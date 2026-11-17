import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Blocks and reports.
//
// Blocking is enforced in the database (see phase13 SQL): the messages INSERT
// policy rejects a write when either party has blocked the other, so a blocked
// user genuinely cannot send — the UI changes here are just so the app doesn't
// present an action that would fail.
// ---------------------------------------------------------------------------

export type RelationState = {
  /** This user has blocked the other party. */
  blocking: boolean;
  /** The other party has blocked this user. */
  blockedBy: boolean;
  /**
   * C7: the read failed, so neither "blocked" nor "not blocked" is known.
   * Both flags are false then; ask relationStatus(), never the flags alone.
   */
  readFailed: boolean;
};

export const EMPTY_RELATION: RelationState = {
  blocking: false,
  blockedBy: false,
  readFailed: false,
};

/**
 * C7 (A4-M2, 2d): the three answers a chat must tell apart. 'unknown' is a
 * failed read: the chat hides its composer and shows its load-error state
 * with Try Again — never the blocked state, which would say something false
 * about a person.
 */
export function relationStatus(relation: RelationState): 'unknown' | 'blocked' | 'clear' {
  if (relation.readFailed) return 'unknown';
  return relation.blocking || relation.blockedBy ? 'blocked' : 'clear';
}

/** Block state between the signed-in user and one other person. */
export async function fetchRelation(
  userId: string,
  otherId: string
): Promise<RelationState> {
  const blocksRes = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(
      `and(blocker_id.eq.${userId},blocked_id.eq.${otherId}),` +
        `and(blocker_id.eq.${otherId},blocked_id.eq.${userId})`
    );

  if (blocksRes.error) return { blocking: false, blockedBy: false, readFailed: true };
  const blocks = blocksRes.data ?? [];
  return {
    blocking: blocks.some((b) => b.blocker_id === userId),
    blockedBy: blocks.some((b) => b.blocker_id === otherId),
    readFailed: false,
  };
}

export type ModerationLists = { blocking: Set<string>; blockedBy: Set<string> };

/**
 * Every user the signed-in user has blocked or is blocked by (for the inbox
 * list). C7: a failed read says so — empty sets beside an error, which no
 * caller may read as "nobody is blocked".
 */
export async function fetchMyModerationLists(
  userId: string
): Promise<ModerationLists & { error: { message: string } | null }> {
  const blocksRes = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  const blocking = new Set<string>();
  const blockedBy = new Set<string>();
  if (blocksRes.error) return { blocking, blockedBy, error: { message: blocksRes.error.message } };
  for (const b of blocksRes.data ?? []) {
    if (b.blocker_id === userId) blocking.add(b.blocked_id);
    else blockedBy.add(b.blocker_id);
  }

  return { blocking, blockedBy, error: null };
}

/**
 * C7: the inbox's lists after a read. A failed read keeps the last good
 * lists; with none yet, nothing is known (null) and the inbox shows no rows
 * until a read succeeds, because a row from a blocked person is the harm.
 */
export function moderationAfterRead(
  previous: ModerationLists | null,
  read: ModerationLists & { error: unknown }
): ModerationLists | null {
  if (!read.error) return { blocking: read.blocking, blockedBy: read.blockedBy };
  return previous;
}

export async function blockUser(userId: string, otherId: string) {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: userId, blocked_id: otherId });
  if (!error) hideUser(otherId);
  return { error };
}

export async function unblockUser(userId: string, otherId: string) {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', otherId);
  // Still hidden if THEY blocked this user too; a reload settles it.
  if (!error) void loadHiddenUsers(userId);
  return { error };
}

// ---------------------------------------------------------------------------
// Hidden people (FIX-RUN B3, Apple 1.2): a blocked person's posts, profile and
// reviews leave the viewer's feeds. A block either way hides — the database's
// is_blocked_between() already gates bidding, messages and notifications both
// ways, so the feeds agree with it. Client-side and read-only: one shared set,
// loaded once per signed-in user, updated in place by blockUser() above.
// hooks/useHiddenUserIds.ts is the React face of it.
// ---------------------------------------------------------------------------

let hiddenIds: ReadonlySet<string> = new Set();
let hiddenFor: string | null = null;
let hiddenLoad: Promise<void> | null = null;
const hiddenListeners = new Set<() => void>();

function setHidden(next: ReadonlySet<string>) {
  hiddenIds = next;
  for (const listener of hiddenListeners) listener();
}

/** The current set — the same object until it changes (useSyncExternalStore). */
export function hiddenUserIds(): ReadonlySet<string> {
  return hiddenIds;
}

export function subscribeHiddenUsers(listener: () => void): () => void {
  hiddenListeners.add(listener);
  return () => {
    hiddenListeners.delete(listener);
  };
}

