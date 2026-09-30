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

/**
 * 2026-09-30 (idea 20) — HIRE FROM THE PUSH: a bid's push (migration 20260930001200, notify_on_bid)
 * carries View and Accept & pay; a repeat visit's Confirm push carries Confirm. A button's title is
 * fixed when the app registers it, so the amount rides in the push's words ("Sam bid $80 · $86
 * all-in").
 */
export const HIRE_CATEGORIES = {
  bid: 'bid_hire',
  series: 'series_confirm',
} as const;

/** The buttons' identifiers. */
export const ACTION_MESSAGE = 'message';
export const ACTION_ROUTE = 'route';
export const ACTION_VIEW = 'view';
export const ACTION_ACCEPT_PAY = 'accept_pay';
export const ACTION_CONFIRM = 'confirm';

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
  // Idea 20: Accept & pay opens the offer's own confirm on the customer's job; Confirm goes to Checkout
  // to pay with the saved card. View is the plain tap.
  if (actionIdentifier === ACTION_ACCEPT_PAY && typeof data.offerId === 'string') {
    return { ...data, screen: 'ClientJobDetail', intent: 'accept' };
  }
  if (actionIdentifier === ACTION_CONFIRM) return { ...data, screen: 'ClientJobDetail', intent: 'pay' };
  return raw;
}
