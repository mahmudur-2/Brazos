# Inventory: dependencies and tests (Phase B step B5)

Counted from package.json, app code (lib/ screens/ components/ ui/ hooks/ modes/ navigation/ config/ App.tsx index.ts app.config.ts), app.config.ts plugins, package.json scripts, and tests/ on branch lean-v1. Descriptions come from each test file's describe/test names and header comment. Counting only: no file was changed.

## Table 1: dependencies (61 rows)

| package | version | dep or devDep | import count in app code | up to 3 importing paths | in app.config.ts plugins or package.json scripts? | note |
|---|---|---|---|---|---|---|
| @expo/vector-icons | ^15.0.2 | dep | 130 | lib/chatMenus.ts, lib/jobs.ts, lib/skillCategories.ts | no | - |
| @react-native-async-storage/async-storage | 2.2.0 | dep | 13 | lib/designStudioPresets.ts, lib/discoveryFilterStorage.ts, lib/legalCache.ts | no | - |
| @react-native-community/netinfo | 11.4.1 | dep | 1 | hooks/useOnline.ts | no | - |
| @react-navigation/bottom-tabs | ^7.18.3 | dep | 4 | components/MeltTabBar.shared.tsx, ui/primitives/BottomNav.tsx, navigation/CustomerRoot.tsx | no | - |
| @react-navigation/native | ^7.3.4 | dep | 66 | lib/navigation.ts, lib/navigationRef.ts, lib/shellGround.tsx | no | - |
| @react-navigation/native-stack | ^7.17.6 | dep | 8 | lib/navigation.ts, screens/AuthFlow.tsx, screens/NotificationsScreen.tsx | no | - |
| @sentry/react-native | ~7.2.0 | dep | 1 | lib/observability/sentry.ts | yes | - |
| @shopify/flash-list | 2.0.2 | dep | 0 | - | no | unreferenced |
| @stripe/stripe-react-native | 0.50.3 | dep | 1 | lib/payments/stripe.ts | yes | - |
| @supabase/supabase-js | ^2.108.2 | dep | 5 | lib/AuthContext.tsx, lib/phoneAuth/supabase.ts, lib/supabase.ts | no | - |
| @tanstack/query-async-storage-persister | ^5.102.8 | dep | 0 | - | no | unreferenced |
| @tanstack/react-query | ^5.102.8 | dep | 5 | lib/queryClient.ts, hooks/useMyJobsHub.ts, hooks/useOpenJobs.ts | no | - |
| @tanstack/react-query-persist-client | ^5.102.8 | dep | 0 | - | no | unreferenced |
| expo | ~54.0.37 | dep | 3 | lib/liveCard.ts, index.ts, app.config.ts | yes | - |
| expo-asset | ~12.0.13 | dep | 0 | - | no | unreferenced |
| expo-audio | ~1.1.1 | dep | 3 | components/VoiceNote.tsx, hooks/useVoiceRecorder.ts, App.tsx | yes | - |
| expo-blur | ~15.0.8 | dep | 1 | lib/blur.tsx | no | - |
| expo-clipboard | ~8.0.8 | dep | 1 | lib/clipboard.ts | no | - |
| expo-dev-client | ~6.0.21 | dep | 0 | - | no | unreferenced |
| expo-device | ~8.0.10 | dep | 1 | lib/pushNotifications.ts | no | - |
| expo-document-picker | ~14.0.8 | dep | 1 | screens/ChatScreen.tsx | no | - |
| expo-file-system | ~19.0.24 | dep | 1 | lib/sharing.ts | no | - |
| expo-font | ~14.0.12 | dep | 0 | - | yes | no app import; referenced by plugin or script |
| expo-haptics | ~15.0.8 | dep | 1 | lib/haptics.ts | no | - |
| expo-image | ~3.0.11 | dep | 1 | components/RemoteImage.tsx | no | - |
| expo-image-picker | ~17.0.11 | dep | 8 | lib/storage.ts, screens/ChatScreen.tsx, screens/PostJobScreen.tsx | yes | - |
| expo-linking | ~8.0.12 | dep | 0 | - | no | unreferenced |
| expo-local-authentication | ~17.0.9 | dep | 1 | screens/MessagesInboxScreen.tsx | no | - |
| expo-localization | ~17.0.9 | dep | 0 | - | yes | no app import; referenced by plugin or script |
| expo-location | ~19.0.8 | dep | 6 | lib/geolocation.ts, screens/WorkerHomeScreen.tsx, components/HotspotMap.native.tsx | yes | - |
| expo-notifications | ~0.32.17 | dep | 3 | lib/pushNotifications.ts, hooks/usePushNotifications.ts, hooks/useSetupPermissions.ts | yes | - |
| expo-secure-store | ~15.0.8 | dep | 1 | lib/secureSessionStorage.ts | yes | - |
| expo-sharing | ~14.0.8 | dep | 1 | lib/sharing.ts | no | - |
| expo-speech-recognition | 3.1.3 | dep | 1 | lib/voiceSearch/index.ts | yes | - |
| expo-status-bar | ~3.0.9 | dep | 2 | screens/LaunchScreen.tsx, App.tsx | no | - |
| expo-updates | ~29.0.20 | dep | 2 | lib/designStudioGate.ts, lib/observability/sentry.ts | yes | - |
| expo-video | ~3.0.16 | dep | 3 | components/JobVideo.tsx, components/MediaViewer.tsx, ui/primitives/MediaUploader.tsx | yes | - |
| i18next | ^26.4.0 | dep | 0 | - | yes | no app import; referenced by plugin or script |
| ol | ^10.10.0 | dep | 1 | components/HotspotMap.web.tsx | no | - |
| posthog-react-native | ^4.66.0 | dep | 1 | lib/observability/analytics.ts | no | - |
| react | 19.1.0 | dep | 241 | lib/AuthContext.tsx, lib/blur.tsx, lib/chatMenus.ts | no | - |
| react-dom | 19.1.0 | dep | 0 | - | no | unreferenced |
| react-i18next | ^17.0.12 | dep | 0 | - | no | unreferenced |
| react-native | 0.81.5 | dep | 249 | lib/AuthContext.tsx, lib/authTheme.ts, lib/blur.tsx | yes | - |
| react-native-gesture-handler | ~2.28.0 | dep | 5 | lib/motion120/vendor.ts, components/MeltTabBar.motion120.tsx, components/PeekSheet.motion120.tsx | no | - |
| react-native-keyboard-controller | 1.18.5 | dep | 3 | lib/motion120/vendor.ts, components/KeyboardAvoid.motion120.tsx, components/KeyboardRisingColumn.motion120.tsx | no | - |
| react-native-maps | 1.20.1 | dep | 1 | components/HotspotMap.native.tsx | no | - |
| react-native-reanimated | ~4.1.1 | dep | 21 | lib/motion120/vendor.ts, components/ChipCheck.motion120.tsx, components/DropdownReveal.motion120.tsx | no | - |
| react-native-safe-area-context | ~5.6.0 | dep | 51 | screens/AccountSafetyScreen.tsx, screens/AdminReportsScreen.tsx, screens/AppearanceScreen.tsx | no | - |
| react-native-screens | ~4.16.0 | dep | 0 | - | no | unreferenced |
| react-native-url-polyfill | ^3.0.0 | dep | 2 | lib/supabase.ts, lib/supabase.web.ts | no | - |
| react-native-web | ^0.21.2 | dep | 0 | - | no | unreferenced |
| react-native-worklets | 0.5.1 | dep | 0 | - | no | unreferenced (named in babel.config.js) |
| zod | ^4.4.3 | dep | 1 | config/env.ts | no | - |
| @expo/ngrok | ^4.1.3 | devDep | 0 | - | no | unreferenced |
| @types/react | ~19.1.10 | devDep | 0 | - | no | unreferenced |
| babel-preset-expo | ~54.0.10 | devDep | 0 | - | no | unreferenced (named in babel.config.js) |
| i18next-parser | ^9.0.2 | devDep | 0 | - | yes | no app import; referenced by plugin or script |
| playwright | ^1.62.1 | devDep | 0 | - | no | unreferenced |
| supabase | ^2.116.0 | devDep | 0 | - | yes | no app import; referenced by plugin or script |
| typescript | ~5.9.2 | devDep | 0 | - | yes | no app import; referenced by plugin or script |

