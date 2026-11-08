# Graph Report - BRAZOS  (2026-11-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4142 nodes · 14592 edges · 177 communities (172 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `812bc273`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175

## God Nodes (most connected - your core abstractions)
1. `useThemeColors()` - 326 edges
2. `react-native` - 219 edges
3. `react` - 210 edges
4. `userMessage()` - 154 edges
5. `withAlpha()` - 154 edges
6. `alertAsync()` - 122 edges
7. `ColorPalette` - 115 edges
8. `themedStyles()` - 115 edges
9. `@expo/vector-icons` - 109 edges
10. `spacing` - 107 edges

## Surprising Connections (you probably didn't know these)
- `CheckoutScreen()` --indirect_call--> `goBackOrHome()`  [INFERRED]
  screens/CheckoutScreen.tsx → lib/navigationRef.ts
- `recheck()` --calls--> `isHeld()`  [EXTRACTED]
  screens/CheckoutScreen.tsx → lib/paymentRules.ts
- `EarningsScreen()` --indirect_call--> `releaseAtLabel()`  [INFERRED]
  screens/EarningsScreen.tsx → lib/jobLifecycle.ts
- `EarningsScreen()` --indirect_call--> `formatTimeAgo()`  [INFERRED]
  screens/EarningsScreen.tsx → lib/time.ts
- `openSetup()` --calls--> `alertAsync()`  [EXTRACTED]
  screens/PayoutsScreen.tsx → lib/dialog.ts

## Import Cycles
- 3-file cycle: `hooks/useThemeColors.ts -> lib/ThemeContext.tsx -> lib/theme.ts -> hooks/useThemeColors.ts`

## Communities (177 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (120): KeyboardAvoid(), CheckoutSessionResult, createStripePaymentProvider(), PaymentProvider, PaymentResult, EARNING_STATUSES, fetchMyEarnings(), EarningsFormatters (+112 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (82): CardProps, load(), centeredTitleInset(), ScreenHeader(), ScreenHeaderProps, stylesFor, useBackLandsOnHome(), deriveMyJobsTab() (+74 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (80): JobProgress(), STEPS, stylesFor, PayoutNudge(), stylesFor, RepeatNote(), stylesFor, StatusBadge() (+72 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (36): root, flatten(), root, stripComments(), root, root, EXPECTED, text (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (81): Impl, MeltTabBarFallback(), chosenIcon(), chosenLabel(), cutInnerStyle(), cutStyle(), KICKS, MeltTabBar() (+73 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (68): ActionSheetItem, Avatar(), AvatarProps, stylesFor, AvatarPressable(), AvatarPressableProps, PhotoViewer(), handleShare() (+60 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (75): useJob(), fetchAccountDeletionBlockers(), alertAsync(), confirmAsync(), ConfirmHostEntry, ConfirmOptions, hostForNow(), hosts (+67 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (63): ActionSheet(), ActionSheetProps, IoniconName, stylesFor, AmountPrompt(), AmountPromptProps, stylesFor, stylesFor (+55 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (55): HomeAtmosphere(), stylesFor, HomeAvatarButton(), stylesFor, NotificationBell(), stylesFor, useOfferCounts(), OpenJobsPotential (+47 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (62): classifySettlementFailure(), DEFERRED_CODES, describe(), isObject(), summarise(), cents(), countBlocked(), countRows() (+54 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (35): root, SCAN_DIRS, walk(), root, BUDGETS, ROOT, gate, legalIndex (+27 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (61): BrowseJobCard(), stylesFor, Card(), stylesFor, BAKED, BAKED_FILLED, CategoryGlyph(), IoniconName (+53 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (31): offersModule, read(), toDataUrl(), app, bottomNav, customerRoot, home, migration (+23 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (49): mapSupabaseAuthError(), PHONE_AUTH_MESSAGES, phoneAuthError(), RawAuthError, createDisabledPhoneAuthProvider(), createProvider(), phoneAuthConfigError, phoneAuthMode (+41 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (50): DEFAULT_REGION, HotspotMap(), PermState, stylesFor, MapPinIcon(), MapPinIconProps, Impl, PeekSheet() (+42 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (49): Button(), ButtonProps, ButtonSize, IoniconName, SIZES, stylesFor, ConfirmDialog(), ConfirmDialogProps (+41 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (40): CountryPicker(), CountryPickerProps, stylesFor, DropMenuFallback(), DropMenu(), PANEL_SPRING, DropMenuBackdrop(), DropMenuItem (+32 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (45): emeraldColors, MAP_DARK, MAP_EMERALD_DARK, NAV_BAR_DARK, SCRIM_DARK_ALPHA, slopRoomCache, theme, touchSlopCache (+37 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (42): App(), LaunchGate(), MainTabs(), QueryAuthBridge(), RootNavigator(), styles, ThemedNavigation(), BodyImpl (+34 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (35): EntranceViewFallback(), EntranceView(), EntranceViewProps, UploadRing(), KeyboardAwayFallback(), EASE_IN, EASE_OUT, fadeInOver() (+27 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (38): ModeSwitchRow(), stylesFor, useModeTransition(), fetchMyActiveMode(), setMyActiveMode(), consumePendingLanding(), defaultConfirmation(), ModeContext (+30 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (37): APP_LINK_SCHEME, AppLinkOutcome, AppLinkTarget, BidSentRouteParamList, ChatRouteParamList, ChatTargetParams, CustomerHomeStackParamList, CustomerParamList (+29 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (35): categoriesNote(), JOB_SORT_LABELS, JobFilterSheet(), JobFilterSheetProps, longDate(), PILL_ROOM, PopoverKind, Section() (+27 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (33): claim(), HeldPulse(), isFreshMoment(), MOMENT_FRESH_MS, played, ReleasedTick(), PressScale(), PressScaleFallback() (+25 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (33): supportMailtoUrl(), ChatMenu, IoniconName, nextMenu(), PersonMenuItem, personSafetyItems(), ActiveJobCandidate, bestBy() (+25 more)

