import { fetchJobById } from './jobs';
import type { OpenJob } from './jobs';
import { navigationRef, navigateWhenReady } from './navigationRef';

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
  type?: string;
  outboxId?: string;
};

/** Tab that owns each destination, for the nested navigate() call. */
const TAB_FOR_SCREEN: Record<string, string> = {
  Chat: 'Messages',
  ClientJobDetail: 'MyJobs',
  WorkerJob: 'MyJobs',
  JobDetail: 'Home',
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
    navigateWhenReady(() => navigationRef.navigate('Profile', { screen: 'ProfileMain' }));
    return;
  }

  if (!data.jobId) {
    console.error('[push] notification missing jobId for screen', data.screen);
    return;
  }

  // These take only an id, so they can be routed without a round-trip.
  if (data.screen === 'Chat' || data.screen === 'WorkerJob') {
    navigateWhenReady(() =>
      navigationRef.navigate(tab, {
        screen: data.screen,
        params: { jobId: data.jobId },
      })
    );
    return;
  }

  // ClientJobDetail / JobDetail need the job row itself.
  const { data: job, error } = await fetchJobById(data.jobId);

  if (error || !job) {
    // Deleted job, or RLS hides it from this user (e.g. they were unassigned).
    // Land them on the owning tab rather than doing nothing at all.
    console.error('[push] could not load job for notification', data.jobId, error);
    navigateWhenReady(() => navigationRef.navigate(tab));
    return;
  }

  if (data.screen === 'ClientJobDetail') {
    navigateWhenReady(() =>
      navigationRef.navigate('MyJobs', {
        screen: 'ClientJobDetail',
        params: { job },
      })
    );
    return;
  }

  // JobDetail takes an OpenJob, which is a strict subset of Job's fields.
  navigateWhenReady(() =>
    navigationRef.navigate('Home', {
      screen: 'JobDetail',
      params: { job: job as OpenJob },
    })
  );
}
