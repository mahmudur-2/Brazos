import type { AppNotification } from './notifications';

/**
 * 2026-09-29 (LUX-LIST-2 #8) — THE FEED'S SHAPE: day groups, and bids on one job folded into one row.
 *
 * Pure: rows in, groups out, `now` passed in so the tests pin the calendar. Nothing here reads the
 * network or invents a field — a grouped row's words are rearranged from the rows' own title and body
 * as the trigger wrote them (phase20 `bid_received`: title "New bid on <job title>", body
 * "<worker> bid $<amount>", data { screen, jobId }).
 */

/** One line in the feed: a single notification, or two or more `bid_received` on one job that day. */
export type FeedEntry = {
  key: string;
  /** The newest row — its time, its route, its type. */
  lead: AppNotification;
  /** Every row folded into this entry, newest first (one for an ordinary row). */
  rows: AppNotification[];
  title: string;
  body: string | null;
  unread: boolean;
};

export type FeedGroup = { label: FeedDayLabel; entries: FeedEntry[] };
export type FeedDayLabel = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (at: Date): number => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

/** Which day group a timestamp falls in, on the device's own calendar. */
export function feedDayLabel(iso: string, now: Date): FeedDayLabel {
  const today = startOfDay(now);
  const day = startOfDay(new Date(iso));
  if (day >= today) return 'Today';
  if (day >= today - DAY_MS) return 'Yesterday';
  if (day >= today - 6 * DAY_MS) return 'This week';
  return 'Earlier';
}

const jobIdOf = (row: AppNotification): string | null => {
  const data = row.data ?? {};
  const id = (data as { jobId?: unknown; job_id?: unknown }).jobId ?? (data as { job_id?: unknown }).job_id;
  return typeof id === 'string' && id ? id : null;
};

const BID_TITLE = /^New bid on (.+)$/;
const BID_BODY = /^(.+?) bid (\$[\d,]+(?:\.\d{2})?)\.?$/;

/**
 * The folded row's words, from the rows' own text (the brief's wording): "2 new bids on your job",
 * then "Priya Natarajan $135.00 · Sam Okafor $120.00 on <job title>." — the amounts exactly as the
 * trigger wrote them, never re-formatted here.
 */
function bidGroupText(rows: AppNotification[]): { title: string; body: string | null } {
  const job = BID_TITLE.exec(rows[0].title)?.[1] ?? null;
  const title = `${rows.length} new bids on your job`;
  const parts = rows.map((row) => {
    const hit = row.body ? BID_BODY.exec(row.body) : null;
    return hit ? `${hit[1]} ${hit[2]}` : row.body;
  });
  if (!parts.every((part) => !!part)) return { title, body: null };
  return { title, body: job ? `${parts.join(' · ')} on ${job}.` : parts.join(' · ') };
}

/**
 * The feed: newest first, cut into day groups; within a day, every `bid_received` on the same job is
 * ONE entry (two or more of them), placed where its newest row falls. "N unread" still counts rows.
 */
export function groupFeed(rows: readonly AppNotification[], now: Date = new Date()): FeedGroup[] {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const groups: FeedGroup[] = [];
  const bidEntries = new Map<string, FeedEntry>();
  for (const row of sorted) {
    const label = feedDayLabel(row.created_at, now);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, entries: [] };
      groups.push(group);
    }
    const jobId = row.type === 'bid_received' ? jobIdOf(row) : null;
    const foldKey = jobId ? `${label}|${jobId}` : null;
    const existing = foldKey ? bidEntries.get(foldKey) : undefined;
    if (existing) {
      existing.rows.push(row);
      existing.unread = existing.unread || !row.read_at;
      const text = bidGroupText(existing.rows);
      existing.title = text.title;
      existing.body = text.body;
      continue;
    }
    const entry: FeedEntry = {
      key: row.id,
      lead: row,
      rows: [row],
      title: row.title,
      body: row.body,
      unread: !row.read_at,
    };
    group.entries.push(entry);
    if (foldKey) bidEntries.set(foldKey, entry);
  }
  return groups;
}
