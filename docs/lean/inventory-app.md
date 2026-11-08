# Inventory: app code (Phase B step B1)

Scope: every tracked file under screens/, components/, ui/, hooks/, modes/, navigation/, config/, plus App.tsx, index.ts, app.config.ts. Branch lean-v1. lib/ not inventoried.

Method: Node import map (scratchpad importmap-app.mjs) walked .ts/.tsx/.mjs in screens, components, ui, hooks, modes, navigation, lib, App.tsx, index.ts and resolved relative imports (platform suffixes .web/.native/.motion120 included). Barrel re-exports (ui/primitives/index.ts, ui/templates/index.ts, modes/index.ts) were resolved at symbol level by a second script, so "imported by" names real consumers. Counts include sibling files of the same component family (chooser/shared/motion120) and lib/ importers. Tests in tests/ read files as text and do not import them, so they are not in the counts; notes mention them where a file is DEAD.

Label key: V1 / CUT / MAYBE / DEAD / TOOLING as in the brief. TOOLING: none in scope (dev-tools/ is outside scope). "UI motion infra" = the chooser / shared / motion120 file triples; they serve V1 screens, so V1.

| path | lines | what it is | label | imported by | proposal | note |
|---|---|---|---|---|---|---|
| App.tsx | 496 | App root: providers, auth/legal/setup gate, launch layer, push wiring | V1 | 1: index.ts | keep | contains CUT parts: web profile route; dev-web HomeDesignStudio; design-studio hooks; voice-note audio mode |
| app.config.ts | 245 | Expo config: build variants, plugins, permissions | V1 | 0 (entry/config) | keep | contains CUT parts: android block, web block, expo-audio plugin and mic strings naming voice messages |
| config/env.ts | 126 | Zod-validated reader of EXPO_PUBLIC env vars | V1 | 4: lib/observability/analytics.ts, lib/observability/sentry.ts, lib/payments/stripe.ts, lib/supabase.ts | keep | contains CUT parts: EXPO_PUBLIC_POSTHOG_KEY, PAYMENTS_MODE value sandbox |
| index.ts | 8 | registerRootComponent entry point | V1 | 0 (entry/config) | keep |  |
| components/ActionSheet.tsx | 190 | Bottom action sheet with danger-styled items | V1 | 3: screens/ChatScreen.tsx, screens/MessagesInboxScreen.tsx, screens/ProfileScreen.tsx | keep | contains CUT parts: design-override dials |
| components/AmountPrompt.tsx | 203 | Small modal to enter a dollar amount (counter-offer) | V1 | 1: screens/ChatScreen.tsx | keep | only importer ChatScreen. contains CUT parts: design-override dials |
| components/AppErrorBoundary.tsx | 142 | The app's single error boundary | V1 | 1: App.tsx | keep |  |
| components/AudioMeterBars.tsx | 137 | Live waveform inside the voice-recording pill | CUT | 1: components/ChatComposer.tsx | delete | voice messages; only importer ChatComposer (CUT branch) |
| components/AuthBackdrop.tsx | 212 | Contour art behind ivory auth screens | V1 | 1: components/AuthScaffold.tsx | keep |  |
| components/AuthButton.tsx | 343 | Welcome/auth page buttons | V1 | 9: screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/EmailSignInScreen.tsx, screens/LegalGateScreen.tsx | keep |  |
| components/AuthField.tsx | 157 | Auth text field with caption | V1 | 4: screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/EmailSignInScreen.tsx, screens/ResetPasswordScreen.tsx | keep |  |
| components/AuthNotice.tsx | 70 | Inline message strip on auth screens | V1 | 4: screens/CreateAccountScreen.tsx, screens/EmailSignInScreen.tsx, screens/SignInScreen.tsx, screens/VerifyPhoneScreen.tsx | keep |  |
| components/AuthScaffold.tsx | 479 | Auth screen layout with keyboard handling | V1 | 8: screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/EmailSignInScreen.tsx, screens/ResetPasswordScreen.tsx | keep |  |
| components/Avatar.tsx | 69 | Round photo or initials avatar | V1 | 15: components/AvatarPressable.tsx, components/HireAgainRow.tsx, components/HomeAvatarButton.tsx, components/MarketJobPreview.tsx | keep |  |
| components/AvatarPressable.tsx | 45 | Avatar that opens the photo full-screen | V1 | 7: components/ChatBubble.tsx, components/ConversationRow.tsx, components/OfferCard.tsx, screens/ClientJobDetailScreen.tsx | keep |  |
| components/BrandLogo.tsx | 84 | Brand mark for the launch screen | V1 | 1: screens/LaunchScreen.tsx | keep |  |
| components/BrowseJobCard.tsx | 269 | Fixed-height job card for browse lists | V1 | 2: screens/CellJobsScreen.tsx, screens/JobDetailScreen.tsx | keep |  |
| components/Button.tsx | 293 | The app's standard button | V1 | 35: components/AmountPrompt.tsx, components/ConfirmDialog.tsx, components/EditBudgetDialog.tsx, components/HotspotMap.native.tsx | keep | contains CUT parts: design-override dials |
| components/Card.tsx | 80 | Pressable card container | V1 | 28: components/BrowseJobCard.tsx, components/DraftCard.tsx, components/HowBrazosWorks.tsx, components/HubCard.tsx | keep |  |
| components/CategoryAccordion.tsx | 218 | Multi-select category list on profile | V1 | 1: screens/ProfileScreen.tsx | keep | only importer ProfileScreen |
| components/CategoryGlyph.tsx | 77 | Icon glyph for a service category | V1 | 16: components/BrowseJobCard.tsx, components/CategoryTileRow.tsx, components/Chip.tsx, components/CreateSheet.tsx | keep |  |
| components/CategoryTileRow.tsx | 320 | Post-a-job category tile row | V1 | 1: screens/PostJobScreen.tsx | keep |  |
| components/ChatBubble.tsx | 548 | One chat message bubble | V1 | 1: screens/ChatScreen.tsx | keep | contains CUT parts: voice-note bubble; read/delivered ticks; document attachment |
| components/ChatComposer.tsx | 615 | Chat input bar: text, photo, attach, mic | V1 | 1: screens/ChatScreen.tsx | keep | contains CUT parts: web branch; voice-message recorder; live-location option; document attach; chat-field dictation mic |
| components/Chip.tsx | 349 | Selectable chip pill | V1 | 10: components/DistanceChips.tsx, components/JobLivePage.tsx, components/OfferComposer.tsx, components/PostQuestions.tsx | keep | contains CUT parts: design-override dials |
| components/ChipCheck.motion120.tsx | 34 | Chip check mark, Reanimated 120 Hz path | V1 | 1: components/ChipCheck.tsx | keep | UI motion infra |
| components/ChipCheck.shared.tsx | 41 | Chip check mark shared body and constants | V1 | 2: components/ChipCheck.motion120.tsx, components/ChipCheck.tsx | keep | UI motion infra |
| components/ChipCheck.tsx | 39 | Chip check mark chooser plus fallback | V1 | 2: components/Chip.tsx, components/JobFilterSheet.tsx | keep | UI motion infra |
| components/ConfirmDialog.tsx | 176 | Confirm dialog (frosted pop-up) | V1 | 13: components/ConfirmHost.tsx, components/JobOwnerActions.tsx, screens/ApproveOrDisputeScreen.tsx, screens/BidDetailScreen.tsx | keep | contains CUT parts: design-override dials |
| components/ConfirmHost.tsx | 98 | Host for the one confirm engine | V1 | 2: App.tsx, components/CreateSheet.tsx | keep |  |
| components/ConversationRow.tsx | 317 | Inbox conversation row | V1 | 2: screens/HiddenChatsScreen.tsx, screens/MessagesInboxScreen.tsx | keep | contains CUT parts: muted glyph; archived/hidden flags |
| components/CountryPicker.tsx | 334 | Country calling-code picker for phone input | V1 | 1: components/PhoneNumberInput.tsx | keep |  |
| components/CreateSheet.tsx | 622 | Customer create/post sheet from centre tab | V1 | 1: navigation/CustomerRoot.tsx | keep | contains CUT parts: design-override dials |
| components/DesignStudioPanel.tsx | 1965 | Floating design studio tuning panel | CUT | 1: navigation/ModeShell.tsx | delete | design studio; only importer navigation/ModeShell.tsx |
| components/DictationMic.tsx | 233 | Dictation mic beside post-a-job fields | V1 | 1: screens/PostJobScreen.tsx | keep | post-a-job dictation (V1); uses lib/voiceSearch recognizer |
| components/DistanceChips.tsx | 140 | Radius distance chips | V1 | 1: screens/WorkerResultsScreen.tsx | keep |  |
| components/DraftCard.tsx | 78 | Unpublished post-job draft card | V1 | 2: screens/HomeScreen.tsx, screens/MyJobsHubScreen.tsx | keep |  |
| components/DrawnCheck.tsx | 65 | Self-drawing check mark | V1 | 2: components/JobLivePage.tsx, components/SealTransition.tsx | keep |  |
| components/DropMenu.motion120.tsx | 124 | Anchored menu, Reanimated 120 Hz path | V1 | 1: components/DropMenu.tsx | keep | UI motion infra |
| components/DropMenu.shared.tsx | 241 | Anchored menu shared body | V1 | 5: components/CountryPicker.tsx, components/DropMenu.motion120.tsx, components/DropMenu.tsx, components/GlassDropdown.tsx | keep | UI motion infra. contains CUT parts: design-override dials |
| components/DropMenu.tsx | 129 | Anchored drop menu chooser plus fallback | V1 | 2: components/ChatComposer.tsx, screens/ChatScreen.tsx | keep | UI motion infra; consumers are ChatComposer and ChatScreen |
| components/DropdownReveal.motion120.tsx | 75 | In-place row reveal, 120 Hz path | V1 | 1: components/DropdownReveal.tsx | keep | UI motion infra |
| components/DropdownReveal.shared.tsx | 24 | In-place row reveal shared constants | V1 | 3: components/CategoryTileRow.tsx, components/DropdownReveal.motion120.tsx, components/DropdownReveal.tsx | keep | UI motion infra |
| components/DropdownReveal.tsx | 46 | In-place row reveal chooser plus fallback | V1 | 5: components/CreateSheet.tsx, components/OfflineBanner.tsx, components/PostQuestions.tsx, screens/PostJobScreen.tsx | keep | UI motion infra |
| components/EditBudgetDialog.tsx | 295 | Edit-budget dialog for posted job | DEAD | 0 | delete | nothing imports it; only mentioned in lib/pricingMode.ts comment and tests |
| components/EntranceView.motion120.tsx | 37 | Staggered entrance wrapper, 120 Hz path | V1 | 1: components/EntranceView.tsx | keep | UI motion infra |
| components/EntranceView.shared.tsx | 19 | Entrance wrapper shared props | V1 | 2: components/EntranceView.motion120.tsx, components/EntranceView.tsx | keep | UI motion infra |
| components/EntranceView.tsx | 29 | Staggered entrance wrapper chooser | V1 | 11: components/PostQuestions.tsx, screens/CellJobsScreen.tsx, screens/HomeScreen.tsx, screens/MessagesInboxScreen.tsx | keep | UI motion infra |
| components/EyeOffIcon.tsx | 37 | Eye-with-slash icon | V1 | 1: screens/PostJobScreen.tsx | keep | only importer PostJobScreen |
| components/FadeIn.tsx | 55 | Fade-and-lift for arriving content | V1 | 1: screens/WorkerSearchScreen.tsx | keep | only importer WorkerSearchScreen |
| components/FocusRing.tsx | 100 | Focus glow ring around text fields | V1 | 8: components/AmountPrompt.tsx, components/AuthField.tsx, components/CountryPicker.tsx, components/GlowTextInput.tsx | keep |  |
| components/GlassDropdown.tsx | 283 | Frosted dropdown menu | V1 | 2: components/JobSummaryCard.tsx, screens/MessagesInboxScreen.tsx | keep |  |
| components/GlowTextInput.tsx | 52 | Text input with focus glow | V1 | 7: components/CategoryAccordion.tsx, components/ChatComposer.tsx, components/PortfolioPicker.tsx, screens/ApproveOrDisputeScreen.tsx | keep |  |
| components/HireAgainRow.tsx | 192 | Home row to rehire saved or past workers | MAYBE | 1: screens/HomeScreen.tsx | judge | saved workers / rebook; only importer HomeScreen |
| components/HomeAtmosphere.tsx | 55 | Fixed background behind both Homes | V1 | 2: screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| components/HomeAvatarButton.tsx | 43 | Profile photo button on Home | V1 | 2: screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| components/HomeLiveBar.tsx | 117 | Home live-job status bar | V1 | 2: components/ConversationRow.tsx, screens/HomeScreen.tsx | keep |  |
| components/HotspotMap.d.ts | 6 | Type shim for platform-resolved HotspotMap import | CUT | 1: screens/MapScreen.tsx | judge | web/native split shim; MapScreen imports it by bare path (map shows 0 importers because resolver cannot see .d.ts); remove with .web and point import at .native |
| components/HotspotMap.native.tsx | 488 | Native hotspot map with job cells | V1 | 1: screens/MapScreen.tsx | keep | contains CUT parts: PostHog analytics calls |
| components/HotspotMap.web.tsx | 575 | Web build of hotspot map | CUT | 1: screens/MapScreen.tsx | delete | web (*.web.tsx) |
| components/HowBrazosWorks.tsx | 132 | Dismissible how-it-works card for new customers | MAYBE | 1: screens/HomeScreen.tsx | judge | onboarding explainer, not on either list; only importer HomeScreen |
| components/HubCard.tsx | 371 | My Jobs hub job card | V1 | 3: components/CreateSheet.tsx, screens/HomeScreen.tsx, screens/MyJobsHubScreen.tsx | keep |  |
| components/JobFilterSheet.tsx | 834 | Worker job filter sheet | V1 | 2: screens/MapScreen.tsx, screens/WorkerResultsScreen.tsx | keep | contains CUT parts: design-override dials |
| components/JobLivePage.tsx | 433 | Post-publish live job page | V1 | 1: screens/PostJobScreen.tsx | keep | contains CUT parts: serif display (second font) |
| components/JobOwnerActions.tsx | 120 | Edit/Delete job buttons for poster | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/JobDetailScreen.tsx | keep |  |
| components/JobProgress.tsx | 135 | Three-step job progress presentation | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx | keep |  |
| components/JobSummaryCard.tsx | 848 | Post-job summary card with media | V1 | 1: screens/PostJobScreen.tsx | keep | contains CUT parts: serif display (second font) |
| components/JobVideo.tsx | 151 | One short video attached to a job | V1 | 5: components/MarketJobPreview.tsx, screens/ApproveOrDisputeScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/JobDetailScreen.tsx | keep | job video attachment, not named in v1 list |
| components/KeyboardAvoid.motion120.tsx | 49 | Keyboard-avoiding view, 120 Hz path | V1 | 1: components/KeyboardAvoid.tsx | keep | UI motion infra |
| components/KeyboardAvoid.shared.tsx | 38 | Keyboard-avoiding view shared body | V1 | 2: components/KeyboardAvoid.motion120.tsx, components/KeyboardAvoid.tsx | keep | UI motion infra |
| components/KeyboardAvoid.tsx | 32 | Keyboard-avoiding view chooser plus fallback | V1 | 13: components/AuthScaffold.tsx, components/OfferComposer.tsx, components/PortfolioPicker.tsx, components/ReportDialog.tsx | keep | UI motion infra |
| components/KeyboardAway.motion120.tsx | 65 | Block stepping aside for keyboard, 120 Hz | V1 | 1: components/KeyboardAway.tsx | keep | UI motion infra |
| components/KeyboardAway.shared.tsx | 28 | Keyboard-away shared props | V1 | 2: components/KeyboardAway.motion120.tsx, components/KeyboardAway.tsx | keep | UI motion infra |
| components/KeyboardAway.tsx | 69 | Keyboard-away chooser plus fallback | V1 | 1: screens/WorkerSearchScreen.tsx | keep | UI motion infra; only importer WorkerSearchScreen |
| components/KeyboardRisingColumn.motion120.tsx | 81 | Column rising with keyboard, 120 Hz | V1 | 1: components/KeyboardRisingColumn.tsx | keep | UI motion infra |
| components/KeyboardRisingColumn.shared.tsx | 96 | Keyboard-rising column shared contract | V1 | 4: components/AuthScaffold.tsx, components/KeyboardRisingColumn.motion120.tsx, components/KeyboardRisingColumn.tsx, hooks/useKeyboardOffset.ts | keep | UI motion infra |
| components/KeyboardRisingColumn.tsx | 77 | Keyboard-rising column chooser | V1 | 2: components/AuthScaffold.tsx, screens/ChatScreen.tsx | keep | UI motion infra |
| components/LiveDot.tsx | 140 | Pulsing live-status dots | V1 | 5: components/ConversationRow.tsx, components/HomeLiveBar.tsx, components/StageRail.tsx, screens/HomeScreen.tsx | keep |  |
| components/LiveLocationCard.tsx | 271 | Live-location share card and bar in chat | CUT | 1: screens/ChatScreen.tsx | delete | live location; only importer ChatScreen (CUT branch) |
| components/MapPinIcon.tsx | 132 | Map tab pin glyph | V1 | 2: components/HotspotMap.native.tsx, components/HotspotMap.web.tsx | keep |  |
| components/MarkdownText.tsx | 143 | Minimal markdown renderer for legal text | V1 | 2: screens/LegalDocumentScreen.tsx, screens/LegalGateScreen.tsx | keep |  |
| components/MarketJobPreview.tsx | 321 | Customer-safe preview of an open job | V1 | 1: screens/JobDetailScreen.tsx | keep |  |
| components/MediaViewer.tsx | 203 | Full-screen paged viewer for photos and clips | V1 | 1: components/JobSummaryCard.tsx | keep | only importer JobSummaryCard |
| components/MeltTabBar.motion120.tsx | 655 | Melt-through tab bar, 120 Hz path | V1 | 1: components/MeltTabBar.tsx | keep | UI motion infra |
| components/MeltTabBar.shared.tsx | 358 | Melt-through tab bar shared body | V1 | 2: components/MeltTabBar.motion120.tsx, components/MeltTabBar.tsx | keep | UI motion infra. contains CUT parts: web branch |
| components/MeltTabBar.tsx | 196 | Melt-through tab bar chooser plus fallback | V1 | 2: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx | keep | UI motion infra |
| components/MessageTicks.tsx | 77 | Sent/delivered/read ticks on own message | CUT | 1: components/ChatBubble.tsx | delete | read and delivered ticks; only importer ChatBubble |
| components/ModeSwitchRow.tsx | 98 | Profile row to switch customer/worker mode | V1 | 1: screens/ProfileScreen.tsx | keep |  |
| components/ModeTransitionOverlay.motion120.tsx | 112 | Mode-switch wipe, 120 Hz path | V1 | 1: components/ModeTransitionOverlay.tsx | keep | UI motion infra |
| components/ModeTransitionOverlay.shared.tsx | 282 | Mode-switch wipe shared body | V1 | 2: components/ModeTransitionOverlay.motion120.tsx, components/ModeTransitionOverlay.tsx | keep | UI motion infra. contains CUT parts: web branch |
| components/ModeTransitionOverlay.tsx | 369 | Mode-switch wipe provider and fallback | V1 | 3: App.tsx, modes/ModeProvider.tsx, navigation/ModeShell.tsx | keep |  |
| components/MoneyMoment.tsx | 111 | Held/released payment pulse and tick | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx | keep |  |
| components/NotificationBell.tsx | 83 | Home bell with unread count | V1 | 2: screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| components/OfferCard.tsx | 803 | Offer/bid card with actions | V1 | 2: screens/ChatScreen.tsx, screens/ClientJobDetailScreen.tsx | keep |  |
| components/OfferComposer.tsx | 662 | Bid/offer/counteroffer entry form | V1 | 5: components/EditBudgetDialog.tsx, screens/CounterofferScreen.tsx, screens/JobDetailScreen.tsx, screens/PostJobScreen.tsx | keep | contains CUT parts: PostHog analytics calls |
| components/OfferResponseActions.tsx | 194 | Accept/counter/decline block for offers | V1 | 2: components/OfferCard.tsx, screens/JobDetailScreen.tsx | keep |  |
| components/OfflineBanner.tsx | 63 | Slim offline banner | V1 | 1: App.tsx | keep |  |
| components/OtpInput.tsx | 200 | Six-cell phone code field | V1 | 1: screens/VerifyPhoneScreen.tsx | keep | contains CUT parts: android sms autofill / web-input workaround |
| components/PastWork.tsx | 422 | Worker portfolio past-work strip | MAYBE | 2: screens/ProfileDetailsScreen.tsx, screens/WorkerProfileScreen.tsx | judge | worker portfolio, not on either list |
| components/PayoutNudge.tsx | 61 | Set-up-payouts nudge on approved payment | V1 | 1: screens/WorkerJobScreen.tsx | keep |  |
| components/PeekSheet.motion120.tsx | 178 | Map jobs pane drag, 120 Hz path | V1 | 1: components/PeekSheet.tsx | keep | UI motion infra (map) |
| components/PeekSheet.shared.tsx | 552 | Map jobs pane shared body | V1 | 2: components/PeekSheet.motion120.tsx, components/PeekSheet.tsx | keep | UI motion infra (map) |
| components/PeekSheet.tsx | 110 | Map floating jobs pane chooser | V1 | 1: screens/MapScreen.tsx | keep | UI motion infra (map) |
| components/PhoneNumberInput.tsx | 295 | Phone number field with country picker | V1 | 4: screens/CreateAccountScreen.tsx, screens/EmailCreateAccountScreen.tsx, screens/SignInScreen.tsx, ui/primitives/index.ts | keep |  |
| components/PhotoViewer.tsx | 171 | Full-screen photo viewer with share | V1 | 12: components/PastWork.tsx, screens/ApproveOrDisputeScreen.tsx, screens/ChatScreen.tsx, screens/ClientJobDetailScreen.tsx | keep |  |
| components/PickerPopover.tsx | 412 | Checkmark list popover under a pill | V1 | 6: components/CountryPicker.tsx, components/DistanceChips.tsx, components/GlassDropdown.tsx, components/JobFilterSheet.tsx | keep |  |
| components/PopModal.motion120.tsx | 66 | Frosted pop-up, 120 Hz path | V1 | 1: components/PopModal.tsx | keep | UI motion infra |
| components/PopModal.shared.tsx | 53 | Frosted pop-up shared constants | V1 | 2: components/PopModal.motion120.tsx, components/PopModal.tsx | keep | UI motion infra |
| components/PopModal.tsx | 102 | Frosted pop-up chooser plus fallback | V1 | 6: components/ActionSheet.tsx, components/AmountPrompt.tsx, components/ConfirmDialog.tsx, components/EditBudgetDialog.tsx | keep | UI motion infra |
| components/PortfolioPicker.tsx | 805 | Worker portfolio photo picker | MAYBE | 2: screens/ProfileDetailsScreen.tsx, screens/ProfileScreen.tsx | judge | worker portfolio, not on either list |
| components/PostJobBar.tsx | 189 | Publish/back bar above tab bar | V1 | 2: components/JobLivePage.tsx, screens/PostJobScreen.tsx | keep |  |
| components/PostQuestions.tsx | 146 | Guided questions chips in post-a-job | V1 | 1: screens/PostJobScreen.tsx | keep |  |
| components/PressScale.motion120.tsx | 40 | Press-sink pressable, 120 Hz path | V1 | 1: components/PressScale.tsx | keep | UI motion infra |
| components/PressScale.shared.tsx | 163 | Press-sink shared styles | V1 | 2: components/PressScale.motion120.tsx, components/PressScale.tsx | keep | UI motion infra |
| components/PressScale.tsx | 47 | Press-sink pressable chooser | V1 | 20: components/Button.tsx, components/CategoryAccordion.tsx, components/CategoryTileRow.tsx, components/Chip.tsx | keep | UI motion infra |
| components/PriceDropdown.tsx | 454 | Bids-or-set-price chooser with price presets | V1 | 1: screens/PostJobScreen.tsx | keep |  |
| components/ReactionPicker.tsx | 134 | Emoji reaction picker for chat messages | MAYBE | 1: screens/ChatScreen.tsx | judge | message reactions, not on either list; only importer ChatScreen |
| components/RemoteImage.tsx | 122 | Single boundary for remote photos | V1 | 22: components/Avatar.tsx, components/BrowseJobCard.tsx, components/ChatBubble.tsx, components/HubCard.tsx | keep |  |
| components/RepeatNote.tsx | 109 | Repeating-job visit note | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx | keep |  |
| components/ReportContentLink.tsx | 93 | Report link for jobs, profiles, reviews | V1 | 5: components/MarketJobPreview.tsx, screens/JobDetailScreen.tsx, screens/ProfileReviewsScreen.tsx, screens/PublicProfileScreen.tsx | keep |  |
| components/ReportDialog.tsx | 396 | Report sheet with reasons | V1 | 4: components/PastWork.tsx, components/ReportContentLink.tsx, screens/ChatScreen.tsx, screens/MessagesInboxScreen.tsx | keep |  |
| components/ReviewSection.tsx | 651 | Review list and write-review block | V1 | 3: screens/ClientJobDetailScreen.tsx, screens/ReviewAndTipScreen.tsx, screens/WorkerJobScreen.tsx | keep |  |
| components/RimLight.motion120.tsx | 78 | Button rim light, 120 Hz path | V1 | 1: components/RimLight.tsx | keep | decorative; only importer WelcomeScreen |
| components/RimLight.shared.tsx | 196 | Button rim light shared geometry | V1 | 2: components/RimLight.motion120.tsx, components/RimLight.tsx | keep | decorative; only importer WelcomeScreen |
| components/RimLight.tsx | 101 | Button rim light native fallback | V1 | 1: screens/WelcomeScreen.tsx | keep | decorative; only importer WelcomeScreen |
| components/ScreenHeader.tsx | 447 | Standard screen header | V1 | 26: screens/AccountSafetyScreen.tsx, screens/AdminReportsScreen.tsx, screens/AppearanceScreen.tsx, screens/CellJobsScreen.tsx | keep | contains CUT parts: design-override dials |
| components/SealTransition.tsx | 239 | Publish button to seal transition | V1 | 1: screens/PostJobScreen.tsx | keep |  |
| components/SegmentedControl.tsx | 173 | Segmented control | V1 | 7: components/PriceDropdown.tsx, screens/ClientJobDetailScreen.tsx, screens/MyJobsHubScreen.tsx, screens/NotificationSettingsScreen.tsx | keep |  |
| components/SelectMark.motion120.tsx | 51 | Arriving selection mark, 120 Hz | V1 | 1: components/SelectMark.tsx | keep | UI motion infra |
| components/SelectMark.shared.tsx | 64 | Selection mark shared constants | V1 | 2: components/SelectMark.motion120.tsx, components/SelectMark.tsx | keep | UI motion infra |
| components/SelectMark.tsx | 83 | Selection mark chooser plus fallback | V1 | 5: components/CategoryAccordion.tsx, components/StarRating.tsx, screens/AppearanceScreen.tsx, screens/ApproveOrDisputeScreen.tsx | keep | UI motion infra |
| components/Selection.motion120.tsx | 81 | Selection colour fade, 120 Hz | V1 | 1: components/Selection.tsx | keep | UI motion infra |
| components/Selection.shared.tsx | 95 | Selection fade shared props | V1 | 2: components/Selection.motion120.tsx, components/Selection.tsx | keep | UI motion infra |
| components/Selection.tsx | 98 | Selection fade chooser plus fallback | V1 | 4: components/Chip.tsx, components/JobFilterSheet.tsx, components/SegmentedControl.tsx, screens/MessagesInboxScreen.tsx | keep | UI motion infra |
| components/ServicePickerSheet.tsx | 207 | All-services picker sheet | V1 | 2: screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| components/ServiceTileRow.tsx | 269 | Service tile row on Home | V1 | 4: components/CategoryGlyph.tsx, components/CategoryTileRow.tsx, screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| components/SetupChoiceCard.tsx | 156 | Start-in customer/worker choice card | V1 | 1: screens/SetupScreen.tsx | keep |  |
| components/SetupRow.tsx | 169 | Setup screen row | V1 | 1: screens/SetupScreen.tsx | keep |  |
| components/SheetCard.motion120.tsx | 66 | Docked sheet card, 120 Hz | V1 | 1: components/SheetCard.tsx | keep | UI motion infra |
| components/SheetCard.shared.tsx | 34 | Docked sheet card shared constants | V1 | 2: components/SheetCard.motion120.tsx, components/SheetCard.tsx | keep | UI motion infra |
| components/SheetCard.tsx | 84 | Docked sheet card chooser plus fallback | V1 | 3: components/CreateSheet.tsx, components/ServicePickerSheet.tsx, ui/primitives/Sheet.tsx | keep | UI motion infra |
| components/Skeleton.tsx | 92 | Loading skeleton placeholder | V1 | 4: components/WorkerJobCard.tsx, screens/WorkerHomeScreen.tsx, ui/primitives/index.ts, ui/templates/ScreenStates.tsx | keep |  |
| components/StageRail.tsx | 195 | Live-job stage rail | V1 | 1: components/HubCard.tsx | keep | contains CUT parts: web branch |
| components/StarRating.tsx | 72 | Star rating input/display | V1 | 3: components/ReviewSection.tsx, screens/ProfileReviewsScreen.tsx, ui/primitives/index.ts | keep |  |
| components/StatusBadge.tsx | 118 | Job status badge | V1 | 7: components/HubCard.tsx, components/OfferCard.tsx, components/OfferResponseActions.tsx, screens/AdminReportsScreen.tsx | keep |  |
| components/SuccessMark.motion120.tsx | 160 | Published-job mark entrance, 120 Hz | DEAD | 1: components/SuccessMark.tsx | delete | imported only by dead SuccessMark.tsx |
| components/SuccessMark.shared.tsx | 154 | Published-job mark artwork constants | V1 | 3: components/DrawnCheck.tsx, components/SuccessMark.motion120.tsx, components/SuccessMark.tsx | keep | imported by DrawnCheck, ModeTransitionOverlay.shared |
| components/SuccessMark.tsx | 193 | Still/animated published-job mark | DEAD | 0 | delete | nothing imports it (SuccessScreen mentions it in a comment only); tests/motion120 and postJobPublish read it as text |
| components/SwipeableRow.motion120.tsx | 142 | Swipe-left row actions, 120 Hz | CUT | 1: components/SwipeableRow.tsx | judge | inbox swipe actions (archive/mute/mark unread); DEAD-after-cut with SwipeableRow.tsx |
| components/SwipeableRow.shared.tsx | 147 | Swipe action types and tiles | CUT | 2: components/SwipeableRow.motion120.tsx, components/SwipeableRow.tsx | judge | DEAD-after-cut; imported only by SwipeableRow pair |
| components/SwipeableRow.tsx | 58 | Swipeable list row chooser | CUT | 1: screens/MessagesInboxScreen.tsx | judge | only importer MessagesInboxScreen, for archive/mute/mark-unread swipe actions (CUT); DEAD-after-cut |
| components/TextField.tsx | 203 | Labelled text field | V1 | 8: components/OfferComposer.tsx, components/PriceDropdown.tsx, components/ReportDialog.tsx, components/ReviewSection.tsx | keep |  |
| components/TileCheck.motion120.tsx | 34 | Category tile check, 120 Hz | V1 | 1: components/TileCheck.tsx | keep | UI motion infra |
| components/TileCheck.shared.tsx | 51 | Category tile check shared body | V1 | 2: components/TileCheck.motion120.tsx, components/TileCheck.tsx | keep | UI motion infra |
| components/TileCheck.tsx | 39 | Category tile check chooser | V1 | 1: components/CategoryTileRow.tsx | keep | UI motion infra |
| components/TodayPill.tsx | 77 | Need-it-today pill on job card | V1 | 2: components/BrowseJobCard.tsx, components/WorkerJobCard.tsx | keep |  |
| components/TranslationSheet.tsx | 176 | Chat message translation sheet | CUT | 1: screens/ChatScreen.tsx | delete | translation; only importer ChatScreen |
| components/UndoToast.tsx | 111 | Undo toast | V1 | 2: screens/MessagesInboxScreen.tsx, screens/PostJobScreen.tsx | keep |  |
| components/VoiceNote.tsx | 152 | Voice-message player bubble | CUT | 2: components/ChatBubble.tsx, components/ChatComposer.tsx | delete | voice messages; importers ChatBubble, ChatComposer (CUT branches) |
| components/WorkerJobCard.tsx | 711 | Worker job result card and skeleton | V1 | 3: screens/MapScreen.tsx, screens/WorkerHomeScreen.tsx, screens/WorkerResultsScreen.tsx | keep |  |
| components/ZoomableImage.motion120.tsx | 208 | Pinch/pan photo, 120 Hz | V1 | 1: components/ZoomableImage.tsx | keep | UI motion infra |
| components/ZoomableImage.shared.tsx | 75 | Zoomable photo shared constants | V1 | 2: components/ZoomableImage.motion120.tsx, components/ZoomableImage.tsx | keep | UI motion infra |
| components/ZoomableImage.tsx | 309 | Zoomable photo chooser plus fallback | V1 | 2: components/MediaViewer.tsx, components/PhotoViewer.tsx | keep | UI motion infra |
| hooks/useAnnounce.ts | 31 | Screen-reader announcements | V1 | 16: components/AuthField.tsx, components/AuthNotice.tsx, components/OfflineBanner.tsx, components/PhoneNumberInput.tsx | keep |  |
| hooks/useAuth.ts | 3 | Auth context hook | V1 | 53: App.tsx, components/BrowseJobCard.tsx, components/MoneyMoment.tsx, components/PastWork.tsx | keep |  |
| hooks/useBidCounts.ts | 21 | Deprecated facade over useOfferCounts | V1 | 1: screens/WorkerHomeScreen.tsx | keep | deprecated facade; only importer WorkerHomeScreen; candidate to inline |
| hooks/useConversationChat.ts | 278 | One conversation's threads and messages | V1 | 1: screens/ChatScreen.tsx | keep |  |
| hooks/useConversations.ts | 224 | Inbox conversation list with realtime | V1 | 2: screens/HiddenChatsScreen.tsx, screens/MessagesInboxScreen.tsx | keep | contains CUT parts: hidden/archived/cleared state; read ticks; mute |
| hooks/useDropdownPresence.ts | 59 | Dropdown open/close presence animation | V1 | 2: components/DropdownReveal.motion120.tsx, components/DropdownReveal.tsx | keep |  |
| hooks/useEntrance.ts | 112 | Staggered entrance style hook | V1 | 9: components/EntranceView.motion120.tsx, components/EntranceView.tsx, screens/CellJobsScreen.tsx, screens/MessagesInboxScreen.tsx | keep |  |
| hooks/useFocusedPoll.ts | 24 | Poll while screen focused | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/TrackWorkerScreen.tsx | keep |  |
| hooks/useHiddenUserIds.ts | 22 | Set of blocked users to hide | V1 | 3: hooks/useOpenJobs.ts, screens/ProfileReviewsScreen.tsx, screens/WorkerSearchScreen.tsx | keep | report/block |
| hooks/useHotspots.ts | 67 | Hotspot cells with realtime | V1 | 1: screens/MapScreen.tsx | keep | map |
| hooks/useJob.ts | 36 | Load a single job | V1 | 3: screens/ChatScreen.tsx, screens/WorkChecklistScreen.tsx, screens/WorkerJobScreen.tsx | keep |  |
| hooks/useJobDetail.ts | 122 | Canonical job read from nav param | V1 | 6: screens/ApproveOrDisputeScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/JobDetailScreen.tsx | keep |  |
| hooks/useJobLive.ts | 47 | Notify screen when its job changes | V1 | 1: hooks/useJobDetail.ts | keep |  |
| hooks/useJobOffers.ts | 197 | Offers on a job with worker profiles | V1 | 4: screens/BidDetailScreen.tsx, screens/ChatScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/CompareBidsScreen.tsx | keep |  |
| hooks/useJobOwnerActions.ts | 160 | Edit/delete permission and actions | V1 | 1: components/JobOwnerActions.tsx | keep |  |
| hooks/useJobSeries.ts | 35 | Series a repeat job visit belongs to | V1 | 2: screens/ClientJobDetailScreen.tsx, screens/WorkerJobScreen.tsx | keep | repeat jobs |
| hooks/useKeyboardOffset.ts | 92 | Keyboard offset as native-driven value | V1 | 3: components/AuthScaffold.tsx, components/KeyboardRisingColumn.tsx, screens/WorkerSearchScreen.tsx | keep |  |
| hooks/useLegalGate.ts | 107 | Legal acceptance gate state | V1 | 1: App.tsx | keep |  |
| hooks/useLiveJobCard.ts | 167 | Lock-screen live card following customer jobs | MAYBE | 1: App.tsx | judge | lock-screen live card; only importer App.tsx |
| hooks/useLiveLocation.ts | 313 | Live-location shares watcher per thread | CUT | 1: screens/ChatScreen.tsx | delete | live location; only importer ChatScreen |
| hooks/useLoopActive.ts | 42 | Whether endless loops may run | V1 | 7: components/JobLivePage.tsx, components/JobSummaryCard.tsx, components/LiveDot.tsx, components/RimLight.motion120.tsx | keep |  |
| hooks/useModalPresence.ts | 18 | Modal on-screen tracker | V1 | 15: components/ActionSheet.tsx, components/AmountPrompt.tsx, components/ConfirmDialog.tsx, components/CountryPicker.tsx | keep |  |
| hooks/useMyJobsHub.ts | 207 | My Jobs hub snapshot | V1 | 6: components/CreateSheet.tsx, screens/HomeScreen.tsx, screens/MapScreen.tsx, screens/MyJobsHubScreen.tsx | keep |  |
| hooks/useNavInset.ts | 29 | Tab bar inset contract | V1 | 1: ui/primitives/BottomNav.tsx | keep |  |
| hooks/useNotificationModeBridge.ts | 56 | Mode context for notification routing | V1 | 3: App.tsx, hooks/usePushNotifications.ts, screens/NotificationsScreen.tsx | keep |  |
| hooks/useOfferCounts.ts | 40 | Offer counts per job | V1 | 4: hooks/useBidCounts.ts, screens/CellJobsScreen.tsx, screens/MapScreen.tsx, screens/WorkerResultsScreen.tsx | keep |  |
| hooks/useOneTimeNotice.ts | 44 | Show-once notice flag | MAYBE | 1: components/PortfolioPicker.tsx | judge | only importer PortfolioPicker (MAYBE); follows it |
| hooks/useOnline.ts | 72 | Online/offline reachability | V1 | 3: App.tsx, components/OfflineBanner.tsx, lib/queryClient.ts | keep |  |
| hooks/useOpenJobs.ts | 129 | Shared open-jobs feed | V1 | 4: screens/JobDetailScreen.tsx, screens/MapScreen.tsx, screens/WorkerHomeScreen.tsx, screens/WorkerResultsScreen.tsx | keep |  |
| hooks/usePostJobDraft.ts | 34 | Unpublished draft read on focus | V1 | 2: screens/HomeScreen.tsx, screens/MyJobsHubScreen.tsx | keep |  |
| hooks/usePressFeedback.ts | 104 | Shared press feedback | V1 | 7: components/Card.tsx, components/PressScale.motion120.tsx, components/PressScale.tsx, ui/primitives/JobCard.tsx | keep |  |
| hooks/useProfile.ts | 105 | Own profile row | V1 | 9: hooks/useWorkerSkills.ts, screens/AccountSafetyScreen.tsx, screens/HomeScreen.tsx, screens/JobDetailScreen.tsx | keep |  |
| hooks/usePushNotifications.ts | 126 | Push taps to navigation and token refresh | V1 | 1: App.tsx | keep | contains CUT parts: web branch |
| hooks/useReactions.ts | 72 | Message reactions with realtime | MAYBE | 1: screens/ChatScreen.tsx | judge | message reactions, not on either list; only importer ChatScreen |
| hooks/useRebookWorkers.ts | 57 | Workers a customer can hire again | MAYBE | 2: screens/HomeScreen.tsx, screens/WorkerSearchScreen.tsx | judge | saved workers / rebook |
| hooks/useReducedMotion.ts | 65 | System reduce-motion preference | V1 | 51: components/AudioMeterBars.tsx, components/CategoryTileRow.tsx, components/ChatComposer.tsx, components/Chip.tsx | keep |  |
| hooks/useRefreshOnFocus.ts | 22 | Cache-aware refresh on focus | V1 | 1: hooks/useUnreadNotificationCount.ts | keep |  |
| hooks/useSessionJobFilters.ts | 34 | Session job filter memory | V1 | 2: screens/MapScreen.tsx, screens/WorkerResultsScreen.tsx | keep |  |
| hooks/useSetupPermissions.ts | 207 | Setup screen permission states | DEAD | 0 | delete | nothing imports it (SetupScreen comment says it stays on disk unimported); tests reference it |
| hooks/useSetupStatus.ts | 90 | Whether setup step still owed | V1 | 1: App.tsx | keep |  |
| hooks/useSheetPresence.ts | 23 | Docked sheet presence | V1 | 3: components/CreateSheet.tsx, components/ServicePickerSheet.tsx, ui/primitives/Sheet.tsx | keep |  |
| hooks/useThemeColors.ts | 66 | Themed palette hook | V1 | 5: App.tsx, components/JobFilterSheet.tsx, components/MapPinIcon.tsx, lib/theme.ts | keep | contains CUT parts: design-override dials |
| hooks/useUnreadNotificationCount.ts | 34 | Unread notification count | V1 | 2: components/NotificationBell.tsx, screens/ProfileScreen.tsx | keep |  |
| hooks/useVoiceRecorder.ts | 241 | Voice message recorder hook | CUT | 2: components/ChatComposer.tsx, screens/ChatScreen.tsx | delete | voice messages; importers ChatComposer, ChatScreen |
| hooks/useWorkerSkills.ts | 117 | Worker skills derived for matching | V1 | 3: screens/MapScreen.tsx, screens/WorkerHomeScreen.tsx, screens/WorkerResultsScreen.tsx | keep |  |
| modes/ModeGuard.tsx | 55 | Runtime mode guard canary | DEAD | 0 | delete | only modes/index.ts re-exports it; referenced by tests/mode.test.mjs |
| modes/ModeProvider.tsx | 431 | Authoritative mode state provider | V1 | 16: components/ModeSwitchRow.tsx, modes/ModeGuard.tsx, modes/perspective.tsx, screens/EarningsScreen.tsx | keep | contains CUT parts: PostHog analytics calls |
| modes/index.ts | 24 | Modes barrel | V1 | 13: App.tsx, components/MarketJobPreview.tsx, components/ServiceTileRow.tsx, hooks/useNotificationModeBridge.ts | keep |  |
| modes/modeStorage.ts | 80 | Device mode preference storage | V1 | 1: modes/ModeProvider.tsx | keep |  |
| modes/perspective.tsx | 42 | Mode perspective hook and preview | V1 | 4: components/ServiceTileRow.tsx, dev-tools/ComponentCatalog.tsx, ui/primitives/JobCard.tsx, ui/primitives/MoneyText.tsx | keep | importers via barrel: ServiceTileRow, JobCard, MoneyText |
| modes/types.ts | 100 | Customer/Worker mode types | V1 | 8: components/ModeTransitionOverlay.shared.tsx, hooks/useNotificationModeBridge.ts, lib/navigation.ts, lib/notificationRoutes.ts | keep |  |
| navigation/CustomerRoot.tsx | 271 | Customer tab tree | V1 | 1: navigation/ModeShell.tsx | keep |  |
| navigation/ModeShell.tsx | 212 | Mode shell hosting both trees | V1 | 1: App.tsx | keep | contains CUT parts: lazy design-studio panel mount |
| navigation/WorkerRoot.tsx | 103 | Worker tab tree | V1 | 1: navigation/ModeShell.tsx | keep |  |
| navigation/sharedStacks.tsx | 193 | Shared stack navigators per tab | V1 | 2: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx | keep | contains CUT parts: routes HiddenChats; TrackWorker |
| screens/AccountSafetyScreen.tsx | 243 | Profile account and safety page | V1 | 1: navigation/sharedStacks.tsx | keep |  |
| screens/AdminReportsScreen.tsx | 321 | Admin queue of content reports | MAYBE | 1: navigation/sharedStacks.tsx | judge | admin moderation queue; reachable from Profile; not on either list |
| screens/AppearanceScreen.tsx | 197 | Light/Dark/System theme picker | V1 | 1: navigation/sharedStacks.tsx | keep | theme picker also duplicated as in-row switch in ProfileScreen. contains CUT parts: design-studio toggle row |
| screens/ApproveOrDisputeScreen.tsx | 654 | Customer approves or disputes completed job | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/AuthFlow.tsx | 40 | Signed-out stack navigator | V1 | 1: App.tsx | keep |  |
| screens/BidDetailScreen.tsx | 559 | Customer view of one bid: accept, counter | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/BidSentScreen.tsx | 86 | Bid-sent confirmation | V1 | 2: navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/CellJobsScreen.tsx | 204 | Jobs in tapped map hotspot cell | MAYBE | 1: navigation/sharedStacks.tsx | judge | cell jobs |
| screens/ChatScreen.tsx | 2505 | Job chat thread | V1 | 2: navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep | contains CUT parts: PostHog analytics calls; voice messages; live location; translation; document attachments; timed block; mute; read ticks |
| screens/CheckoutScreen.tsx | 968 | Accept and pay via Stripe Checkout | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/ClientJobDetailScreen.tsx | 2141 | Customer job detail: offers, status, payment | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials; sandbox practice-money branch; Track worker button (live location) |
| screens/CompareBidsScreen.tsx | 551 | Compare sealed bids | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials |
| screens/CounterofferScreen.tsx | 61 | Counteroffer entry screen | V1 | 1: navigation/sharedStacks.tsx | keep |  |
| screens/CreateAccountScreen.tsx | 245 | Phone-first account creation | V1 | 1: screens/AuthFlow.tsx | keep |  |
| screens/DeleteAccountScreen.tsx | 387 | Account deletion flow | V1 | 1: navigation/sharedStacks.tsx | keep |  |
| screens/EarningsScreen.tsx | 423 | Worker wallet and per-job earnings | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch; sandbox cash-out wording |
| screens/EmailCreateAccountScreen.tsx | 308 | Email and password account creation | V1 | 1: screens/AuthFlow.tsx | keep |  |
| screens/EmailSignInScreen.tsx | 364 | Email sign-in | V1 | 1: screens/AuthFlow.tsx | keep | contains CUT parts: serif display (second font) |
| screens/HiddenChatsScreen.tsx | 278 | Hidden conversations list | CUT | 1: navigation/sharedStacks.tsx | delete | hidden chats |
| screens/HomeScreen.tsx | 1478 | Customer Home | V1 | 1: navigation/CustomerRoot.tsx | keep | contains CUT parts: design-studio dials; serif display hero (second font); voice-search mic via SearchBar |
| screens/JobConfirmedScreen.tsx | 223 | Job confirmed after payment held | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/JobDetailScreen.tsx | 1501 | Open job detail for worker or market | V1 | 2: navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials |
| screens/LaunchScreen.tsx | 379 | Launch splash layer | V1 | 1: App.tsx | keep | contains CUT parts: serif display (second font) |
| screens/LegalDocumentScreen.tsx | 84 | Read-only legal document | V1 | 1: navigation/sharedStacks.tsx | keep |  |
| screens/LegalGateScreen.tsx | 737 | Legal acceptance gate | V1 | 2: App.tsx, screens/OnboardingFlow.tsx | keep |  |
| screens/MapScreen.tsx | 1068 | Jobs map with filters and pane | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials; voice-search mic via SearchBar |
| screens/MessagesInboxScreen.tsx | 1394 | Messages inbox | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials; hidden/archived/cleared chats; mute person; mark unread; swipe actions; timed block; read ticks |
| screens/MyJobsHubScreen.tsx | 738 | My Jobs hub | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials |
| screens/NotificationSettingsScreen.tsx | 499 | Notification prefs and quiet hours | V1 | 3: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/NotificationsScreen.tsx | 400 | Notification feed | V1 | 3: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/OnboardingFlow.tsx | 82 | Signed-in-not-set-up stack | V1 | 1: App.tsx | keep |  |
| screens/PaymentMethodsScreen.tsx | 379 | Saved card and payment methods | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/PayoutsScreen.tsx | 454 | Worker Stripe Connect payout state | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/PostJobScreen.tsx | 2649 | Post-a-job wizard | V1 | 3: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials; PostHog analytics calls; price guidance |
| screens/ProfileDetailsScreen.tsx | 475 | Edit profile details | V1 | 1: navigation/sharedStacks.tsx | keep |  |
| screens/ProfileReviewsScreen.tsx | 599 | Profile reviews list | V1 | 3: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/ProfileScreen.tsx | 1754 | Profile hub | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch; PostHog analytics calls; design-studio row |
| screens/PublicProfileScreen.tsx | 238 | Web page behind shared profile link | CUT | 1: App.tsx | delete | web only (App.tsx webRoute) |
| screens/ResetPasswordScreen.tsx | 189 | Set new password | V1 | 1: App.tsx | keep |  |
| screens/ReviewAndTipScreen.tsx | 863 | Review and tip after job | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: sandbox practice-money branch |
| screens/SavedWorkersScreen.tsx | 347 | Customer's saved workers list | MAYBE | 1: navigation/sharedStacks.tsx | judge | saved workers |
| screens/ServicesPricingScreen.tsx | 559 | Worker services and pricing setup | MAYBE | 1: navigation/sharedStacks.tsx | judge | services pricing |
| screens/SetupScreen.tsx | 371 | Final setup step: start-in choice | V1 | 1: screens/OnboardingFlow.tsx | keep |  |
| screens/SignInScreen.tsx | 271 | Phone-first sign-in | V1 | 1: screens/AuthFlow.tsx | keep | contains CUT parts: serif display (second font) |
| screens/SubmitBidScreen.tsx | 125 | Worker submit-bid screen | V1 | 2: navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/TrackWorkerScreen.tsx | 454 | Customer live Track worker map | CUT | 1: navigation/sharedStacks.tsx | delete | live location + Track worker |
| screens/VerifyPhoneScreen.tsx | 595 | Phone code verification | V1 | 1: screens/AuthFlow.tsx | keep | contains CUT parts: web branch |
| screens/WelcomeScreen.tsx | 447 | Welcome page | V1 | 1: screens/AuthFlow.tsx | keep | contains CUT parts: serif display (second font) |
| screens/WorkChecklistScreen.tsx | 348 | Worker's per-job step checklist | MAYBE | 1: navigation/sharedStacks.tsx | judge | work checklist, not on either list |
| screens/WorkerHomeScreen.tsx | 1079 | Worker Home | V1 | 1: navigation/WorkerRoot.tsx | keep | contains CUT parts: design-override dials; voice-search mic via SearchBar |
| screens/WorkerJobScreen.tsx | 1635 | Worker job screen: start, running late, complete | V1 | 1: navigation/sharedStacks.tsx | keep | contains CUT parts: design-override dials; sandbox practice-money branch |
| screens/WorkerProfileScreen.tsx | 691 | Worker public profile | V1 | 3: navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx, navigation/sharedStacks.tsx | keep |  |
| screens/WorkerResultsScreen.tsx | 671 | Worker job results list | V1 | 2: navigation/WorkerRoot.tsx, screens/WorkerHomeScreen.tsx | keep |  |
| screens/WorkerSearchScreen.tsx | 1173 | Customer worker search and discovery | V1 | 1: navigation/CustomerRoot.tsx | keep | contains CUT parts: design-override dials; voice-search mic via SearchBar |
| ui/colorAlpha.ts | 44 | Hex to rgba helper | V1 | 3: components/Selection.shared.tsx, lib/hotspots.ts, ui/tokens.ts | keep |  |
| ui/colorMath.ts | 122 | Colour math for design studio | CUT | 1: components/DesignStudioPanel.tsx | delete | design studio; only importer DesignStudioPanel |
| ui/designStudioInput.ts | 50 | Direct numeric entry parser for studio | CUT | 1: components/DesignStudioPanel.tsx | delete | design studio; only importer DesignStudioPanel |
| ui/designStudioLayout.ts | 90 | Studio panel geometry | CUT | 1: components/DesignStudioPanel.tsx | delete | design studio; only importer DesignStudioPanel |
| ui/designStudioSchema.ts | 2548 | Design studio dial schema registry | CUT | 1: components/DesignStudioPanel.tsx | delete | design studio; only importer DesignStudioPanel |
| ui/primitives/BottomNav.tsx | 220 | Tab bar contract and tab lists | V1 | 36: components/MeltTabBar.shared.tsx, navigation/CustomerRoot.tsx, navigation/ModeShell.tsx, navigation/WorkerRoot.tsx | keep |  |
| ui/primitives/Divider.tsx | 78 | Hairline divider | V1 | 7: components/GlassDropdown.tsx, components/JobLivePage.tsx, components/JobSummaryCard.tsx, screens/ChatScreen.tsx | keep | contains CUT parts: design-override dials |
| ui/primitives/EmptyState.tsx | 118 | Shared nothing-here surface | V1 | 2: dev-tools/ComponentCatalog.tsx, ui/templates/ScreenStates.tsx | keep | used by ScreenStates via barrel |
| ui/primitives/JobCard.tsx | 425 | Mode-aware JobCard primitive | DEAD | 1: dev-tools/ComponentCatalog.tsx | delete | only dev-tools/ComponentCatalog.tsx uses it (via barrel); tests read it |
| ui/primitives/ListRow.tsx | 142 | Settings list row | DEAD | 1: dev-tools/ComponentCatalog.tsx | delete | only dev-tools/ComponentCatalog.tsx uses it (via barrel); tests read it |
| ui/primitives/LitSurface.tsx | 226 | Lit-instead-of-filled surface | V1 | 9: components/AuthButton.tsx, components/AuthScaffold.tsx, components/HotspotMap.native.tsx, components/ModeTransitionOverlay.shared.tsx | keep | contains CUT parts: design-override dials; web branch |
| ui/primitives/MediaGrid.tsx | 169 | Media thumbnail grid | DEAD | 1: dev-tools/ComponentCatalog.tsx | delete | only dev-tools/ComponentCatalog.tsx uses it (via barrel) |
| ui/primitives/MediaUploader.tsx | 501 | Photo/video upload tile with retry | V1 | 3: components/JobSummaryCard.tsx, dev-tools/ComponentCatalog.tsx, screens/PostJobScreen.tsx | keep |  |
| ui/primitives/MoneyText.tsx | 122 | Money text with payment-state labels | V1 | 9: screens/ApproveOrDisputeScreen.tsx, screens/CheckoutScreen.tsx, screens/ClientJobDetailScreen.tsx, screens/EarningsScreen.tsx | keep |  |
| ui/primitives/SearchBar.tsx | 465 | Shared search field | V1 | 5: screens/MapScreen.tsx, dev-tools/ComponentCatalog.tsx, screens/HomeScreen.tsx, screens/WorkerHomeScreen.tsx | keep | contains CUT parts: design-override dials; voice-search mic |
| ui/primitives/Sheet.tsx | 293 | Generic bottom sheet | V1 | 5: components/HireAgainRow.tsx, components/JobFilterSheet.tsx, components/TranslationSheet.tsx, screens/MapScreen.tsx | keep | contains CUT parts: design-override dials |
| ui/primitives/SheetHeader.tsx | 140 | Sheet header with Done/Close | V1 | 4: components/ActionSheet.tsx, components/CreateSheet.tsx, components/ServicePickerSheet.tsx, ui/primitives/Sheet.tsx | keep |  |
| ui/primitives/StatusPill.tsx | 205 | Enum-driven status pill | V1 | 3: screens/BidDetailScreen.tsx, ui/primitives/MoneyText.tsx, dev-tools/ComponentCatalog.tsx | keep | contains CUT parts: design-override dials |
| ui/primitives/StepHeader.tsx | 115 | Wizard progress header | V1 | 2: dev-tools/ComponentCatalog.tsx, ui/templates/FormScreen.tsx | keep | used only by FormScreen template. contains CUT parts: design-override dials |
| ui/primitives/Surface.tsx | 299 | The one glass surface | V1 | 17: components/ActionSheet.tsx, components/AmountPrompt.tsx, components/Card.tsx, components/Chip.tsx | keep | contains CUT parts: design-override dials; web branch |
| ui/primitives/Toggle.tsx | 195 | The one toggle switch | V1 | 6: components/ReportDialog.tsx, screens/CheckoutScreen.tsx, screens/NotificationSettingsScreen.tsx, screens/PostJobScreen.tsx | keep | contains CUT parts: design-override dials |
| ui/primitives/index.ts | 159 | Primitives barrel | V1 | 36: components/DesignStudioPanel.tsx, components/EditBudgetDialog.tsx, components/KeyboardRisingColumn.shared.tsx, components/OfferComposer.tsx | keep | exports DEAD JobCard, ListRow, MediaGrid; prune after cut |
| ui/templates/DetailScreen.tsx | 188 | Detail screen template | V1 | 11: components/MarketJobPreview.tsx, screens/BidDetailScreen.tsx, screens/CheckoutScreen.tsx, screens/CompareBidsScreen.tsx | keep | contains CUT parts: design-override dials |
| ui/templates/FormScreen.tsx | 291 | Form/wizard screen template | V1 | 4: screens/ApproveOrDisputeScreen.tsx, screens/DeleteAccountScreen.tsx, screens/ServicesPricingScreen.tsx, screens/WorkChecklistScreen.tsx | keep | contains CUT parts: design-override dials |
| ui/templates/ScreenStates.tsx | 180 | Loading/empty/error screen states | V1 | 33: components/JobOwnerActions.tsx, components/JobSummaryCard.tsx, screens/AdminReportsScreen.tsx, screens/ApproveOrDisputeScreen.tsx | keep |  |
| ui/templates/SuccessScreen.tsx | 297 | Confirmation screen template | V1 | 2: screens/BidSentScreen.tsx, screens/JobConfirmedScreen.tsx | keep |  |
| ui/templates/index.ts | 24 | Templates barrel | V1 | 1: App.tsx | keep | only importer App.tsx |
| ui/tokens.ts | 1791 | Authoritative design tokens | V1 | 26: components/DesignStudioPanel.tsx, hooks/useNavInset.ts, lib/ThemeContext.tsx, lib/authTheme.ts | keep | contains CUT parts: design-studio dial references; android values; displayHero serif role |

