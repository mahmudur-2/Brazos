# Emerald Lux Glass — every screen, drawn or to draw

One row per current screen or sheet (from `screens/` and the sheets in
`components/`), grouped in six batches — one batch per round with the operator.
Status: **done** (a `lux-<key>.html` exists and was sent), **todo**. The rule for
every row: read the source, keep every control, lay it out the Lux way
(`README.md`). Harness target names are the `scripts/shots.mjs` entries that
photograph the LIVE screen, for the side-by-side.

## Batch 1 — customer core (approved 2026-09-21, "Yes, all of them"; a screen that scrolls has a second frame — `lux-wprofile-2`, `lux-post-review-2`)

| key | screen | source | harness target | status |
|-|-|-|-|-|
| home | Customer Home | screens/HomeScreen.tsx | customer-home-jobs | done |
| discover | Discover (worker search) | screens/WorkerSearchScreen.tsx | customer-discover, workersearch-category | done |
| wprofile | A worker's public profile | screens/WorkerProfileScreen.tsx, PublicProfileScreen.tsx | — | done |
| reviews | Profile reviews | screens/ProfileReviewsScreen.tsx | — | done |
| post-what | Post a job · 1 What needs doing | screens/PostJobScreen.tsx | — (the media step is postjob-media) | done |
| post-media | Post a job · 2 Media | screens/PostJobScreen.tsx | postjob-media | done |
| post-where | Post a job · 3 Where and when | screens/PostJobScreen.tsx | postjob-location | done |
| post-review | Post a job · 4 Review and publish | screens/PostJobScreen.tsx | postjob-review | done |
| post-budget | The Edit Budget dialog | components/EditBudgetDialog.tsx | postjob-budget-dialog | done |
| post-live | Your job is live | screens/PostJobScreen.tsx (its success overlay), ui/templates/SuccessScreen.tsx | postjob-published | done |
| create | The [+] Create sheet | components/CreateSheet.tsx | customer-create-sheet | done |
| services | The All services sheet | components/ServicePickerSheet.tsx | customer-services-sheet | done |

## Batch 2 — customer jobs (approved 2026-09-21, "Yes, all of them"; scrolled frames: `lux-myjobs-2`, `lux-cjob-2` and `-3`, `lux-track-2`, `lux-review-tip-2`)

| key | screen | source | harness target | status |
|-|-|-|-|-|
| myjobs | My Jobs hub (customer) | screens/MyJobsHubScreen.tsx | customer-myjobs | done |
| cjob | The client's job detail | screens/ClientJobDetailScreen.tsx | — | done |
| compare | Compare bids | screens/CompareBidsScreen.tsx | — | done |
| bid | Bid detail | screens/BidDetailScreen.tsx | — | done |
| counter | Counteroffer | screens/CounterofferScreen.tsx, components/OfferComposer.tsx | — | done |
| checkout | Checkout (accept = fund) | screens/CheckoutScreen.tsx | — | done |
| confirmed | Job confirmed | screens/JobConfirmedScreen.tsx | — | done |
| track | Track worker | screens/TrackWorkerScreen.tsx | — | done |
| approve | Approve or dispute | screens/ApproveOrDisputeScreen.tsx | — | done |
| review-tip | Review and tip | screens/ReviewAndTipScreen.tsx | — | done |
| cell | Cell jobs (map drill-down) | screens/CellJobsScreen.tsx | — | done |
| cmap | Map (customer) | screens/MapScreen.tsx | — (no target: tile hosts) | done |

## Batch 3 — worker (drawn 2026-09-21 under the operator's standing "build all batches" instruction; scrolled frames: `lux-submit-2`, `lux-wjob-2`, `lux-pricing-2`; the four popups are `lux-filters-pop` … `-4`; Worker Home and Available Jobs re-barred with the worker bar)

| key | screen | source | harness target | status |
|-|-|-|-|-|
| whome | Worker Home | screens/WorkerHomeScreen.tsx | worker-home-jobs, worker-home-online | done |
| jobs | Available Jobs | screens/WorkerResultsScreen.tsx | worker-results-jobs | done |
| filters | The Filters sheet | components/JobFilterSheet.tsx | worker-results-filters | done |
| filters-pop | Its popups (distance · budget · date · sort) | components/PickerPopover.tsx | worker-results-filters-budget | done |
| detail | Job detail (worker) | screens/JobDetailScreen.tsx | — | done |
| submit | Submit Bid | screens/SubmitBidScreen.tsx, components/OfferComposer.tsx | worker-submit-bid | done |
| bid-sent | Bid sent | screens/BidSentScreen.tsx | — | done |
| wjob | The worker's job (assigned) | screens/WorkerJobScreen.tsx | — | done |
| checklist | Work checklist | screens/WorkChecklistScreen.tsx | — | done |
| route | Route and arrival | screens/RouteArrivalScreen.tsx | — | done |
| wmap | Map (worker) + the jobs sheet | screens/MapScreen.tsx, components/PeekSheet.tsx | — (`map-explore-dark.html` is the base) | done |
| wmyjobs | My Jobs hub (worker) | screens/MyJobsHubScreen.tsx | worker-myjobs | done |
| earnings | Earnings | screens/EarningsScreen.tsx | customer-earnings | done |
| payouts | Payouts | screens/PayoutsScreen.tsx | — | done |
| pricing | Services & availability | screens/ServicesPricingScreen.tsx | customer-services-pricing | done |

