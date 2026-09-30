/**
 * 2026-09-30 (the build run, idea 6) — THE REMINDER'S BUTTONS. The evening before a hired job's day
 * (migration 20260930000900), the worker's push carries Message and Route and the customer's
 * Message. A push's buttons are a category the app registers once (lib/pushNotifications.ts); the
 * server names it in the payload (data.categoryId) and the send-push function passes it through.
 * Pure, so the tests execute it.
 */

/** The two sets, named as the server names them. */
export const REMINDER_CATEGORIES = {
  worker: 'job_reminder_worker',
  customer: 'job_reminder_customer',
} as const;

/** The buttons' identifiers. */
export const ACTION_MESSAGE = 'message';
export const ACTION_ROUTE = 'route';

/**
 * Where a button leads, as the payload the one tap resolver (lib/notificationRoutes.ts) reads:
 * Message opens the job's chat; Route opens the worker's job and asks it for directions at once.
 * Any other action — the plain tap included — keeps the payload as it came.
 */
export function dataForAction(raw: unknown, actionIdentifier: string | null | undefined): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const data = raw as Record<string, unknown>;
  if (typeof data.jobId !== 'string') return raw;
  if (actionIdentifier === ACTION_MESSAGE) return { ...data, screen: 'Chat' };
  if (actionIdentifier === ACTION_ROUTE) return { ...data, screen: 'WorkerJob', intent: 'route' };
  return raw;
}
