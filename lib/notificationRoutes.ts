import { alertAsync } from './dialog';
import { fetchJobById } from './jobs';
import type { OpenJob } from './jobs';
import type { AppMode } from '../modes/types';
import { navigateAcrossTabs } from './navigationRef';
import { Sentry } from './observability/sentry';

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
  /** Idea 6: the reminder's Route button — the worker's job opens and asks for directions. */
  intent?: string;
  /** Idea 20: the offer a bid push's Accept & pay opens the confirm for. */
  offerId?: string;
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

/**
 * Which mode OWNS each destination (Stage 4D mode purity). ClientJobDetail is
 * the poster's own job — customer activity; WorkerJob and the bid screen are
 * the worker's side of the marketplace. `null` marks a genuinely shared
 * surface (the inbox, the profile), which never asks for a switch. Every
 * destination still RESOLVES in both trees — the MyJobs tab is mounted in
 * both — so this is a UX contract about which perspective the user should be
 * standing in, not about technical reachability.
 */
const MODE_FOR_SCREEN: Record<string, AppMode | null> = {
  Chat: null,
  ClientJobDetail: 'customer',
  WorkerJob: 'worker',
  JobDetail: 'worker',
  ProfileMain: null,
};

/**
 * ModeContext, as the router needs it — supplied by the React caller through
 * hooks/useNotificationModeBridge.ts, because this module lives outside the
 * component tree and must never mirror mode state into a second authority.
 */
export type NotificationModeBridge = {
  /** The resolved mode, or null while resolution is pending (cold start). */
  getMode: () => AppMode | null;
  /**
   * ModeProvider's switchMode: the confirmation is mandatory and lives inside
   * the provider; resolves true only once the target tree is mounted, false
   * when declined or refused.
   */
  switchMode: (
    target: AppMode,
    options: { confirm: { title: string; message?: string; confirmText?: string } }
  ) => Promise<boolean>;
};

