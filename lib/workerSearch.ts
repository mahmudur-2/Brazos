import { supabase } from './supabase';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';
import { fetchProfileReviewSummaries, type ProfileReviewSummaryRow } from './reviews';
import { SKILL_CATEGORIES } from './skillCategories';

/**
 * Turning "I need someone to move a queen mattress up three flights" into a
 * ranked list of workers, using only evidence the database actually holds.
 *
 * ONE RANKING LIVES HERE: findWorkers() is a deterministic keyword + category
 * match (lean v1: nothing may depend on a learned model, so the old
 * server-side meaning ranking is gone). Results are ranked by string and category overlap and
 * must never be presented as anything cleverer than that — resultHeading() is
 * the single place that wording is decided, so a screen cannot accidentally
 * label keyword matching as something it is not.
 *
 * What is deliberately NOT used, because the schema does not hold it:
 *   * distance / service area — `profiles` has no location column at all, and
 *     a job's free-text location is not comparable to anything on a worker.
 *     This is why the search contract carries no such field: there is no real
 *     data to put in it, and an estimate would be invented.
 *   * availability / calendars — not stored.
 *   * response time — the column exists but is null for essentially every
 *     account, so ranking on it would be ranking on nothing.
 */

/** Candidate rows pulled back before scoring. Bounded so a broad query can't
 *  drag the whole profiles table onto the device. */
const CANDIDATE_LIMIT = 60;

/** Results actually shown — also the number of worker_job_stats() calls made
 *  (the rating read is ONE batch call however many rows there are), so this
 *  is a request-count budget as much as a layout choice. */
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
    'stairs', 'upstairs', 'load', 'unload', 'lifting', 'heavy', 'junk',
    'dispose', 'disposal', 'removal', 'storage', 'apartment',
  ],
  packing: [
    'pack', 'packing', 'unpack', 'unpacking', 'wrap', 'wrapping', 'boxes',
    'declutter', 'organize', 'organizing', 'organization', 'closet', 'sort',
    'label', 'tidying',
  ],
  furniture_assembly: [
    'assemble', 'assembly', 'furniture', 'ikea', 'flatpack', 'bookshelf',
    'shelves', 'shelf', 'crib', 'dresser', 'wardrobe', 'bedframe', 'desk',
    'table', 'chair', 'build',
  ],
  cleaning: [
    'clean', 'cleaning', 'cleaner', 'tidy', 'vacuum', 'mop', 'scrub',
    'housekeeping', 'maid', 'dusting', 'dust', 'carpet', 'upholstery',
    'window', 'windows', 'wash', 'washing', 'pressure', 'powerwash',
    'sanitize', 'bathroom', 'kitchen', 'mildew',
  ],
  handyman: [
    'fix', 'repair', 'repairs', 'handyman', 'leak', 'leaky', 'leaking',
    'plumbing', 'plumber', 'electrical', 'electrician', 'faucet', 'drywall',
    'patch', 'broken', 'door', 'hinge', 'sink', 'toilet', 'drain', 'clog',
    'clogged', 'pipe', 'pipes', 'outlet', 'outlets', 'wiring', 'fixture',
    'fixtures', 'appliance', 'dishwasher', 'dryer', 'install',
    'installation', 'pest', 'rodent', 'exterminator', 'termite',
  ],
  yard_work: [
    'yard', 'lawn', 'mow', 'mowing', 'garden', 'gardening', 'landscaping',
    'landscape', 'leaves', 'hedge', 'hedges', 'weeds', 'weeding', 'snow',
    'shovel', 'shoveling', 'gutter', 'gutters', 'trim', 'trimming', 'prune',
    'pruning', 'mulch', 'planting', 'outdoor',
  ],
  dog_walking: [
    'dog', 'dogs', 'puppy', 'walk', 'walking', 'pet', 'pets', 'cat', 'cats',
    'sitter', 'sitting', 'feed', 'feeding', 'boarding', 'litter',
  ],
  errands: [
    'errand', 'errands', 'grocery', 'groceries', 'delivery', 'deliver',
    'pickup', 'shopping', 'courier', 'pharmacy', 'assistant', 'dropoff',
    'prescription',
  ],
  tv_mounting: [
    'tv', 'television', 'mount', 'mounting', 'bracket', 'wallmount', 'hang',
    'hanging', 'picture', 'pictures', 'mirror', 'monitor', 'soundbar',
  ],
  painting: [
    'paint', 'painting', 'painter', 'repaint', 'primer', 'wall', 'walls',
    'ceiling', 'interior', 'touchup', 'stain', 'caulk',
  ],
};

