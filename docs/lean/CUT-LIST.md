# CUT-LIST (Phase C1, Fable). Every file keep / delete / archive, in deletion slices.

Source: the five inventories in this folder. Rule applied: v1 is the "In v1" list of
`docs/SCOPE.md` plus the owner's override (keep BOTH light and dark themes). Anything not on
that list goes unless removing it breaks the loop or costs more than it saves.
Undo for everything: tag `pre-lean-2026-11`.

## 1. Rulings on every NEEDS-JUDGE

App (inventory-app.md)
1. EarningsScreen "Cash out": DELETE. Sandbox-only; the Stripe provider refuses it. Payouts run
   server-side (process-settlements).
2. ChatComposer dictation mic: DELETE. iOS keyboard has its own dictation key. Post-a-job mics stay.
3. Chat reactions (ReactionPicker, useReactions, lib/reactions, code in ChatBubble/ChatScreen/
   useConversations, DB table): DELETE. v1 messaging = text + photo.
4. AppearanceScreen: DELETE. ProfileScreen rows 1129-1160 already hold the same Light/Dark/System
   switch (`setPreference`). Remove the "dial panel" row (ProfileScreen ~1162-1175) and the
   `Appearance` route. Both themes stay.
5. Second font: the serif hero is the platform face Georgia (no file, no load). KEEP as is.
   `assets/fonts/PlayfairDisplay-Bold.ttf` + `OFL.txt` are loaded by nothing: ARCHIVE; fix
   `tests/themeTokens.test.mjs:409` first (it asserts that file is the only font).
6. Job video (JobVideo, MediaViewer, video tiles, expo-video): KEEP. On the posting path, works,
   removal would churn five v1 files.
7. The 51 motion files (chooser / shared / motion120): KEEP all. 120 Hz smoothness is a standing
   owner requirement; Reanimated stays.
8. SwipeableRow (3 files): DELETE with the inbox swipe actions.
9. HotspotMap.d.ts + .web.tsx: DELETE both; rename `HotspotMap.native.tsx` → `HotspotMap.tsx`.
10. MAYBE items: HireAgainRow, useRebookWorkers, SavedWorkersScreen, lib/rebook, lib/savedWorkers
    = DELETE (saved workers, not on the list). PastWork, PortfolioPicker, useOneTimeNotice,
    lib/portfolio = DELETE (portfolio, not on the list). WorkChecklistScreen, lib/checklist =
    DELETE. ServicesPricingScreen, lib/services = KEEP (worker skills feed matching and the
    profile). CellJobsScreen = KEEP (map tap → jobs in that cell; map is v1 discovery).
    AdminReportsScreen + admin calls in lib/moderation = KEEP (report/block is v1; the queue is
    how the owner acts on reports; Apple UGC rules). useLiveJobCard + lib/liveCard = DELETE
    (see ruling 51: the native module was never installed). HowBrazosWorks = KEEP (132
    lines, first-run help for the friends who test). lib/clientStats, lib/workerHeroCard,
    lib/reuseJobs, lib/launchContext, lib/meltBarGeometry, lib/shellGround, lib/hotspots = KEEP.
    lib/clipboard + expo-clipboard = DELETE (copy-message only).

Lib (inventory-lib.md)
11. lib/adapters/paymentsMode.ts: DELETE. In `lib/adapters/payments.ts` the mode becomes
    `'stripe' | 'disabled'`: stripe when `EXPO_PUBLIC_PAYMENTS_MODE === 'stripe'` and the
    publishable key is set, else disabled (fail closed). Type `PaymentsMode` loses `'sandbox'`.
12. lib/conversationVisibility.ts: TRIM, not delete. Keep `countUnseen`, `UnseenStamp`,
    `UnseenThread`, `visibleMessages` and what they need. Delete cleared/hidden/deleted/block
    rules, `BLOCK_DURATIONS`, `FULLY_UNREAD_AT`, fold/index state.
13. appLinks.profileUrl + sharing.shareProfileLink: DELETE (the web page behind the link goes).
    Keep the support mailto.