## Table 2: tests (140 rows)

| file | lines | what it fences | source files it reads or imports (up to 5) | feature guess |
|---|---|---|---|---|
| tests/accountDeletion.test.mjs | 182 | Account deletion blockers, grouping and routing | lib/accountDeletionBlockers.ts, lib/accountDeletion.ts, screens/DeleteAccountScreen.tsx, screens/ProfileScreen.tsx, screens/AccountSafetyScreen.tsx | deletion |
| tests/analyticsPrivacy.test.mjs | 459 | Analytics sweep forbids personal data in events | lib/observability/analytics.ts, lib/, modes/, components/HotspotMap.native.tsx, hooks/useLiveLocation.ts | analytics |
| tests/appConfig.test.mjs | 181 | App config: OTA runtime, bundle IDs, no tablet | scripts/supabase-ref.mjs, app.config.ts, assets/brand/app-icon-b-leaf.png | other |
| tests/authPhone.test.mjs | 392 | Phone sign-up country codes and number validation | lib/countries.ts, lib/phoneNumber.ts, screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, components/PhoneNumberInput.tsx | auth |
| tests/blurBoundary.test.mjs | 251 | Blur confined to one boundary component | lib/blur.tsx, components, hooks, lib, modes | theme |
| tests/buildGate.test.mjs | 396 | EAS build gate: profiles and environment checks | scripts/eas-build-pre-install.mjs, eas.json | harness |
| tests/cancelledMoney.test.mjs | 100 | Cancelled-job money rows and earnings treatment | lib/paymentRules.ts, lib/earningsMath.ts, lib/payments.ts, ui/primitives/MoneyText.tsx, screens/ClientJobDetailScreen.tsx | payments |
| tests/chatComposer.test.mjs | 1557 | Chat composer zones, glyphs, dictation and voice placement | components/ChatComposer.tsx, components/DropMenu.tsx, components/DropMenu.shared.tsx, components/DropMenu.motion120.tsx, components/AudioMeterBars.tsx | messaging |
| tests/chatDocuments.test.mjs | 1001 | Chat document upload path and stored reference | lib/storage.ts, lib/messages.ts, components/ChatBubble.tsx, screens/ChatScreen.tsx, lib/featureFlags.ts | documents |
| tests/connect.test.mjs | 241 | Stripe Connect status vocabulary and enablement | supabase/functions/connect-status/classify.mjs, supabase/functions/connect-return/page.mjs, app.config.ts, supabase/functions/connect-return/index.ts | payouts |
| tests/consistencySet.test.mjs | 148 | Modal count and single confirm engine | lib/modalPresence.ts, lib/dialog.ts, components/ConfirmHost.tsx, components/CreateSheet.tsx, App.tsx | other |
| tests/conversationStates.test.mjs | 652 | Conversation clear, hidden and unseen watermark rules | supabase, lib/conversationVisibility.ts, lib/messageTicks.ts, lib/inboxFilters.ts, supabase/archive/phases/phase77_conversation_features.sql | chat-extras |
| tests/conversion.test.mjs | 699 | Skill category price ranges and money ceiling | lib/jobs.ts, lib/time.ts, lib/skillCategories.ts, lib/priceGuidance.ts, lib/validation.ts | post-job |
| tests/copyHonesty.test.mjs | 40 | No AI or matching language in product copy | components, hooks, lib, modes, navigation | other |
| tests/copyTruth.test.mjs | 244 | Copy truth for approve, sandbox and brand wording | screens/ApproveOrDisputeScreen.tsx, screens/PostJobScreen.tsx, screens/JobDetailScreen.tsx, components/MarketJobPreview.tsx, screens/ProfileScreen.tsx | payments |
| tests/counterCap.test.mjs | 180 | Counteroffer cap of ten per side, under row lock | lib/offers.ts, supabase/archive/phases/phase63_counteroffer_cap_ten_per_side.sql, components/OfferCard.tsx, screens/JobDetailScreen.tsx, components/OfferResponseActions.tsx | offers |
| tests/counterResponse.test.mjs | 266 | Counteroffer whose-move and withdraw visibility | lib/offers.ts, screens/JobDetailScreen.tsx, screens/MessagesInboxScreen.tsx, screens/MyJobsHubScreen.tsx, supabase/archive/phases/phase59_staging_counter_notification.sql | offers |
| tests/crossModeNotification.test.mjs | 335 | Notifications switch mode, then route correctly | lib/notificationRoutes.ts, hooks/useJobLive.ts, public, hooks/useJobDetail.ts, screens/TrackWorkerScreen.tsx | notifications |
| tests/crossTabNavigation.test.mjs | 632 | Worker feed route and tab registration | lib/navigation.ts, navigation/WorkerRoot.tsx, navigation/CustomerRoot.tsx, navigation/sharedStacks.tsx, screens | other |
| tests/customerCharge.test.mjs | 64 | Customer sees the charge amount, never the fee | lib/paymentRules.ts, screens/JobConfirmedScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/ApproveOrDisputeScreen.tsx, screens/WorkerJobScreen.tsx | payments |
| tests/customerCore.test.mjs | 279 | Customer route boundaries and four-step post flow | navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx, lib/navigation.ts, screens/PostJobScreen.tsx | post-job |
| tests/demoLink.test.mjs | 74 | Demo link keeps secret keys out of public config | scripts/demo-link/lib.mjs, scripts/supabase-ref.mjs, scripts/demo-link/refresh.mjs, scripts/demo-link/robot.mjs, scripts/demo-link/frame.html | web-pwa |
| tests/designStudio.test.mjs | 2133 | Design studio gate truth table and schema | ui/tokens.ts, lib/designOverrides.ts, ui/designStudioSchema.ts, lib/designStudioGate.ts, ui/primitives/Surface.tsx | design-studio |
| tests/dictation.test.mjs | 81 | Dictation text insertion and dictation mic placement | lib/dictation.ts, components/DictationMic.tsx, screens/PostJobScreen.tsx, components/TextField.tsx, ui/tokens.ts | voice |
| tests/discovery.test.mjs | 337 | Job filters, budget floors and sort edges | lib/jobFilters.ts, lib/time.ts, screens/JobDetailScreen.tsx, components/MarketJobPreview.tsx, screens/SubmitBidScreen.tsx | discovery |
| tests/docsBudget.test.mjs | 34 | Always-read docs stay within byte budgets | docs/DECISIONS.md | docs-process |
| tests/dynamicType.test.mjs | 47 | Large text keeps touch floors and wrapping | components/AuthButton.tsx, components/ConversationRow.tsx, components/JobFilterSheet.tsx, screens, components | theme |
| tests/earnings.test.mjs | 265 | Wallet and earnings derive only from ledger rows | lib/earningsMath.ts, lib/earningsCopy.ts, screens/EarningsScreen.tsx, screens/WorkerJobScreen.tsx, lib/moneyCopy.ts | payouts |
| tests/emeraldFences.test.mjs | 2208 | Customer bar slots and cross-tab dispatch targets | screens, components, ui, hooks, lib | other |
| tests/envParity.test.mjs | 133 | Tooling and app Supabase refs must match | scripts/verify-schema.mjs, scripts/supabase-ref.mjs | harness |
| tests/errorHonesty.test.mjs | 547 | Dispute read failure never shows a false lifecycle state | lib/jobLifecycle.ts, screens/TrackWorkerScreen.tsx, screens, hooks, components | lifecycle |
| tests/errorMessage.test.mjs | 198 | Device errors classified, never shown verbatim | lib/errorMessage.ts, screens/EmailSignInScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/LegalGateScreen.tsx, hooks/useConversations.ts | other |
| tests/firstSession.test.mjs | 119 | Welcome screen and launch overlay first-session flow | screens/WelcomeScreen.tsx, supabase, screens/AuthFlow.tsx, lib/navigation.ts, screens/LaunchScreen.tsx | auth |
| tests/fixRunA.test.mjs | 228 | Money and safety fixes: dispute, decision and runbook copy | screens/ReviewAndTipScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx, screens/ApproveOrDisputeScreen.tsx, supabase/migrations/20260905000000_stripe_foundation.sql | payments |
| tests/fixRunD.test.mjs | 167 | Tab back buttons and opaque picker surfaces | screens/WorkerSearchScreen.tsx, screens/MyJobsHubScreen.tsx, ui/primitives/Surface.tsx, components/PickerPopover.tsx, screens/MessagesInboxScreen.tsx | other |
| tests/fixRunF.test.mjs | 617 | Boot path never imports the design studio | navigation/ModeShell.tsx, App.tsx, navigation/sharedStacks.tsx, screens/PostJobScreen.tsx, screens/ProfileDetailsScreen.tsx | design-studio |
| tests/fundingPath.test.mjs | 279 | Which jobs can be funded, and within what window | lib/paymentRules.ts, screens/ClientJobDetailScreen.tsx, screens/ApproveOrDisputeScreen.tsx, lib/payments.ts, screens/ChatScreen.tsx | payments |
| tests/gateAnswer.test.mjs | 379 | Legal and setup gate answer per signed-in state | lib/gateAnswer.ts, hooks/useSetupStatus.ts, hooks/useLegalGate.ts, App.tsx, lib/gateAnswer | auth |
| tests/goldOnForest.test.mjs | 538 | Gold is line-work only; dark palette colours | screens, components, ui, ui/tokens.ts, components/HotspotMap.native.tsx | theme |
| tests/governance.test.mjs | 291 | Governance docs keep required literals and derive SDK | docs/architecture.md, docs/README.md, docs/PROJECT-CHAT.md, .github/workflows/ci.yml, .github/workflows/pgtap.yml | docs-process |
| tests/haptics.test.mjs | 113 | Haptics wrapper no-ops; web never loads the vendor | lib/haptics.ts, components, hooks, lib, modes | motion |
| tests/hardening.test.mjs | 570 | Protected fields and RPC-only writes under RLS | supabase/archive/phases/phase29_security_hardening.sql, supabase/archive/phases/phase32_function_execute_privileges.sql, lib/profiles.ts, lib/jobs.ts, lib/offers.ts | other |
| tests/hireFromPush.test.mjs | 191 | Hire-from-push actions and bid push payload | lib/notificationActions.ts, supabase/migrations/20260930001200_hire_from_push.sql, supabase/functions/create-payment/index.ts, lib/payments/stripe.ts, supabase/functions/payment-methods/index.ts | offers |
| tests/homeAttention.test.mjs | 382 | Home attention rows: a move versus a wait | lib/jobLifecycle.ts, lib/homeAttention.ts, screens/HomeScreen.tsx | lifecycle |
| tests/homeDesignStudio.test.mjs | 84 | Home design studio wrapper and default geometry | App.tsx, lib/homeDesignStudio.tsx, screens/HomeScreen.tsx | design-studio |
| tests/inboxRows.test.mjs | 123 | Unseen count and inbox row time stamps | lib/conversationVisibility.ts, lib/time.ts, lib/liveJobStatus.ts, components/ConversationRow.tsx, components/SwipeableRow.motion120.tsx | chat-extras |
| tests/inboxUndo.test.mjs | 42 | Inbox actions offer Undo instead of confirm | screens/MessagesInboxScreen.tsx | chat-extras |
| tests/jobCompletions.test.mjs | 234 | Completion needs a photo, passes proof URLs | screens/WorkerJobScreen.tsx, screens/EarningsScreen.tsx, lib/payments.ts, lib/storage.ts, lib/jobs.ts | lifecycle |
| tests/jobFilterRules.test.mjs | 462 | Job sheet sort order and newest rules | lib/jobFilters.ts, lib/time.ts, lib/discoveryFilter.ts, lib/jobs.ts, supabase/migrations/20260930000500_radius_cap_3000.sql | discovery |
| tests/jobSeries.test.mjs | 137 | Repeat jobs cadence and offer/post RPC rules | lib/repeatJobs.ts, supabase/migrations/20260930001000_job_series.sql, supabase/tests/040_authz.sql, supabase/tests/180_job_series.sql, screens/PostJobScreen.tsx | post-job |
| tests/launchCategories.test.mjs | 103 | Excluded categories hidden from the posting pick | lib/jobs.ts, screens/PostJobScreen.tsx, components/CategoryTileRow.tsx, components/JobFilterSheet.tsx, components/BrowseJobCard.tsx | post-job |
| tests/launchMark.test.mjs | 105 | Launch mark rounding and BrandLogo radius | screens/LaunchScreen.tsx, components/BrandLogo.tsx | theme |
| tests/layout.test.mjs | 419 | Tab screens safe-area gaps and page ground | screens/HomeScreen.tsx, screens/MyJobsHubScreen.tsx, screens/MessagesInboxScreen.tsx, screens/ProfileScreen.tsx, lib/meltBarGeometry.ts | theme |
| tests/legacyAggregateFence.test.mjs | 146 | No app code reads legacy rating columns | lib, screens, components, hooks, navigation | reviews |
| tests/legalGate.test.mjs | 392 | Legal documents exist once, shared by the gate | screens/LegalGateScreen.tsx, lib/legal/index.ts, hooks/useLegalGate.ts, App.tsx, components/SegmentedControl.tsx | auth |
| tests/lifecycle.test.mjs | 446 | Job lifecycle: confirmed derived, arrival beats payment | lib/jobLifecycle.ts, components/JobProgress.tsx, lib/jobStage.ts, components/StatusBadge.tsx, ui/primitives/StatusPill.tsx | lifecycle |
| tests/litSurface.test.mjs | 93 | LitSurface paints on web and native, no colour | ui/primitives/LitSurface.tsx, ui/primitives/index.ts | theme |
| tests/liveCard.test.mjs | 138 | Lock-screen live card native module installed whole | supabase/migrations/20260930001300_live_card.sql, lib, hooks, screens, components | notifications |
| tests/liveLocation.test.mjs | 732 | Live location RPC names, projection and thread column | supabase/archive/phases/phase77_conversation_features.sql, lib/liveLocation.ts, hooks/useLiveLocation.ts, screens/ChatScreen.tsx, components/LiveLocationCard.tsx | live-location |
| tests/locationPrivacy.test.mjs | 232 | Geocode fallback never shows coordinates | lib/locationPrivacy.ts, lib/geolocation.ts, screens/PostJobScreen.tsx, lib/jobs.ts, lib/offers.ts | post-job |
| tests/maestroFlows.test.mjs | 203 | Maestro money-walk flow files and variant | scripts/supabase-ref.mjs, .maestro/money-walk.yml, .maestro/sign-in.yml, .maestro, app.config.ts | harness |
| tests/marketplaceThreadIdentity.test.mjs | 114 | Thread identity migration grants and create_offer replace | supabase/archive/phases/phase61_marketplace_thread_identity.sql | messaging |
| tests/mediaUploader.test.mjs | 85 | Media uploader appends only real uploads | ui/primitives/MediaUploader.tsx, screens/PostJobScreen.tsx, ui/primitives/index.ts | post-job |
| tests/meltTabBar.test.mjs | 169 | Melt tab bar pill geometry and slot centres | lib/meltBarGeometry.ts, ui/tokens.ts, navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, components/MeltTabBar.shared.tsx | theme |
| tests/messagingLock.test.mjs | 312 | Messages locked until the offer is confirmed | lib/messages.ts, supabase/archive/phases/phase66_messaging_locked_until_confirmed.sql, supabase/archive/phases/phase46_offer_rpcs_and_rls.sql, supabase/archive/phases/phase61_marketplace_thread_identity.sql, screens/ChatScreen.tsx | messaging |
| tests/mode.test.mjs | 648 | Exactly two modes: customer and worker | modes/types.ts, modes/ModeProvider.tsx, modes/ModeGuard.tsx, navigation/ModeShell.tsx, navigation/CustomerRoot.tsx | other |
| tests/moderationEntryPoints.test.mjs | 129 | Report reasons and subject kinds match the database | supabase/migrations/20261003000700_ugc_moderation.sql, lib/moderation.ts, components/ReportDialog.tsx, components/ReportContentLink.tsx, screens/JobDetailScreen.tsx | moderation |
| tests/modeTransition.test.mjs | 102 | Mode switch overlay choreography under full cover | components/ModeTransitionOverlay.tsx, components/ModeTransitionOverlay.motion120.tsx, components/ModeTransitionOverlay.shared.tsx, navigation/ModeShell.tsx, modes/ModeProvider.tsx | other |
| tests/moneyCeiling.test.mjs | 172 | Client money ceilings mirror database ceilings | lib/jobs.ts, lib/validation.ts, supabase/archive/phases/phase75_security_hardening.sql, supabase/archive/phases/phase51_active_work_lifecycle.sql, lib/offers.ts | payments |
| tests/moneyCopy.test.mjs | 131 | Money state captions and one fee name, no false paid | lib/moneyCopy.ts, lib/payments.ts, ui/primitives/StatusPill.tsx, ui/primitives/MoneyText.tsx, screens/WorkerJobScreen.tsx | payments |
| tests/moneyFormat.test.mjs | 62 | Money renders two decimals, grouped thousands | lib/jobs.ts | payments |
| tests/moneyMoments.test.mjs | 37 | Money moments: one haptic per payment, reduce-motion safe | components/MoneyMoment.tsx, screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx | payments |
| tests/motion120.test.mjs | 2372 | Vendor motion packages load only at the boundary | lib/motion120/types.ts, lib/motion120/vendor.ts, lib, screens, components | motion |
| tests/motionDriver.test.mjs | 73 | lib/motion.ts is the sole Animated driver authority | lib/motion.ts, components, hooks, lib, modes | motion |
| tests/myJobsRetab.test.mjs | 106 | My Jobs tabs Active, Review, Closed and perspective | screens/MyJobsHubScreen.tsx, hooks/useMyJobsHub.ts, components/HubCard.tsx, lib/payments.ts, lib/disputes.ts | lifecycle |
| tests/neededToday.test.mjs | 65 | Needed-today pill and flag on create_job | lib/neededToday.ts, supabase/migrations/20260930000600_needed_today.sql, supabase/tests/140_needed_today.sql, lib/jobs.ts, screens/PostJobScreen.tsx | post-job |
| tests/notificationFeed.test.mjs | 324 | One event log; recipient writes read_at only | supabase/archive/phases, supabase/archive/phases/${file}, supabase/archive/phases/phase56_notification_feed.sql, lib/notifications.ts, supabase/archive/phases/phase20_push_notifications.sql | notifications |
| tests/notificationGroups.test.mjs | 78 | Notification day labels and same-day bid fold | lib/notificationGroups.ts | notifications |
| tests/observability.test.mjs | 490 | Sentry and analytics load only via guarded require | config/env, lib/observability/sentry.ts, lib/observability/analytics.ts, lib, hooks | analytics |
| tests/offerActionParity.test.mjs | 591 | Incoming offers and counteroffers actionable by recipient | lib/offers.ts, lib/offerNavigation.ts, lib/offerCopy.ts, lib/time.ts, components/OfferCard.tsx | offers |
| tests/offerComposer.test.mjs | 230 | Offer composer form for bid, counter and hire terms | components/OfferComposer.tsx, screens/SubmitBidScreen.tsx, screens/CounterofferScreen.tsx, screens/PostJobScreen.tsx, screens/JobDetailScreen.tsx | offers |
| tests/offerCopyAndRouting.test.mjs | 228 | Notification feed routing and payload destinations | screens/NotificationsScreen.tsx, supabase/archive/phases, supabase/archive/phases/${file}, lib/notificationRoutes.ts, screens/JobDetailScreen.tsx | notifications |
| tests/offerScopedChat.test.mjs | 138 | Offer-scoped chat thread creation and chat route | supabase/archive/phases/phase52_offer_scoped_chat.sql, lib/navigation.ts, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx, lib/conversations.ts | messaging |
| tests/ownJobCard.test.mjs | 122 | Own job card opens client job detail in My Jobs | lib/errorMessage.ts, lib/ownJobCard.ts, screens/HomeScreen.tsx | post-job |
| tests/passwordReset.test.mjs | 58 | Reset link parsing and recovery flag | lib/passwordResetLink.ts, screens/EmailSignInScreen.tsx, App.tsx, lib/passwordReset.ts, supabase/config.toml | auth |
| tests/paymentsMode.test.mjs | 389 | Declared payments modes honoured on every build | lib/adapters/paymentsMode.ts, components, hooks, lib, modes | sandbox-money |
| tests/payouts.test.mjs | 475 | Four payout states and their CTA mapping | lib/payments.ts, lib/paymentRules.ts, lib/jobs.ts, supabase, lib/payments/stripe.ts | payouts |
| tests/permissionPrompts.test.mjs | 102 | Permission denial offers a Settings path | lib/permissionPrompt.ts, screens/ChatScreen.tsx, screens/ProfileScreen.tsx, hooks/useVoiceRecorder.ts, hooks/useLiveLocation.ts | other |
| tests/phase76Shape.test.mjs | 152 | phase76 SQL transaction shape and sentinel | scripts/verify-schema.mjs, supabase/archive/phases/phase76_rls_and_search_path_corrections.sql | harness |
| tests/phase77Shape.test.mjs | 396 | phase77 SQL transaction shape and sentinel | supabase/archive/phases/phase77_conversation_features.sql, scripts/verify-schema.mjs | harness |
| tests/phoneOtp.test.mjs | 943 | Mock phone codes six digits; injectable generator | lib/phoneAuth/types.ts, lib/phoneAuth/errors.ts, types, lib/phoneAuth/mode.ts, lib/phoneAuth/mock.ts | auth |
| tests/platformFee.test.mjs | 209 | Client carries no fee constant; quotes validated | lib/paymentRules.ts, lib/payments.ts, lib/jobs.ts, supabase/archive/phases, supabase/archive/phases/${file} | payments |
| tests/pngGeometry.mjs | 242 | Helper: measures rendered PNG geometry (not a test) | - | harness |
| tests/postJobDraft.test.mjs | 308 | Post-job draft persists, clears and survives Back | lib/pricingMode.ts, lib/postJobDraft.ts, screens/PostJobScreen.tsx, screens/MyJobsHubScreen.tsx | post-job |
| tests/postJobPublish.test.mjs | 1343 | Publish success overlay opaque, palette green | components/JobLivePage.tsx, screens/PostJobScreen.tsx, lib/theme.ts, ui/tokens.ts, components/MeltTabBar.shared.tsx | post-job |
| tests/postQuestions.test.mjs | 117 | Category questions: two to four real choices | lib/postQuestions.ts, lib/jobs.ts, components/CategoryTileRow.tsx, ui/tokens.ts, components/PostQuestions.tsx | post-job |
| tests/potentialEarnings.test.mjs | 68 | Potential earnings excludes the viewer own jobs | lib/earningsMath.ts, screens/WorkerHomeScreen.tsx | discovery |
| tests/pricingMode.test.mjs | 312 | Pricing mode allow-list and open-bids default | docs/DECISIONS.md, supabase/migrations/20260930000400_job_pricing_mode.sql, lib/pricingMode.ts, lib/jobs.ts, lib/postJobDraft.ts | post-job |
| tests/projections.test.mjs | 101 | Typed select projections match their types | lib/conversations.ts, lib/reactions.ts, lib/portfolio.ts, lib/notificationPrefs.ts | other |
| tests/pwa.test.mjs | 195 | Web build installable, PWA icon, web map | app.config.ts, public/manifest.json, public/index.html, public/sw.js, lib/supabase.web.ts | web-pwa |
| tests/quietHours.test.mjs | 52 | Quiet hours off by default; nearby alerts wait | lib/quietHours.ts, supabase/migrations/20260930000800_quiet_hours.sql, supabase/tests/160_quiet_hours.sql, lib/notificationPrefs.ts, screens/NotificationSettingsScreen.tsx | notifications |
| tests/receipts.test.mjs | 188 | Customer and worker receipts after release | supabase/functions/send-receipts/receipt.mjs, lib/jobs.ts, supabase/functions/send-receipts/index.ts, supabase/migrations/20260930001100_receipts.sql, supabase/tests/190_receipts.sql | payments |
| tests/remoteImage.test.mjs | 106 | RemoteImage lazy-loads expo-image; no raw remote Image | components/RemoteImage.tsx, components, hooks, lib, modes | other |
| tests/reusePastJob.test.mjs | 105 | Reuse-past-job list order and card width | lib/reuseJobs.ts, components/CreateSheet.tsx, navigation/CustomerRoot.tsx, screens/PostJobScreen.tsx | post-job |
| tests/reviews.test.mjs | 49 | Review rule defense in depth; reliability count | supabase/archive/phases/phase54_review_integrity.sql, lib/jobs.ts, screens/JobDetailScreen.tsx, screens/ReviewAndTipScreen.tsx, lib/adapters/payments.ts | reviews |
| tests/rimLight.test.mjs | 275 | Rim-light lap path and auth-role layers | components/RimLight.shared.tsx, components/RimLight.motion120.tsx, components/RimLight.tsx, screens/WelcomeScreen.tsx, components/AuthButton.tsx | theme |
| tests/runningLate.test.mjs | 96 | Running-late window moves until the worker arrives | lib/runningLate.ts, lib/liveJobStatus.ts, lib/jobs.ts, supabase/migrations/20260930000700_running_late.sql, supabase/tests/040_authz.sql | lifecycle |
| tests/safety.test.mjs | 487 | Agent-safety guard canaries for hooks and settings | .claude, hooks, docs/audits/HARDENING_RUN_B_${TODAY}.md, screens/LaunchScreen.tsx, screens/WelcomeScreen.tsx | harness |
| tests/sandboxCheckout.test.mjs | 224 | Payments availability declared; no real provider | lib/adapters/paymentsMode.ts, package.json, lib/adapters/payments.ts, lib/payments.ts, screens/CheckoutScreen.tsx | sandbox-money |
| tests/screenDials.test.mjs | 497 | Screens category and no dial reaches the type | ui/designStudioSchema.ts, screens/HomeScreen.tsx, lib/theme, screens/WorkerHomeScreen.tsx, screens/PostJobScreen.tsx | design-studio |
| tests/screenStates.test.mjs | 84 | State copy lives once; wait VoiceOver labels | screens, components, ui/templates/ScreenStates.tsx, components/PortfolioPicker.tsx, components/TranslationSheet.tsx | other |
| tests/sectionLabels.test.mjs | 97 | One eyebrow measure for every section label | screens, components, screens/ClientJobDetailScreen.tsx, screens/DeleteAccountScreen.tsx, screens/EarningsScreen.tsx | theme |
| tests/secureSessionStorage.test.mjs | 280 | Keychain session storage round-trips, chunked | lib/secureSessionStorageCore.ts | auth |
| tests/secureSessionStorageFence.test.mjs | 140 | Auth storage is the SecureStore adapter, never AsyncStorage | lib/supabase.web.ts, scripts/shots.mjs, scripts/home-shots.mjs, components, hooks | auth |
| tests/selfService.test.mjs | 172 | Saved workers and self-service grants posture | supabase/archive/phases/phase53_worker_self_service.sql, lib/savedWorkers.ts, supabase/archive/phases, supabase/archive/phases/${file}, screens/WorkerProfileScreen.tsx | other |
| tests/sessionGaps.test.mjs | 52 | Payment sheet return URL; ban re-check on foreground | lib/payments/stripe.ts, app.config.ts, App.tsx, lib/AuthContext.tsx, screens/ChatScreen.tsx | payments |
| tests/settlementRetry.test.mjs | 309 | Settlement retry classification and deferral | supabase/functions/process-settlements/classify.mjs, supabase/functions/process-settlements/index.ts, supabase/migrations/20261003000000_settlement_queue_ready.sql, supabase/migrations/20261003001100_transfers_ready_fresh_first.sql | payouts |
| tests/setupOnboarding.test.mjs | 611 | Setup state from device record, then server | lib/setupState.ts, hooks/useSetupStatus.ts, lib/legal/index.ts, App.tsx, screens/SetupScreen.tsx | auth |
| tests/shotHarness.test.mjs | 549 | Screenshot harness photographs chip destinations | scripts/shots.mjs, screens/HomeScreen.tsx, components/ServiceTileRow.tsx, components/ServicePickerSheet.tsx, lib/skillCategories.ts | harness |
| tests/smoothPass.test.mjs | 316 | Endless loops stop when covered; glass dropdown rule | screens, components, ui, hooks, lib | motion |
| tests/stage4dInvariants.test.mjs | 211 | Date and window render; running late moves window | lib/jobs.ts, lib/runningLate.ts, lib/time.ts, lib/jobLifecycle.ts, screens/WorkerResultsScreen.tsx | lifecycle |
| tests/statusVocabulary.test.mjs | 398 | Raw job statuses match the migration enum | lib/jobLifecycle.ts, lib/jobStage.ts, supabase, ui/primitives/StatusPill.tsx, lib/moneyCopy.ts | lifecycle |
| tests/stripePayments.test.mjs | 659 | Stripe mode honoured on every build type | lib/adapters/paymentsMode.ts, lib/payments/stripeRules.ts, components, hooks, lib | payments |
| tests/stripeWebhookSignature.test.mjs | 167 | Stripe webhook signature verification | supabase/functions/stripe-webhook/verify.mjs | payments |
| tests/supportContact.test.mjs | 153 | Support mailto assembled once; Profile row | lib/appLinks.ts, screens/ProfileScreen.tsx, lib, screens, components | other |
| tests/themeResolution.test.mjs | 1193 | Theme preference resolution truth table | lib/themePreference.ts, lib/themePreferenceStorage.ts, screens/, screens/${name}, lib/navigation.ts | theme |
| tests/themeTokens.test.mjs | 1570 | Theme tokens and alpha literals byte-for-byte | app.config.ts, ui/colorAlpha.ts, ui/tokens.ts, ui/tokens, lib/theme.ts | theme |
| tests/tipCheckout.test.mjs | 105 | Tip payment call and unchanged job-branch bytes | supabase/functions/create-payment/index.ts | payments |
| tests/tomorrowReminders.test.mjs | 60 | Tomorrow reminder buttons route; server rule | lib/notificationActions.ts, supabase/migrations/20260930000900_tomorrow_reminders.sql, supabase/functions/send-push/index.ts, lib/pushNotifications.ts, hooks/usePushNotifications.ts | notifications |
| tests/touchTargets.test.mjs | 173 | Controls reach 44pt touch slop | screens/MessagesInboxScreen.tsx, components/JobFilterSheet.tsx, screens/MapScreen.tsx, screens/SavedWorkersScreen.tsx, screens/WorkerProfileScreen.tsx | theme |
| tests/unifiedConversation.test.mjs | 463 | Conversation resolver picks the active job thread | lib/conversationResolver.ts, screens/MessagesInboxScreen.tsx, lib/conversations.ts, lib/jobLifecycle.ts, screens/ChatScreen.tsx | messaging |
| tests/verificationBadgeRemoved.test.mjs | 103 | Verification badge gone; nothing references it | screens/LaunchScreen.tsx, screens/WelcomeScreen.tsx, screens/SignInScreen.tsx, screens/EmailSignInScreen.tsx, screens/CreateAccountScreen.tsx | other |
| tests/verifySchemaGuards.test.mjs | 190 | Production Supabase ref refused, staging accepted | scripts/verify-schema.mjs, scripts/supabase-ref.mjs | harness |
| tests/voiceOver.test.mjs | 93 | Glyph-only Pressables carry accessibility labels | screens, components, ui, components/ScreenHeader.tsx, ui/primitives/SheetHeader.tsx | other |
| tests/voiceSearch.test.mjs | 1025 | Voice search on-device, en-US, non-continuous | lib/voiceSearch/types.ts, lib/voiceSearch/provider.ts, types, lib/voiceSearch/index.ts, lib | voice |
| tests/workerDiscovery.test.mjs | 635 | Map pins cluster and merge by zoom | lib/mapClustering.ts, components/HotspotMap.native.tsx, screens/MapScreen.tsx, lib/hotspots.ts, components/HotspotMap.web.tsx | discovery |
| tests/workerHeroCard.test.mjs | 181 | Worker hero card facts; no placeholder rating | lib/workerHeroCard.ts, lib/compareBids.ts, screens/WorkerProfileScreen.tsx | discovery |
| tests/workerHome.test.mjs | 758 | Worker home stack and View all routing | screens/WorkerHomeScreen.tsx, navigation/WorkerRoot.tsx, screens/HomeScreen.tsx, lib/skillCategories.ts, components/ServiceTileRow.tsx | discovery |
| tests/workerMatching.test.mjs | 1058 | Semantic worker matching ranks history above category | supabase/archive/phases/phase39_worker_semantic_matching.sql, supabase/archive/phases/phase40_fix_semantic_match_return_type.sql, supabase/functions/worker-search/index.ts, lib/workerSearch.ts, screens/WorkerSearchScreen.tsx | discovery |
| tests/workerSkills.test.mjs | 99 | Worker skill keys map to job categories | lib/workerSkills.ts, lib/skillCategories.ts, lib/jobs.ts, components/JobFilterSheet.tsx, screens/MapScreen.tsx | discovery |