## Summary

| label | files | lines |
|---|---|---|
| V1 | 258 | 71063 |
| CUT | 20 | 8040 |
| MAYBE | 14 | 3804 |
| DEAD | 8 | 1646 |
| TOOLING | 0 | 0 |
| total | 300 | 84553 |

## 10 largest files

| rank | path | lines | label |
|---|---|---|---|
| 1 | screens/PostJobScreen.tsx | 2649 | V1 |
| 2 | ui/designStudioSchema.ts | 2548 | CUT |
| 3 | screens/ChatScreen.tsx | 2505 | V1 |
| 4 | screens/ClientJobDetailScreen.tsx | 2141 | V1 |
| 5 | components/DesignStudioPanel.tsx | 1965 | CUT |
| 6 | ui/tokens.ts | 1791 | V1 |
| 7 | screens/ProfileScreen.tsx | 1754 | V1 |
| 8 | screens/WorkerJobScreen.tsx | 1635 | V1 |
| 9 | screens/JobDetailScreen.tsx | 1501 | V1 |
| 10 | screens/HomeScreen.tsx | 1478 | V1 |

## CUT-only chains (DEAD-after-cut)

- Design studio: components/DesignStudioPanel.tsx (1966) is the only importer of ui/colorMath.ts, ui/designStudioInput.ts, ui/designStudioLayout.ts, ui/designStudioSchema.ts (2549). DesignStudioPanel itself is imported only by navigation/ModeShell.tsx (lazy). All five go together. V1 files that still read design dials (lib/designOverrides, lib/homeDesignStudio, lib/designStudioGate) are tagged "design-override dials" or "design-studio ..." in the note column; lib/ is the other helper's inventory. dev-tools/HomeDesignStudio.tsx (outside scope) is required lazily by App.tsx.
- Voice messages: components/AudioMeterBars.tsx and components/VoiceNote.tsx and hooks/useVoiceRecorder.ts are imported only by ChatBubble, ChatComposer, ChatScreen (all V1 files with CUT branches).
- Live location: components/LiveLocationCard.tsx and hooks/useLiveLocation.ts only by ChatScreen; screens/TrackWorkerScreen.tsx only by navigation/sharedStacks.tsx (route TrackWorker) and ClientJobDetailScreen's Track worker button.
- Translation: components/TranslationSheet.tsx only by ChatScreen.
- Ticks: components/MessageTicks.tsx only by ChatBubble.
- Hidden chats: screens/HiddenChatsScreen.tsx only by navigation/sharedStacks.tsx (route HiddenChats).
- Swipe actions: components/SwipeableRow.tsx (+ .shared, .motion120) only by MessagesInboxScreen.
- Web: components/HotspotMap.web.tsx, screens/PublicProfileScreen.tsx (App.tsx webRoute), components/HotspotMap.d.ts (type shim).
- Dead after import check (nothing imports): components/EditBudgetDialog.tsx, components/SuccessMark.tsx (+ SuccessMark.motion120.tsx), hooks/useSetupPermissions.ts, modes/ModeGuard.tsx (only re-exported by modes/index.ts), ui/primitives/JobCard.tsx, ListRow.tsx, MediaGrid.tsx (only dev-tools/ComponentCatalog.tsx). Several tests under tests/ read these files as text (EditBudgetDialog, SuccessMark, ModeGuard, JobCard, ListRow, MediaGrid, useSetupPermissions), so deleting them breaks those tests.
- No file outside the CUT/DEAD chains above was found whose only importers are CUT or DEAD files (script check, 0 flagged).