14. lib/phoneAuth/mock.ts: KEEP. Dev-only; lets a simulator walk the phone screens with no SMS.
15. ChatComposer dictation: see 2.
16. Appearance / designStudioGate: see 4; designStudioGate DELETE.
17. lib/designOverrides.ts: DELETE. In each of the 35 v1 readers replace
    `useOverrideNumber('k', d)` / `useDialNumber` / `useOverrideString` / `useOverrideValue` with
    the default `d` as a literal; `useMaterials`, `applyPaletteOverrides`, `useMetricsGeneration`
    become the plain token values. Shipped builds never had the studio, so defaults ARE the
    shipped look: nothing visible changes.
18. lib/observability/analytics.ts: DELETE; remove every `track` / `trackIntent` / `identify`
    call (15 files); remove `EXPO_PUBLIC_POSTHOG_KEY` from config/env.ts; edit
    lib/legal/privacyPolicy.ts lines 17, 161, 201 (PostHog), 116 (voice/documents), 18, 121
    (speech stays: dictation), 241 (live location).
19. Admin tools: KEEP (see 10).
20. Sandbox wording in moneyCopy, offerCopy, earningsCopy, jobLifecycle, payments: strip the
    sandbox branches; keep everything else.

Deps and tests (inventory-deps-tests.md)
21. Tests of a deleted feature are deleted, named in the commit. Tests that fence a kept thing
    and also read a deleted file are edited to drop only that part. No test is weakened to pass.
22. Unreferenced packages: remove all 15 EXCEPT `react-native-screens` (react-navigation needs
    it), `react-native-worklets` (Reanimated 4 needs it), `babel-preset-expo`, `@types/react`
    and `expo-dev-client` (the `development` EAS profile uses it). `expo-asset` and
    `expo-linking`: remove, then `npx expo-doctor` and an `expo export --platform ios` must pass;
    if either complains, put that one back and say so.

Docs and tools (inventory-docs-tools.md)
23. HANDOFF.md: KEEP as the state file (one screen). The surviving docs are seven, not five:
    README.md, CLAUDE.md, HANDOFF.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/TESTING.md,
    docs/BACKLOG.md (one page). Everything else under docs/ and every other root .md/.sql is
    folded or archived.
24. AGENTS.md: fold 3 lines into CLAUDE.md; drop it from `tests/governance.test.mjs` ACTIVE_DOCS.
25. SCOPE "Built already": not carried. README gets the v1 list and the "Not in v1" line.
26. docs/DECISIONS.md: keep the rows that are rules of the code (money, offers, lifecycle,
    security, scope, platform); drop the 66 UI-taste rows; drop the "Full text" column; add v3
    D-1..D-11, D-14, D-15 as rows. Must stay under 40,000 B (docsBudget).
27. docs/archive/DECISIONS-2026-10.md: ARCHIVE with the rest (it stays on disk in _archive).
28. v3 D-12 (Android ships) and D-13 (runs push to mainexpo): not copied.
29. scripts/verify-schema.mjs: ARCHIVE. pgTAP owns schema truth. Delete tests envParity,
    phase76Shape, phase77Shape, verifySchemaGuards (they test the probe); edit counterResponse
    262, lifecycle 399, messagingLock 307, mode 634 to drop the probe lines.
30. scripts/demo-link/, scripts/prepare-sites-build.mjs: ARCHIVE; remove package.json scripts
    `web`, `build:web`, `demo:refresh`, `export`, `android`; delete tests demoLink, pwa.
31. scripts/shots.mjs + home-shots, home-diff, master-diff, atmosphere-tune, home-ground-blend:
    ARCHIVE; delete tests/shotHarness.test.mjs.
32. .eas/workflows/ (both files): ARCHIVE. Phase F runs Maestro on a GitHub macOS runner
    (`.github/workflows/e2e-ios.yml`). `.maestro/*.yml` KEEP as Phase F's base; screens-walk
    is rewritten there. Edit tests/maestroFlows.test.mjs (it scans `.eas/`).
