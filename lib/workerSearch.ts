import { supabase } from './supabase';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';
import { SKILL_CATEGORIES } from './skillCategories';

/**
 * Turning "I need someone to move a queen mattress up three flights" into a
 * ranked list of workers, using only evidence the database actually holds.
 *
 * This is deterministic keyword + category matching over `profiles`, then a
 * weighted rank over real reputation signals. It is NOT semantic search and
 * is deliberately never described as AI anywhere in the UI — nothing here
 * embeds, infers intent, or calls a model. The pieces are separated
 * (interpret -> fetch candidates -> score) so a semantic step could replace
 * interpretQuery() later without touching the rest.
 *
 * What is deliberately NOT used, because the schema does not hold it:
 *   * distance / service area — `profiles` has no location column at all, and
 *     a job's free-text location is not comparable to anything on a worker.
 *   * availability / calendars — not stored.
 *   * response time — the column exists but is null for essentially every
 *     account, so ranking on it would be ranking on nothing.
 */

/** Candidate rows pulled back before scoring. Bounded so a broad query can't
 *  drag the whole profiles table onto the device. */
const CANDIDATE_LIMIT = 60;

/** Results actually shown — also the number of worker_job_stats() calls made,
 *  so this is a request-count budget as much as a layout choice. */
export const WORKER_RESULT_LIMIT = 12;

/**
 * Keywords that identify a service category in plain English. Only words a
 * customer would realistically type; each one is checked as a whole word (or
 * a whole-word prefix, so "moving"/"movers" both reach "move").
 *
 * Keys are the shared category keys — SKILL_CATEGORIES (what a worker
 * advertises) and JOB_CATEGORIES (what a job is filed under) use the same
 * strings, which is what lets one query address both.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  moving: [
    'move', 'moving', 'mover', 'movers', 'relocate', 'relocation', 'haul',
    'hauling', 'truck', 'mattress', 'couch', 'sofa', 'flight', 'flights',
    'stairs', 'upstairs', 'load', 'unload', 'lifting', 'heavy',
  ],
  packing: [
    'pack', 'packing', 'unpack', 'unpacking', 'wrap', 'wrapping', 'boxes',
    'declutter',
  ],
  furniture_assembly: [
    'assemble', 'assembly', 'ikea', 'flatpack', 'bookshelf', 'shelves',
    'crib', 'dresser', 'wardrobe', 'bedframe',
  ],
  cleaning: [
    'clean', 'cleaning', 'cleaner', 'tidy', 'vacuum', 'mop', 'scrub',
    'housekeeping', 'maid', 'dusting',
  ],
  handyman: [
    'fix', 'repair', 'handyman', 'leak', 'leaky', 'plumbing', 'plumber',
    'electrical', 'electrician', 'faucet', 'drywall', 'patch', 'broken',
    'door', 'hinge',
  ],
  yard_work: [
    'yard', 'lawn', 'mow', 'mowing', 'garden', 'gardening', 'landscaping',
    'leaves', 'hedge', 'weeds', 'weeding', 'snow', 'shovel',
  ],
  dog_walking: [
    'dog', 'dogs', 'puppy', 'walk', 'walking', 'pet', 'pets', 'cat', 'cats',
    'sitter', 'sitting', 'feed',
  ],
  errands: [
    'errand', 'errands', 'grocery', 'groceries', 'delivery', 'deliver',
    'pickup', 'shopping', 'courier', 'pharmacy',
  ],
  tv_mounting: ['tv', 'television', 'mount', 'mounting', 'bracket', 'wallmount'],
  painting: ['paint', 'painting', 'painter', 'repaint', 'primer', 'wall', 'walls'],
};

/** Category keys, in the order SKILL_CATEGORIES lists them — used as the tie
 *  break so equal keyword scores resolve the same way every time. */
const CATEGORY_ORDER = SKILL_CATEGORIES.map((c) => c.key);

/** Longest a raw query is allowed to be before it is treated as a paste. */
const MAX_QUERY_LENGTH = 120;

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .slice(0, MAX_QUERY_LENGTH)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Which service categories a free-text request is about, best first.
 *
 * Scored by how many DISTINCT keywords of that category the query hits, so
 * "pack up a 1-bedroom apartment before movers" ranks moving and packing
 * together rather than picking one arbitrarily. Returns at most three, and an
 * empty list when nothing matches — callers treat that as "search by name /
 * show everything" rather than "no results".
 */
export function interpretQuery(query: string): string[] {
  const tokens = new Set(tokenize(query));
  if (tokens.size === 0) return [];

  const scored: { key: string; hits: number }[] = [];
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let hits = 0;
    for (const keyword of keywords) {
      // Whole word, or a whole word that starts with it — "movers" reaches
      // "move" but "remove" does not.
      for (const token of tokens) {
        if (token === keyword || token.startsWith(keyword)) {
          hits++;
          break;
        }
      }
    }
    if (hits > 0) scored.push({ key, hits });
  }

  return scored
    .sort(
      (a, b) => b.hits - a.hits || CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key)
    )
    .slice(0, 3)
    .map((s) => s.key);
}

export type WorkerMatch = {
  profile: Profile;
  /** Intersection of what was searched for and what the worker advertises. */
  matchedCategories: string[];
  /** Completed jobs in the searched categories. 0 also means "not known yet". */
  completedInCategory: number;
  completedTotal: number;
  score: number;
};

// --- Scoring ---------------------------------------------------------------
// Same conventions as bidValueScore() in lib/bids.ts: a worker with no
// reputation data yet scores neutral, never zero, so a brand-new account is
// not buried below one with a bad record. Weights sum to 1.

