import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Job, OpenJob } from './jobs';

// Screens stacked inside the Home tab (posting only).
export type HomeStackParamList = {
  HomeMain: undefined;
  PostJob: undefined;
};

export type HomeStackNavigation = NativeStackNavigationProp<HomeStackParamList>;

// Screens stacked inside the Find Work (worker browse) tab.
export type WorkStackParamList = {
  BrowseJobs: undefined;
  JobDetail: { job: OpenJob };
};

export type WorkStackNavigation = NativeStackNavigationProp<WorkStackParamList>;

// Screens stacked inside the unified My Jobs hub tab. All job detail/progress
// screens live here so hub cards navigate within the same stack.
export type MyJobsStackParamList = {
  MyJobsHub: undefined;
  ClientJobDetail: { job: Job };
  WorkerJob: { jobId: string };
  JobDetail: { job: OpenJob };
  Chat: { jobId: string };
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;

// Screens stacked inside the Messages (inbox) tab.
export type MessagesStackParamList = {
  MessagesInbox: undefined;
  Chat: { jobId: string };
};

export type MessagesStackNavigation = NativeStackNavigationProp<MessagesStackParamList>;

// Screens stacked inside the Map tab. JobDetail is registered here too so a
// hotspot drill-down can open a job (and let the worker bid) without leaving
// the tab.
export type MapStackParamList = {
  MapMain: undefined;
  CellJobs: { ilat: number; ilng: number; count: number };
  JobDetail: { job: OpenJob };
};

export type MapStackNavigation = NativeStackNavigationProp<MapStackParamList>;

// Chat is registered in both MyJobsStack and MessagesStack (reached from a job's
// detail screen or from the inbox). It only needs its own route param shape and
// goBack(), so its route/nav types are declared standalone rather than tied to
// either parent stack's full param list.
export type ChatRouteParamList = { Chat: { jobId: string } };