/**
 * Multi-word phrases that name a service almost unambiguously.
 *
 * These exist because the single words they are built from are individually
 * weak or actively misleading — "pressure" and "washing" each drift, "pressure
 * washing" does not; "junk" alone could be decluttering, "junk removal" is a
 * haul-away. A phrase hit is worth more than the sum of its tokens for exactly
 * that reason.
 */
const CATEGORY_PHRASES: Record<string, string[]> = {
  moving: ['junk removal', 'moving help', 'move out', 'move in'],
  packing: ['home organization', 'packing and unpacking'],
  furniture_assembly: ['furniture assembly', 'flat pack'],
  cleaning: [
    'pressure washing', 'power washing', 'deep clean', 'carpet cleaning',
    'window washing', 'upholstery cleaning', 'move out clean',
  ],
  handyman: [
    'light fixture', 'garbage disposal', 'pest control', 'drywall repair',
    'appliance installation', 'water heater', 'ceiling fan',
  ],
  yard_work: ['snow removal', 'gutter cleaning', 'leaf removal', 'lawn care'],
  dog_walking: ['dog walking', 'pet sitting', 'dog sitting'],
  errands: ['personal assistant', 'grocery run'],
  tv_mounting: ['tv mounting', 'wall mount', 'picture hanging', 'shelf hanging'],
  painting: ['interior painting', 'accent wall'],
};

/**
 * How many categories each keyword belongs to, computed once at module load.
 *
 * A word filed under three categories says roughly a third as much about any
 * one of them as a word filed under exactly one — "trim" (hedges or paintwork)
 * should not carry the weight of "ikea". Deriving this from the map rather
 * than hand-maintaining a weight table means adding a keyword automatically
 * re-prices every category that shares it.
 */
const KEYWORD_BREADTH: Map<string, number> = (() => {
  const breadth = new Map<string, number>();
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      breadth.set(keyword, (breadth.get(keyword) ?? 0) + 1);
    }
  }
  return breadth;
})();

/** Words that carry no service signal and would only add fuzzy-match noise. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'need', 'needs', 'needed',
  'want', 'have', 'has', 'are', 'was', 'you', 'your', 'our', 'get', 'got',
  'can', 'will', 'would', 'please', 'some', 'any', 'all', 'also', 'but',
  'not', 'from', 'into', 'out', 'off', 'over', 'under', 'about', 'just',
  'very', 'really', 'help', 'someone', 'somebody', 'looking', 'look', 'like',
  'new', 'old', 'big', 'small', 'today', 'tomorrow', 'asap', 'soon',
]);

/** Category keys, in the order SKILL_CATEGORIES lists them — used as the tie
 *  break so equal keyword scores resolve the same way every time. */
const CATEGORY_ORDER = SKILL_CATEGORIES.map((c) => c.key);

/** Longest a raw query is allowed to be before it is treated as a paste. */
const MAX_QUERY_LENGTH = 120;

/** Lowercased, punctuation-flattened, length-capped. Shared by the token and
 *  the phrase pass so the two can't disagree about what the query says. */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Whether two words are within `max` edits of each other, counting a swap of
 * two adjacent characters as ONE edit rather than two.
 *
 * That last part is the reason this is Damerau-Levenshtein (optimal string
 * alignment) and not plain Levenshtein: transposition is far and away the most
 * common real typing error — "leakign", "recieve" — and plain Levenshtein
 * prices it at 2, the same as two unrelated substitutions. Charging it 1
 * is what lets the edit budget below stay at a single edit, which is what
 * keeps genuinely different words ("washing" vs "walking", "leaking" vs
 * "cleaning" — both distance 2) out of each other's results.
 *
 * Three rolling rows rather than the full matrix, with a length pre-check and
 * a per-row early exit; this runs once per (token, keyword) pair, so the
 * constant factor is the whole cost.
 */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;

  let twoBack: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let rowBest = i;

    for (let j = 1; j <= b.length; j++) {
      const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      let best = Math.min(prev[j] + 1, curr[j - 1] + 1, substitution);

      // Adjacent transposition: "ab" typed where "ba" was meant.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, twoBack[j - 2] + 1);
      }

      curr[j] = best;
      if (best < rowBest) rowBest = best;
    }

    // Every later row can only grow, so once the best cell in a row is over
    // budget the answer is settled.
    if (rowBest > max) return false;
    twoBack = prev;
    prev = curr;
  }

  return prev[b.length] <= max;
}