## Summary

- Unreferenced packages (0 app imports, no plugin or script reference): 15: @shopify/flash-list, @tanstack/query-async-storage-persister, @tanstack/react-query-persist-client, expo-asset, expo-dev-client, expo-linking, react-dom, react-i18next, react-native-screens, react-native-web, react-native-worklets, @expo/ngrok, @types/react, babel-preset-expo, playwright
- Tests per feature guess:
  - auth: 9
  - post-job: 13
  - discovery: 8
  - offers: 5
  - payments: 15
  - lifecycle: 8
  - payouts: 4
  - reviews: 2
  - messaging: 5
  - notifications: 7
  - deletion: 1
  - moderation: 1
  - theme: 12
  - design-studio: 4
  - voice: 2
  - chat-extras: 3
  - live-location: 1
  - documents: 1
  - web-pwa: 2
  - sandbox-money: 2
  - analytics: 2
  - docs-process: 2
  - harness: 9
  - motion: 4
  - other: 18
- Tests in the judge set (design-studio, voice, translation, chat-extras, live-location, documents, web-pwa, sandbox-money, analytics, i18n, docs-process, harness): 28
  - tests/analyticsPrivacy.test.mjs (analytics)
  - tests/buildGate.test.mjs (harness)
  - tests/chatDocuments.test.mjs (documents)
  - tests/conversationStates.test.mjs (chat-extras)
  - tests/demoLink.test.mjs (web-pwa)
  - tests/designStudio.test.mjs (design-studio)
  - tests/dictation.test.mjs (voice)
  - tests/docsBudget.test.mjs (docs-process)
  - tests/envParity.test.mjs (harness)
  - tests/fixRunF.test.mjs (design-studio)
  - tests/governance.test.mjs (docs-process)
  - tests/homeDesignStudio.test.mjs (design-studio)
  - tests/inboxRows.test.mjs (chat-extras)
  - tests/inboxUndo.test.mjs (chat-extras)
  - tests/liveLocation.test.mjs (live-location)
  - tests/maestroFlows.test.mjs (harness)
  - tests/observability.test.mjs (analytics)
  - tests/paymentsMode.test.mjs (sandbox-money)
  - tests/phase76Shape.test.mjs (harness)
  - tests/phase77Shape.test.mjs (harness)
  - tests/pngGeometry.mjs (harness)
  - tests/pwa.test.mjs (web-pwa)
  - tests/safety.test.mjs (harness)
  - tests/sandboxCheckout.test.mjs (sandbox-money)
  - tests/screenDials.test.mjs (design-studio)
  - tests/shotHarness.test.mjs (harness)
  - tests/verifySchemaGuards.test.mjs (harness)
  - tests/voiceSearch.test.mjs (voice)
