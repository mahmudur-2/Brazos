import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Job, JobCategory, OpenJob } from './jobs';
import type { ChatTarget } from './messages';
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
// in, so `navigate('BrowseJobs')` from customer code is a compile error rather
// than a mode leak, and `navigate('WorkerSearch')` from worker code likewise.
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
 * Note what is absent, and cannot be reached from here: `BrowseJobs` (Worker
 * Home), `WorkerResults` (the worker job feed) and `JobDetail` (the worker bid
 * screen). Those are worker surfaces — EST. PAY, bid CTAs, payout figures —
 * and a customer route into them is the leak §F exists to make impossible.
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
      }
    | undefined;
};

export type DiscoverStackNavigation = NativeStackNavigationProp<DiscoverStackParamList>;

/**
 * The Home tab in WORKER mode: the job marketplace.
 *
 * `BrowseJobs` is Worker Home (atlas 48) and is this stack's ROOT, not a screen
 * pushed onto the customer stack. That is the whole fix for "the Home tab sends
 * worker users back to Customer Home" — popping this stack to its root lands on
 * Worker Home, so the default tab-re-press behaviour is now correct instead of
 * needing the listener that used to intercept it.
 */
export type WorkerHomeStackParamList = {
  BrowseJobs: undefined;
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
      }
    | undefined;
  WorkerProfile: { workerId: string; workerName?: string };
  ProfileReviews: { userId: string; name?: string };
};

export type MyJobsStackNavigation = NativeStackNavigationProp<MyJobsStackParamList>;

// Screens stacked inside the Messages (inbox) tab.
export type MessagesStackParamList = {
  MessagesInbox: undefined;
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
  /** Screens 64+66 (Phase 9): the worker's services & pricing manager with
   *  the availability toggle and the honest verification state. */
  ServicesPricing: undefined;
  /** Screen 46 + the Rebook 08 fold-in (Phase 9): saved + past workers. */
  SavedWorkers: undefined;
  /** Screen 45 (Phase 9): the sandbox payment-methods surface. */
  PaymentMethods: undefined;
  /** Screens 59+60 (Phase 11): the ledger-derived wallet + simulated cash-out. */
  Earnings: undefined;
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
// because it is not there. Since Stage 4D the two BARS differ (operator
// decision): the worker tree keeps the five classic tabs; the customer tree
// shows Home · Discover · [ + ] · Messages · Profile, with Map and MyJobs
// registered as HIDDEN routes (see CustomerRoot.tsx for the mechanism and
// why). The trees stay separately typed, so cross-tree navigation is still a
// compile error.

/** The customer tree. §F's `CustomerParamList`. */
export type CustomerParamList = {
  Home: NavigatorScreenParams<CustomerHomeStackParamList> | undefined;
  /** The customer browse surface — workers and services, never job postings. */
  Discover: NavigatorScreenParams<DiscoverStackParamList> | undefined;
  /**
   * The center [ + ] slot. NOT a navigation destination: its tabBarButton
   * opens the creation sheet and never dispatches, so this route can only be
   * reached by a deliberate programmatic navigate — which nothing does. It is
   * typed so the registration typechecks, same rationale as ComponentCatalog.
   */
  Create: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
  /**
   * HIDDEN routes — registered, dispatchable, absent from the bar
   * (HIDDEN_TAB_ITEM_OPTIONS in ui/primitives/BottomNav.tsx):
   * MyJobs hosts the whole customer hire + active-work loop and every
   * notification / cross-tab jump that targets the MyJobs tab; Map keeps the
   * LOCKED Customer Home's `getParent()?.navigate('Map')` pill resolving
   * until the operator's unlock session removes that chip.
   */
  MyJobs: NavigatorScreenParams<MyJobsStackParamList> | undefined;
  Map: NavigatorScreenParams<MapStackParamList> | undefined;
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
      }
    | undefined;
};