/** Exact beats prefix beats typo, and the gaps are wide enough that a real
 *  word always outranks a plausible misspelling of a different one. */
const MATCH_EXACT = 1;
const MATCH_PREFIX = 0.85;
const MATCH_STEM = 0.75;
const MATCH_FUZZY = 0.55;

/**
 * How well one typed word matches one keyword, 0 when it does not.
 *
 * The length guards matter more than the weights: a two-character keyword that
 * prefix-matches would let "tv" claim "tvidsomething", and a one-edit typo
 * allowance on a four-letter word turns half the dictionary into a match for
 * the other half.
 */
function matchQuality(token: string, keyword: string): number {
  if (token === keyword) return MATCH_EXACT;

  // "movers" reaches "move". Guarded so only keywords long enough to be a
  // meaningful head can absorb a longer word.
  if (keyword.length >= 4 && token.startsWith(keyword)) return MATCH_PREFIX;
  // "clean" reaches "cleaning" — the same relationship the other way round.
  if (token.length >= 4 && keyword.startsWith(token)) return MATCH_STEM;

  // Typos, only on words long enough that a single edit is unlikely to spell
  // a genuinely different word. Two edits are allowed only once a word is long
  // enough for that to still be a small proportion of it — at seven letters it
  // is not, and letting it through is what made "leaking" match "cleaning".
  const budget = token.length >= 9 ? 2 : token.length >= 5 ? 1 : 0;
  if (budget > 0 && withinEditDistance(token, keyword, budget)) return MATCH_FUZZY;

  return 0;
}

/** A phrase is worth more than a lone keyword because it is far less likely to
 *  be a coincidence — see CATEGORY_PHRASES. */
const PHRASE_SCORE = 1.6;

/** Below this a category is a stray fuzzy hit rather than a reading of the
 *  request, and surfacing it would be worse than returning nothing. */
const MIN_CATEGORY_SCORE = 0.3;

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
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const tokens = [...new Set(normalized.split(' '))].filter(
    (token) => token.length >= 2 && !STOPWORDS.has(token)
  );
  if (tokens.length === 0) return [];

  const scored: { key: string; score: number }[] = [];

  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;

    // Each typed word contributes at most once per category, via its single
    // best keyword. Scoring per keyword instead — which is what this used to
    // do — let one word count twice ("cleaning" hitting both 'clean' and
    // 'cleaning') and quietly handed every category with a long keyword list
    // an advantage that had nothing to do with the request.
    for (const token of tokens) {
      let best = 0;
      for (const keyword of keywords) {
        const quality = matchQuality(token, keyword);
        if (quality === 0) continue;

        const weight = quality / (KEYWORD_BREADTH.get(keyword) ?? 1);
        if (weight > best) best = weight;
        // Nothing can beat an unambiguous exact hit, so stop looking.
        if (best === MATCH_EXACT) break;
      }
      score += best;
    }

    for (const phrase of CATEGORY_PHRASES[key] ?? []) {
      if (normalized.includes(phrase)) score += PHRASE_SCORE;
    }

    if (score >= MIN_CATEGORY_SCORE) scored.push({ key, score });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score || CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key)
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
// A worker with no reputation data yet scores neutral, never zero, so a
// brand-new account is not buried below one with a bad record. Weights sum
// to 1. (This SEARCH ranking is separate from bid ordering, which is the
// factual lib/compareBids.ts rule — the old blended offerValueScore these
// conventions once mirrored was deleted 2026-08-18.)

/** What the rating term reads (n7): the worker-role REVEALED summary —
 *  profile_review_summaries' row for this worker — never the profile's legacy
 *  mixed aggregate. Null is UNKNOWN (the batch unanswered or failed) and
 *  scores exactly as no reviews do: neutral. */