33. assets/icon.png (Android) and favicon.png (web): ARCHIVE with those blocks.
34. Pixel fences: tests/emeraldFences.test.mjs loses the tests that read PNGs (lines ~1459-1592,
    1929); its code fences stay. tests/themeResolution.test.mjs roster: remove the archived
    masters. tests/themeTokens.test.mjs:409: delete the font-file assertion.
35. Dispute runbook: the 3 rule lines go to docs/ARCHITECTURE.md with the operator SQL in one
    code block under "Disputes (operator)". Edit tests/fixRunA.test.mjs 58-65.
36. phone-auth-activation.md: fold 2 lines; add "Twilio Verify values live in the Supabase
    dashboard (Authentication → Providers → Phone), never in .env".
37. dist/ and design-reference/ (disk only): MOVE both to `_archive/2026-11-lean/` (never delete
    design-reference: only copy).
38. docs/LEAN-SHIP-PLAN.md, docs/lean/, docs/proposed/: archive in Phase H, not before.
39. docs/architecture.md → docs/ARCHITECTURE.md: `git mv docs/architecture.md docs/tmp.md` then
    `git mv docs/tmp.md docs/ARCHITECTURE.md`; update governance.test.mjs.
40. Comment-only `docs/` paths in 93 code/SQL files: leave them (no runtime, no test effect).
41. start.ps1: not tracked, not found; nothing to do.
42. Android: REMOVE the `android` block in app.config.ts, the `android` keys in eas.json,
    `npm run android`, assets/icon.png, OtpInput/PortfolioPicker/tokens android branches,
    pushNotifications ANDROID_CHANNEL_ID. This reverses the project CLAUDE.md line "Android
    config stays and keeps building" (owner: delete everything outside v1; undo = the tag).
    Decided for you: D9.

Database and server (inventory-db.md)
43. Wide table grants (TRUNCATE/TRIGGER/MAINTAIN/ALL to authenticated, MAINTAIN/ALL to anon, 25
    rows in the baseline + default privileges): a SECURITY fix, Phase E4, its own migration
    `_lean_v1_grants.sql` plus a pgTAP file asserting `has_table_privilege` is false for every
    one. Not in D6. E1 first confirms on the local stack (inferred so far).
44. `handle_new_user()` has no trigger on auth.users in any migration: D6 adds it (idempotent
    `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`), with a pgTAP test that an auth.users insert
    creates the profile row. Staging already has it by hand; the migration makes it real.
45. `brazos-drain-push` cron only in archive phase74: D6 adds `install_push_schedule()` in the
    same idempotent style as the other eight installers and calls it. Without it a fresh stack
    sends no push.
46. Legacy `bids` plumbing (table, mirror trigger, notify_on_bid, accepted_bid_id FK): KEEP for
    v1; it carries the new-bid push. Backlog item: re-home notify_on_bid onto job_offers, then
    drop bids. DROP now only the uncalled RPCs: accept_bid, create_bid, create_job_request,
    job_bid_count, job_bid_counts, my_pending_job_requests, respond_job_request, and the view
    v_bids_projection_drift (probe only). pgTAP 040 / phase29 assert their grants: change those
    to "does not exist".
47. Sandbox money in SQL: drop the 5 sandbox_* RPCs + 2 markers; re-CREATE the 7 v1 functions
    without their sandbox branches (ban_user, job_payment_state, notify_on_payment_release,
    release_job_payment, cancel_job, refund_on_no_show_withdrawn, resolve_job_dispute);
    `payments.provider` DEFAULT → 'stripe'; the CHECK keeps allowing 'sandbox' (staging rows
    exist; comment `shortcut: legacy sandbox rows on staging, tighten after a staging reset`).
    pgTAP fixtures in 010, 020, 030, 040, 080, 090, 120 that paid a job through sandbox_* get one
    helper in `_helpers.sql` (`test_fund_job(job_id)`, run as postgres) that walks the Stripe
    path's state changes (prefer `apply_payment_event` with a synthetic checkout event; else a
    direct UPDATE of the payments row). The tests' assertions do not change.
