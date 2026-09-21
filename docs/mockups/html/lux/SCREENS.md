# Emerald Lux Glass — every screen, drawn or to draw

One row per current screen or sheet (from `screens/` and the sheets in
`components/`), grouped in six batches — one batch per round with the operator.
Status: **done** (a `lux-<key>.html` exists and was sent), **todo**. The rule for
every row: read the source, keep every control, lay it out the Lux way
(`README.md`). Harness target names are the `scripts/shots.mjs` entries that
photograph the LIVE screen, for the side-by-side.

## Batch 1 — customer core

| key | screen | source | harness target | status |
|-|-|-|-|-|
| home | Customer Home | screens/HomeScreen.tsx | customer-home-jobs | done |
| discover | Discover (worker search) | screens/WorkerSearchScreen.tsx | customer-discover, workersearch-category | todo |
| wprofile | A worker's public profile | screens/WorkerProfileScreen.tsx, PublicProfileScreen.tsx | — | todo |
| reviews | Profile reviews | screens/ProfileReviewsScreen.tsx | — | todo |
| post-what | Post a job · 1 What needs doing | screens/PostJobScreen.tsx | — (the media step is postjob-media) | todo |
| post-media | Post a job · 2 Media | screens/PostJobScreen.tsx | postjob-media | todo |
| post-where | Post a job · 3 Where and when | screens/PostJobScreen.tsx | postjob-location | todo |
| post-review | Post a job · 4 Review and publish | screens/PostJobScreen.tsx | postjob-review | todo |
| post-budget | The Edit Budget dialog | components/EditBudgetDialog.tsx | postjob-budget-dialog | todo |
| post-live | Your job is live | screens/JobConfirmedScreen.tsx | postjob-published | todo |
| create | The [+] Create sheet | components/CreateSheet.tsx | customer-create-sheet | todo |
| services | The All services sheet | components/ServicePickerSheet.tsx | customer-services-sheet | todo |

## Batch 2 — customer jobs

| key | screen | source | harness target | status |
|-|-|-|-|-|
| myjobs | My Jobs hub (customer) | screens/MyJobsHubScreen.tsx | customer-myjobs | todo |
| cjob | The client's job detail | screens/ClientJobDetailScreen.tsx | — | todo |
| compare | Compare bids | screens/CompareBidsScreen.tsx | — | todo |
| bid | Bid detail | screens/BidDetailScreen.tsx | — | todo |
| counter | Counteroffer | screens/CounterofferScreen.tsx, components/OfferComposer.tsx | — | todo |
| checkout | Checkout (accept = fund) | screens/CheckoutScreen.tsx | — | todo |
| confirmed | Job confirmed | screens/JobConfirmedScreen.tsx | — | todo |
| track | Track worker | screens/TrackWorkerScreen.tsx | — | todo |
| approve | Approve or dispute | screens/ApproveOrDisputeScreen.tsx | — | todo |
| review-tip | Review and tip | screens/ReviewAndTipScreen.tsx | — | todo |
| cell | Cell jobs (map drill-down) | screens/CellJobsScreen.tsx | — | todo |
| cmap | Map (customer) | screens/MapScreen.tsx | — (no target: tile hosts) | todo |

## Batch 3 — worker

| key | screen | source | harness target | status |
|-|-|-|-|-|
| whome | Worker Home | screens/WorkerHomeScreen.tsx | worker-home-jobs, worker-home-online | done |
| jobs | Available Jobs | screens/WorkerResultsScreen.tsx | worker-results-jobs | done |
| filters | The Filters sheet | components/JobFilterSheet.tsx | worker-results-filters | todo (the approved gallery `map-explore-filters-dark.html` is the base) |
| filters-pop | Its popups (distance · budget · date · sort) | components/PickerPopover.tsx | worker-results-filters-budget | todo |
| detail | Job detail (worker) | screens/JobDetailScreen.tsx | — | done |
| submit | Submit Bid | screens/SubmitBidScreen.tsx, components/OfferComposer.tsx | worker-submit-bid | todo |
| bid-sent | Bid sent | screens/BidSentScreen.tsx | — | todo |
| wjob | The worker's job (assigned) | screens/WorkerJobScreen.tsx | — | todo |
| checklist | Work checklist | screens/WorkChecklistScreen.tsx | — | todo |
| route | Route and arrival | screens/RouteArrivalScreen.tsx | — | todo |
| wmap | Map (worker) + the jobs sheet | screens/MapScreen.tsx, components/PeekSheet.tsx | — (`map-explore-dark.html` is the base) | todo |
| wmyjobs | My Jobs hub (worker) | screens/MyJobsHubScreen.tsx | worker-myjobs | todo |
| earnings | Earnings | screens/EarningsScreen.tsx | customer-earnings | todo |
| payouts | Payouts | screens/PayoutsScreen.tsx | — | todo |
| pricing | Services & availability | screens/ServicesPricingScreen.tsx | customer-services-pricing | todo |

