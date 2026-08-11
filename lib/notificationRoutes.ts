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
 * Routes a tapped notification to the screen it refers to, with the record
 * already loaded.
 *
 * Two of the destinations (ClientJobDetail, JobDetail) take a whole job object
 * as a route param rather than an id, so this fetches the row before
 * navigating. That is why the whole function is async and why a tap can't be
 * turned into a plain linking URL.
 */
export async function handleNotificationData(raw: unknown): Promise<void> {
  const data = toNotificationData(raw);
  if (!data?.screen) return;

  const tab = TAB_FOR_SCREEN[data.screen];
  if (!tab) {
    console.error('[push] unknown notification screen', data.screen);
    return;
  }

  // Profile needs no record.
  if (data.screen === 'ProfileMain') {
    navigateChecked('Profile', 'ProfileMain');
    return;
  }

  // phase57: a pre-hire chat notification carries a direct thread, never a
  // job. Chat's route param is the ChatTarget union, so this is the same
  // screen with the other half of that union.
  if (data.screen === 'Chat' && data.directThreadId) {
    navigateChecked(tab, 'Chat', { directThreadId: data.directThreadId });
    return;
  }

  if (!data.jobId) {
    console.error('[push] notification missing jobId for screen', data.screen);
    return;
  }

  // These take only an id, so they can be routed without a round-trip.
  if (data.screen === 'Chat' || data.screen === 'WorkerJob') {
    navigateChecked(tab, data.screen, { jobId: data.jobId });
    return;
  }

  // ClientJobDetail / JobDetail need the job row itself.
  const { data: job, error } = await fetchJobById(data.jobId);

  if (error || !job) {
    // Deleted job, or RLS hides it from this user (e.g. they were unassigned).
    // Land them on the owning tab rather than doing nothing at all.
    console.error('[push] could not load job for notification', data.jobId, error);
    navigateChecked(tab);
    return;
  }

  if (data.screen === 'ClientJobDetail') {
    navigateChecked('MyJobs', 'ClientJobDetail', { job });
    return;
  }

  // JobDetail takes an OpenJob, which is a strict subset of Job's fields.
  navigateChecked('MyJobs', 'JobDetail', { job: job as OpenJob });
}
