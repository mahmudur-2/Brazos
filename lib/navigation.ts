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
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;
