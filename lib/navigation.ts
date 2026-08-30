import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppMode } from '../modes/types';
import type { Job, JobCategory, OpenJob } from './jobs';
import type { ChatTarget } from './messages';
import { navigateAcrossTabs } from './navigationRef';
import type { NotificationModeBridge } from './notificationRoutes';
import type { Offer } from './offers';
import type { PhoneAuthIntent, PhoneProfileDraft } from './phoneAuth/types';

/**
 * Chat's route params.
 *
 * `counterpartyId` is the canonical conversation identity: a pair have exactly
 * ONE conversation, and that is what names it. The two legacy shapes stay
 * valid forever — every job screen, every push payload and every offer surface
 * already navigates with a `jobId` or a `directThreadId`, and none of them
 * should have to manufacture a counterparty id. Chat derives the person from
 * whichever identifier it was handed and renders the same merged conversation
 * either way; a supplied `jobId` is kept ONLY as the initial scroll target.
 */
export type ChatTargetParams =
  | (ChatTarget & { counterpartyId?: undefined })
  | { counterpartyId: string; jobId?: undefined; directThreadId?: undefined };

/** The two bounces connect-return serves: the worker came back, or the
 *  single-use link had expired unused (R5b "FOR R6"). */
export type PayoutsLinkFrom = 'return' | 'refresh';

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

// ===========================================================================
// The mode split (BRAZOS_MASTER_PLAN.md §F, enforcement mechanism 1)
// ===========================================================================
//
// There used to be one `HomeStackParamList` shared by Customer Home and Worker
// Home, which is exactly why a customer tapping "View all" landed in the
// worker marketplace: the two modes were the same stack, so nothing could
// object. They are now two stacks with two types.
//
// The rule this buys: a screen types its navigation against the tree it lives
// in, so `navigate('WorkerResults')` from customer code is a compile error
// rather than a mode leak, and `navigate('WorkerSearch')` from worker code
// likewise.
// tsc is the enforcement — no lint rule, no code review, no runtime check.
//
// The Home tab is the mode-defining tab. The other four (Map, MyJobs,
// Messages, Profile) are deliberately SHARED, one implementation each, mounted
// in both trees: a Brazos account is simultaneously a customer and a worker on
// different jobs, so its inbox, its job hub, its map and its profile are the
// same surfaces in both modes. Duplicating them would be duplicating screens
// to no end (§F "preserve shared routes"; §P.3 "do not create a second version
// of an existing component or screen").

/**
 * The Home tab in CUSTOMER mode: posting a job and finding workers.
 *
 * Note what is absent, and cannot be reached from here: `WorkerHome` (the
 * worker dashboard), `WorkerResults` (the worker job feed) and `JobDetail`
 * (the worker bid screen). Those are worker surfaces — EST. PAY, bid CTAs,
 * payout figures — and a customer route into them is the leak §F exists to
 * make impossible.
 */
export type CustomerHomeStackParamList = {
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
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
  /**
   * Worker search. Opened blank from Home's search field, or pre-run with a
   * typed query / a tapped service chip. `autoFocus: false` suppresses the
   * open-with-keyboard behaviour for the Discover tab's root mount, where a
   * keyboard popping on every first tab visit would be noise.
   */
  WorkerSearch: { query?: string; category?: string; autoFocus?: boolean } | undefined;
};

export type CustomerHomeStackNavigation =
  NativeStackNavigationProp<CustomerHomeStackParamList>;

/**
 * The customer Discover tab (Stage 4D) — the customer's browse surface, rooted
 * at the same WorkerSearchScreen the Home stack pushes. Mode purity: this tab
 * lists WORKERS and services, never job postings. WorkerProfile / PostJob /
 * ProfileReviews ride along per the standing every-stack-that-surfaces-a-user
 * rule (WorkerSearch opens profiles; a profile offers "Send an offer").
 */
export type DiscoverStackParamList = {
  WorkerSearch: { query?: string; category?: string; autoFocus?: boolean } | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
};

export type DiscoverStackNavigation = NativeStackNavigationProp<DiscoverStackParamList>;