## NEEDS-JUDGE

- NEEDS-JUDGE: screens/EarningsScreen.tsx "Cash out" button calls paymentProvider.cashOut() (moves approved payments to Transferred, sandbox variant). Not clearly the CUT "instant payouts"; labelled V1.
- NEEDS-JUDGE: components/ChatComposer.tsx has a dictation mic into the chat text field (uses lib/voiceSearch). The CUT list names voice SEARCH only and V1 names post-a-job dictation; chat-field dictation is on neither list.
- NEEDS-JUDGE: chat reactions (components/ReactionPicker.tsx, hooks/useReactions.ts, reaction code inside ChatBubble, ChatScreen, useConversations) are on neither list; labelled MAYBE for the two standalone files.
- NEEDS-JUDGE: screens/AppearanceScreen.tsx is a Light/Dark/System picker (V1, both themes stay) but ProfileScreen already has the same three-way switch in a row. The screen is redundant unless the design-studio toggle row is the reason it exists; labelled V1, keep.
- NEEDS-JUDGE: "second font". The only non-system font role found in scope is the platform serif (Georgia) displayHero in ui/tokens.ts, used in HomeScreen (14 hits), WelcomeScreen, SignInScreen, EmailSignInScreen, LaunchScreen, JobLivePage, JobSummaryCard. No bundled font file is loaded in App.tsx (comment says Playfair was retired). Judge decides whether the serif hero counts as the CUT second font.
- NEEDS-JUDGE: job video (components/JobVideo.tsx, MediaViewer.tsx, video tiles in MediaUploader, uploadJobVideo in PostJobScreen) is on neither list; labelled V1 because it is wired through the post-a-job and job-detail screens.
- NEEDS-JUDGE: the 51 files tagged "UI motion infra" (chooser, shared and motion120 families; 40 of them are .shared or .motion120) (Reanimated 120 Hz paths) are labelled V1 "UI motion infra". If the judge wants the app lean, the .motion120 half of each pair is the removable half; the chooser keeps the native-driver fallback. tests/motion120.test.mjs and tests/smoothPass.test.mjs read them as text.
- NEEDS-JUDGE: components/SwipeableRow.* labelled CUT with proposal judge: the comment in SwipeableRow.tsx says no shipped build swipes; the one consumer uses it for archive / mute / mark-unread (all CUT). tests/inboxRows.test.mjs reads it.
- NEEDS-JUDGE: components/HotspotMap.d.ts labelled CUT with proposal judge: it only exists so TypeScript resolves the bare ./HotspotMap import across .native and .web. If .web is deleted, MapScreen should import ./HotspotMap.native and the .d.ts goes.
- NEEDS-JUDGE: MAYBE items kept for the judge: HireAgainRow, hooks/useRebookWorkers, screens/SavedWorkersScreen (saved workers / hire again); screens/ServicesPricingScreen; components/PastWork, PortfolioPicker, hooks/useOneTimeNotice (worker portfolio); screens/WorkChecklistScreen; screens/CellJobsScreen; screens/AdminReportsScreen; hooks/useLiveJobCard (lock-screen live card); components/HowBrazosWorks; components/ReactionPicker, hooks/useReactions.

## Notes on method and limits

- Platform web branches (Platform.OS === 'web') were found in: App.tsx, usePushNotifications.ts, VerifyPhoneScreen.tsx, ui/primitives/Surface.tsx, ui/primitives/LitSurface.tsx, components/StageRail.tsx, MeltTabBar.shared.tsx, ModeTransitionOverlay.shared.tsx, ChatComposer.tsx. Android branches: OtpInput.tsx, PortfolioPicker.tsx, ui/tokens.ts, app.config.ts android block. These are listed per file in the note column where the detector fired; they are small branches, not whole files.
- "Tomorrow reminders", "demo link" and calendars: no file in this scope is named for them (PickerPopover draws a small calendar glyph on date rows only).
- Import counts come from a regex over static import/require strings; dynamic paths would be missed. App.tsx requires dev-tools/HomeDesignStudio lazily and ModeShell requires DesignStudioPanel lazily; those literal strings were matched.