48. Re-CREATE without CUT objects: delete_my_account, should_notify, notify_on_message,
    unsend_message (keep unsend; drop its audio handling).
49. MAYBE groups: reactions DROP (table, 4 policies). message_reads + mark_direct_thread_read
    KEEP (inbox unread badge); DROP set_direct_thread_read_at (mark-unread rewind) and the
    policy `message_reads_select_party` (the other party no longer reads your read state: no
    ticks). portfolio_items + enforce_portfolio_cap + its 3 triggers DROP. worker_services KEEP.
    saved_workers DROP. job_checklist_items DROP (edit pgTAP 020). job_hotspots, jobs_in_cell,
    worker_job_stats, legal_acceptances KEEP.
50. Semantic worker search: DROP the `worker-search` edge function, the 6 worker_semantic_*
    functions, table worker_semantic_docs, its 3 triggers and the `vector` extension. The app's
    `lib/workerSearch.ts` already has a deterministic fallback (`mode: 'fallback'`); it becomes
    the only path (delete rankWorkersOnServer, the 'semantic' mode and its heading). This honours
    "nothing may depend on AI" and `tests/copyHonesty`. Edit tests/workerMatching.test.mjs.
51. Lock-screen live card: DROP the whole set (hooks/useLiveJobCard.ts, lib/liveCard.ts, 8 SQL
    functions, tables live_activity_tokens + live_card_outbox, trigger jobs_live_card, cron
    brazos-live-cards, edge function send-live-cards, pgTAP 210, tests/liveCard.test.mjs). It is
    on the v1 list, but its native module `expo-live-activity` is NOT in package.json, so no
    build has ever shown a card, and shipping it needs APNs keys plus a new native dependency.
    It becomes BACKLOG item 1. Decided for you: D10 (reverses one v1-list line; undo = the tag).
52. Dead tables areas, properties, job_requests: DROP with jobs.area_code, jobs.property_id,
    messages.job_request_id (edit lib/messages.ts:122), functions area_for_point,
    set_job_property, close_requests_on_block (+ trigger), notify_on_job_request (+ trigger),
    my_payouts_enabled (edit pgTAP 010, 030, 040, 060), and the 7 inert policies.
53. The 41 TOOLING marker/probe functions (phase*_enabled, phase76_rls_posture,
    job_categories_expanded...): DROP in D6; D7 archives scripts/verify-schema.mjs; edit the
    pgTAP files that probe them (040, phase29, 030, 060).
54. Edge-function auth: the four `!==` service-key compares become one constant-time helper
    (Phase E4). connect-return stays auth-less by design (constant HTML).
55. supabase/archive/phases: archived in D7 after the 28 jest readers are cut or repointed.

## 2. Slices (one Opus xhigh helper and one commit each; `npm run verify` green before commit;
`npm run db:reset && npm run db:test` green for any slice touching supabase/)

### D1  Design studio and dead UI
Delete: components/DesignStudioPanel.tsx; ui/colorMath.ts, designStudioInput.ts,
designStudioLayout.ts, designStudioSchema.ts; lib/designOverrides.ts, designStudioGate.ts,
designStudioHistory.ts, designStudioPresets.ts, homeDesignStudio.tsx; dev-tools/HomeDesignStudio.tsx,
dev-tools/ComponentCatalog.tsx; screens/AppearanceScreen.tsx; ui/primitives/JobCard.tsx,
ListRow.tsx, MediaGrid.tsx (dead); components/EditBudgetDialog.tsx, SuccessMark.tsx,
SuccessMark.motion120.tsx; hooks/useSetupPermissions.ts; modes/ModeGuard.tsx.
Edit: the 35 design-override readers (ruling 17); navigation/ModeShell.tsx (lazy studio mount);
App.tsx (HomeDesignStudio require, SHOW_HOME_DESIGN_STUDIO); screens/HomeScreen.tsx (studio
dials, homeDesignStudio provider); screens/ProfileScreen.tsx (dial-panel row, Appearance nav);
lib/navigation.ts (`Appearance` route); navigation/sharedStacks.tsx (Appearance, ComponentCatalog);
ui/primitives/index.ts (drop JobCard, ListRow, MediaGrid); modes/index.ts (ModeGuard);
hooks/useThemeColors.ts; lib/theme.ts 1045, 1081 (metricGeneration); ui/tokens.ts studio refs;
hooks/useBidCounts.ts → inline useOfferCounts in WorkerHomeScreen and delete the facade.
Tests delete: designStudio, homeDesignStudio, screenDials, fixRunF (if all its groups are studio
fences; else keep the non-studio groups). Tests edit: themeResolution (Appearance), mode
(ModeGuard, ComponentCatalog), mediaUploader (ComponentCatalog), postJobPublish (SuccessMark),
motion120 + smoothPass (deleted files), setupOnboarding (useSetupPermissions), crossTabNavigation.
Check: `npm run verify`; app still boots (Phase F build proves it).