## Batch 4 — messaging (drawn 2026-09-21 under the same standing instruction; `lux-chat` is scrolled to its end; the menus are `lux-chat-menu` (overflow), `-2` (a message held), `-3` (a conversation held))

| key | screen | source | harness target | status |
|-|-|-|-|-|
| inbox | Inbox | screens/MessagesInboxScreen.tsx | customer-inbox, worker-inbox | done |
| chat | Chat (text · photo · voice · document · live location · ticks) | screens/ChatScreen.tsx, components/ChatComposer.tsx | — | done |
| chat-menu | The long-press sheet and the overflow menu | components/ActionSheet.tsx, components/DropMenu.tsx | — | done |
| hidden | Hidden chats | screens/HiddenChatsScreen.tsx | — | done |
| feed | Notification feed | screens/NotificationsScreen.tsx | customer-notification-feed | done |
| report | Report dialog | components/ReportDialog.tsx | — | done |

## Batch 5 — profile and settings (drawn 2026-09-21 under the same standing instruction; scrolled frames: `lux-details-2`, `lux-safety-2`, `lux-notif-2`, `lux-delete-2`, `lux-legal-2`; `lux-portfolio-2` is the detail step)

| key | screen | source | harness target | status |
|-|-|-|-|-|
| profile | Profile hub | screens/ProfileScreen.tsx | customer-profile, worker-profile | done |
| details | Profile details | screens/ProfileDetailsScreen.tsx | customer-profile-details | done |
| safety | Account and safety | screens/AccountSafetyScreen.tsx | customer-account-safety | done |
| notif | Notification settings | screens/NotificationSettingsScreen.tsx | customer-notification-settings | done |
| appearance | Appearance | screens/AppearanceScreen.tsx | customer-appearance | done |
| payment | Payment methods | screens/PaymentMethodsScreen.tsx | customer-payment-methods | done |
| saved | Saved & past workers | screens/SavedWorkersScreen.tsx | customer-saved-workers | done |
| delete | Delete account | screens/DeleteAccountScreen.tsx | customer-delete-account | done |
| legal | Legal document | screens/LegalDocumentScreen.tsx | customer-legal-terms | done |
| admin | Admin reports | screens/AdminReportsScreen.tsx | — | done |
| portfolio | Portfolio picker | components/PortfolioPicker.tsx | — | done |

## Batch 6 — auth and launch (drawn 2026-09-21 in Lux under the same standing instruction — whether the auth flow keeps its own emerald/ivory palette is the operator's ruling on return; `lux-amount` is the counter prompt, `lux-amount-2` the mode-switch confirm)

| key | screen | source | harness target | status |
|-|-|-|-|-|
| launch | Launch | screens/LaunchScreen.tsx | — | done |
| welcome | Welcome | screens/WelcomeScreen.tsx | auth-welcome | done — SUPERSEDED 2026-09-21 by the operator's pick, `welcome-motion.html` (the reference composition on the Lux ground, the rim light), and APPLIED to the app that day (DECISIONS 16) |
| signin | Sign in (phone) | screens/SignInScreen.tsx | auth-signin | done |
| email-signin | Sign in (email) | screens/EmailSignInScreen.tsx | auth-email-signin | done |
| create-account | Create account (phone) | screens/CreateAccountScreen.tsx | auth-create-account | done |
| email-create | Create account (email) | screens/EmailCreateAccountScreen.tsx | auth-email-create-account | done |
| verify | Verify phone | screens/VerifyPhoneScreen.tsx | — | done |
| setup | Setup | screens/SetupScreen.tsx | auth-setup | done |
| legal-gate | The legal gate | screens/LegalGateScreen.tsx | — | done |
| mode-switch | The mode-switch overlay | components/ModeTransitionOverlay.tsx | — | done |
| amount | Amount prompt · Confirm dialog | components/AmountPrompt.tsx, components/ConfirmDialog.tsx | — | done |

Not screens (containers, no page of their own): `screens/AuthFlow.tsx`,
`screens/OnboardingFlow.tsx`, `dev-tools/`. The auth flow renders on its own
emerald/ivory brand palette (`lib/authTheme.ts`) — batch 6 decides whether Lux
reaches it or the auth palette stays its own; the operator rules that when the
batch is sent.