### Community 25 - "Community 25"
Cohesion: 0.09
Nodes (33): ChipProps, ChipVariant, CLEAR_PAINT, IoniconName, Pill(), IoniconName, Option, SegmentedControl() (+25 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (26): envFileCandidates(), evaluateGate(), addKeySource(), EXPECTED_REF, loadEnvFiles(), parseEnvText(), selfPath, keyKind() (+18 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (33): Chip(), stylesFor, DistanceChips(), DistanceChipsProps, rowHeight(), stylesFor, EntranceView(), Impl (+25 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (39): dependencies, expo, expo-blur, expo-dev-client, expo-device, expo-file-system, expo-font, expo-haptics (+31 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (31): CounterpartyInfo, EMPTY_MODERATION, ModerationLists, useConversations(), ClientJobStats, ACTIVE_JOB_STATUSES, ActiveJob, Conversation (+23 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (28): ACTION_ACCEPT_PAY, ACTION_CONFIRM, ACTION_MESSAGE, ACTION_ROUTE, ACTION_VIEW, HIRE_CATEGORIES, REMINDER_CATEGORIES, updateNotificationPrefs() (+20 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (33): Impl, ModeTransitionContext, ModeTransitionRun(), ModeTransitionValue, ModeTransitionRun(), NativeDriverRun(), ReducedRun(), RunOwnerProps (+25 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (33): createJob(), jobBudgetCeilingError(), jobPricingModeError(), mapJobRow(), toPhotoArray(), updateJob(), createDirectOffer(), deleteJobPhoto() (+25 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (24): AuthButtonProps, HERO, styles, AuthFieldProps, styles, AuthNoticeProps, AuthScaffoldProps, GROUND (+16 more)

### Community 34 - "Community 34"
Cohesion: 0.17
Nodes (30): PhoneNumberInput, PhoneNumberInputProps, stylesFor, BY_CODE, COUNTRIES, Country, DATA, DEFAULT_COUNTRY (+22 more)

### Community 35 - "Community 35"
Cohesion: 0.06
Nodes (14): root, read(), readSchema(), root, code, root, workflow, root (+6 more)

### Community 36 - "Community 36"
Cohesion: 0.11
Nodes (29): useSessionJobFilters(), NEARBY_RADIUS_MILES, applyJobFilters(), BUDGET_CUSTOM_VALUES_CENTS, BUDGET_FILTER_MAX_CENTS, BUDGET_FILTER_PRESETS_CENTS, budgetCeiling(), compareDistance() (+21 more)

### Community 37 - "Community 37"
Cohesion: 0.14
Nodes (27): OfferAmountField(), OfferComposer(), handleSubmit(), OfferComposerContext, OfferComposerProps, stylesFor, validateOfferAmount(), FieldLabel() (+19 more)

### Community 38 - "Community 38"
Cohesion: 0.10
Nodes (26): useJobOffers(), useThreadOffers(), isOfferJobOpenable(), OFFER_JOB_TAB, OfferJobIdentity, OfferJobRouteName, OfferJobTarget, COUNTER_LIMIT_MESSAGE (+18 more)

### Community 39 - "Community 39"
Cohesion: 0.09
Nodes (22): env, EnvSchema, isProduction, parsed, AuthContext, AuthContextValue, AuthProvider(), AuthResult (+14 more)

### Community 40 - "Community 40"
Cohesion: 0.10
Nodes (25): DirectThread, fetchDirectThread(), otherParticipant(), canUnsend(), fetchMessagingUnlocked(), isMessagingLockedError(), unsendMessage(), fetchRelation() (+17 more)

### Community 41 - "Community 41"
Cohesion: 0.12
Nodes (18): secureSessionStorage, Backend, chunkKeyFor(), ChunkManifest, chunkValue(), createSecureSessionStorage(), deleteNative(), enqueueWrite() (+10 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (26): offsetOf(), PeekSheet(), SPRING, stylesFor, PeekSheetFallback(), FLING_VELOCITY, OPEN_THRESHOLD, OVERDRAG (+18 more)

### Community 43 - "Community 43"
Cohesion: 0.13
Nodes (25): ReportDialog(), handleSubmit(), reset(), ReportDialogProps, stylesFor, EMPTY, useHiddenUserIds(), AdminReport (+17 more)

### Community 44 - "Community 44"
Cohesion: 0.15
Nodes (23): Impl, RimLight(), RimLight(), RimLightNative(), RIM_COVER_INSET, RIM_INSET, RIM_LAP_MS, RIM_LIGHT (+15 more)

### Community 45 - "Community 45"
Cohesion: 0.15
Nodes (25): BID_ORDER_RULE, BID_SORT_CHIPS, BidSortChip, byRatingDesc(), CompareBid, compareBidsDefault(), CompareWorker, compareWorkerFromSummary() (+17 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (19): CategoryAccordion(), CategoryAccordionProps, KNOWN_KEYS, stylesFor, ChatComposer(), ChatComposerProps, stylesFor, DropMenu() (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (23): ChatBubble, ChatBubbleProps, stylesFor, useConversationChat(), ChatTarget, chatTargetFilter(), chatTargetKey(), fetchFirstMessageAt() (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (18): RFC-3986, bouncePage(), PAGE_HEADERS, payoutsHref(), refreshPage(), render(), returnPage(), classifyAccount() (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.14
Nodes (21): EMPTY_HUB, HubSnapshot, readHub(), useRefreshOnFocus(), useUnreadNotificationCount(), fetchOpenDisputeJobIds(), fetchJobLifecycleStates(), JobLifecycleState (+13 more)

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (18): ConversationRow(), ConversationRowProps, stylesFor, DictationMicButton(), stylesFor, HomeLiveBar(), stylesFor, toneColor() (+10 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (21): EyeOffIcon(), EyeOffIconProps, POST_BAR_BUTTON, SealFrom, SealPhase, RFC-5322, dictateBeforeLine(), joinDictation() (+13 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (21): voiceSearch, createVoiceSearchProvider(), beginSession(), ensurePermission(), getAvailability(), vendorModule(), normalizeLocaleTag(), VoiceSearchDeps (+13 more)

### Community 53 - "Community 53"
Cohesion: 0.09
Nodes (12): read(), ROOT, storageWith(), toDataUrl(), JOB_CATEGORIES, JOB_CATEGORY_CHIP_LABELS, JOB_CATEGORY_CHIP_ORDER, root (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.11
Nodes (18): typescript, ALLOWED_LITERALS, assertAA(), CATEGORY_ACCENTS_BEFORE_L002, colorAlphaModule, contrastOf(), HERO_SITES, liveMetricKeys (+10 more)

### Community 55 - "Community 55"
Cohesion: 0.16
Nodes (17): Impl, MarkPop(), SelectMark(), SelectMarkModule, MARK_FROM, MARK_SPRING, markOpacity(), MarkPopProps (+9 more)

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (20): acceptCurrentDocuments(), OnboardingStackNavigation, OnboardingStackParamList, setPendingLanding(), LandingPreference, DocumentStatusRow(), LegalGateScreen(), handleContinue() (+12 more)

### Community 57 - "Community 57"
Cohesion: 0.10
Nodes (20): GESTURE_WORKLET_METHODS, JS_DRIVER_SITES, loadRelativeModule(), manifestOf(), read(), readableBytes(), repoPath(), requireFromRepo (+12 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (19): boundary, createAccount, emailCreateAccount, emailSignIn, errorsUrl, flow, link(), mockUrl (+11 more)

### Community 59 - "Community 59"
Cohesion: 0.16
Nodes (19): FadeIn(), AwayImpl, KeyboardAway(), KeyboardShift(), ShiftImpl, ProfileReviewSummaryRow, skillCategoryLabel(), emeraldColorsFor() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (17): KeyboardAvoid(), KeyboardAvoidProps, keyboardPadding(), Impl, KeyboardRisingColumn(), KeyboardRisingColumnFallback(), KeyboardRisingColumn(), COLUMN_BOTTOM_PADDING (+9 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (21): deletePhotoWithRetry(), ReviewSection(), cleanupDraftPhotos(), handleSubmit(), pickPhotos(), removePhoto(), ReviewSectionProps, stylesFor (+13 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (20): AuthField, AuthScaffold(), BackButton(), authMessage(), AuthStackParamList, completePasswordReset(), requestPasswordReset(), isValidEmail() (+12 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (20): GlassDropdownItem, GlassDropdownRequest, IoniconName, JobSummaryCard(), add(), onMenuClosed(), remove(), renderTile() (+12 more)

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (17): PostQuestions(), PostQuestionsProps, stylesFor, JobCategory, ANSWER_JOIN, answerLine(), lastWholeLine(), POST_QUESTIONS (+9 more)

### Community 65 - "Community 65"
Cohesion: 0.19
Nodes (19): onAppState(), pulse, Skeleton(), start(), stop(), stylesFor, chipGap(), PeekRow() (+11 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (19): colors, darkColors, applyNativeColorScheme(), styles, ThemeColors, ThemeContext, ThemeProvider(), coerceThemePreference() (+11 more)

### Community 67 - "Community 67"
Cohesion: 0.16
Nodes (19): CategoryTileRow(), CategoryTileRowProps, IoniconName, stylesFor, TileArrow(), tileIcon(), tileLabel(), TileRim() (+11 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (17): DraftCard(), stylesFor, Block, MarkdownText(), parse(), stylesFor, IoniconName, SetupRow() (+9 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (16): bookedWindow(), clockLabel(), hourLabel(), inboxStage(), LIVE_BAR_PRIORITY, LIVE_RAIL_STEPS, LiveJobStatus, clockLabel() (+8 more)

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (20): main, name, private, version, babel-preset-expo, expo-blur, expo-dev-client, expo-device (+12 more)

### Community 71 - "Community 71"
Cohesion: 0.18
Nodes (9): check(), check(), check(), check(), check(), check(), check(), check() (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (10): countriesUrl, GB, NL, phoneUrl, read(), root, strip(), ACTIVE_DOCS (+2 more)

### Community 73 - "Community 73"
Cohesion: 0.16
Nodes (16): DrawnCheck(), stylesFor, SealTransition(), stylesFor, CHECK_LEGS, CHECK_STROKE, legBox(), legTransform() (+8 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (17): useNotificationModeBridge(), usePushNotifications(), dataForAction(), canRouteNotification(), CROSS_MODE_CONFIRM, handleNotificationData(), MODE_FOR_SCREEN, MODE_WAIT_MS (+9 more)

### Community 75 - "Community 75"
Cohesion: 0.23
Nodes (15): AuthButton(), AuthNotice(), stylesFor, OtpInput, OtpInputHandle, OtpInputProps, stylesFor, authSurface() (+7 more)

### Community 76 - "Community 76"
Cohesion: 0.26
Nodes (16): DISMISS_DISTANCE, DISMISS_MS, DISMISS_VELOCITY, DOUBLE_TAP_MS, DRAG_FADE_DISTANCE, DRAG_FADE_FLOOR, DRAG_X_DAMPING, LONG_PRESS_MS (+8 more)

### Community 77 - "Community 77"
Cohesion: 0.20
Nodes (17): abbreviateState(), formatNativePlace(), ResolvedPlace, ResolveResult, STATE_ABBREVIATIONS, Sentry, boroughOf(), fetchAddress() (+9 more)

### Community 78 - "Community 78"
Cohesion: 0.17
Nodes (17): bidGroupText(), FeedDayLabel, FeedEntry, FeedGroup, groupFeed(), jobIdOf(), startOfDay(), AppNotification (+9 more)

### Community 79 - "Community 79"
Cohesion: 0.16
Nodes (18): fetchProfileReviewSummaries(), CATEGORY_KEYWORDS, CATEGORY_ORDER, CATEGORY_PHRASES, findWorkers(), interpretQuery(), KEYWORD_BREADTH, matchQuality() (+10 more)

### Community 80 - "Community 80"
Cohesion: 0.19
Nodes (14): MeltTabBar(), ModeTreeLayoutSignal(), useReportLaunchReady(), SetShellGround, ShellGroundProvider, ShellGroundToken, useShellGroundState(), CustomerRoot() (+6 more)

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (14): SetupState, useSetupStatus(), deriveGateAnswer(), GateAnswer, hasAnyLegalAcceptance(), DEFAULT_LANDING, isLandingPreference(), parseSetupRecord() (+6 more)

### Community 82 - "Community 82"
Cohesion: 0.12
Nodes (13): allMigrations, baseline, home, jobDetail, jobs, migrationFiles, offers, profiles (+5 more)

### Community 83 - "Community 83"
Cohesion: 0.18
Nodes (15): handleSubmit(), IoniconName, MODE_ICONS, PRICE_PRESETS, PriceDropdown, PriceDropdownHandle, PriceViewport, stylesFor (+7 more)

### Community 84 - "Community 84"
Cohesion: 0.21
Nodes (13): ChevronImpl, DropdownBodyFallback(), DropdownChevron(), DropdownChevronFallback(), DropdownBody(), DropdownChevron(), MEASURING_LAYER, useOpenProgress() (+5 more)

### Community 85 - "Community 85"
Cohesion: 0.24
Nodes (11): fetchJobSeries(), seriesFrom(), startJobSeries(), stopJobSeries(), CADENCE_LABELS, JobSeries, SERIES_CADENCES, SeriesCadence (+3 more)

### Community 87 - "Community 87"
Cohesion: 0.15
Nodes (12): DERIVED_BEYOND_ENUM, jobStageJs, lifecycleModuleUrl, lifecycleSource, migrationEnum, parseDerivedUnion(), parseMigrationEnum(), parseRawStatusInputs() (+4 more)

### Community 88 - "Community 88"
Cohesion: 0.21
Nodes (14): GateState, gateStateForStatus(), useLegalGate(), fetchLegalStatus(), PRIVACY_VERSION, TERMS_VERSION, cachedAcceptanceFor(), CURRENT_LEGAL_VERSIONS (+6 more)

### Community 89 - "Community 89"
Cohesion: 0.23
Nodes (15): ChatMediaBucket, isSupportedVideo(), keepSignedUrl(), keptSignedUrl(), legacyFallback(), pathFromPublicUrl(), pathFromStorageValue(), resolveChatMediaUrl() (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.15
Nodes (9): CONVERTED_SURFACES, link(), providerUrl, read(), root, searchBarCode, strip(), toDataUrl() (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.18
Nodes (11): BrandLogo(), BrandLogoProps, SOURCE, stylesFor, expo-status-bar, LAUNCH_MARK, LaunchScreen(), LaunchScreenProps (+3 more)

### Community 92 - "Community 92"
Cohesion: 0.22
Nodes (13): getSnapshot(), JOB_CATEGORY_KEYS, LABEL_TO_KEY, listeners, publish(), ServicesSnapshot, snapshot, subscribe() (+5 more)

### Community 93 - "Community 93"
Cohesion: 0.17
Nodes (13): DeleteAccountResult, deleteMyAccount(), RpcError, ACCOUNT_DELETION_BLOCKED, AccountDeletionBlocker, BlockerList, BlockerRoute, BlockerRow (+5 more)

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (15): scripts, db:reset, db:test, db:types, eas-build-pre-install, fingerprint, ios, lint (+7 more)

### Community 95 - "Community 95"
Cohesion: 0.13
Nodes (10): fbEnd, fbStart, formatBudgetSource, FOUR, jobsJs, js, navCalls, navJs (+2 more)

### Community 96 - "Community 96"
Cohesion: 0.16
Nodes (9): BAKED_ART, LITERAL_FILE_ALLOWLIST, MODULE_SCOPE_SHEET_EXCLUSIONS, read(), storageModule, storageShim, toDataUrl(), webpAlphaChecked() (+1 more)

### Community 97 - "Community 97"
Cohesion: 0.22
Nodes (10): ZoomableImage(), pinchDistance(), clampTo(), dragFade(), panBound(), ZoomableImageFallback(), clampAndSpringTranslate(), reportZoom() (+2 more)

### Community 98 - "Community 98"
Cohesion: 0.20
Nodes (8): HANDLED_EVENTS, json(), readAttempts(), serviceHeaders(), StripeEvent, TOLERANCE_SECONDS, verifyStripeSignature(), BODY

### Community 99 - "Community 99"
Cohesion: 0.21
Nodes (8): ConfirmHost(), Pending, nativeConfirm(), registerConfirmHost(), ResolvedConfirm, MODAL_SETTLE_INSTANT_MS, MODAL_SETTLE_MS, modalSettleDelay()

### Community 100 - "Community 100"
Cohesion: 0.19
Nodes (9): switchAndOpen(), useJobOwnerActions(), confirmDelete(), deleteJob(), canNavigateTo(), navigateAcrossTabs(), submitSearch(), leaveAfterSuccess() (+1 more)

### Community 101 - "Community 101"
Cohesion: 0.32
Nodes (10): FILL, FILL, PopModal(), CLEAR_GROUND, POP_CLOSE_MS, POP_FROM_SCALE, POP_OPEN_MS, PopModalProps (+2 more)

### Community 102 - "Community 102"
Cohesion: 0.28
Nodes (11): usePostJobDraft(), answersFrom(), clearPostJobDraft(), draftHasContent(), draftStorageKey(), LEGACY_DRAFT_STORAGE_KEY, loadPostJobDraft(), PostJobDraft (+3 more)

### Community 103 - "Community 103"
Cohesion: 0.19
Nodes (10): compareBidsModule, completenessModule, formatBudgetSource, importLibModule(), offerMessageModule, read(), skillCategoriesModule, toDataUrl() (+2 more)

### Community 104 - "Community 104"
Cohesion: 0.15
Nodes (10): app, choice, flow, root, routes, row, setup, status (+2 more)

### Community 105 - "Community 105"
Cohesion: 0.36
Nodes (9): ChipCheck(), ChipCheckStill(), Impl, ChipCheck(), CHIP_CHECK_GAP, CHIP_CHECK_MS, ChipCheckProps, chipCheckStylesFor (+1 more)

### Community 106 - "Community 106"
Cohesion: 0.24
Nodes (8): SUPPORT_EMAIL, LEGAL_DOCUMENTS, LegalAcceptance, LegalDocument, LegalDocumentKey, REQUIRED_DOCUMENTS, PRIVACY_POLICY, TERMS_OF_SERVICE

### Community 107 - "Community 107"
Cohesion: 0.20
Nodes (10): useLaunchComplete(), PHONE_ENTRY, ART, DISC_SHADOWS, EntranceTransform, LAYOUT, Shadow, STAGGER (+2 more)

### Community 108 - "Community 108"
Cohesion: 0.26
Nodes (10): expo-image-picker, expo-video, chromeFor, clipDurationLabel(), MediaUploader(), handleAdd(), MediaUploaderKind, MediaUploaderProps (+2 more)

### Community 109 - "Community 109"
Cohesion: 0.20
Nodes (7): HOOKS, LEGAL_VALUES, loadHook(), read(), root, SETUP_VALUES, toDataUrl()

### Community 110 - "Community 110"
Cohesion: 0.17
Nodes (6): D6_SURFACES, GOLD_FILL_ALLOWLIST, GOLD_FILL_EXCEPTIONS, root, SOURCE_DIRS, sourceFiles

### Community 111 - "Community 111"
Cohesion: 0.18
Nodes (9): EVERY_STATUS, EXCLUDED, flatten(), GOOD, root, ROOT_FILES, SCAN_DIRS, stripComments() (+1 more)

### Community 112 - "Community 112"
Cohesion: 0.45
Nodes (8): Impl, TileCheck(), TileCheckBox(), TileCheckProps, tileCheckStylesFor, TileCheck(), TileCheckStill(), postTiles

### Community 113 - "Community 113"
Cohesion: 0.18
Nodes (5): calls, fetchResult, js, replacements, root

### Community 114 - "Community 114"
Cohesion: 0.18
Nodes (6): CUSTOMER_TAB_STACKS, DISPATCH_SHAPES, GETPARENT_ALLOWLIST, GOBACK_ALLOWLIST, INDIRECT_DISPATCHES, NAVIGATOR_FILES

### Community 115 - "Community 115"
Cohesion: 0.20
Nodes (7): APP_DIRS, appFiles(), captureGap(), root, sentryCode, sentrySource, sentrySpecifier()

### Community 116 - "Community 116"
Cohesion: 0.25
Nodes (8): clipDurationLabel, flatten(), mediaSummary, publishBranch(), read(), root, stripComments(), TOUCHED

### Community 117 - "Community 117"
Cohesion: 0.18
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 118 - "Community 118"
Cohesion: 0.20
Nodes (9): ALL_SERVICES, BY_KEY, HOME_QUICK_SERVICES, IoniconName, MORE_SERVICES, ServiceTile, SKILL_CATEGORIES, SkillCategory (+1 more)

### Community 119 - "Community 119"
Cohesion: 0.27
Nodes (7): constantOf(), flatten(), root, sansLadder(), SOURCE_DIRS, sourceFiles, stripComments()

### Community 120 - "Community 120"
Cohesion: 0.20
Nodes (3): held, root, source

### Community 121 - "Community 121"
Cohesion: 0.38
Nodes (8): allFiles(), allFlows(), ALLOWED_ENV, isFlow(), previewBundleIdentifier(), read(), root, topFlows()

### Community 122 - "Community 122"
Cohesion: 0.20
Nodes (6): block, bubble, fillet, kicks, root, tokens

### Community 123 - "Community 123"
Cohesion: 0.28
Nodes (4): AppErrorBoundary, AppErrorBoundaryState, CrashFallback(), stylesFor

### Community 124 - "Community 124"
Cohesion: 0.28
Nodes (8): AuthBackdrop(), AuthBackdropVariant, contour(), Ring, Strokes, styles, sweep(), WELCOME_CORNER

### Community 125 - "Community 125"
Cohesion: 0.33
Nodes (7): Caller, json(), jwtClaims(), resolveCaller(), serviceHeaders(), serviceRpc(), stripeV2()

### Community 126 - "Community 126"
Cohesion: 0.47
Nodes (8): callerId(), Card, ensureCustomer(), json(), listCards(), serviceRpc(), storedCustomer(), stripe()

### Community 127 - "Community 127"
Cohesion: 0.22
Nodes (5): end, jobsJs, postable, root, start

### Community 128 - "Community 128"
Cohesion: 0.28
Nodes (4): openJobModule, read(), root, toDataUrl()

### Community 129 - "Community 129"
Cohesion: 0.25
Nodes (7): EXCEPTIONS, flatten(), root, ROOT_FILES, SCAN_DIRS, stripComments(), walk()

### Community 130 - "Community 130"
Cohesion: 0.29
Nodes (7): useDictation(), toggle(), askOpenSettings(), PERMISSION_COPY, PermissionKind, handleUseCurrentLocation(), takePhoto()

### Community 131 - "Community 131"
Cohesion: 0.36
Nodes (6): MediaViewer(), stylesFor, VideoPage(), ViewerItem, Impl, ZoomableImage()

### Community 132 - "Community 132"
Cohesion: 0.36
Nodes (4): deviceTimeZone(), QUIET_HOURS_HINT, QUIET_HOURS_LABEL, root

### Community 133 - "Community 133"
Cohesion: 0.36
Nodes (7): fileNameFor(), sanitiseFileName(), sharePhoto(), ShareResult, stageForSharing(), expo-file-system, expo-sharing

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (6): flatten(), root, ROOT_FILES, SCAN_DIRS, stripComments(), walk()

### Community 135 - "Community 135"
Cohesion: 0.36
Nodes (6): appFiles(), code(), read(), renderedStrings(), root, stripComments()

### Community 136 - "Community 136"
Cohesion: 0.36
Nodes (4): counterOfferSql(), offersModule, read(), toDataUrl()

### Community 137 - "Community 137"
Cohesion: 0.29
Nodes (6): flatten(), root, ROOT_FILES, SCAN_DIRS, stripComments(), walk()

### Community 138 - "Community 138"
Cohesion: 0.43
Nodes (6): baseline(), baselineFunction(), insertPolicyBody(), messagesModule, read(), toDataUrl()

### Community 139 - "Community 139"
Cohesion: 0.25
Nodes (5): base, fast, root, shared, shell

### Community 140 - "Community 140"
Cohesion: 0.32
Nodes (8): bindingNames(), checkWorkletCalls(), directiveVerdict(), functionCandidatesIn(), hasWorkletDirective(), isFunctionNode(), scriptKindFor(), unwrapExpression()

### Community 141 - "Community 141"
Cohesion: 0.46
Nodes (5): copyModule, navModule, offersModule, read(), toDataUrl()

### Community 142 - "Community 142"
Cohesion: 0.29
Nodes (6): flatten(), root, SOURCE_DIRS, SOURCE_FILES, sourceFiles, stripComments()

### Community 143 - "Community 143"
Cohesion: 0.29
Nodes (6): DEFAULT_PREFS, NOTIFICATION_TOGGLES, NotificationPrefs, NotificationPrefsPatch, NotificationToggleKey, RADIUS_OPTIONS

### Community 144 - "Community 144"
Cohesion: 0.29
Nodes (6): Completeness, CompletenessInput, CompletenessStep, CompletenessStepKey, profileCompleteness(), SERVICES_TARGET

### Community 145 - "Community 145"
Cohesion: 0.38
Nodes (6): asBoolean(), asString(), ConfigRow, FALLBACK, merge(), RemoteConfig

### Community 146 - "Community 146"
Cohesion: 0.43
Nodes (6): json(), PaymentRow, serviceHeaders(), serviceRpc(), stripe(), stripeGet()

### Community 147 - "Community 147"
Cohesion: 0.29
Nodes (3): FAKE, NOW, root

### Community 148 - "Community 148"
Cohesion: 0.48
Nodes (5): legalCacheModule, legalGateModule, read(), root, toDataUrl()

### Community 149 - "Community 149"
Cohesion: 0.43
Nodes (5): code(), flat(), read(), root, stripComments()

### Community 150 - "Community 150"
Cohesion: 0.38
Nodes (3): read(), toDataUrl(), validationModule

### Community 151 - "Community 151"
Cohesion: 0.33
Nodes (5): appFiles(), root, ROOT_FILES, SCAN_DIRS, walk()

### Community 152 - "Community 152"
Cohesion: 0.38
Nodes (5): liveShouldNotify(), OUTBOX, read(), root, scanEmitted()

### Community 153 - "Community 153"
Cohesion: 0.38
Nodes (6): ALL_STATES, formattersModule, read(), root, THIS_YEAR, toDataUrl()

### Community 154 - "Community 154"
Cohesion: 0.29
Nodes (3): LOCKED_SCREENS, root, SCAN_DIRS

### Community 155 - "Community 155"
Cohesion: 0.33
Nodes (5): BUNDLE_SUFFIX, DISPLAY_NAME, ICON, Variant, VARIANTS

### Community 156 - "Community 156"
Cohesion: 0.53
Nodes (5): HowBrazosWorks(), close(), howItWorksDismissedKey(), stylesFor, @react-native-async-storage/async-storage

### Community 158 - "Community 158"
Cohesion: 0.33
Nodes (5): expo/tsconfig.base, compilerOptions, strict, exclude, extends

### Community 159 - "Community 159"
Cohesion: 0.47
Nodes (4): code(), read(), root, stripComments()

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (3): APP_TREES, appSources(), root

### Community 161 - "Community 161"
Cohesion: 0.33
Nodes (3): root, SETTLED, STATUSES

### Community 162 - "Community 162"
Cohesion: 0.40
Nodes (4): filesUnder(), flatten(), root, stripComments()

### Community 163 - "Community 163"
Cohesion: 0.47
Nodes (4): blankDraft, draftModule, read(), toDataUrl()

### Community 164 - "Community 164"
Cohesion: 0.47
Nodes (4): { deriveWorkerHeroTrust }, read(), root, toDataUrl()

### Community 165 - "Community 165"
Cohesion: 0.33
Nodes (4): JOB_CATEGORIES, KEYS, LABELS, root

### Community 166 - "Community 166"
Cohesion: 0.40
Nodes (5): devDependencies, babel-preset-expo, supabase, @types/react, typescript

### Community 167 - "Community 167"
Cohesion: 0.70
Nodes (4): normalise_table(), preprocess(), resolve_pending_files(), staging-scan.sh script

### Community 168 - "Community 168"
Cohesion: 0.60
Nodes (4): code(), read(), root, strip()

### Community 169 - "Community 169"
Cohesion: 0.50
Nodes (3): flatten(), root, stripComments()

### Community 170 - "Community 170"
Cohesion: 0.50
Nodes (3): flatten(), root, stripComments()

### Community 171 - "Community 171"
Cohesion: 0.50
Nodes (3): flatten(), root, stripComments()

### Community 173 - "Community 173"
Cohesion: 0.67
Nodes (4): compareVersions(), partialCeiling(), satisfiesRange(), versionParts()

### Community 175 - "Community 175"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.23.1, @sentry/cli@2.55.0

## Knowledge Gaps
- **17 isolated node(s):** `expo/tsconfig.base`, `RFC-3986`, `RFC-5322`, `babel-preset-expo`, `expo-blur` (+12 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 1401 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 19` to `Community 0`, `Community 1`, `Community 2`, `Community 131`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 11`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 27`, `Community 156`, `Community 29`, `Community 31`, `Community 33`, `Community 34`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 49`, `Community 50`, `Community 51`, `Community 55`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 67`, `Community 68`, `Community 70`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 80`, `Community 81`, `Community 83`, `Community 84`, `Community 85`, `Community 88`, `Community 91`, `Community 92`, `Community 99`, `Community 101`, `Community 102`, `Community 105`, `Community 107`, `Community 108`, `Community 112`, `Community 118`, `Community 123`, `Community 124`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **What connects `expo/tsconfig.base`, `RFC-3986`, `RFC-5322` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03422735944338458 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `Community 60` to `Community 0`, `Community 1`, `Community 2`, `Community 131`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 130`, `Community 133`, `Community 11`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 27`, `Community 156`, `Community 30`, `Community 31`, `Community 33`, `Community 34`, `Community 37`, `Community 39`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 50`, `Community 51`, `Community 52`, `Community 55`, `Community 59`, `Community 61`, `Community 62`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 67`, `Community 68`, `Community 70`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 80`, `Community 83`, `Community 84`, `Community 91`, `Community 101`, `Community 105`, `Community 107`, `Community 108`, `Community 112`, `Community 123`, `Community 124`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06781326781326781 - nodes in this community are weakly interconnected._
- **Why does `useThemeColors()` connect `Community 68` to `Community 0`, `Community 1`, `Community 2`, `Community 131`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 11`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 27`, `Community 156`, `Community 30`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 37`, `Community 40`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 50`, `Community 51`, `Community 55`, `Community 56`, `Community 59`, `Community 61`, `Community 62`, `Community 63`, `Community 64`, `Community 65`, `Community 67`, `Community 73`, `Community 75`, `Community 78`, `Community 80`, `Community 83`, `Community 107`, `Community 108`, `Community 123`, `Community 124`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.060542309490416085 - nodes in this community are weakly interconnected._