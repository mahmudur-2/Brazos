/**
 * F13 (fix run, 2026-10-03) — THE CACHE'S PURE RULES. Imports nothing, so the
 * node suite executes it directly; lib/queryClient.ts and the hooks that read
 * the cache take their keys and their rules from here.
 */

/** Every key the app caches under. One place, so an invalidation cannot misspell one. */
export const queryKeys = {
  /** The open-market feed — the same rows for every viewer; the hook filters the hidden. */
  openJobs: ['openJobs'] as const,
  /** The bell's count, per account. */
  unreadNotifications: (userId: string) => ['notifications', 'unread', userId] as const,
  /** The My Jobs hub, per account. */
  myJobsHub: (userId: string) => ['myJobsHub', userId] as const,
};

/** The hub's freshness window: a focus within it reads the cache, not the network. */
export const HUB_STALE_MS = 20_000;

/**
 * Whether the cache must be emptied: the signed-in account changed, or signed
 * out. One account must never see another's rows, even for a frame.
 */
export function cacheBelongsToSomeoneElse(previousUserId: string | null, nextUserId: string | null): boolean {
  return previousUserId !== nextUserId;
}

/**
 * KEEP-ON-ERROR, field by field: a source whose read failed keeps its last
 * good value instead of blanking the rows it fed. `failed` names the fields
 * whose read failed this time.
 */
export function mergeKeepOnError<T extends Record<string, unknown>>(
  previous: T | undefined,
  next: T,
  failed: ReadonlySet<keyof T>
): T {
  if (!previous || failed.size === 0) return next;
  const merged = { ...next };
  for (const field of failed) merged[field] = previous[field];
  return merged;
}