/**
 * The Home tab in WORKER mode: the job marketplace.
 *
 * Rooted since Stage 4D at `WorkerHome` (the dashboard); every job-list
 * intent lands on `WorkerResults` (4D-1b — the locked atlas-48 browse screen
 * is unmounted and unnamed here, so a dispatch to it is a compile error).
 * The stack still belongs to the worker tree only — popping to its root lands
 * on the worker's own home, never Customer Home.
 */
export type WorkerHomeStackParamList = {
  WorkerHome: undefined;
  JobDetail: { job: OpenJob };
  /** Phase 7 — pre-hire chat from the worker's own-bid card. Registered
   *  alongside JobDetail in every stack that mounts it (the SubmitBid rule):
   *  an offer links the pair, and the chat entry lives on the offer surface. */
  Chat: ChatTargetParams;
  /** Screen 52 — the OfferComposer's marketplace-bid entry (Phase 5).
   *  Registered alongside JobDetail in every stack that mounts it. */
  SubmitBid: { job: OpenJob };
  /** Screen 53 — bid confirmation (Phase 5). SubmitBid replaces itself with
   *  this, so Back cannot land on a re-submittable form. */
  BidSent: { jobTitle: string; amountCents: number; offerId: string };
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
  /**
   * Registered 2026-08-10 (user decision, device-reproduced crash). This tree
   * mounts three screens that dispatch it — WorkerProfile ("Send an offer"),
   * Chat (re-hire), JobDetail (own-job Edit via useJobOwnerActions) — and was
   * the ONLY stack of the six not registering it, so those taps threw
   * `NAVIGATE 'PostJob' was not handled by any navigator`. PostJob has been
   * registered in all four shared tabs since Phase 5–9: it is a shared
   * surface, not a customer-Home-only one, and the standing every-stack-that-
   * surfaces-a-user rule applies here as everywhere. Supersedes the Phase-3
   * Known-Issues stance; decision recorded in BRAZOS_BUILD_STATE.md.
   */
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
  /**
   * The spacious Worker job list — "View all", the two availability-card
   * filter pills, and Worker Home's own search bar all land here with a
   * different `mode` rather than each getting a near-duplicate screen.
   */
  WorkerResults: {
    mode: 'all' | 'skills' | 'nearby' | 'search';
    query?: string;
    /** Worker Home's category pills (2026-08-22): seeds the screen's existing
     *  job-filter model with this one category — the same filter the sheet's
     *  own category chips drive, so the badge shows it and the user can clear
     *  it. Validated against JOB_CATEGORY_LABELS at the seed; an unknown key
     *  seeds nothing. Same plain-string shape as WorkerSearch's `category`. */
    category?: string;
    /** For "nearby": the already-resolved center point from Home's own pill,
     *  so this screen filters the exact same coordinates rather than calling
     *  the GPS again and risking a different (if nearly identical) cell set.
     *  Falls back to resolving fresh if omitted. */
    lat?: number;
    lng?: number;
    label?: string;
  };
};

export type WorkerHomeStackNavigation =
  NativeStackNavigationProp<WorkerHomeStackParamList>;

