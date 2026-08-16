import { fetchJobById } from './jobs';
import type { OpenJob } from './jobs';
import { navigateAcrossTabs } from './navigationRef';

/**
 * Dispatch only into a navigator that can actually handle the target.
 *
 * The check itself now lives in navigationRef.ts, because push routing is not
 * the only thing that jumps between tabs — a shared screen reaching into the
 * mode-defining Home tab has exactly the same problem, and two copies of the
 * rule is how one of them ends up unguarded. This file keeps the deliberate
 * DROP behaviour (no fallbackToTabRoot): a tapped alert that cannot reach its
 * subject is better ignored than answered with an unrelated screen.
 */
const navigateChecked = (tab: string, screen?: string, params?: object): void =>
  navigateAcrossTabs(tab, screen, params);

// ---------------------------------------------------------------------------
// Notification payload -> destination screen.
//
// The `screen` strings here are a contract with phase20's triggers, which
// build them in jsonb_build_object('screen', ...). Changing one means changing
// both. Every type in that migration is handled below.
// ---------------------------------------------------------------------------

export type NotificationData = {
  screen?: string;
  jobId?: string;
  /** phase57's pre-hire chat payload: a direct thread carries no job. */
  directThreadId?: string;
  type?: string;
  outboxId?: string;
};

/** Tab that owns each destination, for the nested navigate() call. */
const TAB_FOR_SCREEN: Record<string, string> = {
  Chat: 'Messages',
  ClientJobDetail: 'MyJobs',
  WorkerJob: 'MyJobs',
  // The worker bid screen. Routed through the SHARED MyJobs tab, not Home:
  // since Phase 2, Home is the mode-defining tab and only the worker tree's
  // Home stack registers JobDetail, so a customer-mode tap on this tab would
  // silently land on Customer Home instead. MyJobs is mounted in both trees
  // and registers JobDetail in both, so the link resolves in either mode.
  // §F's real answer is a mode segment in the payload, which Phase 12 owns.
  JobDetail: 'MyJobs',
  ProfileMain: 'Profile',
};

function toNotificationData(raw: unknown): NotificationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const screen = typeof data.screen === 'string' ? data.screen : undefined;
  if (!screen) return null;
  return {
    screen,
    jobId: typeof data.jobId === 'string' ? data.jobId : undefined,
    directThreadId:
      typeof data.directThreadId === 'string' ? data.directThreadId : undefined,
    type: typeof data.type === 'string' ? data.type : undefined,
    outboxId: typeof data.outboxId === 'string' ? data.outboxId : undefined,
  };
}

/**
 * Where a payload points, or null when it points nowhere.
 *
 * `direct` targets carry everything the destination needs. `job` targets take
 * the whole job ROW as a route param, so dispatching one costs a fetch.
 * Splitting them here is what lets canRouteNotification() answer
 * SYNCHRONOUSLY: the in-app feed has to decide whether a row is tappable while
 * it renders, and it cannot await a round-trip to do that.
 */
type RouteTarget =
  | { kind: 'direct'; tab: string; screen: string; params?: object }
  | { kind: 'job'; tab: string; screen: 'ClientJobDetail' | 'JobDetail'; jobId: string };

/** Pure: reads the payload, touches neither the network nor the navigator. */
function resolveTarget(data: NotificationData | null): RouteTarget | null {
  if (!data?.screen) return null;

  const tab = TAB_FOR_SCREEN[data.screen];
  if (!tab) return null;

  // Profile needs no record.
  if (data.screen === 'ProfileMain') {
    return { kind: 'direct', tab, screen: 'ProfileMain' };
  }

  // phase57: a pre-hire chat notification carries a direct thread, never a
  // job. Chat's route param is the ChatTarget union, so this is the same
  // screen with the other half of that union.
  if (data.screen === 'Chat' && data.directThreadId) {
    return {
      kind: 'direct',
      tab,
      screen: 'Chat',
      params: { directThreadId: data.directThreadId },
    };
  }

  if (!data.jobId) return null;

  // These take only an id, so they can be routed without a round-trip.
  if (data.screen === 'Chat' || data.screen === 'WorkerJob') {
    return { kind: 'direct', tab, screen: data.screen, params: { jobId: data.jobId } };
  }

  // ClientJobDetail / JobDetail need the job row itself.
  if (data.screen === 'ClientJobDetail' || data.screen === 'JobDetail') {
    return { kind: 'job', tab, screen: data.screen, jobId: data.jobId };
  }

  // Named in TAB_FOR_SCREEN but not handled above. Fail closed rather than
  // guessing: a wrong destination is worse than none.
  return null;
}

/**
 * Whether a payload resolves to a real destination.
 *
 * Screen 42's feed needs this. A row that marks itself read and then navigates
 * nowhere is a dead tap, so a row whose payload resolves to nothing must not
 * be tappable at all. It answers from the SAME resolver handleNotificationData
 * dispatches on, so the feed and the router cannot disagree about what is
 * reachable - which is the entire reason the switch was pulled out of the
 * screen.
 *
 * A 'job' target is reported routable on the strength of its jobId alone. If
 * that row later turns out to be deleted or RLS-hidden, the dispatch below
 * lands on the owning tab, which is still a real destination.
 */
export function canRouteNotification(raw: unknown): boolean {
  return resolveTarget(toNotificationData(raw)) !== null;
}

/**
 * Routes a tapped notification to the screen it refers to, with the record
 * already loaded.
 *
 * Two of the destinations (ClientJobDetail, JobDetail) take a whole job object
 * as a route param rather than an id, so this fetches the row before
 * navigating. That is why the whole function is async and why a tap can't be
 * turned into a plain linking URL.
 *
 * Both consumers come through here: the push tap (hooks/usePushNotifications)
 * and the in-app feed (screens/NotificationsScreen).
 */
export async function handleNotificationData(raw: unknown): Promise<void> {
  const data = toNotificationData(raw);
  const target = resolveTarget(data);

  if (!target) {
    if (data?.screen && !TAB_FOR_SCREEN[data.screen]) {
      console.error('[push] unknown notification screen', data.screen);
    } else if (data?.screen) {
      console.error('[push] notification missing jobId for screen', data.screen);
    }
    return;
  }

  if (target.kind === 'direct') {
    navigateChecked(target.tab, target.screen, target.params);
    return;
  }

  const { data: job, error } = await fetchJobById(target.jobId);

  if (error || !job) {
    // Deleted job, or RLS hides it from this user (e.g. they were unassigned).
    // Land them on the owning tab rather than doing nothing at all.
    console.error('[push] could not load job for notification', target.jobId, error);
    navigateChecked(target.tab);
    return;
  }

  if (target.screen === 'ClientJobDetail') {
    navigateChecked('MyJobs', 'ClientJobDetail', { job });
    return;
  }

  // JobDetail takes an OpenJob, which is a strict subset of Job's fields.
  navigateChecked('MyJobs', 'JobDetail', { job: job as OpenJob });
}