### D2  Web, PWA and Android
Delete: components/HotspotMap.web.tsx, HotspotMap.d.ts (rename .native → HotspotMap.tsx);
screens/PublicProfileScreen.tsx; lib/webRoute.ts; lib/supabase.web.ts; public/; hosting/;
.openai/; WEB_DEPLOYMENT.md; assets/favicon.png; assets/icon.png.
Archive: scripts/demo-link/, scripts/prepare-sites-build.mjs.
Edit: App.tsx (webRoute, web profile route); app.config.ts (`web` block, `android` block);
eas.json (android keys); package.json scripts (`web`, `android`, `build:web`, `demo:refresh`,
`export`); remove `Platform.OS === 'web'` branches in App.tsx, usePushNotifications.ts,
VerifyPhoneScreen.tsx, Surface.tsx, LitSurface.tsx, StageRail.tsx, MeltTabBar.shared.tsx,
ModeTransitionOverlay.shared.tsx, ChatComposer.tsx, lib/blur.tsx, dialog.ts, haptics.ts,
motion.ts, sharing.ts, theme.ts, authTheme.ts, payments/stripe.ts:95, pushNotifications.ts;
android branches in OtpInput.tsx, PortfolioPicker.tsx (deleted in D5 anyway), ui/tokens.ts,
lib/pushNotifications.ts 129-131; .gitignore (dist, .shots, design-reference entries).
Deps remove: react-dom, react-native-web, ol, @expo/ngrok, playwright.
Tests delete: pwa, demoLink. Tests edit: appConfig, litSurface, haptics, motionDriver,
secureSessionStorageFence (supabase.web), workerDiscovery (HotspotMap.web), crossModeNotification
(public).
Check: `npm run verify`; `npx expo-doctor`.

### D3a  Chat media extras: voice messages, documents, translation, ticks, reactions, clipboard
Delete: components/AudioMeterBars.tsx, VoiceNote.tsx, MessageTicks.tsx, TranslationSheet.tsx,
ReactionPicker.tsx; hooks/useVoiceRecorder.ts, useReactions.ts; lib/audioMeter.ts, messageTicks.ts,
translate.ts, translateRules.ts, reactions.ts, clipboard.ts; supabase/functions/translate/.
Edit: ChatBubble.tsx (voice bubble, ticks, document, reactions); ChatComposer.tsx (recorder,
document attach, dictation mic, web branch); ChatScreen.tsx (voice, translation, documents,
ticks, reactions, copy, dictation); lib/messages.ts (audio_*, document_* fields, helpers,
chat-audio/chat-documents resolve); lib/storage.ts (uploadChatAudio 247, uploadChatDocument 295,
the two buckets); lib/sharing.ts (shareDocument); lib/conversations.ts
(fetchCounterpartyReadStates); hooks/useConversations.ts (reactions, read ticks); app.config.ts
(expo-audio plugin; mic strings → dictation only); App.tsx (audio mode); lib/legal/privacyPolicy.ts.
Deps remove: expo-audio, expo-document-picker, expo-clipboard.
Tests delete: chatDocuments. Tests edit: chatComposer (voice/dictation/document zones),
permissionPrompts (useVoiceRecorder), projections (reactions), screenStates (TranslationSheet),
motion120, copyTruth as needed.