// Screens stacked inside the unified My Jobs hub tab. All job detail/progress
// screens live here so hub cards navigate within the same stack.
export type MyJobsStackParamList = {
  MyJobsHub: undefined;
  ClientJobDetail: { job: Job };
  WorkerJob: { jobId: string };
  JobDetail: { job: OpenJob };
  SubmitBid: { job: OpenJob };
  BidSent: { jobTitle: string; amountCents: number; offerId: string };
  /** Screen 28 — the comparison surface over a job's pending bids (Phase 5). */
  CompareBids: { job: Job };
  /** Screen 29 — one bid's full terms and proof, with accept/counter/decline. */
  BidDetail: { job: Job; offerId: string };
  /** Screen 30 — OfferComposer's counter entry from the customer bid surfaces.
   *  The offer is a seed; counter_offer() re-validates state server-side. */
  Counteroffer: {
    job: Job;
    offer: Offer;
    counterpartyName: string;
    countersRemaining: number;
  };
  /** Screen 31 — sandbox protected checkout for an assigned, unfunded job. */
  Checkout: { job: Job };
  /** Screen 32 — rendered only after funds are genuinely held. */
  JobConfirmed: { job: Job };
  /** Screen 56 — the worker's static arrival declarations (Phase 6). No live
   *  location exists anywhere; these are two one-way taps. */
  RouteArrival: { jobId: string };
  /** Screen 57 — the worker's job checklist (Phase 6). */
  WorkChecklist: { jobId: string };
  /** Screen 33 — the customer's static "where things stand" timeline (Phase 6). */
  TrackWorker: { job: Job };
  /** Screen 36 — approve the finished work (releasing held funds) or report
   *  an issue that freezes release. Authorization is server-side (phase51). */
  ApproveOrDispute: { job: Job };
  /** Screen 37 — review & tip, reachable only after release per the §9
   *  ordering (release first, then review). */
  ReviewAndTip: { job: Job };
  Chat: ChatTargetParams;
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
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;

// Screens stacked inside the Messages (inbox) tab.
export type MessagesStackParamList = {
  MessagesInbox: undefined;
  // Reached ONLY from the inbox's foot row, and only after
  // expo-local-authentication has succeeded (phase77 HIDDEN_CHATS). No params:
  // which conversations are hidden is read live, not carried through a route.
  HiddenChats: undefined;
  Chat: ChatTargetParams;
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
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
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
  SubmitBid: { job: OpenJob };
  BidSent: { jobTitle: string; amountCents: number; offerId: string };
  /** Phase 7 — pre-hire chat from the worker's own-bid card (the JobDetail
   *  rule: registered wherever JobDetail is). */
  Chat: ChatTargetParams;
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
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
};

export type MapStackNavigation = NativeStackNavigationProp<MapStackParamList>;

// Profile tab — the admin moderation queue is nested here, gated on is_admin.
export type ProfileStackParamList = {
  /** Golden master 45 — the profile hub. `edit: true` opens it on the edit
   *  surface, which is how masters 42's pencil and its "Edit profile" chip
   *  both reach the form. */
  ProfileMain: { edit?: boolean } | undefined;
  /** Golden master 42 — the hub's read-only details page (decision 10). */
  ProfileDetails: undefined;
  /** Golden master 41 — the hub's account & safety page (decision 10). */
  AccountSafety: undefined;
  AdminReports: undefined;
  NotificationSettings: undefined;
  /** Profile → Appearance (4D-4): the Light/Dark/System theme setting. */
  Appearance: undefined;
  /** Screens 64+66 (Phase 9): the worker's services & pricing manager with
   *  the availability toggle and the honest verification state. */
  ServicesPricing: undefined;
  /** Screen 46 + the Rebook 08 fold-in (Phase 9): saved + past workers. */
  SavedWorkers: undefined;
  /** Screen 45 (Phase 9): the sandbox payment-methods surface. */
  PaymentMethods: undefined;
  /** Screens 59+60 (Phase 11): the ledger-derived wallet + simulated cash-out. */
  Earnings: undefined;
  /**
   * R6c (D1/D2) — the worker's payout state over connect-onboarding /
   * connect-status. Reached from Earnings in stripe mode and by the
   * brazos://payouts?from=return|refresh deep link: `from` is the bounce the
   * provider's browser took, `at` the arrival time so a repeated bounce is a
   * distinct param change. Registered on the SHARED profile stack (it is
   * mounted in both trees); the deep link's cross-mode gate treats it as
   * worker-owned.
   */
  Payouts: { from?: PayoutsLinkFrom; at?: number } | undefined;
  /** Screen 42 (Phase 12): the in-app event feed over the phase20/56 outbox. */
  Notifications: undefined;
  /** Phase 9 — SavedWorkers surfaces other users, so WorkerProfile and the
   *  PostJob hire-again entry ride along (the standing every-stack-that-
   *  surfaces-a-user rule). */
  WorkerProfile: { workerId: string; workerName?: string };
  PostJob:
    | {
        hireWorkerId?: string;
        hireWorkerName?: string;
        editJobId?: string;
        threadJobId?: string;
        initialTitle?: string;
        initialDescription?: string;
        initialCategory?: JobCategory;
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
  LegalDocument: { document: 'terms' | 'privacy' };
  ProfileReviews: { userId: string; name?: string };
  /** Phase 67 — in-app account deletion (App Store Guideline 5.1.1(v)).
   *  Reached only from the Profile tab's destructive row, below Log out. */
  DeleteAccount: undefined;
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

// ===========================================================================
// The two tab trees
// ===========================================================================
//
// Exactly one of these is mounted at a time (navigation/ModeShell.tsx), which
// is §F's enforcement mechanism 2: a screen from the other tree cannot render
// because it is not there. The trees stay separately typed, so cross-tree
// navigation is still a compile error.
//
// THE TWO BARS ARE NOT THE SAME FIVE TABS. This block used to say they were —
// `Home · Map · My Jobs · Messages · Profile`, with Discover hidden — which
// has been wrong since emerald(1) and was flagged by the 2026-08-19 audit as
// the single correction most worth making, because a run reading it would
// restore Map and My Jobs to the customer bar. What is actually drawn:
//
//   WORKER    Home · Map · My Jobs · Messages · Profile
//   CUSTOMER  Home · Discover · [ + ] · Messages · Profile
//
// The customer tree registers Map and MyJobs as HIDDEN routes — dispatchable,
// absent from the bar — and the [ + ] is an ACTION, not a destination. See
// navigation/CustomerRoot.tsx for the mechanism and why, and the per-field
// JSDoc below for each hidden route's own reason.

/** The customer tree. §F's `CustomerParamList`. */
export type CustomerParamList = {
  Home: NavigatorScreenParams<CustomerHomeStackParamList> | undefined;
  /**
   * HIDDEN route since emerald D1 — registered and dispatchable, absent from
   * the bar. home(9) removed its last customer-side caller: Home's "View map"
   * pill, which dispatched an untargeted `getParent()?.navigate('Map')`. The
   * route STAYS registered anyway — React Navigation 7 resolves an untargeted
   * NAVIGATE on the tab navigator only, so un-registering it is what turns a
   * future customer-side dispatch into a crash, and the cost of keeping it is
   * one hidden entry. The WORKER tree still draws Map as a visible tab.
   */
  Map: NavigatorScreenParams<MapStackParamList> | undefined;
  /**
   * HIDDEN route since emerald D1 — registered and dispatchable, absent from
   * the bar. Still hosts the whole customer hire + active-work loop and every
   * notification / cross-tab jump that targets the MyJobs tab
   * (lib/notificationRoutes.ts's TAB_FOR_SCREEN sends ClientJobDetail,
   * WorkerJob and JobDetail through it in BOTH trees), plus the [ + ] sheet's
   * "My jobs" action. Losing the bar item cost none of that.
   */
  MyJobs: NavigatorScreenParams<MyJobsStackParamList> | undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
  /**
   * The [ + ] creation slot (D3). An ACTION, not a destination: its bar button
   * opens the creation sheet and never dispatches navigation, so the route is
   * never focused and never draws an active state. It is named here only
   * because React Navigation requires every rendered Tab.Screen to be in the
   * param list — nothing navigates to it, and a `navigate('Create')` anywhere
   * is a defect the mode suite asserts against.
   */
  Create: undefined;
  /**
   * VISIBLE customer tab since emerald D1, in the slot Map used to hold: the
   * customer browse surface (workers and services, never job postings). It was
   * registered-but-hidden from 4D-1a until D1 — SavedWorkers has always
   * dispatched into it — so D1 gave a bar item to an existing destination
   * rather than inventing a screen.
   */
  Discover: NavigatorScreenParams<DiscoverStackParamList> | undefined;
};

/** The worker tree. §F's `WorkerParamList`. */
export type WorkerParamList = {
  Home: NavigatorScreenParams<WorkerHomeStackParamList> | undefined;
  Map: NavigatorScreenParams<MapStackParamList> | undefined;
  MyJobs: NavigatorScreenParams<MyJobsStackParamList> | undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

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
export type ChatRouteParamList = { Chat: ChatTargetParams };

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

// Registered in the customer Home stack (pushed from Home's search/chips) and
// as the Discover tab's root; its own route-param type for the same reason as
// the others: the screen needs its params and goBack(), not the whole parent
// stack.
export type WorkerSearchRouteParamList = {
  WorkerSearch: { query?: string; category?: string; autoFocus?: boolean } | undefined;
};

// SubmitBid/BidSent are registered in every stack that mounts JobDetail
// (worker Home, MyJobs, Map) — same standalone-type treatment as
// Chat/JobDetail/PostJob, and for the same reason: the screens need their own
// params and goBack(), not a parent stack's full list.
export type SubmitBidRouteParamList = { SubmitBid: { job: OpenJob } };
export type BidSentRouteParamList = {
  BidSent: { jobTitle: string; amountCents: number; offerId: string };
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
        /** Prefill for the hire flow's single offer amount, integer cents —
         *  e.g. a worker_services listed price ("Book at listed price").
         *  Read only when hireWorkerId is set; fresh posts ignore it. */
        initialAmountCents?: number;
      }
    | undefined;
};

// ===========================================================================
// R6c (D2) — the app-scheme deep link: brazos://payouts?from=return|refresh
// ===========================================================================
//
// THE ONE INBOUND LINK THE NATIVE APP ANSWERS. connect-return (R5b) bounces
// the provider's hosted onboarding back into the app on this URL, and nothing
// else in the app produces a brazos:// link today. It rides the EXISTING
// dispatch machinery — navigateAcrossTabs parks through navigateWhenReady
// (a cold-start URL is delivered before the container mounts), asks the live
// navigator through canNavigateTo, and lands on the Profile tab's Payouts
// route — and the same cross-mode gate lib/notificationRoutes.ts applies:
// payouts are worker-owned, so a customer-mode arrival asks for the switch
// through ModeProvider's own switchMode() (confirmation mandatory) and routes
// only after it resolves true. Declining drops the navigation. While mode
// resolution is pending (cold start) the gate stands down: Profile is mounted
// in both trees, so the destination resolves either way.
//
// An unknown brazos:// path is ignored silently — no alert, no navigation —
// which is the difference from a tapped notification: a bounce the app does
// not recognise is nothing the user asked for.
//
// The listener lives in App.tsx (RootNavigator, beside usePushNotifications)
// — not a `linking` prop on NavigationContainer, which this app has never
// carried; one dispatch system, not two.

/** app.config.ts's `scheme`, as the resolver matches it. */
export const APP_LINK_SCHEME = 'brazos';

export type AppLinkTarget = {
  tab: 'Profile';
  screen: 'Payouts';
  /** The mode that OWNS the destination — the cross-mode gate's input. */
  mode: AppMode;
  params: { from?: PayoutsLinkFrom };
};

/**
 * Pure: reads the URL, touches neither the network nor the navigator.
 * Returns null for anything that is not brazos://payouts — including every
 * other brazos:// path, any http(s) URL, and an empty string. A `from` value
 * outside return|refresh is dropped, not guessed.
 */
export function resolveAppLink(url: string): AppLinkTarget | null {
  const match = new RegExp(`^${APP_LINK_SCHEME}://payouts/?(?:\\?(.*))?$`, 'i').exec(url.trim());
  if (!match) return null;
  let from: PayoutsLinkFrom | undefined;
  for (const pair of (match[1] ?? '').split('&')) {
    const [key, value] = pair.split('=');
    if (key?.toLowerCase() !== 'from') continue;
    const bounce = value?.toLowerCase();
    if (bounce === 'return' || bounce === 'refresh') from = bounce;
  }
  return { tab: 'Profile', screen: 'Payouts', mode: 'worker', params: from ? { from } : {} };
}

/** The cross-mode prompt for a payouts arrival in customer mode. */
export const PAYOUTS_LINK_CONFIRM = {
  title: 'Switch to Worker Mode?',
  message:
    'Payouts are part of your worker side. Viewing them means switching to Worker Mode — your posted jobs stay exactly where they are.',
  confirmText: 'Switch',
} as const;

export type AppLinkOutcome = 'navigated' | 'declined' | 'ignored';

/**
 * Routes an inbound app-scheme URL, with the cross-mode gate. Both arrivals
 * come through here: the cold-start URL (Linking.getInitialURL) and the warm
 * one (the 'url' event). `at` is stamped on the params so a repeated bounce
 * is a distinct param change for the screen's arrival effect.
 */
export async function handleAppLink(url: string, bridge: NotificationModeBridge): Promise<AppLinkOutcome> {
  const target = resolveAppLink(url);
  if (!target) return 'ignored';

  const currentMode = bridge.getMode();
  if (currentMode && currentMode !== target.mode) {
    const switched = await bridge.switchMode(target.mode, { confirm: PAYOUTS_LINK_CONFIRM });
    if (!switched) return 'declined';
  }

  navigateAcrossTabs(target.tab, target.screen, { ...target.params, at: Date.now() });
  return 'navigated';
}