/** Load (or reload) the set for this user. A failed read keeps what is there:
 *  hiding is a courtesy on top of the server's gates, never the gate itself. */
export function loadHiddenUsers(userId: string): Promise<void> {
  if (hiddenFor !== userId) {
    hiddenFor = userId;
    if (hiddenIds.size) setHidden(new Set());
  }
  const load = fetchMyModerationLists(userId)
    .then(({ blocking, blockedBy, error }) => {
      if (hiddenFor !== userId) return;
      // C7: a failed read keeps the set it has (the comment above was not
      // true: it used to set the empty sets) and is tried again by the next
      // ensureHiddenUsers instead of being shared for the whole session.
      if (error) throw new Error(error.message);
      setHidden(new Set([...blocking, ...blockedBy]));
    })
    .catch(() => {
      if (hiddenLoad === load) hiddenLoad = null;
    });
  hiddenLoad = load;
  return load;
}

/** Load once per user; later calls share the first. */
export function ensureHiddenUsers(userId: string): Promise<void> {
  if (hiddenFor === userId && hiddenLoad) return hiddenLoad;
  return loadHiddenUsers(userId);
}

function hideUser(otherId: string) {
  if (hiddenIds.has(otherId)) return;
  setHidden(new Set([...hiddenIds, otherId]));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// The values are the database's reports_reason_valid allow-list, exactly
// (20261003000700_ugc_moderation.sql; tests/moderationEntryPoints.test.mjs
// compares the two).
export const REPORT_REASONS = [
  { value: 'no_show', label: 'No-show' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'scam', label: 'Scam / non-payment' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** What a report is about, beyond the person (FIX-RUN B3, Apple 1.2): the
 *  database's reports_subject_valid allow-list, exactly. */
export const REPORT_SUBJECT_KINDS = ['job', 'profile', 'review', 'portfolio_item', 'message'] as const;

export type ReportSubject = { kind: (typeof REPORT_SUBJECT_KINDS)[number]; id: string };

/** The longest description a report may carry: the database refuses a longer one
 *  (B10, 20261112032000_text_caps.sql), so the form stops typing there. */
export const REPORT_DESCRIPTION_MAX = 2000;

export async function createReport(params: {
  reporterId: string;
  reportedId: string;
  jobId?: string | null;
  reason: ReportReason;
  description?: string;
  subject?: ReportSubject | null;
}) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    job_id: params.jobId ?? null,
    reason: params.reason,
    description: params.description?.trim() || null,
    // Only when there is one: a person-only report (chat, the inbox) writes
    // exactly the columns it always did.
    ...(params.subject ? { subject_kind: params.subject.kind, subject_id: params.subject.id } : {}),
  });
  return { error };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type AdminReport = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reporter_name: string | null;
  reported_name: string | null;
  reported_banned: boolean;
  job_id: string | null;
  job_title: string | null;
  reason: ReportReason;
  description: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  /** admin_open_reports_v2: what was reported ('job', 'profile', 'review', 'portfolio_item' or
   *  'message'), its id, and for a review or a message the server's first 200 characters of it
   *  (the job's title for a job; null for a profile or a portfolio item). */
  subject_kind: string | null;
  subject_id: string | null;
  subject_text: string | null;
};

const SUBJECT_LABELS: Record<string, string> = {
  review: 'Reported Review',
  message: 'Reported Message',
};

/**
 * T2: the reported review or message, quoted on the report card under its label. Nothing for a job
 * (its title is already on the card), a profile or a portfolio item, or when there is no text. The
 * server already cut the text at 200 characters; it is shown as it came.
 */
export function reportSubject(report: Pick<AdminReport, 'subject_kind' | 'subject_text'>): { label: string; text: string } | null {
  const label = report.subject_kind ? SUBJECT_LABELS[report.subject_kind] : undefined;
  if (!label || typeof report.subject_text !== 'string' || report.subject_text.length === 0) return null;
  return { label, text: report.subject_text };
}

export async function fetchAdminReports() {
  const { data, error } = await supabase.rpc('admin_open_reports_v2');
  return { data: (data ?? []) as AdminReport[], error };
}

export async function banUser(targetId: string, reportId?: string | null) {
  const { error } = await supabase.rpc('ban_user', {
    p_target: targetId,
    p_report_id: reportId ?? null,
  });
  return { error };
}

export async function unbanUser(targetId: string) {
  const { error } = await supabase.rpc('unban_user', { p_target: targetId });
  return { error };
}

/**
 * B2: dismiss_report() answers true when it closed the report and false, with no error, when the
 * report was already closed. Either way the caller reads the list again and shows no error.
 */
export async function dismissReport(reportId: string) {
  const { error } = await supabase.rpc('dismiss_report', { p_report_id: reportId });
  return { error };
}

/** Reason value -> display label, for the admin queue. */
export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
