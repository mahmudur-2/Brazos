# Inventory: lib/ and types/ (Phase B step B2)

Branch lean-v1. Reader helper output, no source changed. The judge decides; this proposes.
Files inventoried: 149 (148 under lib/, 1 under types/). Total lines: 30673.

## Method and caveats

- Import map: Node script at C:\Users\mdmah\AppData\Local\Temp\claude\426dba03622c4567\b193d4bf-d994-45fb-93d0-1ba0b9f8c2b0\scratchpad\importmap-lib.mjs. Walks .ts/.tsx/.mjs/.js in lib, screens, components, ui, hooks, modes, navigation, App.tsx, index.ts and tests/*.mjs; resolves relative imports to files.
- "imported by app" counts every non-test importer, including other lib/ files and dev-only files, excluding self. Paths shown are the first 4 alphabetically.
- "imported by tests" = test files that import the file OR name its path (tests often read source as text). Exception: for the four index.ts(x) files (motion120, phoneAuth, voiceSearch, legal) only real imports are counted, because several tests scan whole folders.
- lib/supabase.ts and lib/supabase.web.ts: Metro picks the .web file on web builds; the script resolved both for every import, so the web file is shown as 0 explicit importers.
- Outside the scanned dirs only dev-tools/ComponentCatalog.tsx (type OpenJob from lib/jobs) and dev-tools/HomeDesignStudio.tsx (lib/theme) import lib; nothing in scripts/, config/, app.config.ts or supabase/functions does.
- DEAD: no lib/ or types/ file has zero importers. Within-file unused exports exist (e.g. phoneAuth/errors.ts maskPhoneForLog, phoneAuth/index.ts phoneAuthMode and phoneAuthConfigError have no outside reader) but were not audited exhaustively.
- "dead after cut" was judged against this CUT app set: screens TrackWorkerScreen, HiddenChatsScreen, AppearanceScreen; components AudioMeterBars, DesignStudioPanel, HotspotMap.web, LiveLocationCard, MessageTicks, TranslationSheet, VoiceNote; hooks useVoiceRecorder, useLiveLocation; plus the CUT lib files below. Other inventories own those app files; confirm against them.
- Label rule used: a mixed V1 + CUT file is V1 with "contains CUT parts". A CUT file that V1 files still import is CUT with the V1 importers named (edit needed, not dead).

## Table

| path | lines | what it is | label | imported by app (count; up to 4) | imported by tests | proposal | note |
|---|---|---|---|---|---|---|---|
| lib/AuthContext.tsx | 224 | Auth session provider: email sign-up/in, sign-out, profile bootstrap | V1 | 2: App.tsx, hooks/useAuth.ts | 4 | keep | calls analytics identify/track (CUT PostHog) |
| lib/ThemeContext.tsx | 139 | Theme provider: light/dark/system palette context | V1 | 2: App.tsx, hooks/useThemeColors.ts | 1 | keep | both themes stay |
| lib/accountDeletion.ts | 54 | Delete-my-account RPC call and blocker fetch | V1 | 1: screens/DeleteAccountScreen.tsx | 1 | keep |  |
| lib/accountDeletionBlockers.ts | 132 | Pure blocker-list shape and wording for account deletion | V1 | 2: lib/accountDeletion.ts, screens/DeleteAccountScreen.tsx | 1 | keep |  |
| lib/adapters/payments.ts | 249 | Payment provider boundary: Stripe checkout, release, tip; sandbox provider | V1 | 14: screens/ApproveOrDisputeScreen.tsx, screens/BidDetailScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, ... | 7 | keep | MONEY. contains CUT parts: createSandboxPaymentProvider (calls RPCs sandbox_authorize_job_payment, sandbox_hold_job_payment, sandbox_release_job_payment, sandbox_tip_worker, sandbox_cash_out), SANDBOX_NO_SHEET_MESSAGE, STRIPE_NO_TWO_STEP_MESSAGE, STRIPE_TIP_MESSAGE, STRIPE_CASH_OUT_MESSAGE, PaymentProvider methods authorizeJobPayment/protectJobPayment/tipWorker/cashOut. Exports: paymentProvider, paymentsMode, paymentsConfigError, resolvePaymentsMode, types PaymentResult/CheckoutSessionResult/PaymentProvider/PaymentsMode. Callers: paymentProvider.beginJobCheckout CheckoutScreen:460; authorizeJobPayment CheckoutScreen:333; protectJobPayment CheckoutScreen:344; releaseJobPayment ApproveOrDisputeScreen:184; beginTipCheckout ReviewAndTipScreen:223; tipWorker ReviewAndTipScreen:337; cashOut EarningsScreen:87. paymentsMode read by 14 screens (ApproveOrDispute, BidDetail, Checkout, ClientJobDetail, DeleteAccount, Earnings, JobConfirmed, PaymentMethods, Payouts, Profile, ReviewAndTip, TrackWorker, WorkerHome, WorkerJob) with many === 'sandbox' branches |
| lib/adapters/paymentsMode.ts | 74 | Pure resolver of payments mode: sandbox, stripe or disabled | CUT | 1: lib/adapters/payments.ts | 3 | delete | sandbox path. Only importer is adapters/payments.ts (which also needs edit). Exports resolvePaymentsMode, types PaymentsMode/PaymentsModeResolution. Unset env gives sandbox in dev. NEEDS-JUDGE: if deleted, adapters/payments.ts needs a fixed stripe/disabled choice instead |
| lib/appLinks.ts | 52 | Public web profile URL and support mailto constants | V1 | 5: lib/legal/privacyPolicy.ts, lib/legal/termsOfService.ts, lib/sharing.ts, screens/MessagesInboxScreen.tsx, ... | 2 | keep | support mailto is V1; profileUrl/PROFILE_WEB_BASE_URL (https://brazos.app, placeholder) points at the web build /profile route: NEEDS-JUDGE whether shared profile link stays (only sharing.ts:shareProfileLink uses profileUrl) |
| lib/audioMeter.ts | 57 | Pure voice-recording meter arithmetic | CUT | 2: components/AudioMeterBars.tsx, hooks/useVoiceRecorder.ts | 1 | delete | dead after cut (only AudioMeterBars, useVoiceRecorder) |
| lib/authTheme.ts | 226 | Auth-screen colours, radius, type, shadows | V1 | 22: components/AuthBackdrop.tsx, components/AuthButton.tsx, components/AuthField.tsx, components/AuthNotice.tsx, ... | 5 | keep | Platform.select at 205,216 (web/android shadows) |
| lib/blur.tsx | 135 | Blur layer wrapper; web falls back to plain view | V1 | 4: components/PopModal.motion120.tsx, components/PopModal.tsx, ui/primitives/Sheet.tsx, ui/primitives/Surface.tsx | 4 | keep | web branches at 70,83,122 |
| lib/chatMenus.ts | 97 | Single open-menu state and person safety menu rows | V1 | 2: screens/ChatScreen.tsx, screens/MessagesInboxScreen.tsx | 4 | keep | contains CUT parts: personSafetyItems mute row (mute person); ChatMenu/nextMenu keep |
| lib/checklist.ts | 58 | Worker job checklist items fetch/add/toggle | MAYBE | 1: screens/WorkChecklistScreen.tsx | 0 | judge | WorkChecklistScreen only; not on v1 list |
| lib/clientStats.ts | 31 | Poster trust counts (posted, completed, cancelled) | MAYBE | 1: screens/JobDetailScreen.tsx | 0 | judge | JobDetailScreen trust signal only; not on v1 list |
| lib/clipboard.ts | 70 | Lazy expo-clipboard boundary: copy text | MAYBE | 1: screens/ChatScreen.tsx | 1 | judge | only ChatScreen copy-message; not on v1 list |
| lib/compareBids.ts | 197 | Deterministic bid ordering and trust rows for compare | V1 | 3: lib/workerHeroCard.ts, screens/ClientJobDetailScreen.tsx, screens/CompareBidsScreen.tsx | 3 | keep | bids compare screen |
| lib/conversationResolver.ts | 214 | Resolve active job and group threads by person | V1 | 3: screens/ChatScreen.tsx, screens/HiddenChatsScreen.tsx, screens/MessagesInboxScreen.tsx | 2 | keep | messaging inbox |
| lib/conversationStates.ts | 212 | Per-user chat state calls: hide, archive, clear, delete, timed block, mark unread | CUT | 4: hooks/useConversations.ts, screens/ChatScreen.tsx, screens/HiddenChatsScreen.tsx, screens/MessagesInboxScreen.tsx | 1 | delete | V1 importers need edit: hooks/useConversations, ChatScreen, MessagesInboxScreen (+ HiddenChatsScreen CUT). Exports fetchMyConversationStates, setConversationState(ForAll), setBlockUntil, setDirectThreadReadAt, markConversationUnread(ForAll), restoreConversationReadAt |
| lib/conversationVisibility.ts | 270 | Pure rules: cleared, hidden, deleted chats; unseen count; block durations | CUT | 4: hooks/useConversations.ts, lib/conversationStates.ts, lib/conversations.ts, screens/ChatScreen.tsx | 3 | delete | NEEDS-JUDGE: mixed. Keep countUnseen/UnseenStamp/UnseenThread (inbox unread number, used by hooks/useConversations) and visibleMessages callers; rest (clearedBy, conversationHiddenByDelete, BLOCK_DURATIONS, FULLY_UNREAD_AT, fold/index state) is CUT. Importers: hooks/useConversations, lib/conversations, ChatScreen |
| lib/conversations.ts | 363 | Inbox conversations, active jobs, read states, mark read | V1 | 4: hooks/useConversations.ts, screens/ChatScreen.tsx, screens/HiddenChatsScreen.tsx, screens/MessagesInboxScreen.tsx | 6 | keep | contains CUT parts: fetchCounterpartyReadStates (read ticks), re-exports clearedBy/conversationHiddenByDelete (hidden/cleared/deleted chats), imports conversationVisibility |
| lib/countries.ts | 284 | Country dial-code data for phone field | V1 | 7: components/CountryPicker.tsx, components/PhoneNumberInput.tsx, lib/navigation.ts, lib/phoneNumber.ts, ... | 2 | keep |  |
| lib/designOverrides.ts | 539 | Design-studio live overrides store, hooks, dials, undo | CUT | 39: components/ActionSheet.tsx, components/AmountPrompt.tsx, components/Button.tsx, components/Chip.tsx, ... | 3 | delete | NOT dead: 35 V1 importers (Button, Chip, ConfirmDialog, ui/primitives/*, ui/templates/*, 10 screens, hooks/useThemeColors) call useOverrideNumber(18), useDialNumber(13), useOverrideString(10), useOverrideValue, useMaterials, applyPaletteOverrides, useMetricsGeneration; replace with constants |
| lib/designStudioGate.ts | 58 | Where the design studio may exist (dev channels) | CUT | 3: navigation/ModeShell.tsx, screens/AppearanceScreen.tsx, screens/ProfileScreen.tsx | 2 | delete | V1 importers need edit: navigation/ModeShell.tsx, screens/ProfileScreen.tsx (+ AppearanceScreen) |
| lib/designStudioHistory.ts | 96 | Design studio undo/redo history | CUT | 1: components/DesignStudioPanel.tsx | 1 | delete | dead after cut (only DesignStudioPanel) |
| lib/designStudioPresets.ts | 148 | Design studio saved presets and pins storage | CUT | 1: components/DesignStudioPanel.tsx | 1 | delete | dead after cut (only DesignStudioPanel) |
| lib/dialog.ts | 136 | Confirm and alert helpers (confirmAsync, alertAsync) | V1 | 41: components/ConfirmHost.tsx, components/DesignStudioPanel.tsx, components/OfferComposer.tsx, components/PastWork.tsx, ... | 2 | keep | web branches at 95,122 (Alert no-op on web) |
| lib/dictation.ts | 26 | Joins dictated words into a post-a-job field | V1 | 2: components/DictationMic.tsx, screens/PostJobScreen.tsx | 1 | keep | post-a-job dictation; imported by DictationMic + PostJobScreen only |
| lib/directThreads.ts | 35 | Read a direct-offer chat thread row | V1 | 1: screens/ChatScreen.tsx | 0 | keep | direct offer chat; ChatScreen only |
| lib/discoveryFilter.ts | 99 | Pure worker discovery distance filter rules | V1 | 8: components/DistanceChips.tsx, components/JobFilterSheet.tsx, components/WorkerJobCard.tsx, lib/discoveryFilterStorage.ts, ... | 2 | keep | radius |
| lib/discoveryFilterStorage.ts | 46 | Stored distance filter read/write | V1 | 3: screens/JobDetailScreen.tsx, screens/MapScreen.tsx, screens/WorkerResultsScreen.tsx | 1 | keep | radius |
| lib/disputes.ts | 109 | Open, withdraw and read job disputes | V1 | 6: hooks/useMyJobsHub.ts, lib/inboxStages.ts, screens/ApproveOrDisputeScreen.tsx, screens/ClientJobDetailScreen.tsx, ... | 2 | keep |  |
| lib/earnings.ts | 74 | Fetch worker earnings rows and derive summary | V1 | 3: screens/EarningsScreen.tsx, screens/PayoutsScreen.tsx, screens/WorkerHomeScreen.tsx | 1 | keep | comment mentions sandbox only |
| lib/earningsCopy.ts | 96 | One-sentence meta line per payment state in Earnings | V1 | 1: screens/EarningsScreen.tsx | 1 | keep | contains CUT parts: provider==='sandbox' branch (line 86) |
| lib/earningsMath.ts | 75 | Pure earnings totals and potential-earnings math | V1 | 2: lib/earnings.ts, screens/WorkerHomeScreen.tsx | 5 | keep |  |
| lib/errorMessage.ts | 175 | Shared user-facing error message mapper | V1 | 51: components/JobSummaryCard.tsx, components/OfferComposer.tsx, components/PortfolioPicker.tsx, components/ReportDialog.tsx, ... | 9 | keep |  |
| lib/featureFlags.ts | 354 | Compile-time flags for 12 chat/post features | CUT | 4: components/ChatComposer.tsx, screens/ChatScreen.tsx, screens/MessagesInboxScreen.tsx, screens/PostJobScreen.tsx | 7 | delete | every flag guards a CUT feature. States: LIVE_LOCATION true; DOCUMENTS true; TIMED_BLOCK true; HIDDEN_CHATS true; ARCHIVE true; CLEAR_CHAT true; DELETE_CHAT true; MARK_UNREAD true; READ_TICKS true; DELIVERED_TICKS false (read by nothing); TRANSLATION false; PRICE_GUIDANCE false. Readers: LIVE_LOCATION ChatScreen:675, ChatComposer:306; DOCUMENTS ChatComposer:314; TIMED_BLOCK ChatScreen:982, MessagesInboxScreen:940; HIDDEN_CHATS MessagesInboxScreen:804,991; ARCHIVE MessagesInboxScreen:788; CLEAR_CHAT MessagesInboxScreen:818; DELETE_CHAT MessagesInboxScreen:836; MARK_UNREAD MessagesInboxScreen:780; READ_TICKS ChatScreen:402,441,1804; TRANSLATION ChatScreen:1443; PRICE_GUIDANCE PostJobScreen:1472. Importers need edit: ChatComposer, ChatScreen, MessagesInboxScreen, PostJobScreen |
| lib/gateAnswer.ts | 53 | Per-user answer for setup and legal gate hooks | V1 | 2: hooks/useLegalGate.ts, hooks/useSetupStatus.ts | 2 | keep | legal gate |
| lib/geolocation.ts | 154 | Resolve current place from device location | V1 | 4: screens/NotificationSettingsScreen.tsx, screens/PostJobScreen.tsx, screens/WorkerHomeScreen.tsx, screens/WorkerResultsScreen.tsx | 3 | keep | calls analytics (CUT PostHog) |
| lib/haptics.ts | 89 | Lazy expo-haptics boundary | V1 | 6: components/MeltTabBar.shared.tsx, components/MoneyMoment.tsx, components/PressScale.motion120.tsx, hooks/usePressFeedback.ts, ... | 1 | keep | web branch at 57 |
| lib/homeAttention.ts | 194 | Home "needs your attention" items for both modes | V1 | 3: components/CreateSheet.tsx, screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | 1 | keep |  |
| lib/homeDesignStudio.tsx | 59 | Home design-studio settings provider | CUT | 1: screens/HomeScreen.tsx | 2 | delete | V1 importer needs edit: screens/HomeScreen.tsx. dev-tools/HomeDesignStudio.tsx does not import it |
| lib/hotspots.ts | 318 | Job hotspot cells, nearby jobs by radius, map helpers | MAYBE | 8: components/HotspotMap.d.ts, components/HotspotMap.native.tsx, components/HotspotMap.web.tsx, hooks/useHotspots.ts, ... | 4 | judge | listed MAYBE; also holds fetchJobsWithinRadius/cellsWithinMiles/milesBetween (radius discovery = V1). Importers: HotspotMap.native/web, useHotspots, CellJobsScreen, MapScreen, WorkerHomeScreen, WorkerResultsScreen |
| lib/inboxFilters.ts | 207 | Pure inbox filter pills and long-press sheet rules | V1 | 1: screens/MessagesInboxScreen.tsx | 3 | keep | contains CUT parts: archived pill and filter, muteActionFor, mute flag in resolveSheetTarget |
| lib/inboxStages.ts | 36 | Fetch job lifecycle stage per inbox row | V1 | 1: screens/MessagesInboxScreen.tsx | 1 | keep |  |
| lib/jobFilterSession.ts | 34 | Session-held job filter store | V1 | 1: hooks/useSessionJobFilters.ts | 1 | keep | discovery filters |
| lib/jobFilters.ts | 307 | Job filter and sort model and apply function | V1 | 7: components/JobFilterSheet.tsx, components/WorkerJobCard.tsx, hooks/useSessionJobFilters.ts, lib/jobFilterSession.ts, ... | 4 | keep | discovery |
| lib/jobLifecycle.ts | 419 | Derive job lifecycle state, worker steps, My Jobs tabs | V1 | 18: components/JobProgress.tsx, lib/conversations.ts, lib/homeAttention.ts, lib/inboxStages.ts, ... | 12 | keep | contains CUT parts: sandbox 72h auto-release mirror (lines 119-128, provider==='sandbox') |
| lib/jobSeries.ts | 59 | Repeat-job series calls: start, stop, drop worker | V1 | 4: hooks/useJobSeries.ts, screens/ClientJobDetailScreen.tsx, screens/PostJobScreen.tsx, screens/WorkerJobScreen.tsx | 1 | keep | repeat jobs |
| lib/jobStage.ts | 78 | Job stage and status label formatting | V1 | 2: components/StatusBadge.tsx, screens/ClientJobDetailScreen.tsx | 2 | keep |  |
| lib/jobs.ts | 986 | Job model, categories, fetch/create/update jobs, completion | V1 | 70: components/AmountPrompt.tsx, components/BrowseJobCard.tsx, components/CategoryTileRow.tsx, components/CreateSheet.tsx, ... | 24 | keep | largest app lib; calls analytics track (CUT PostHog) |
| lib/launchContext.ts | 31 | Context: launch layer finished fading out | MAYBE | 3: App.tsx, navigation/ModeShell.tsx, screens/WelcomeScreen.tsx | 0 | judge | launch-screen plumbing; App, ModeShell, WelcomeScreen |
| lib/legal/index.ts | 122 | Legal docs registry, versions, accept/fetch status | V1 | 5: hooks/useLegalGate.ts, hooks/useSetupStatus.ts, lib/legalCache.ts, screens/LegalDocumentScreen.tsx, ... | 5 | keep | legal gate |
| lib/legal/privacyPolicy.ts | 276 | Privacy policy markdown text | V1 | 1: lib/legal/index.ts | 1 | keep | text mentions CUT items to edit: PostHog (17,161,201), voice messages/documents (116), speech (18,121), live location (241) |
| lib/legal/termsOfService.ts | 278 | Terms of service markdown text | V1 | 1: lib/legal/index.ts | 2 | keep |  |
| lib/legalCache.ts | 86 | Cache of accepted legal versions | V1 | 1: hooks/useLegalGate.ts | 2 | keep | legal gate |
| lib/liveCard.ts | 126 | Lock-screen live activity card boundary | MAYBE | 1: hooks/useLiveJobCard.ts | 1 | judge | listed MAYBE; imported by hooks/useLiveJobCard only; iOS only |
| lib/liveJobStatus.ts | 307 | Live job status, rail steps, home live bar pick | V1 | 10: components/ConversationRow.tsx, components/HireAgainRow.tsx, components/HomeLiveBar.tsx, components/HubCard.tsx, ... | 4 | keep | also imported by TrackWorkerScreen (CUT) |
| lib/liveLocation.ts | 249 | Live location share start/update/stop and timing rules | CUT | 3: components/LiveLocationCard.tsx, hooks/useLiveLocation.ts, screens/ChatScreen.tsx | 1 | delete | Track worker/live location. V1 importer needs edit: ChatScreen (+ LiveLocationCard, useLiveLocation CUT) |
| lib/locationPrivacy.ts | 61 | Approximate public job location label rules | V1 | 4: components/WorkerJobCard.tsx, lib/geolocation.ts, lib/jobs.ts, lib/offers.ts | 2 | keep |  |
| lib/mapClustering.ts | 108 | Pure grid clustering for worker discovery map | V1 | 2: lib/hotspots.ts, screens/MapScreen.tsx | 1 | keep | map |
| lib/matchReasons.ts | 80 | Why a job matches a worker (match reasons) | V1 | 1: screens/JobDetailScreen.tsx | 1 | keep | discovery; JobDetailScreen |
| lib/meltBarGeometry.ts | 199 | Pure geometry for the melt-through floating tab bar | MAYBE | 3: components/MeltTabBar.motion120.tsx, components/MeltTabBar.shared.tsx, hooks/useNavInset.ts | 4 | judge | listed MAYBE; cosmetic tab-bar effect (MeltTabBar.*, useNavInset) |
| lib/messageTicks.ts | 120 | Sent/delivered/read tick state derivation | CUT | 3: components/ChatBubble.tsx, components/MessageTicks.tsx, screens/ChatScreen.tsx | 3 | delete | read/delivered ticks. V1 importers need edit: ChatBubble, ChatScreen (+ MessageTicks CUT) |
| lib/messages.ts | 465 | Message model, fetch, send, unsend, media resolve, preview | V1 | 15: components/ChatBubble.tsx, components/ChatComposer.tsx, components/OfferCard.tsx, components/VoiceNote.tsx, ... | 7 | keep | contains CUT parts: audio_url/audio_duration_ms fields, document_* fields, documentIconFor, formatDocumentSize, DocumentIconName, formatClipDuration, chat-audio/chat-documents resolve inside resolveMessageMedia(s); imports conversation state helpers |
| lib/modalPresence.ts | 52 | Count open modals and settle delay | V1 | 5: components/ConfirmHost.tsx, components/JobSummaryCard.tsx, components/PastWork.tsx, hooks/useModalPresence.ts, ... | 1 | keep |  |
| lib/moderation.ts | 265 | Block, mute, report, hidden users, admin report calls | V1 | 7: components/ReportContentLink.tsx, components/ReportDialog.tsx, hooks/useConversations.ts, hooks/useHiddenUserIds.ts, ... | 3 | keep | contains CUT parts: muteUser, unmuteUser (mute person). fetchAdminReports/banUser/unbanUser/dismissReport serve AdminReportsScreen (admin tool, not on either list) |
| lib/moneyCopy.ts | 125 | Money wording: fee name, payment captions and eyebrows | V1 | 8: screens/ApproveOrDisputeScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/ReviewAndTipScreen.tsx, ... | 6 | keep | contains CUT parts: paymentEyebrow(sandbox) "PAYMENT · TEST MODE" (line 27) |
| lib/motion.ts | 18 | USE_NATIVE_DRIVER flag (false on web) | V1 | 50: components/AudioMeterBars.tsx, components/AuthButton.tsx, components/AuthScaffold.tsx, components/CategoryTileRow.tsx, ... | 2 | keep | web branch line 10 |
| lib/motion120/index.tsx | 107 | Motion boundary roots and capability exports | V1 | 27: App.tsx, components/ChipCheck.tsx, components/CountryPicker.tsx, components/DropMenu.motion120.tsx, ... | 1 | keep | animation infra; MotionRoot in App.tsx |
| lib/motion120/types.ts | 125 | Pure motion capability resolver and menu timings | V1 | 2: lib/motion120/index.tsx, lib/motion120/vendor.ts | 1 | keep | animation infra |
| lib/motion120/vendor.ts | 147 | Lazy vendor loader for gesture-handler and keyboard-controller | V1 | 1: lib/motion120/index.tsx | 2 | keep | animation infra |
| lib/navigation.ts | 751 | Navigation param lists, types and route helpers | V1 | 48: App.tsx, navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx, ... | 14 | keep | contains CUT parts: route types TrackWorker (329), HiddenChats (371), Appearance (455, also holds the V1 theme choice); SavedWorkers/ServicesPricing/WorkChecklist/AdminReports are MAYBE routes |
| lib/navigationRef.ts | 266 | Navigation ref, cross-tab navigation, back helpers | V1 | 48: App.tsx, components/HomeAvatarButton.tsx, components/MarketJobPreview.tsx, components/ScreenHeader.tsx, ... | 1 | keep |  |
| lib/neededToday.ts | 19 | Today pill rule for need-it-today jobs | V1 | 2: components/BrowseJobCard.tsx, components/WorkerJobCard.tsx | 1 | keep |  |
| lib/notificationActions.ts | 51 | Push action button categories and payload mapping | V1 | 2: hooks/usePushNotifications.ts, lib/pushNotifications.ts | 2 | keep | hire-from-push (V1); REMINDER_CATEGORIES/ACTION_ROUTE = tomorrow reminders (MAYBE) |
| lib/notificationGroups.ts | 104 | Group notification feed by day | V1 | 1: screens/NotificationsScreen.tsx | 1 | keep | feed |
| lib/notificationPrefs.ts | 132 | Notification prefs fetch/update and toggle list | V1 | 2: screens/NotificationSettingsScreen.tsx, screens/WorkerHomeScreen.tsx | 4 | keep |  |
| lib/notificationRoutes.ts | 338 | Route a tapped push or feed item to its screen | V1 | 4: hooks/useNotificationModeBridge.ts, hooks/usePushNotifications.ts, lib/navigation.ts, screens/NotificationsScreen.tsx | 10 | keep |  |
| lib/notifications.ts | 64 | Notification feed fetch and mark-read | V1 | 3: hooks/useUnreadNotificationCount.ts, lib/notificationGroups.ts, screens/NotificationsScreen.tsx | 2 | keep |  |
| lib/observability/analytics.ts | 253 | PostHog funnel and intent event emitters | CUT | 15: components/HotspotMap.native.tsx, components/OfferComposer.tsx, hooks/useLiveLocation.ts, hooks/useSetupPermissions.ts, ... | 3 | delete | PostHog. NOT dead: 15 importers call track/trackIntent/identify: HotspotMap.native, OfferComposer, useLiveLocation, useSetupPermissions, AuthContext, geolocation, jobs, offers, payments/stripe, pushNotifications, reviews, ModeProvider, ChatScreen, PostJobScreen, ProfileScreen. Also imports config/env |
| lib/observability/sentry.ts | 241 | Sentry init, scrub, user tagging, app wrapper | V1 | 17: App.tsx, components/AppErrorBoundary.tsx, components/ReviewSection.tsx, hooks/useLegalGate.ts, ... | 4 | keep | Sentry stays; 17 importers |
| lib/offerCopy.ts | 176 | Wording for offer and counteroffer actions | V1 | 6: components/OfferCard.tsx, components/OfferResponseActions.tsx, screens/BidDetailScreen.tsx, screens/ChatScreen.tsx, ... | 8 | keep | contains CUT parts: `sandbox` input flag and test-mode sentence (lines 89-103) |
| lib/offerMessage.ts | 121 | Bid composer availability chips and message compose | V1 | 1: components/OfferComposer.tsx | 1 | keep |  |
| lib/offerNavigation.ts | 99 | Where an offer opens: job route target | V1 | 1: screens/ChatScreen.tsx | 2 | keep |  |
| lib/offers.ts | 667 | Offers: create, counter, decline, withdraw, accept | V1 | 16: components/OfferCard.tsx, components/OfferComposer.tsx, hooks/useJobOffers.ts, hooks/useMyJobsHub.ts, ... | 10 | keep | calls analytics track (CUT PostHog) |
| lib/ownJobCard.ts | 46 | Open own job card from Home | V1 | 1: screens/HomeScreen.tsx | 1 | keep |  |
| lib/passwordReset.ts | 46 | Password reset request and recovery completion | V1 | 3: App.tsx, screens/EmailSignInScreen.tsx, screens/ResetPasswordScreen.tsx | 1 | keep |  |
| lib/passwordResetLink.ts | 58 | Pure reset-link parser and recovery flag | V1 | 1: lib/passwordReset.ts | 1 | keep |  |
| lib/paymentMethods.ts | 103 | Saved card list, remove, card setup session | V1 | 4: screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/DeleteAccountScreen.tsx, screens/PaymentMethodsScreen.tsx | 1 | keep | MONEY: saved card for one-tap hiring; callers CheckoutScreen, ClientJobDetailScreen, DeleteAccountScreen, PaymentMethodsScreen |
| lib/paymentRules.ts | 148 | Pure payment state predicates and customer charge | V1 | 7: lib/payments.ts, screens/ApproveOrDisputeScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, ... | 9 | keep | MONEY: exports isHeld, isReleased, isReleaseRequested, isRefundQueued, isCancellationFeeKept, canOfferJobFunding, customerChargeCents; only sandbox comments |
| lib/payments.ts | 470 | Payment model, price quote, payouts view, tip poll, fetches | V1 | 24: components/OfferComposer.tsx, hooks/useMyJobsHub.ts, lib/adapters/payments.ts, lib/earnings.ts, ... | 15 | keep | MONEY: exports workerTakeCents (4 users), quoteJobPrice (5 screens), fetchJobPayment, fetchJobPaymentState (5 screens), fetchJobPaymentStatusesByJobIds, fetchJobTip, classifyTipPoll, payoutsCta, payoutSetupNotice (7 users), validatePayouts*Response. No sandbox-only export; "sandbox" only as provider value and comments (64-112, 264, 414, 434) |
| lib/payments/stripe.ts | 512 | Only loader of Stripe SDK; checkout, card sheet, payouts onboarding | V1 | 9: App.tsx, lib/adapters/payments.ts, screens/CheckoutScreen.tsx, screens/EarningsScreen.tsx, ... | 6 | keep | MONEY. exports createPaymentSession (adapters/payments, analytics), presentCheckoutSheet (CheckoutScreen, ReviewAndTipScreen), confirmWithSavedCard (CheckoutScreen), presentCardSetupSheet (PaymentMethodsScreen), fetchMyPayoutsStatus (Earnings, Payouts, WorkerHome, WorkerJob), beginPayoutsOnboarding + refreshPayoutsStatus (PayoutsScreen), stripeReady, handleStripeUrl + STRIPE_RETURN_URL (App.tsx), STRIPE_UNAVAILABLE_MESSAGE. web short-circuit line 95; analytics import (CUT PostHog) |
| lib/payments/stripeRules.ts | 208 | Pure checkout poll classifier and response validators | V1 | 3: lib/payments/stripe.ts, screens/CheckoutScreen.tsx, screens/ReviewAndTipScreen.tsx | 1 | keep | MONEY: classifyCheckoutPoll (payments.ts, CheckoutScreen), CHECKOUT_POLL_*_MS (Checkout, ReviewAndTip), validateCheckoutResponse/extractInvokeError/classifySheetError (stripe.ts) |
| lib/permissionPrompt.ts | 48 | Permission copy and open-settings prompt | V1 | 8: components/DictationMic.tsx, hooks/useLiveLocation.ts, hooks/useVoiceRecorder.ts, screens/ChatScreen.tsx, ... | 1 | keep | also used by DictationMic |
| lib/phone.ts | 19 | Display-only phone number formatting | V1 | 1: screens/ProfileDetailsScreen.tsx | 0 | keep | ProfileDetailsScreen only |
| lib/phoneAuth/errors.ts | 126 | Phone auth error messages and Supabase error mapping | V1 | 3: lib/phoneAuth/index.ts, lib/phoneAuth/mock.ts, lib/phoneAuth/supabase.ts | 1 | keep | LOGIN. exports PHONE_AUTH_MESSAGES, phoneAuthError, mapSupabaseAuthError (supabase.ts), maskPhoneForLog (unused) |
| lib/phoneAuth/index.ts | 106 | Phone auth entry: picks provider, exports phoneAuth | V1 | 7: components/OtpInput.tsx, screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/EmailSignInScreen.tsx, ... | 2 | keep | LOGIN. exports phoneAuth (requestOtp/resendOtp/verifyOtp/inspectChallenge/cancelChallenge), PHONE_ENTRY, phoneAuthMode, phoneAuthConfigError, PHONE_AUTH_MESSAGES, OTP_LENGTH, RESEND_COOLDOWN_MS, MAX_VERIFY_ATTEMPTS, isOtpToken. Callers: phoneAuth.requestOtp CreateAccountScreen:87 + SignInScreen:112; verify/resend/inspect/cancel VerifyPhoneScreen; PHONE_ENTRY EmailCreateAccountScreen, EmailSignInScreen, WelcomeScreen; OtpInput. Imports mock provider (TOOLING) |
| lib/phoneAuth/mock.ts | 199 | Dev-only mock OTP provider (made-up codes) | TOOLING | 1: lib/phoneAuth/index.ts | 1 | judge | LOGIN dev harness: mode.ts forces disabled outside __DEV__. Only importer lib/phoneAuth/index.ts (createMockPhoneAuthProvider). Not CUT by the brief; NEEDS-JUDGE keep for dev/tests or drop |
| lib/phoneAuth/mode.ts | 92 | Pure resolver: phone auth mode and entry routes | V1 | 1: lib/phoneAuth/index.ts | 4 | keep | LOGIN. exports resolvePhoneAuthMode, phoneEntryRoutes (index.ts only). Phone buttons only live when EXPO_PUBLIC_PHONE_AUTH_MODE=supabase; else routes to email |
| lib/phoneAuth/supabase.ts | 235 | Supabase SMS OTP provider implementation | V1 | 1: lib/phoneAuth/index.ts | 1 | keep | LOGIN. exports createSupabasePhoneAuthProvider (index.ts only) |
| lib/phoneAuth/types.ts | 166 | Phone auth provider interface, constants, types | V1 | 6: lib/navigation.ts, lib/phoneAuth/errors.ts, lib/phoneAuth/index.ts, lib/phoneAuth/mock.ts, ... | 1 | keep | LOGIN |
| lib/phoneNumber.ts | 168 | Phone number parse, validate, format to E.164 | V1 | 4: components/PhoneNumberInput.tsx, screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/SignInScreen.tsx | 2 | keep |  |
| lib/portfolio.ts | 181 | Worker portfolio items and past-work stats | MAYBE | 5: components/PastWork.tsx, components/PortfolioPicker.tsx, screens/ProfileDetailsScreen.tsx, screens/ProfileScreen.tsx, ... | 1 | judge | worker portfolio; not named on v1 list. Importers PastWork, PortfolioPicker, ProfileDetails, Profile, WorkerProfile |
| lib/postJobDraft.ts | 183 | Post-a-job draft save/load | V1 | 4: components/DraftCard.tsx, hooks/usePostJobDraft.ts, screens/MyJobsHubScreen.tsx, screens/PostJobScreen.tsx | 6 | keep |  |
| lib/postQuestions.ts | 424 | Usual questions per category for post a job | V1 | 3: components/PostQuestions.tsx, lib/postJobDraft.ts, screens/PostJobScreen.tsx | 1 | keep | post a job |
| lib/priceGuidance.ts | 58 | Static suggested price ranges per category | CUT | 1: screens/PostJobScreen.tsx | 2 | delete | price guidance, flag PRICE_GUIDANCE=false. V1 importer needs edit: PostJobScreen (priceGuidanceLines at 1472) |
| lib/pricingMode.ts | 85 | Open bids vs posted price choice and copy | V1 | 6: components/EditBudgetDialog.tsx, components/JobLivePage.tsx, components/PriceDropdown.tsx, lib/jobs.ts, ... | 4 | keep |  |
| lib/profileCompleteness.ts | 72 | Worker profile completeness steps | V1 | 1: screens/ProfileScreen.tsx | 1 | keep | profile |
| lib/profiles.ts | 213 | Profile fetch/update, active mode, banned check | V1 | 28: components/Avatar.tsx, components/MarketJobPreview.tsx, components/OfferCard.tsx, hooks/useConversations.ts, ... | 4 | keep |  |
| lib/pushNotifications.ts | 428 | Push registration, handling, token upload | V1 | 7: App.tsx, hooks/usePushNotifications.ts, lib/AuthContext.tsx, screens/JobDetailScreen.tsx, ... | 4 | keep | contains CUT parts: ANDROID_CHANNEL_ID and Android channel branch (129-131); web branches (177,296,350,409); analytics import |
| lib/queryClient.ts | 76 | React Query client and invalidate helpers | V1 | 16: App.tsx, components/OfferComposer.tsx, components/ReviewSection.tsx, hooks/useJobOwnerActions.ts, ... | 1 | keep |  |
| lib/queryKeys.ts | 42 | Query keys and pure cache rules | V1 | 5: App.tsx, hooks/useMyJobsHub.ts, hooks/useOpenJobs.ts, hooks/useUnreadNotificationCount.ts, ... | 2 | keep |  |
| lib/quietHours.ts | 34 | Quiet hours labels and device time zone | V1 | 1: screens/NotificationSettingsScreen.tsx | 1 | keep |  |
| lib/reactions.ts | 83 | Message emoji reactions fetch/set/remove | MAYBE | 5: components/ChatBubble.tsx, components/ReactionPicker.tsx, hooks/useConversations.ts, hooks/useReactions.ts, ... | 1 | judge | chat reactions; not on either list (v1 messaging = text + photo). ChatBubble, ReactionPicker, useReactions, useConversations, ChatScreen |
| lib/rebook.ts | 86 | Rebook strip: saved and past workers to hire again | MAYBE | 7: components/HireAgainRow.tsx, hooks/useRebookWorkers.ts, lib/savedWorkers.ts, screens/ChatScreen.tsx, ... | 3 | judge | hire-again; goes with savedWorkers. HireAgainRow, useRebookWorkers, ChatScreen, PublicProfile, SavedWorkers, WorkerProfile |
| lib/remoteConfig.ts | 130 | Server config read; payments kill switch | V1 | 4: screens/ApproveOrDisputeScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/ReviewAndTipScreen.tsx | 1 | keep | MONEY: paymentsEnabled read by ApproveOrDispute, Checkout, ClientJobDetail, ReviewAndTip; other 3 values consumed by nothing |
| lib/repeatJobs.ts | 70 | Repeat-job cadence labels and visit line | V1 | 2: components/RepeatNote.tsx, lib/jobSeries.ts | 2 | keep | job series |
| lib/reuseJobs.ts | 55 | Which past jobs the + sheet offers to post again | MAYBE | 1: components/CreateSheet.tsx | 1 | judge | reuse a past job; not named on v1 list; CreateSheet only |
| lib/reverseGeocode.ts | 296 | Reverse and forward geocode to area names | V1 | 3: components/LiveLocationCard.tsx, lib/geolocation.ts, screens/WorkerResultsScreen.tsx | 0 | keep | also used by LiveLocationCard (CUT) |
| lib/reviews.ts | 321 | Reviews: create, fetch profile reviews and summaries | V1 | 13: components/OfferCard.tsx, components/ReviewSection.tsx, hooks/useJobOffers.ts, hooks/useMyJobsHub.ts, ... | 3 | keep | calls analytics track (CUT PostHog) |
| lib/runningLate.ts | 82 | Running-late choices and moved arrival window | V1 | 3: lib/jobs.ts, lib/liveJobStatus.ts, screens/WorkerJobScreen.tsx | 3 | keep |  |
| lib/savedWorkers.ts | 96 | Saved workers and rehire people fetch/save | MAYBE | 5: hooks/useRebookWorkers.ts, screens/ChatScreen.tsx, screens/ProfileScreen.tsx, screens/SavedWorkersScreen.tsx, ... | 3 | judge | listed MAYBE; SavedWorkersScreen, useRebookWorkers, ChatScreen, Profile, WorkerProfile |
| lib/secureSessionStorage.ts | 35 | Keychain-backed auth session storage wiring | V1 | 1: lib/supabase.ts | 2 | keep | LOGIN: session storage |
| lib/secureSessionStorageCore.ts | 352 | Pure core of secure session storage adapter | V1 | 1: lib/secureSessionStorage.ts | 3 | keep | LOGIN: session storage |
| lib/services.ts | 113 | Worker priced services list: fetch/add/update/remove | MAYBE | 5: hooks/useWorkerSkills.ts, screens/JobDetailScreen.tsx, screens/ProfileScreen.tsx, screens/ServicesPricingScreen.tsx, ... | 2 | judge | listed MAYBE; ServicesPricingScreen, useWorkerSkills, JobDetail, Profile, WorkerProfile |
| lib/setupLanding.ts | 30 | Pending landing route after setup | V1 | 2: modes/ModeProvider.tsx, screens/SetupScreen.tsx | 2 | keep | setup |
| lib/setupState.ts | 93 | Pure setup record: landing choice and done flag | V1 | 5: hooks/useSetupStatus.ts, lib/setupLanding.ts, lib/setupStorage.ts, screens/OnboardingFlow.tsx, ... | 3 | keep | setup |
| lib/setupStorage.ts | 48 | Setup record read/write storage | V1 | 2: hooks/useSetupStatus.ts, screens/SetupScreen.tsx | 2 | keep | setup |
| lib/sharing.ts | 288 | Share profile link, photo, document via share sheet | V1 | 2: components/PhotoViewer.tsx, screens/ChatScreen.tsx | 4 | keep | contains CUT parts: shareDocument (documents); shareProfileLink builds a web URL (see appLinks); web branches 142,174,245 |
| lib/shellGround.tsx | 93 | Which ground colour the mode shell paints under nav | MAYBE | 4: navigation/ModeShell.tsx, screens/HomeScreen.tsx, screens/JobDetailScreen.tsx, screens/WorkerResultsScreen.tsx | 1 | judge | listed MAYBE; cosmetic. ModeShell, HomeScreen, JobDetailScreen, WorkerResultsScreen |
| lib/skillCategories.ts | 180 | Skill categories, service tiles, icons | V1 | 11: components/CategoryAccordion.tsx, components/CategoryTileRow.tsx, components/ServicePickerSheet.tsx, components/ServiceTileRow.tsx, ... | 5 | keep |  |
| lib/storage.ts | 489 | Supabase storage uploads and signed URL resolve | V1 | 8: components/ChatBubble.tsx, components/ReviewSection.tsx, lib/messages.ts, screens/ChatScreen.tsx, ... | 7 | keep | contains CUT parts: uploadChatAudio (247), uploadChatDocument (295), chat-audio and chat-documents buckets in ChatMediaBucket. Photos/avatar/review/completion uploads stay |
| lib/supabase.ts | 28 | Supabase client with secure session storage | V1 | 49: hooks/useConversationChat.ts, hooks/useConversations.ts, hooks/useHotspots.ts, hooks/useJobLive.ts, ... | 5 | keep | 49 importers |
| lib/supabase.web.ts | 31 | Supabase client for the web build | CUT | 0 explicit (Metro platform pick) | 3 | delete | web/PWA variant; no explicit importer (Metro picks it for web builds of the files that import lib/supabase) |
| lib/supabaseTypes.ts | 36 | Typed Database alias and JobStatusEnum | V1 | 3: lib/conversations.ts, lib/reviews.ts, lib/supabase.ts | 1 | keep |  |
| lib/theme.ts | 1093 | Colours, typography, shadows, theme helpers (largest app lib) | V1 | 189: components/ActionSheet.tsx, components/AmountPrompt.tsx, components/AppErrorBoundary.tsx, components/AudioMeterBars.tsx, ... | 14 | keep | contains CUT parts: second font `fonts.display/displayHero` (undefined, inert), metricGeneration coupling to design overrides (lines 1045,1081), web branches (906,929,945) |
| lib/themePreference.ts | 68 | Light/Dark/System preference rules | V1 | 4: lib/ThemeContext.tsx, lib/themePreferenceStorage.ts, screens/AppearanceScreen.tsx, screens/ProfileScreen.tsx | 2 | keep | both themes stay |
| lib/themePreferenceStorage.ts | 41 | Stored theme preference read/write | V1 | 1: lib/ThemeContext.tsx | 2 | keep |  |
| lib/time.ts | 167 | One date and time formatter (en-US) | V1 | 29: components/BrowseJobCard.tsx, components/ChatBubble.tsx, components/ConversationRow.tsx, components/CreateSheet.tsx, ... | 9 | keep |  |
| lib/translate.ts | 75 | Calls the translate edge function | CUT | 1: screens/ChatScreen.tsx | 0 | delete | translation. V1 importer needs edit: ChatScreen (TRANSLATION flag false, edge function undeployed) |
| lib/translateRules.ts | 124 | Pure translate batch and response rules | CUT | 2: components/TranslationSheet.tsx, lib/translate.ts | 1 | delete | dead after cut (TranslationSheet, translate.ts) |
| lib/validation.ts | 74 | Input validation: email, phone, money ceilings | V1 | 11: components/EditBudgetDialog.tsx, components/PriceDropdown.tsx, lib/adapters/payments.ts, lib/jobs.ts, ... | 2 | keep | comment mentions sandbox_tip_worker cap only |
| lib/voiceSearch/index.ts | 48 | On-device speech recognizer boundary (voiceSearch) | V1 | 3: components/ChatComposer.tsx, components/DictationMic.tsx, ui/primitives/SearchBar.tsx | 1 | keep | shared engine. V1 user: components/DictationMic.tsx (post-a-job mics, PostJobScreen). CUT users: ui/primitives/SearchBar.tsx mic (Home/Map/WorkerHome/WorkerSearch search bars). NEEDS-JUDGE: components/ChatComposer.tsx also uses it (dictate into chat text box) |
| lib/voiceSearch/provider.ts | 267 | expo-speech-recognition provider implementation | V1 | 1: lib/voiceSearch/index.ts | 2 | keep | shared engine; reached only via voiceSearch/index.ts (DictationMic V1, SearchBar CUT, ChatComposer ?) |
| lib/voiceSearch/types.ts | 178 | Voice recognizer interface, constants, types | V1 | 2: lib/voiceSearch/index.ts, lib/voiceSearch/provider.ts | 2 | keep | shared engine; same users as voiceSearch/index.ts |
| lib/webRoute.ts | 38 | Parse web pathname to a web route | CUT | 1: App.tsx | 1 | delete | web/PWA. V1 importer needs edit: App.tsx |
| lib/workerHeroCard.ts | 87 | Worker trust facts for hero card | MAYBE | 1: screens/WorkerProfileScreen.tsx | 2 | judge | listed MAYBE; WorkerProfileScreen only |
| lib/workerSearch.ts | 817 | Worker search: interpret query, rank, find workers | V1 | 1: screens/WorkerSearchScreen.tsx | 5 | keep | worker discovery search; WorkerSearchScreen only |
| lib/workerSkills.ts | 58 | Derive worker skill keys and state | V1 | 2: components/JobFilterSheet.tsx, hooks/useWorkerSkills.ts | 1 | keep |  |
| types/database.ts | 5131 | Generated Supabase database types | V1 | 2: lib/services.ts, lib/supabaseTypes.ts | 0 | keep | generated; imported by lib/services.ts, lib/supabaseTypes.ts |

## Summary

| label | files | total lines |
|---|---|---|
| V1 | 115 | 26032 |
| CUT | 18 | 2815 |
| MAYBE | 15 | 1627 |
| DEAD | 0 | 0 |
| TOOLING | 1 | 199 |
| total | 149 | 30673 |

Without types/database.ts (5131 generated lines) the V1 line total is 20901.

### 10 largest files

| rank | path | lines | label |
|---|---|---|---|
| 1 | types/database.ts | 5131 | V1 |
| 2 | lib/theme.ts | 1093 | V1 |
| 3 | lib/jobs.ts | 986 | V1 |
| 4 | lib/workerSearch.ts | 817 | V1 |
| 5 | lib/navigation.ts | 751 | V1 |
| 6 | lib/offers.ts | 667 | V1 |
| 7 | lib/designOverrides.ts | 539 | CUT |
| 8 | lib/payments/stripe.ts | 512 | V1 |
| 9 | lib/storage.ts | 489 | V1 |
| 10 | lib/payments.ts | 470 | V1 |

### CUT files by size

| path | lines | importers still alive after cut |
|---|---|---|
| lib/designOverrides.ts | 539 | V1 importers need edit (see note) |
| lib/featureFlags.ts | 354 | V1 importers need edit (see note) |
| lib/conversationVisibility.ts | 270 | V1 importers need edit (see note) |
| lib/observability/analytics.ts | 253 | V1 importers need edit (see note) |
| lib/liveLocation.ts | 249 | V1 importers need edit (see note) |
| lib/conversationStates.ts | 212 | V1 importers need edit (see note) |
| lib/designStudioPresets.ts | 148 | none (dead after cut) |
| lib/translateRules.ts | 124 | none (dead after cut) |
| lib/messageTicks.ts | 120 | V1 importers need edit (see note) |
| lib/designStudioHistory.ts | 96 | none (dead after cut) |
| lib/translate.ts | 75 | V1 importers need edit (see note) |
| lib/adapters/paymentsMode.ts | 74 | V1 importers need edit (see note) |
| lib/homeDesignStudio.tsx | 59 | V1 importers need edit (see note) |
| lib/designStudioGate.ts | 58 | V1 importers need edit (see note) |
| lib/priceGuidance.ts | 58 | V1 importers need edit (see note) |
| lib/audioMeter.ts | 57 | none (dead after cut) |
| lib/webRoute.ts | 38 | V1 importers need edit (see note) |
| lib/supabase.web.ts | 31 | none (dead after cut) |

## Feature flags (lib/featureFlags.ts, 354 lines)

All 12 flags guard CUT features, so the whole file is labelled CUT. Compile-time constants (`true as boolean`), no remote config.

| flag | state | guards | read by (file:line) |
|---|---|---|---|
| LIVE_LOCATION | true | live location share + Track worker | screens/ChatScreen.tsx:675; components/ChatComposer.tsx:306 |
| DOCUMENTS | true | document attachments in chat | components/ChatComposer.tsx:314 |
| TIMED_BLOCK | true | timed block | screens/ChatScreen.tsx:982; screens/MessagesInboxScreen.tsx:940 |
| HIDDEN_CHATS | true | hidden chats behind device auth | screens/MessagesInboxScreen.tsx:804,991 |
| ARCHIVE | true | archived chats | screens/MessagesInboxScreen.tsx:788 |
| CLEAR_CHAT | true | clear chat | screens/MessagesInboxScreen.tsx:818 |
| DELETE_CHAT | true | delete chat | screens/MessagesInboxScreen.tsx:836 |
| MARK_UNREAD | true | mark unread | screens/MessagesInboxScreen.tsx:780 |
| READ_TICKS | true | read (gold) ticks | screens/ChatScreen.tsx:402,441,1804 |
| DELIVERED_TICKS | false | delivered tick | nothing reads it (only prose in components/ChatBubble.tsx:267, lib/messageTicks.ts, tests) |
| TRANSLATION | false | in-chat translation | screens/ChatScreen.tsx:1443 |
| PRICE_GUIDANCE | false | suggested price range on post a job | screens/PostJobScreen.tsx:1472 (note: lib/priceGuidance.ts also exports an unrelated PRICE_GUIDANCE table) |

Tests that assert flag text and will need editing or deleting with the flags: tests/chatComposer, chatDocuments, conversationStates, copyTruth, liveLocation, motion120 (lines 799, 835), appConfig, conversion.

## Money, login and adapters (read only)

### lib/adapters/*
- adapters/payments.ts: `paymentProvider` is chosen once at load from `paymentsMode` (sandbox | stripe | disabled). Stripe provider = createPaymentSession (edge function create-payment) + release RPC `release_job_payment`. Sandbox provider = five sandbox_* RPCs (CUT). Disabled = fail-closed.
- Callers of paymentProvider methods: beginJobCheckout CheckoutScreen:460; authorizeJobPayment CheckoutScreen:333 and protectJobPayment CheckoutScreen:344 (sandbox two-step, CUT); releaseJobPayment ApproveOrDisputeScreen:184; beginTipCheckout ReviewAndTipScreen:223; tipWorker ReviewAndTipScreen:337 (sandbox one-step tip, CUT; Stripe provider refuses it); cashOut EarningsScreen:87 (sandbox cash-out, CUT; Stripe provider refuses it).
- `paymentsMode` is imported by 14 screens; 30 occurrences of the string sandbox sit in 12 screens (ClientJobDetail 7, Earnings 7, ReviewAndTip 4, ApproveOrDispute 3, WorkerJob 2, one each in BidDetail, Checkout, JobConfirmed, PaymentMethods, Payouts, Profile, TrackWorker). Those branches are the real work of the sandbox cut, not this lib file.
- adapters/paymentsMode.ts: only `resolvePaymentsMode`; imported only by adapters/payments.ts. Unset env var gives sandbox in dev builds, disabled in release.

### lib/payments.ts and lib/payments/*
- payments.ts: no sandbox-only export. Callers: workerTakeCents (moneyCopy, EarningsScreen, WorkerHomeScreen, WorkerJobScreen); quoteJobPrice (BidDetail, Checkout, ClientJobDetail, JobDetail, OfferComposer); fetchJobPayment (Checkout, JobConfirmed); fetchJobPaymentState (ApproveOrDispute, ClientJobDetail, ReviewAndTip, TrackWorker, WorkerJob); fetchJobPaymentStatusesByJobIds (useMyJobsHub, inboxStages); fetchJobTip + classifyTipPoll (ReviewAndTip); payoutsCta (Earnings, Payouts); payoutSetupNotice (7 files).
- payments/stripe.ts (only loader of @stripe/stripe-react-native): see its table row for each export and caller. Web short-circuit at line 95; four analytics `track` calls (CUT PostHog).
- payments/stripeRules.ts: pure; no CUT part.

### lib/phoneAuth/*
- index.ts exports `phoneAuth` (requestOtp, resendOtp, verifyOtp, inspectChallenge, cancelChallenge). requestOtp: CreateAccountScreen:87, SignInScreen:112. verifyOtp, resendOtp, inspectChallenge, cancelChallenge: VerifyPhoneScreen (129,179,200,253). `PHONE_ENTRY` (live only when EXPO_PUBLIC_PHONE_AUTH_MODE=supabase, else buttons route to email screens): EmailCreateAccountScreen, EmailSignInScreen, WelcomeScreen. OtpInput imports it too.
- mode.ts: mock mode is refused outside __DEV__ (resolves to disabled). mock.ts is therefore dev-only; labelled TOOLING, NEEDS-JUDGE. supabase.ts is the real SMS provider. errors.ts and types.ts are shared.
- Email sign-in/up itself lives in lib/AuthContext.tsx, not in phoneAuth/.

## voiceSearch folder: exactly which files each use

- lib/voiceSearch/index.ts (+ provider.ts, types.ts, reached only through index.ts) is imported by three components: `components/DictationMic.tsx` (V1: the two post-a-job mics, used by PostJobScreen via useDictation; also imports lib/dictation.ts and lib/permissionPrompt.ts), `ui/primitives/SearchBar.tsx` (the search-bar mic: CUT voice SEARCH; SearchBar is used by HomeScreen, MapScreen, WorkerHomeScreen, WorkerSearchScreen), `components/ChatComposer.tsx` (right-hand mic dictates into the chat text box; not named on either list, NEEDS-JUDGE).
- lib/dictation.ts (26 lines) is pure and imported only by DictationMic and PostJobScreen. It does not import voiceSearch itself.
- Cutting voice search therefore means deleting the mic code inside SearchBar.tsx (and ChatComposer if the judge agrees), NOT deleting lib/voiceSearch/.

## NEEDS-JUDGE

1. lib/adapters/paymentsMode.ts is CUT, but adapters/payments.ts needs some resolver for stripe vs disabled. Replace with a fixed stripe-or-disabled check, or keep the file trimmed.
2. lib/conversationVisibility.ts is named CUT but also holds countUnseen/UnseenStamp/UnseenThread, which hooks/useConversations needs for the inbox unread number. Split or keep.
3. lib/appLinks.ts profileUrl and lib/sharing.ts shareProfileLink build a link to the web build (`https://brazos.app/profile/{id}`, a placeholder). Web is CUT, so this share link may have no page behind it. Only ChatScreen calls shareProfileLink.
4. lib/phoneAuth/mock.ts: dev-only mock OTP provider. Keep for dev and tests, or remove.
5. components/ChatComposer.tsx dictation mic uses lib/voiceSearch (see section above).
6. AppearanceScreen / navigation.ts route `Appearance` holds the V1 Light/Dark/System setting and the CUT design-studio entry. lib/designStudioGate.ts is read by ProfileScreen and ModeShell.
7. lib/designOverrides.ts: 35 V1 files read it (useOverrideNumber 18, useDialNumber 13, useOverrideString 10, others). Deleting it is a wide edit, not a clean delete.
8. lib/observability/analytics.ts: 15 importers (7 lib files) call track/trackIntent/identify; the cut means editing those call sites. lib/legal/privacyPolicy.ts text names PostHog and must change with it.
9. Admin tools (moderation.ts fetchAdminReports, banUser, unbanUser, dismissReport; AdminReportsScreen) are on neither list.
10. Test counts: tests that read source text (not import) are counted; they will break when the text is cut. Not exhaustive for tests that build paths dynamically.
11. lib/moneyCopy.ts, offerCopy.ts, earningsCopy.ts, jobLifecycle.ts, payments.ts still carry sandbox branches or wording; flagged as V1 "contains CUT parts", not CUT.
