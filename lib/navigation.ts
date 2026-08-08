import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Job, JobCategory, OpenJob } from './jobs';
import type { ChatTarget } from './messages';
import type { PhoneAuthIntent, PhoneProfileDraft } from './phoneAuth/types';

// The signed-out flow. Not a tab: it replaces the whole tab bar until there is
// a session, so it is its own stack rooted at Welcome. The branded launch
// layer is not a route here — it renders above everything (see LaunchGate in
// App.tsx) so the destination is already mounted when it fades out.
// The flow is phone-first and paired: SignIn/CreateAccount take a number and
// route to VerifyPhone, while EmailSignIn/EmailCreateAccount hold the email +
// password forms that actually authenticate until SMS is switched on. Each
// half is its own route rather than a toggle inside one screen, so each keeps
// its own back behaviour and neither loses what the user typed in the other.
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  EmailSignIn: undefined;
  CreateAccount: undefined;
  EmailCreateAccount: undefined;
  VerifyPhone: VerifyPhoneParams;
};

/**
 * What the verify-phone screen is handed when a code request succeeds.
 *
 * Note what is NOT here: the code itself. Route params are held in navigation
 * state, restored on remount and readable by anything that can reach the
 * navigator, so the only thing routed is the challenge's *identity* — the
 * screen reads the live challenge back from the provider (mock mode's
 * development code included) rather than carrying a credential through the
 * navigation tree.
 */
export type VerifyPhoneParams = {
  /** E.164, already normalised by lib/phoneNumber.ts. */
  phone: string;
  /** Display only — '+1 ••• ••• 0610', from maskE164(). */
  maskedPhone: string;
  /** Sign-in and sign-up challenges are never interchangeable. */
  intent: PhoneAuthIntent;
  challengeId: string;
  /** Epoch ms, or null when the server owns the expiry. */
  expiresAt: number | null;
  resendAvailableAt: number;
  /** Sign-up only: what the create-account screen collected, pre-auth. */
  profileDraft?: PhoneProfileDraft;
};

export type AuthStackNavigation = NativeStackNavigationProp<AuthStackParamList>;

// The one-time step between authentication and the app. Its own stack rather
// than a screen inside AuthFlow, because it is only reachable *with* a
// session — and because the legal gate has to be a real pushed route here so
// Setup stays mounted underneath it and its entrance doesn't replay on the
// way back. LegalGate takes no params: it reads the documents and the
// acceptance record from lib/legal, which is the only source for either.
export type OnboardingStackParamList = {
  Setup: undefined;
  LegalGate: undefined;
};

export type OnboardingStackNavigation = NativeStackNavigationProp<OnboardingStackParamList>;

// Screens stacked inside the Home tab — posting, plus the "explore/browse
// open jobs" flow. Find Work is no longer its own tab; BrowseJobs/JobDetail
// live here now so it's still reachable from Home ("Find Work" button and
// the "Find work" link on the live-marketplace preview).
export type HomeStackParamList = {
  HomeMain: undefined;
  /**
   * Doubles as the direct-offer flow: when hireWorkerId is present the form
   * sends a private job request. It creates no job until that worker accepts
   * the request (or a counteroffer), so it never leaks into public bidding.
   */
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        /** Carried from Home's search field / a tapped category chip so a
         *  fresh post starts pre-filled instead of blank. Ignored in edit
         *  and hire-again modes, which load their own values. */
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
  BrowseJobs: undefined;
  JobDetail: { job: OpenJob };
  /**
   * Worker search. Opened blank from Home's search field, or pre-run with a
   * typed query / a tapped service chip.
   */
  WorkerSearch: { query?: string; category?: string } | undefined;
  /**
   * The spacious Worker job list — "View all", the two availability-card
   * filter pills, and Worker Home's own search bar all land here with a
   * different `mode` rather than each getting a near-duplicate screen.
   */
  WorkerResults: {
    mode: 'all' | 'skills' | 'nearby' | 'search';
    query?: string;
    /** For "nearby": the already-resolved center point from Home's own pill,
     *  so this screen filters the exact same coordinates rather than calling
     *  the GPS again and risking a different (if nearly identical) cell set.
     *  Falls back to resolving fresh if omitted. */
    lat?: number;
    lng?: number;
    label?: string;
  };
};

export type HomeStackNavigation = NativeStackNavigationProp<HomeStackParamList>;