type RatingSummary = Pick<ProfileReviewSummaryRow, 'total' | 'shownAverage'> | null;

function ratingScore(summary: RatingSummary): number {
  const count = summary?.total ?? 0;
  if (count === 0) return 0.6; // neutral for a worker with no revealed reviews yet
  const avg = Math.max(0, Math.min((summary?.shownAverage ?? 0) / 5, 1));
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
  completedTotal: number,
  // Trailing and defaulting to null (neutral) so the positional shape the
  // tests know stays put; the rating term reads this row and never `profile`.
  summary: RatingSummary = null
): number {
  const categoryScore =
    searchedCategories.length === 0
      ? 0.5 // nothing to match against — a name search, so stay neutral
      : Math.min(matchedCategories.length / searchedCategories.length, 1);

  const experienceScore =
    0.6 * Math.min(completedInCategory / 5, 1) + 0.4 * Math.min(completedTotal / 10, 1);

  return (
    0.4 * categoryScore +
    0.25 * ratingScore(summary) +
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
 * Find workers for a request — the one entry point a screen should call.
 *
 * Two candidate reads run in parallel — by advertised category, and by name /
 * bio text — because either alone misses obvious results: a worker who has
 * not filled in their categories is only reachable by name, and a worker
 * whose name has nothing to do with the query is only reachable by category.
 * They are merged and de-duplicated by id before scoring.
 */
export async function findWorkers({
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

  // The rating term (n7): ONE profile_review_summaries() call over every
  // candidate — worker role, revealed reviews only — before anything is
  // ranked, so the cut below still weighs reputation exactly as it did when
  // the columns rode along on the profile row. A failed read is null:
  // every candidate then scores neutral on rating, never zero.
  const { data: summaries } = await fetchProfileReviewSummaries([...byId.keys()], 'worker');
  const summaryFor = (id: string): RatingSummary => summaries?.get(id) ?? null;

  const searched = new Set(searchedCategories);
  const provisional = Array.from(byId.values()).map((profile) => {
    const matchedCategories = (profile.categories ?? []).filter((c) => searched.has(c));
    return {
      profile,
      matchedCategories,
      completedInCategory: 0,
      completedTotal: 0,
      score: scoreMatch(
        profile,
        matchedCategories,
        searchedCategories,
        0,
        0,
        summaryFor(profile.id)
      ),
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
        completedTotal,
        summaryFor(match.profile.id)
      ),
    };
  });

  // Sorted once, after the real numbers are in, so the list never visibly
  // reshuffles under the reader.
  enriched.sort((a, b) => b.score - a.score);

  return { data: enriched, error: null };
}

// --- Result copy -----------------------------------------------------------
// Kept here rather than in the screen so there is exactly one place that
// decides how a result set is described, and no screen can promote keyword
// results by accident.

/**
 * The list header. Keyword results are plain "matches", never "best".
 *
 * `categoryLabel` names the filter the customer chose and is appended to
 * every shape. A search that is filtered has to say so — the alternative is
 * an honest result that reads as a broken screen.
 */
export function resultHeading(count: number, categoryLabel?: string): string {
  const base =
    count >= WORKER_RESULT_LIMIT
      ? `Top ${WORKER_RESULT_LIMIT} matches`
      : `${count} ${count === 1 ? 'match' : 'matches'}`;
  return categoryLabel ? `${base} · ${categoryLabel}` : base;
}

/**
 * The empty-state title, in the same shape and for the same reason: nothing
 * else on that surface names the filter, so an empty result that stays silent
 * about it is the one most likely to be read as a fault. Kept beside
 * resultHeading() so the screen cannot word either of them itself.
 */
export function emptyResultTitle(categoryLabel?: string): string {
  return categoryLabel ? `No ${categoryLabel} workers matched` : 'No workers matched';
}

/**
 * One line of supporting evidence under a result: a count worker_job_stats()
 * actually returned. Nothing here can say "expert", "available now" or "best
 * in Brooklyn", because none of those are stored anywhere.
 */
export function matchReasonText(match: WorkerMatch): string | null {
  const count = match.completedInCategory;
  if (count > 0) {
    return `${count} similar ${count === 1 ? 'job' : 'jobs'} completed`;
  }
  return null;
}
