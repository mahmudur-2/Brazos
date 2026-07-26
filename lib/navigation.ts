import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Job, OpenJob } from './jobs';

// Screens stacked inside the Home tab — posting, plus the "explore/browse
// open jobs" flow. Find Work is no longer its own tab; BrowseJobs/JobDetail
// live here now so it's still reachable from Home ("Find Work" button and
// the "See all" link on the nearby-jobs preview).
export type HomeStackParamList = {
  HomeMain: undefined;
  /**
   * Doubles as the "Hire Again" flow: when hireWorkerId is present the form
   * creates the job already assigned to that worker instead of opening it for
   * bidding.
   */
  PostJob:
    | { hireWorkerId?: string; hireWorkerName?: string; editJobId?: string; threadJobId?: string }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  BrowseJobs: undefined;
  JobDetail: { job: OpenJob };
};

export type HomeStackNavigation = NativeStackNavigationProp<HomeStackParamList>;

// Screens stacked inside the unified My Jobs hub tab. All job detail/progress
// screens live here so hub cards navigate within the same stack.
export type MyJobsStackParamList = {
  MyJobsHub: undefined;
  ClientJobDetail: { job: Job };
  WorkerJob: { jobId: string };
  JobDetail: { job: OpenJob };
  Chat: { jobId: string };
  // Registered here too so "Hire Again" on a bid card can open it in place.
  PostJob:
    | { hireWorkerId?: string; hireWorkerName?: string; editJobId?: string; threadJobId?: string }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;

// Screens stacked inside the Messages (inbox) tab.
export type MessagesStackParamList = {
  MessagesInbox: undefined;
  Chat: { jobId: string };
  // "Hire Again" from a past conversation.
  PostJob:
    | { hireWorkerId?: string; hireWorkerName?: string; editJobId?: string; threadJobId?: string }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
};

export type MessagesStackNavigation = NativeStackNavigationProp<MessagesStackParamList>;

// Screens stacked inside the Map tab. JobDetail is registered here too so a
// hotspot drill-down can open a job (and let the worker bid) without leaving
// the tab.
export type MapStackParamList = {
  MapMain: undefined;
  CellJobs: { ilat: number; ilng: number; count: number };
  JobDetail: { job: OpenJob };
  // Registered so "Edit job" works when a job's own poster reaches its
  // detail screen via a Map/zone drill-down, not just from My Jobs.
  PostJob:
    | { hireWorkerId?: string; hireWorkerName?: string; editJobId?: string; threadJobId?: string }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
};

export type MapStackNavigation = NativeStackNavigationProp<MapStackParamList>;

// Profile tab — the admin moderation queue is nested here, gated on is_admin.
export type ProfileStackParamList = {
  ProfileMain: undefined;
  AdminReports: undefined;
};

export type ProfileStackNavigation = NativeStackNavigationProp<ProfileStackParamList>;

// Chat is registered in both MyJobsStack and MessagesStack (reached from a job's
// detail screen or from the inbox). It only needs its own route param shape and
// goBack(), so its route/nav types are declared standalone rather than tied to
// either parent stack's full param list.
export type ChatRouteParamList = { Chat: { jobId: string } };

// JobDetail (the worker bid screen) is registered in HomeStack, MyJobsStack,
// and MapStack — reached from browsing, a hotspot drill-down, etc. Same
// standalone-type treatment as Chat, for the same reason.
export type JobDetailRouteParamList = { JobDetail: { job: OpenJob } };

// PostJob is registered in HomeStack, MyJobsStack and MessagesStack (posting
// normally, plus "Hire Again" from a bid card or a past conversation). Same
// standalone-type treatment as Chat/JobDetail.
// WorkerProfile is registered in every stack that can surface another user
// (a bid card, a chat counterparty), so like Chat/JobDetail/PostJob it gets a
// standalone route-param type rather than being tied to one parent stack.
export type WorkerProfileRouteParamList = {
  WorkerProfile: { workerId: string; workerName?: string };
};

export type PostJobRouteParamList = {
  PostJob:
    | { hireWorkerId?: string; hireWorkerName?: string; editJobId?: string; threadJobId?: string }
    | undefined;
};