// Screens stacked inside the unified My Jobs hub tab. All job detail/progress
// screens live here so hub cards navigate within the same stack.
export type MyJobsStackParamList = {
  MyJobsHub: undefined;
  ClientJobDetail: { job: Job };
  WorkerJob: { jobId: string };
  JobDetail: { job: OpenJob };
  Chat: ChatTarget;
  // Registered here too so "Hire Again" on a bid card can open it in place.
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        /** Carried from Home's search field / a tapped category chip so a
         *  fresh post starts pre-filled instead of blank. Ignored in edit
         *  and hire-again modes, which load their own values. */
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;

// Screens stacked inside the Messages (inbox) tab.
export type MessagesStackParamList = {
  MessagesInbox: undefined;
  Chat: ChatTarget;
  // "Hire Again" from a past conversation.
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        /** Carried from Home's search field / a tapped category chip so a
         *  fresh post starts pre-filled instead of blank. Ignored in edit
         *  and hire-again modes, which load their own values. */
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
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
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        /** Carried from Home's search field / a tapped category chip so a
         *  fresh post starts pre-filled instead of blank. Ignored in edit
         *  and hire-again modes, which load their own values. */
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
};

export type MapStackNavigation = NativeStackNavigationProp<MapStackParamList>;

// Profile tab — the admin moderation queue is nested here, gated on is_admin.
export type ProfileStackParamList = {
  ProfileMain: undefined;
  AdminReports: undefined;
  NotificationSettings: undefined;
  LegalDocument: { document: 'terms' | 'privacy' };
  ProfileReviews: { userId: string; name?: string };
  /**
   * The dev-only design-system catalog (BRAZOS_MASTER_PLAN.md §I). The route is
   * only REGISTERED under `__DEV__` in App.tsx and its entry point in
   * ProfileScreen is gated the same way, so a production build has no path to
   * it at all. It stays in the param list because the type has to exist for
   * the dev-only navigate() call to typecheck; declaring a type ships nothing.
   */
  ComponentCatalog: undefined;
};

export type ProfileStackNavigation = NativeStackNavigationProp<ProfileStackParamList>;

// LegalDocument is only registered in ProfileStack, but gets a standalone
// route-param type for the same reason as Chat/JobDetail: the screen only
// needs its own params and goBack().
export type LegalDocumentRouteParamList = {
  LegalDocument: { document: 'terms' | 'privacy' };
};

// Chat is registered in both MyJobsStack and MessagesStack (reached from a job's
// detail screen or from the inbox). It only needs its own route param shape and
// goBack(), so its route/nav types are declared standalone rather than tied to
// either parent stack's full param list.
export type ChatRouteParamList = { Chat: ChatTarget };

// JobDetail (the worker bid screen) is registered in HomeStack, MyJobsStack,
// and MapStack — reached from browsing, a hotspot drill-down, etc. Same
// standalone-type treatment as Chat, for the same reason.
export type JobDetailRouteParamList = { JobDetail: { job: OpenJob } };

// PostJob is registered in HomeStack, MyJobsStack, MessagesStack and MapStack
// (posting normally, editing from any customer detail entry point, plus "Hire
// Again" from a bid card or a past job conversation). Same standalone-type
// treatment as Chat/JobDetail.
// WorkerProfile is registered in every stack that can surface another user
// (a bid card, a chat counterparty), so like Chat/JobDetail/PostJob it gets a
// standalone route-param type rather than being tied to one parent stack.
export type WorkerProfileRouteParamList = {
  WorkerProfile: { workerId: string; workerName?: string };
};

// Registered in every stack that can show a profile (including the Profile
// tab, for the user's own reviews). Same standalone-type treatment as the
// others: the screen needs its params and goBack(), not the whole stack.
export type ProfileReviewsRouteParamList = {
  ProfileReviews: { userId: string; name?: string };
};

// Only registered in HomeStack today, but given its own route-param type for
// the same reason as the others: the screen needs its params and goBack(),
// not the whole parent stack.
export type WorkerSearchRouteParamList = {
  WorkerSearch: { query?: string; category?: string } | undefined;
};

export type PostJobRouteParamList = {
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        /** Carried from Home's search field / a tapped category chip so a
         *  fresh post starts pre-filled instead of blank. Ignored in edit
         *  and hire-again modes, which load their own values. */
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
      }
    | undefined;
};