### D3b  Live location and Track worker
Delete: components/LiveLocationCard.tsx; hooks/useLiveLocation.ts; lib/liveLocation.ts;
screens/TrackWorkerScreen.tsx.
Edit: ChatScreen.tsx (LIVE_LOCATION share, 675); ChatComposer.tsx (306); ClientJobDetailScreen.tsx
(Track worker button); navigation/sharedStacks.tsx + lib/navigation.ts (`TrackWorker` route 329);
app.config.ts (location string: drop "share your live position"); lib/reverseGeocode.ts stays.
Tests delete: liveLocation. Tests edit: crossModeNotification, errorHonesty (TrackWorkerScreen),
permissionPrompts.

### D3c  Inbox states and feature flags
Delete: screens/HiddenChatsScreen.tsx; components/SwipeableRow.tsx, .shared.tsx, .motion120.tsx;
lib/conversationStates.ts; lib/featureFlags.ts; lib/priceGuidance.ts.
Edit: lib/conversationVisibility.ts (ruling 12); screens/MessagesInboxScreen.tsx (hidden/archived/
cleared/deleted, mark unread, mute, timed block, swipe, flags 780-991); ChatScreen.tsx (timed
block 982, flags 402/441/1443/1804); hooks/useConversations.ts (hidden/archived/cleared state,
mute); lib/inboxFilters.ts (archived pill, muteActionFor, mute flag); lib/chatMenus.ts (mute row);
lib/moderation.ts (muteUser, unmuteUser; keep block/report/admin); lib/conversations.ts
(clearedBy, conversationHiddenByDelete re-exports); lib/navigation.ts (`HiddenChats` 371);
navigation/sharedStacks.tsx; screens/PostJobScreen.tsx (priceGuidanceLines 1472);
components/UndoToast.tsx stays if PostJobScreen still uses it, else delete; components/
ConversationRow.tsx (muted glyph, archived/hidden flags).
Deps remove: expo-local-authentication.
Tests delete: conversationStates, inboxUndo. Tests edit: inboxRows (keep unseen count + stamps),
chatComposer, conversion (priceGuidance), copyTruth, appConfig (flag text), unifiedConversation.

### D4  Sandbox money, PostHog, i18n  (CRITICAL: payments. Fable blueprint = this slice;
Opus xhigh builds; Fable reviews the diff before the commit is pushed anywhere.)
Delete: lib/adapters/paymentsMode.ts; lib/observability/analytics.ts; any i18n config file
(grep `i18next` across the repo).
Edit: lib/adapters/payments.ts (ruling 11; drop createSandboxPaymentProvider, the five
sandbox_* RPC calls, authorizeJobPayment/protectJobPayment/tipWorker/cashOut from the interface,
the SANDBOX_* and STRIPE_NO_TWO_STEP/TIP/CASH_OUT messages that only the sandbox path showed);
config/env.ts (PAYMENTS_MODE enum, POSTHOG key); the 30 `sandbox` branches in ClientJobDetail(7),
Earnings(7: incl. Cash out button), ReviewAndTip(4: tipWorker path), ApproveOrDispute(3),
WorkerJob(2), BidDetail, Checkout (authorize/protect two-step), JobConfirmed, PaymentMethods,
Payouts, Profile, DeleteAccount, WorkerHome; lib/moneyCopy.ts:27, offerCopy.ts 89-103,
earningsCopy.ts:86, jobLifecycle.ts 119-128, payments.ts comments; the 15 analytics call sites
(HotspotMap, OfferComposer, AuthContext, geolocation, jobs, offers, payments/stripe,
pushNotifications, reviews, ModeProvider, ChatScreen, PostJobScreen, ProfileScreen; two already
deleted); package.json `i18n:extract`; app.config.ts (expo-localization if listed).
Deps remove: posthog-react-native, i18next, react-i18next, i18next-parser, expo-localization.
Tests delete: paymentsMode, sandboxCheckout, analyticsPrivacy. Tests edit: observability (keep
Sentry groups), stripePayments (paymentsMode import), copyTruth (sandbox wording), fundingPath,
reviews, earnings, moneyCopy as needed.
Rule that must hold (write it as a test if none exists): with `EXPO_PUBLIC_PAYMENTS_MODE` unset
or anything but `stripe`, `paymentsMode === 'disabled'` and every money button is disabled with
the existing unavailable message. `npm run db:test` must stay green (sandbox RPCs are dropped in D6,
not here).

