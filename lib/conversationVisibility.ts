/**
 * THE INBOX'S UNSEEN COUNT — a pure rule, no client.
 *
 * WHY THIS FILE IS SEPARATE FROM lib/conversations.ts. A module that imports
 * `./supabase` cannot be loaded by `node --test` at all (Node's ESM resolver
 * will not take an extensionless relative specifier), so a rule living beside
 * a Supabase call is reachable only by reading its source. The count is stated
 * here so a test can RUN it.
 *
 * Everything in here is total and side-effect free. Nothing in here may grow
 * an import that is not a type.
 */

/** One message the unseen count may take: its thread's key and when it was sent. */
export type UnseenStamp = { key: string; created_at: string };

/** A thread the count is asked about: its read position. */
export type UnseenThread = {
  key: string;
  readAt: string | null;
};

/**
 * 2026-09-28 (LUX-LIST-64 #54) — HOW MANY MESSAGES A THREAD HOLDS THAT THE USER
 * HAS NOT SEEN: the number beside the name on the Inbox row. COUNTED from the
 * rows the read returns (the other person's, never unsent ones), never
 * estimated. A message counts when it is newer than the thread's read position
 * (none yet: every one).
 */
export function countUnseen(
  stamps: readonly UnseenStamp[],
  threads: readonly UnseenThread[]
): Record<string, number> {
  const byKey = new Map(threads.map((thread) => [thread.key, thread]));
  const counts: Record<string, number> = {};
  for (const stamp of stamps) {
    const thread = byKey.get(stamp.key);
    if (!thread) continue;
    if (thread.readAt && !(new Date(stamp.created_at) > new Date(thread.readAt))) continue;
    counts[stamp.key] = (counts[stamp.key] ?? 0) + 1;
  }
  return counts;
}