/** The cross-mode prompt's copy, per destination mode. */
const CROSS_MODE_CONFIRM: Record<AppMode, { title: string; message: string; confirmText: string }> =
  {
    customer: {
      title: 'Switch to Customer Mode?',
      message:
        'This update is about a job you posted. Viewing it means switching to Customer Mode — your worker-side work stays exactly where it is.',
      confirmText: 'Switch',
    },
    worker: {
      title: 'Switch to Worker Mode?',
      message:
        'This update is about work you’re doing. Viewing it means switching to Worker Mode — your posted jobs stay exactly where they are.',
      confirmText: 'Switch',
    },
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
    intent: typeof data.intent === 'string' ? data.intent : undefined,
    offerId: typeof data.offerId === 'string' ? data.offerId : undefined,
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
  | { kind: 'direct'; tab: string; screen: string; params?: object; mode: AppMode | null }
  | {
      kind: 'job';
      tab: string;
      screen: 'ClientJobDetail' | 'JobDetail';
      jobId: string;
      mode: AppMode | null;
      /** Idea 14: a repeat visit's "Confirm $X" opens Checkout on arrival; idea 20 its Confirm button
       *  pays with the saved card there, and a bid's Accept & pay opens that offer's confirm. */
      intent?: 'checkout' | 'pay' | 'accept';
      offerId?: string;
    };

/** Pure: reads the payload, touches neither the network nor the navigator. */
function resolveTarget(data: NotificationData | null): RouteTarget | null {
  if (!data?.screen) return null;

  const tab = TAB_FOR_SCREEN[data.screen];
  if (!tab) return null;

  const mode = MODE_FOR_SCREEN[data.screen] ?? null;

  // Profile needs no record.
  if (data.screen === 'ProfileMain') {
    return { kind: 'direct', tab, screen: 'ProfileMain', mode };
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
      mode,
    };
  }

  if (!data.jobId) return null;

  // These take only an id, so they can be routed without a round-trip.
  if (data.screen === 'Chat' || data.screen === 'WorkerJob') {
    // Idea 6: only the worker's job takes the Route button's intent — an allow-list of one.
    const intent = data.screen === 'WorkerJob' && data.intent === 'route' ? { intent: 'route' as const } : {};
    return { kind: 'direct', tab, screen: data.screen, params: { jobId: data.jobId, ...intent }, mode };
  }

  // ClientJobDetail / JobDetail need the job row itself.
  if (data.screen === 'ClientJobDetail' || data.screen === 'JobDetail') {
    // Only the customer's job takes an intent — an allow-list: Checkout (idea 14), Checkout paying with
    // the saved card (idea 20's Confirm), and an offer's confirm (idea 20's Accept & pay, which needs
    // the offer).
    const onClientJob = data.screen === 'ClientJobDetail';
    const intent =
      onClientJob && (data.intent === 'checkout' || data.intent === 'pay')
        ? { intent: data.intent === 'pay' ? ('pay' as const) : ('checkout' as const) }
        : onClientJob && data.intent === 'accept' && data.offerId
          ? { intent: 'accept' as const, offerId: data.offerId }
          : {};
    return { kind: 'job', tab, screen: data.screen, jobId: data.jobId, mode, ...intent };
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
 * and the in-app feed (screens/NotificationsScreen). Each passes ModeContext
 * through the bridge, because of the gate below.
 */
export async function handleNotificationData(
  raw: unknown,
  bridge: NotificationModeBridge
): Promise<void> {
  const data = toNotificationData(raw);
  const target = resolveTarget(data);

  if (!target) {
    if (data?.screen && !TAB_FOR_SCREEN[data.screen]) {
      console.error('[push] unknown notification screen', data.screen);
      Sentry?.captureException(new Error('[push] unknown notification screen'), {
        extra: { site: 'notificationRoutes.handleNotificationData', screen: data.screen },
      });
    } else if (data?.screen) {
      console.error('[push] notification missing jobId for screen', data.screen);
      Sentry?.captureException(new Error('[push] notification missing jobId for screen'), {
        extra: { site: 'notificationRoutes.handleNotificationData', screen: data.screen },
      });
    }
    if (data?.screen) {
      // A tapped alert that routes nowhere says so instead of silently doing
      // nothing (F-042). Only a payload that NAMED a destination gets the
      // dialog — a bare informational push opening the app is not an error.
      // The in-app feed never reaches this: canRouteNotification() disables
      // its unroutable rows before they can be tapped.
      await alertAsync(
        'Couldn’t open this notification',
        'It points at a screen this version of the app can’t open.'
      );
    }
    return;
  }

  // The cross-mode gate (Stage 4D): a destination OWNED by the other mode
  // asks for the switch first — through switchMode() itself, whose
  // confirmation is mandatory and cannot be skipped — and routes only after
  // the provider reports the target tree mounted. Declining drops the
  // navigation: the user stays exactly where they are, and the event stays
  // readable in the feed. While mode resolution is still pending (the
  // cold-start replay), the gate stands down and the dispatch keeps its
  // standing contract: every destination lives in a tab mounted in BOTH
  // trees, so it resolves either way.
  const currentMode = bridge.getMode();
  if (target.mode && currentMode && currentMode !== target.mode) {
    const switched = await bridge.switchMode(target.mode, {
      confirm: CROSS_MODE_CONFIRM[target.mode],
    });
    if (!switched) return;
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
    Sentry?.captureException(error ?? new Error('[push] could not load job for notification'), {
      extra: {
        site: 'notificationRoutes.handleNotificationData',
        jobId: target.jobId,
        code: error?.code,
      },
    });
    navigateChecked(target.tab);
    return;
  }

  if (target.screen === 'ClientJobDetail') {
    navigateChecked('MyJobs', 'ClientJobDetail', {
      job,
      ...(target.intent ? { intent: target.intent } : {}),
      ...(target.offerId ? { offerId: target.offerId } : {}),
    });
    return;
  }

  // JobDetail takes an OpenJob, which is a strict subset of Job's fields.
  navigateChecked('MyJobs', 'JobDetail', { job: job as OpenJob });
}