### D5  Not-in-v1 product features, the voice-search mic, live card, semantic search
Delete: components/HireAgainRow.tsx, PastWork.tsx, PortfolioPicker.tsx; hooks/useRebookWorkers.ts,
useOneTimeNotice.ts, useLiveJobCard.ts; screens/SavedWorkersScreen.tsx, WorkChecklistScreen.tsx;
lib/rebook.ts, savedWorkers.ts, portfolio.ts, checklist.ts, liveCard.ts.
Also: lib/workerSearch.ts loses rankWorkersOnServer and the 'semantic' mode (ruling 50);
App.tsx loses the useLiveJobCard call; tests delete liveCard; tests edit workerMatching.
Edit: screens/HomeScreen.tsx (HireAgainRow), WorkerSearchScreen.tsx (useRebookWorkers),
ProfileScreen.tsx, ProfileDetailsScreen.tsx, WorkerProfileScreen.tsx (portfolio, save worker),
ChatScreen.tsx (save worker, shareProfileLink), WorkerJobScreen.tsx (checklist entry);
lib/navigation.ts + navigation/sharedStacks.tsx (SavedWorkers, WorkChecklist routes);
ui/primitives/SearchBar.tsx (remove the mic; lib/voiceSearch stays for DictationMic);
lib/appLinks.ts (profileUrl, PROFILE_WEB_BASE_URL), lib/sharing.ts (shareProfileLink);
app.config.ts speech string ("into a search" → dictation only).
Tests edit: selfService (saved workers part), touchTargets (SavedWorkersScreen), projections
(portfolio), screenStates (PortfolioPicker), voiceSearch (keep engine tests, drop SearchBar mic
tests), supportContact, workerHome.

### D6  Database and edge functions  (CRITICAL: Fable blueprint = rulings 44-53; Opus xhigh
builds; Fable reviews the migration before commit)
One new migration `supabase/migrations/20261108000000_lean_v1.sql`, sections in this order:
1. Live location: drop start/update/stop_live_location, conversation_parties, table
   live_location_shares (+ policy).
2. Conversation states: drop set_conversation_state, set_block, set_direct_thread_read_at,
   table conversation_states, table mutes (+ policies); drop policy message_reads_select_party.
3. Reactions: drop table message_reactions (+ 4 policies).
4. Saved workers, portfolio, checklist: drop tables saved_workers, portfolio_items (+ cap trigger
   + fn + blocked-terms trigger), job_checklist_items (+ policies).
5. Semantic search: drop 3 triggers mark_worker_semantic_stale, fns apply_worker_embeddings,
   build_worker_semantic_source, match_workers_semantic, refresh_worker_semantic_doc,
   worker_semantic_coverage, worker_semantic_refresh_queue, table worker_semantic_docs,
   extension vector (if nothing else uses it).
6. Live card: unschedule brazos-live-cards; drop drain_live_cards, install_live_card_schedule,
   claim_live_card_batch, resolve_live_card, live_card_enqueue (+ trigger jobs_live_card),
   register_live_activity, live_card_state, clock_label, tables live_card_outbox,
   live_activity_tokens.
7. Dead legacy: ruling 46 RPCs + v_bids_projection_drift; ruling 52 tables, columns, functions,
   triggers, inert policies; my_payouts_enabled.
8. Sandbox: ruling 47 (drop 5 RPCs + 2 markers, re-create 7 functions, provider default).
9. Re-create delete_my_account, should_notify, notify_on_message, unsend_message (ruling 48).
10. Markers: drop the 41 TOOLING functions (ruling 53).
11. Messages columns: drop audio_url, audio_duration_ms, document_url, document_name,
    document_size_bytes.