function ratingScore(profile: Profile): number {
  const count = profile.rating_count ?? 0;
  if (count === 0) return 0.6; // neutral for a worker with no reviews yet
  const avg = Math.max(0, Math.min((profile.rating_avg ?? 0) / 5, 1));
  // Two five-star reviews should not outrank twenty four-star ones outright,
  // so the average is pulled toward neutral until there is enough of it.
  const confidence = Math.min(count / 5, 1);
  return 0.6 + (avg - 0.6) * confidence;
}

function normalizedPercent(value: number | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const frac = value <= 1 ? value : value / 100;
  return Math.max(0, Math.min(frac, 1));
}

function scoreMatch(
  profile: Profile,
  matchedCategories: string[],
  searchedCategories: string[],
  completedInCategory: number,
  completedTotal: number
): number {
  const categoryScore =
    searchedCategories.length === 0
      ? 0.5 // nothing to match against — a name search, so stay neutral
      : Math.min(matchedCategories.length / searchedCategories.length, 1);

  const experienceScore =
    0.6 * Math.min(completedInCategory / 5, 1) + 0.4 * Math.min(completedTotal / 10, 1);

  return (
    0.4 * categoryScore +
    0.25 * ratingScore(profile) +
    0.15 * normalizedPercent(profile.completion_rate, 0.7) +
    0.08 * normalizedPercent(profile.on_time_pct, 0.7) +
    0.12 * experienceScore
  );
}

/** PostgREST reads `or=(...)` as a filter grammar, so a comma or a paren in a
 *  typed query would change its meaning rather than being searched for. */
function sanitizeForFilter(query: string): string {
  return query.replace(/[,()\\%*]/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

type SearchArgs = {
  query: string;
  /** Explicit category (a tapped suggestion chip) wins over the query text. */
  categories?: string[];
  excludeUserId?: string | null;
  limit?: number;
};

/**
 * Find workers for a request.
 *
 * Two candidate reads run in parallel — by advertised category, and by name /
 * bio text — because either alone misses obvious results: a worker who has
 * not filled in their categories is only reachable by name, and a worker
 * whose name has nothing to do with the query is only reachable by category.
 * They are merged and de-duplicated by id before scoring.
 */
export async function searchWorkers({
  query,
  categories,
  excludeUserId,
  limit = WORKER_RESULT_LIMIT,
}: SearchArgs): Promise<{ data: WorkerMatch[]; error: { message: string } | null }> {
  const searchedCategories =
    categories && categories.length > 0 ? categories : interpretQuery(query);
  const text = sanitizeForFilter(query);

  const [byCategory, byText] = await Promise.all([
    searchedCategories.length > 0
      ? supabase
          .from('profiles')
          .select(PUBLIC_PROFILE_COLUMNS)
          .overlaps('categories', searchedCategories)
          .limit(CANDIDATE_LIMIT)
      : Promise.resolve(null),
    // Two characters is the shortest thing worth an ilike scan; below that
    // every profile matches and the read is pure noise.
    text.length >= 2
      ? supabase
          .from('profiles')
          .select(PUBLIC_PROFILE_COLUMNS)
          .or(`full_name.ilike.%${text}%,bio.ilike.%${text}%`)
          .limit(CANDIDATE_LIMIT)
      : Promise.resolve(null),
  ]);

  const results = [byCategory, byText].filter((r) => r !== null);
  if (results.length === 0) {
    return { data: [], error: null };
  }

  // Only fail if EVERY read failed — one working half is still a real result
  // set, and reporting an error over the top of it would be worse.
  const firstError = results.find((r) => r.error)?.error ?? null;
  if (results.every((r) => r.error)) {
    return { data: [], error: firstError };
  }

  const byId = new Map<string, Profile>();
  for (const result of results) {
    for (const row of (result.data ?? []) as Record<string, unknown>[]) {
      const profile = { ...row, phone: null, is_admin: null, banned: null } as Profile;
      if (!profile.id || profile.id === excludeUserId) continue;
      if (!byId.has(profile.id)) byId.set(profile.id, profile);
    }
  }

  const searched = new Set(searchedCategories);
  const provisional = Array.from(byId.values()).map((profile) => {
    const matchedCategories = (profile.categories ?? []).filter((c) => searched.has(c));
    return {
      profile,
      matchedCategories,
      completedInCategory: 0,
      completedTotal: 0,
      score: scoreMatch(profile, matchedCategories, searchedCategories, 0, 0),
    };
  });

  // Rank on profile data first and cut to the page that will actually be
  // shown, THEN spend one worker_job_stats() call per surviving worker. The
  // stats are what make "8 moving jobs completed" real rather than implied,
  // but they are per-worker RPCs — running them over all 60 candidates would
  // be 60 requests to reorder rows nobody sees.
  const shortlist = provisional.sort((a, b) => b.score - a.score).slice(0, limit);

  const stats = await Promise.all(
    shortlist.map((match) =>
      supabase
        .rpc('worker_job_stats', { p_worker: match.profile.id })
        .then((r) => (r.error ? [] : ((r.data ?? []) as { category: string; job_count: number }[])))
    )
  );

  const enriched = shortlist.map((match, i) => {
    const rows = stats[i];
    const completedTotal = rows.reduce((sum, row) => sum + (row.job_count ?? 0), 0);
    const completedInCategory = rows
      .filter((row) => searched.has(row.category))
      .reduce((sum, row) => sum + (row.job_count ?? 0), 0);

    return {
      ...match,
      completedInCategory,
      completedTotal,
      score: scoreMatch(
        match.profile,
        match.matchedCategories,
        searchedCategories,
        completedInCategory,
        completedTotal
      ),
    };
  });

  // Sorted once, after the real numbers are in, so the list never visibly
  // reshuffles under the reader.
  enriched.sort((a, b) => b.score - a.score);

  return { data: enriched, error: null };
}