## Batch 4 — messaging

| key | screen | source | harness target | status |
|-|-|-|-|-|
| inbox | Inbox | screens/MessagesInboxScreen.tsx | customer-inbox, worker-inbox | todo |
| chat | Chat (text · photo · voice · document · live location · ticks) | screens/ChatScreen.tsx, components/ChatComposer.tsx | — | todo |
| chat-menu | The long-press sheet and the overflow menu | components/ActionSheet.tsx, components/DropMenu.tsx | — | todo |
| hidden | Hidden chats | screens/HiddenChatsScreen.tsx | — | todo |
| feed | Notification feed | screens/NotificationsScreen.tsx | customer-notification-feed | todo |
| report | Report dialog | components/ReportDialog.tsx | — | todo |

## Batch 5 — profile and settings

| key | screen | source | harness target | status |
|-|-|-|-|-|
| profile | Profile hub | screens/ProfileScreen.tsx | customer-profile, worker-profile | done |
| details | Profile details | screens/ProfileDetailsScreen.tsx | customer-profile-details | todo |
| safety | Account and safety | screens/AccountSafetyScreen.tsx | customer-account-safety | todo |
| notif | Notification settings | screens/NotificationSettingsScreen.tsx | customer-notification-settings | todo |
| appearance | Appearance | screens/AppearanceScreen.tsx | customer-appearance | todo |
| payment | Payment methods | screens/PaymentMethodsScreen.tsx | customer-payment-methods | todo |
| saved | Saved & past workers | screens/SavedWorkersScreen.tsx | customer-saved-workers | todo |
| delete | Delete account | screens/DeleteAccountScreen.tsx | customer-delete-account | todo |
| legal | Legal document | screens/LegalDocumentScreen.tsx | customer-legal-terms | todo |
| admin | Admin reports | screens/AdminReportsScreen.tsx | — | todo |
| portfolio | Portfolio picker | components/PortfolioPicker.tsx | — | todo |

## Batch 6 — auth and launch

| key | screen | source | harness target | status |
|-|-|-|-|-|
| launch | Launch | screens/LaunchScreen.tsx | — | todo |
| welcome | Welcome | screens/WelcomeScreen.tsx | auth-welcome | todo |
| signin | Sign in (phone) | screens/SignInScreen.tsx | auth-signin | todo |
| email-signin | Sign in (email) | screens/EmailSignInScreen.tsx | auth-email-signin | todo |
| create-account | Create account (phone) | screens/CreateAccountScreen.tsx | auth-create-account | todo |
| email-create | Create account (email) | screens/EmailCreateAccountScreen.tsx | auth-email-create-account | todo |
| verify | Verify phone | screens/VerifyPhoneScreen.tsx | — | todo |
| setup | Setup | screens/SetupScreen.tsx | auth-setup | todo |
| legal-gate | The legal gate | screens/LegalGateScreen.tsx | — | todo |
| mode-switch | The mode-switch overlay | components/ModeTransitionOverlay.tsx | — | todo |
| amount | Amount prompt · Confirm dialog | components/AmountPrompt.tsx, components/ConfirmDialog.tsx | — | todo |

Not screens (containers, no page of their own): `screens/AuthFlow.tsx`,
`screens/OnboardingFlow.tsx`, `dev-tools/`. The auth flow renders on its own
emerald/ivory brand palette (`lib/authTheme.ts`) — batch 6 decides whether Lux
reaches it or the auth palette stays its own; the operator rules that when the
batch is sent.