12. Add: handle_new_user trigger on auth.users (ruling 44); install_push_schedule() (ruling 45).
Storage: remove buckets chat-audio and chat-documents from config/seed if declared there.
Edge functions: delete supabase/functions/translate, send-live-cards, worker-search; remove their
config.toml blocks and their names from .github/workflows/staging.yml's deploy list.
pgTAP: delete 210_live_card.sql; edit 010, 020, 030, 040, 060, 080, 090, 120, 280, phase29 per
rulings 46-53; add `_helpers.sql: test_fund_job`; add tests for the auth.users trigger and the
push schedule. `npm run db:types` regenerates types/database.ts. `npm run db:reset && npm run
db:test` green and `npm run verify` green. Applying the migration to STAGING is the owner's one
click (staging pipeline, `allow_destructive`): a parked step in the report. Production is never
touched. The app slices D3-D5 must land before D6 so no app code calls a dropped object.

### D7  Scripts, tooling, old proofs
Archive (to `_archive/2026-11-lean/`, listed in MOVED.txt): scripts/ except
eas-build-pre-install.mjs, supabase-ref.mjs, staging-scan.sh; dev-tools/ (whole folder after D1);
.eas/; supabase/archive/ (per B3; tests that read phase SQL are repointed at the baseline
migration or deleted with their feature).
Tests delete: envParity, phase76Shape, phase77Shape, verifySchemaGuards, shotHarness,
pngGeometry.mjs (helper). Tests edit: counterResponse 262, lifecycle 399, messagingLock 307,
mode 634 (probe lines); maestroFlows (`.eas/` scan); the phase-SQL readers (notificationFeed,
hardening, marketplaceThreadIdentity, counterCap, moneyCeiling, offerScopedChat, reviews,
platformFee, offerCopyAndRouting, workerMatching, selfService).

### D8  Docs and assets
Archive: every docs/ file except architecture.md and DECISIONS.md (564 files, incl. mockups
102 MB); root DECISIONS.md, BRAZOS_BUILD_STATE.md, PROD_APPLY.md, PROD_APPLY_READY.sql,
PROD_VERIFY.sql, REVIEW_GUIDE.md, AGENTS.md (after folding); assets/fonts/, assets/brand/
customer-home-chair.png, transition-worker.png, assets/prestige/*.png masters,
home-atmosphere-dark.png + .webp, home-ground-blend.json. Move dist/ and design-reference/.
Write (Sonnet high moves and folds; Fable reviews the seven): README.md (what, stack, v1 list,
not-in-v1, how to run), CLAUDE.md (rules, invariants, the 3 AGENTS lines; under 5,000 B),
HANDOFF.md (one screen), docs/ARCHITECTURE.md (renamed + folds from DOMAIN, v3 1.3-1.4,
phone-auth, dispute rules + operator SQL), docs/DECISIONS.md (ruling 26), docs/TESTING.md (new:
verify, db:test, Maestro on GitHub Mac, TestFlight steps, Apple reviewer accounts),
docs/BACKLOG.md (v1 bugs, v1.2 ranked, parked operator decisions).
Tests edit: governance (ACTIVE_DOCS, paths), docsBudget, fixRunA, emeraldFences (pixel tests),
themeResolution (roster), themeTokens 409, authPhone 374 (mockups exclusion).

### D9  Dependency sweep (last)
Remove: @shopify/flash-list, @tanstack/query-async-storage-persister,
@tanstack/react-query-persist-client, expo-font (+ plugin line app.config.ts:145), expo-asset,
expo-linking (ruling 22). Then: `npm install`, `npx expo-doctor`, `npm run verify`,
`npx expo export --platform ios --output-dir <scratch>` (Metro bundle proof). Phase F's EAS
simulator build is the native proof.

## 3. Checkpoints
Fable checks after D3c, after D6, after D9: `git diff --stat pre-lean-2026-11..HEAD`, verify and
db:test logs, and a read of the three largest edited files. Any slice whose verify is red stops
the helper; it reports, nothing is committed.
