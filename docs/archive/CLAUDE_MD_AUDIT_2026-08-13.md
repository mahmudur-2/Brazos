# CLAUDE.md audit — ground truth from repo + live staging

Read-only audit, 2026-08-13. No existing file was modified; this file is the
only thing created. No commits, no branch changes.

**How claims were verified** is stated per section. Three verification classes
appear below:

- **command** — output of a command run in this session, pasted verbatim.
- **source** — a file path + line number read in this session.
- **probe** — `node scripts/verify-schema.mjs` against the live database. See
  §2's caveat: this is a PostgREST existence probe with the publishable key
  (`401` means "the function exists but anon may not call it"), **not** a
  `pg_proc` inspection, because `SUPABASE_DB_URL_STAGING` was not set.

---

## 1. BRANCH REALITY

**Verified by: command.**

```
$ git status
On branch mainexpo
Your branch is ahead of 'origin/mainexpo' by 2 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean

$ git status --porcelain
(no output — tree clean)

$ git log --oneline -3
48169f8 feat(chat): merged conversation timeline and send routing
2ce3aca feat(inbox): one row per person
abfced9 chore: force LF line endings for .sql files

$ git branch --list
  autonomous-6-12
  env-parity-fix
  feature/emerald-auth-flow-v1
  feature/emerald-v2-fidelity
  feature/phone-otp-mock-v1
  feature/setup-onboarding-v1
* mainexpo
  master
  pre-codex-backup
  pre-review-hardening
  stability-core-transactions
  v2
  web-pwa-stable

$ git branch -a   (remotes only)
  remotes/origin/mainexpo
  remotes/origin/stability-core-transactions
```

### Does `mainexpo` still exist?

Yes — both locally and as `origin/mainexpo`.

### How far ahead of it is the current branch?

**The current branch *is* `mainexpo`.** So "ahead of mainexpo" is zero by
definition. The two divergence measurements that actually exist:

```
$ git rev-list --left-right --count origin/mainexpo...mainexpo
0	2          # local mainexpo is 2 commits ahead of its remote, 0 behind

$ git rev-list --left-right --count mainexpo...v2
66	0          # mainexpo has 66 commits v2 lacks; v2 has 0 commits mainexpo lacks
```

### Finding — CLAUDE.md's workflow line is stale

CLAUDE.md:199 says *"Base branch mainexpo; work on v2."* The `v2` branch
contains **zero commits** that `mainexpo` does not already have, and is **66
commits behind**. All V2 work has been landing on `mainexpo` directly. Either
`v2` is abandoned or the instruction is wrong; the repo says work happens on
`mainexpo`.

---

## 2. LIFECYCLE RPCS

**Verified by: source (grep over `supabase/*.sql`, `lib/`, `screens/`) +
probe.**

### Probe caveat — read this before trusting the "live" column

`node scripts/verify-schema.mjs` exited `0` with *"All REQUIRED objects exist
in the live database."* But its own header says:

```
env parity
  app .env SUPABASE_URL ref : zzkumxcjtbqoselzptig
  app .env SUPABASE_KEY ref : zzkumxcjtbqoselzptig
  SUPABASE_DB_URL_STAGING   : NOT SET
  WARNING: SUPABASE_DB_URL_STAGING is not set in this shell, so the
           app-vs-tooling comparison could not be made. The SQL proofs
           cannot run without it either.
  parity: OK (app side only)
```

So every "exists" below means **a PostgREST RPC probe got `401` instead of
`404`** — the function is reachable by name. It is *not* proof of the
signature, the body, or which migration's version won. Treat it as
"present", not "verified correct".

### Per-function results

| RPC | Defined in (file:line) | Live? | Called from app code |
| --- | --- | --- | --- |
| `accept_bid` | `supabase/phase29_security_hardening.sql:529`, `supabase/phase30_accept_bid_rpc.sql:8`, `supabase/phase46_offer_rpcs_and_rls.sql:975`, `supabase/phase47_bids_projection_trigger.sql:315` | **Yes** (`verify-schema` §phase30: `OK rpc accept_bid()`) | **Nothing.** Zero `.rpc('accept_bid'` in `lib/`, `screens/`, `components/`, `hooks/`. Only prose mentions: `screens/JobDetailScreen.tsx:308` (comment), `tests/hardening.test.mjs:61,222`. |
| `respond_job_request` | `supabase/phase18_hire_requests_and_replies.sql:280`, `supabase/phase36_direct_offer_threads.sql:412`, `supabase/phase46_offer_rpcs_and_rls.sql:1081` | **Yes** (`verify-schema` §phase18: `OK rpc respond_job_request()`) | **Nothing.** Zero call sites. Only `scripts/verify-schema.mjs:192` and `tests/hardening.test.mjs:374`. |
| `transition_job_status` | `supabase/phase29_security_hardening.sql:581`, `supabase/phase31_transition_job_status_rpc.sql:8`, `supabase/phase35_completion_videos.sql:78`, `supabase/phase51_active_work_lifecycle.sql:268`, `supabase/phase58_hardening_fixes.sql:138` | **Yes** — both arities probed: `OK rpc transition_job_status()` and `OK rpc transition_job_status() takes p_completion_videos` | **`lib/jobs.ts:564`** — `supabase.rpc('transition_job_status', {...})`. Sole call site. |
| `advance_job_status` | **NOWHERE.** Zero hits across `supabase/*.sql`. | **Not probed — does not exist to probe.** | **Nothing.** Zero hits in any `.ts`/`.tsx`. |
| `accept_offer` | `supabase/phase46_offer_rpcs_and_rls.sql:664`, rewritten at `supabase/phase50_sandbox_payments_and_offer_lifecycle.sql:437` | **Yes** (`verify-schema` §phase46: `OK rpc accept_offer()`) | **`lib/offers.ts:309`** — `supabase.rpc('accept_offer', {...})`. Sole call site. |

`lib/jobStatusCompatibility.ts` contains **no** `.rpc()` call at all; its only
reference to `transition_job_status` is the comment at line 30.

### 🚩 FLAG — `advance_job_status` is a phantom

CLAUDE.md:181 mandates:

> Job/offer/payment statuses come from generated DB enums via the RPCs
> advance_job_status / accept_offer.

**`advance_job_status` does not exist.** Not in any migration, not in the
database, not called anywhere. It appears only in planning prose:
`BRAZOS_MASTER_PLAN.md:238`, `:415`, `:488`; `BRAZOS_BUILD_STATE.md:740`;
`CLAUDE.md:181`. The real function is `transition_job_status`, which CLAUDE.md
*also* names correctly at line 117 in the older half of the document.

CLAUDE.md therefore names two different status-advancing functions in two
different sections, one of which is fictional.

### 🚩 FLAG — lifecycle-duplication risk (P3-31 class)

Two distinct duplications are live simultaneously:

**(a) Three granted entry points to job assignment.** `accept_offer()` is
canonical, but `accept_bid()` and `respond_job_request()` both survive as
`security definer` shims that delegate to it, and both are explicitly
re-granted to `authenticated`:

- `supabase/phase47_bids_projection_trigger.sql:328` — `perform public.accept_offer(p_bid_id);`
- `supabase/phase47_bids_projection_trigger.sql:333` — `grant execute on function public.accept_bid(uuid, uuid) to authenticated;`
- `supabase/phase46_offer_rpcs_and_rls.sql:1093` — `return public.accept_offer(p_request_id);`
- `supabase/phase46_offer_rpcs_and_rls.sql:1106` — `grant execute on function public.respond_job_request(uuid, text, integer) to authenticated;`

Both are commented `DEPRECATED compatibility shim … Remove once a minimum app
version can be enforced` (`phase47:336`, `phase46:1109`). **No app code calls
either one** — the compatibility window they exist for is, as far as this
repo's client is concerned, already closed. They are live, callable, unused
attack surface.

**(b) The status-mover has five stacked redefinitions.**
`transition_job_status` is `create or replace`d in phase29, 31, 35, 51 and 58,
and the signature changed arity mid-stream (`phase35:76` does
`drop function if exists public.transition_job_status(uuid, text, jsonb);`
before recreating it 4-arg). The probe confirms *a* function of each arity
answers; it cannot confirm phase58's body is the one deployed.

CLAUDE.md's invariant *"only `transition_job_status()` may move it"*
(CLAUDE.md:117) is consistent with the code. CLAUDE.md:181's
`advance_job_status` claim is not.

---

## 3. DESIGN TOKENS

**Verified by: command (`grep -rl` over `*.ts`/`*.tsx`, node_modules excluded)
+ source.**

Both files exist: `lib/theme.ts` and `ui/tokens.ts`.

| File | Importers | First commit |
| --- | --- | --- |
| `lib/theme.ts` | **85** | `1f6fc58` 2026-07-12 — *"Initial commit: Brazos Phase 1 core loop"* |
| `ui/tokens.ts` | **18** | `13af291` 2026-08-08 — *"phase-1 design-system"* |

`lib/theme.ts` is the older one. It is **not** a rival palette — it imports
from the newer file and re-exports it:

- `lib/theme.ts:2` — `import { brand } from '../ui/tokens';`
- `lib/theme.ts:44` — `...brand,`
- `lib/theme.ts:18-26` documents this deliberately: *"new screens build on
  ui/tokens.ts, legacy screens keep this."*

**Zero files import both** (`comm -12` on the two sorted lists is empty), so
there is no file with a split allegiance to resolve.

### Every file still on the older `lib/theme.ts` (85)

```
App.tsx
components/ActionSheet.tsx            components/JobVideo.tsx
components/AmountPrompt.tsx           components/MarkdownText.tsx
components/AppErrorBoundary.tsx       components/MarketJobPreview.tsx
components/Avatar.tsx                 components/ModeTransitionOverlay.tsx
components/BrowseJobCard.tsx          components/OfferCard.tsx
components/Button.tsx                 components/OfferComposer.tsx
components/Card.tsx                   components/OfferResponseActions.tsx
components/CategoryAccordion.tsx      components/PastWork.tsx
components/ChatBubble.tsx             components/PortfolioPicker.tsx
components/ChatComposer.tsx           components/PulseDot.tsx
components/Chip.tsx                   components/QuickReplies.tsx
components/ConfirmDialog.tsx          components/ReactionPicker.tsx
components/ConversationRow.tsx        components/ReportDialog.tsx
components/HotspotMap.native.tsx      components/ReviewSection.tsx
components/HotspotMap.web.tsx         components/ScreenHeader.tsx
components/HubCard.tsx                components/SectionHeader.tsx
components/JobFilterSheet.tsx         components/SegmentedControl.tsx
components/JobOwnerActions.tsx        components/ServicePickerSheet.tsx
components/JobProgress.tsx            components/Skeleton.tsx
components/StarRating.tsx             components/TextField.tsx
components/StatusBadge.tsx            components/VerificationBadge.tsx
components/VoiceNote.tsx              components/WorkerJobCard.tsx
dev-tools/HomeDesignStudio.tsx
hooks/useThemeColors.ts
navigation/ModeShell.tsx
screens/AdminReportsScreen.tsx        screens/MyJobsHubScreen.tsx
screens/ApproveOrDisputeScreen.tsx    screens/NotificationSettingsScreen.tsx
screens/BidDetailScreen.tsx           screens/NotificationsScreen.tsx
screens/BidSentScreen.tsx             screens/PaymentMethodsScreen.tsx
screens/BrowseJobsScreen.tsx          screens/PostJobScreen.tsx
screens/CellJobsScreen.tsx            screens/ProfileReviewsScreen.tsx
screens/ChatScreen.tsx                screens/ProfileScreen.tsx
screens/CheckoutScreen.tsx            screens/ReviewAndTipScreen.tsx
screens/ClientJobDetailScreen.tsx     screens/RouteArrivalScreen.tsx
screens/CompareBidsScreen.tsx         screens/SavedWorkersScreen.tsx
screens/CounterofferScreen.tsx        screens/ServicesPricingScreen.tsx
screens/EarningsScreen.tsx            screens/SubmitBidScreen.tsx
screens/HomeScreen.tsx                screens/TrackWorkerScreen.tsx
screens/JobConfirmedScreen.tsx        screens/WorkChecklistScreen.tsx
screens/JobDetailScreen.tsx           screens/WorkerJobScreen.tsx
screens/LegalDocumentScreen.tsx       screens/WorkerProfileScreen.tsx
screens/MapScreen.tsx                 screens/WorkerResultsScreen.tsx
screens/MessagesInboxScreen.tsx       screens/WorkerSearchScreen.tsx
ui/primitives/BottomNav.tsx
```

By directory: `components/` 44, `screens/` 36, plus `App.tsx`,
`dev-tools/HomeDesignStudio.tsx`, `hooks/useThemeColors.ts`,
`navigation/ModeShell.tsx`, `ui/primitives/BottomNav.tsx`.

### Files on `ui/tokens.ts` (18)

```
lib/authTheme.ts                      ui/primitives/MediaUploader.tsx
lib/theme.ts                          ui/primitives/MoneyText.tsx
dev-tools/ComponentCatalog.tsx        ui/primitives/SearchBar.tsx
ui/primitives/EmptyState.tsx          ui/primitives/Sheet.tsx
ui/primitives/JobCard.tsx             ui/primitives/StatusPill.tsx
ui/primitives/ListRow.tsx             ui/primitives/StepHeader.tsx
ui/primitives/MediaGrid.tsx           ui/templates/DetailScreen.tsx
ui/templates/FormScreen.tsx           ui/templates/ListScreen.tsx
ui/templates/ScreenStates.tsx         ui/templates/SuccessScreen.tsx
```

### Two CLAUDE.md rules that currently contradict each other

- CLAUDE.md:75 — *"Design tokens are in `lib/theme.ts`"*
- CLAUDE.md:188 — *"Every screen consumes `ui/tokens.ts` + shared primitives/
  templates."*

Reality is 85 vs 18, with `lib/theme.ts` layered on top of `ui/tokens.ts`.
Notably **`ui/primitives/BottomNav.tsx` is the one file inside `ui/primitives/`
still on `lib/theme.ts`**, and `navigation/ModeShell.tsx` — the newest
navigation code — is on the older file too.

---

## 4. NAVIGATION SHAPE

**Verified by: source.**

**Separate Customer/Worker trees, switched by mode.** The single-navigator
model is gone. Both trees expose *the same five tabs in the same order*
(Home / Map / My Jobs / Messages / Profile) — only the Home stack differs, and
the trees are never mounted simultaneously.

| Thing | File:line |
| --- | --- |
| Customer tab set (5 `Tab.Screen`) | `navigation/CustomerRoot.tsx:54-72` |
| Customer Home stack (5 screens, rooted at `HomeMain`) | `navigation/CustomerRoot.tsx:38-48` |
| Worker tab set (5 `Tab.Screen`) | `navigation/WorkerRoot.tsx:69-83` |
| Worker Home stack (9 screens, rooted at `BrowseJobs`) | `navigation/WorkerRoot.tsx:41-63` |
| Shared Map/MyJobs/Messages/Profile stacks | `navigation/sharedStacks.tsx` (imported at `CustomerRoot.tsx:11-16`, `WorkerRoot.tsx:15-20`) |
| Tab bar config | `ui/primitives/BottomNav.tsx` → `bottomNavScreenOptions()` (`CustomerRoot.tsx:10`, `WorkerRoot.tsx:14`) |
| Which tree mounts | `navigation/ModeShell.tsx:31` — `const { mode, ready, armResolution } = useMode();` |
| Param lists (separately typed per tree) | `lib/navigation.ts` — `CustomerParamList` / `CustomerHomeStackParamList` (`CustomerRoot.tsx:4`), `WorkerParamList` / `WorkerHomeStackParamList` (`WorkerRoot.tsx:4`) |
| `ModeContext` | `modes/ModeProvider.tsx:98` — `const ModeContext = createContext<ModeContextValue | null>(null);` |
| `switchMode()` | `modes/ModeProvider.tsx:197` (type at `:87`, exposed via context at `:250`) |
| `ModeProvider` mounted | `App.tsx:162` (inside `ModeTransitionProvider`, outside `NavigationContainer`) |
| Public barrel | `modes/index.ts:9-12` — `ModeProvider`, `useMode`, `useModeSwitch`, `ModeGuard`, `ModePreview`, `useModePerspective` |
| Perspective for JobCard | `modes/perspective.tsx:16` → consumed at `ui/primitives/JobCard.tsx:83` |

### `MainTabs` still exists, but is now a one-line pass-through

`App.tsx:41-43`:

```tsx
function MainTabs() {
  return <ModeShell />;
}
```

Its doc comment (`App.tsx:35-39`) states: *"Phase 2 emptied this of
navigators… What used to be one five-tab navigator with Worker Home pushed
onto the customer Home stack is now two trees that are never mounted at the
same time."* Rendered at `App.tsx:93` and `:98`.

### Finding — CLAUDE.md:71-73 and :143 describe the dead model

CLAUDE.md:71-73 says *"Navigation is a 5-tab bottom bar … each tab a native
stack. All route param types live in `lib/navigation.ts`."* The param-list
claim still holds; the single-navigator claim does not. CLAUDE.md:143's
*"`MainTabs` already owns that inset"* is now indirect — the inset math lives
in `ui/primitives/BottomNav.tsx` via `bottomNavScreenOptions(insets.bottom)`
(`CustomerRoot.tsx:51,54`; `WorkerRoot.tsx:66,69`), and `ui/tokens.ts:122` and
`ui/templates/FormScreen.tsx:28` still cite `MainTabs` by name. The rule is
correct; the named owner is one hop stale.

---

## 5. `docs/architecture.md`

**Verified by: source + command.**

**It exists.** 210 lines. Last commit touching it:
`7dda18f` **2026-08-04** — *"feat(auth): add mock-first phone OTP flow"*.

It describes the **old single-tree / no-mode model**. `docs/architecture.md:10-12`:

> Navigation: `createBottomTabNavigator` with five tabs, each wrapping a
> `createNativeStackNavigator`.

followed by a five-row tab table (`:14-20`) whose Home row reads
`HomeMain, PostJob, BrowseJobs, JobDetail, WorkerProfile` — i.e. **BrowseJobs
(Worker Home, atlas 48) nested inside the customer Home stack**, which is
precisely the arrangement `navigation/WorkerRoot.tsx:33-39` describes as
having been removed.

A case-insensitive grep for `mode|ModeShell|CustomerRoot|WorkerRoot|switchMode`
over the file returns **no architectural hits** — only
`EXPO_PUBLIC_PHONE_AUTH_MODE` (`:46`), the phone-auth provider table (`:40`),
and *"PostJobScreen in hire mode"* (`:116`). The dual-tree model is not
mentioned anywhere in it.

**Staleness verdict:** stale on navigation — it documents the pre-Phase-2
single 5-tab tree with Worker Home nested under customer Home, ~9 days and one
architectural generation behind the code, though its Supabase/auth/offers
sections were not audited here and may still hold.

---

## 6. CLAUDE CODE CONFIG

**Verified by: command.**

```
$ claude --version
2.1.232 (Claude Code)
```

`.claude/` **exists**. Contents:

```
drwxr-xr-x  _claude_bak/          (contains one file: settings.local.json, 331 B, 2026-06-29)
-rw-r--r--  launch.json           182 B   2026-07-29
-rw-r--r--  settings.json          76 B   2026-08-13
-rw-r--r--  settings.local.json  4496 B   2026-08-09
```

### `.claude/settings.json` (verbatim)

```json
{
  "enabledPlugins": {
    "expo@claude-plugins-official": true
  }
}
```

### `.claude/settings.local.json` (verbatim)

```json
{
  "permissions": {
    "allow": [
      "PowerShell(Get-ChildItem -Force | Select-Object Name; \"---NODE---\"; node --version; \"---NPM---\"; npm --version; \"---NPX---\"; \\(Get-Command npx\\).Source)",
      "PowerShell($env:CI = \"1\"; npx --yes create-expo-app@latest . --template blank-typescript --no-install)",
      "PowerShell(npm install 2>&1)",
      "PowerShell(npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context 2>&1)",
      "PowerShell(npm install --save-dev react-native-dotenv 2>&1)",
      "PowerShell(npx tsc --noEmit 2>&1)",
      "PowerShell(\"---TSC---\")",
      "PowerShell(npx expo install @expo/vector-icons 2>&1)",
      "PowerShell(\"---DONE---\")",
      "PowerShell(npx --yes expo-doctor 2>&1)",
      "PowerShell(npx expo install expo-font 2>&1)",
      "PowerShell(\"---DOCTOR---\")",
      "PowerShell(npx expo export --platform ios --output-dir $out 2>&1)",
      "PowerShell($out = \"C:\\\\Users\\\\mdmah\\\\AppData\\\\Local\\\\Temp\\\\claude\\\\C--Users-mdmah-OneDrive-Documents-BRAZOS\\\\c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27\\\\scratchpad\\\\export_test\")",
      "PowerShell(npm install --save-dev babel-preset-expo 2>&1)",
      "PowerShell(\"---EXPORT---\")",
      "PowerShell(git check-ignore .env)",
      "PowerShell(if \\($?\\) { \"OK: .env is git-ignored\" } else { \"WARNING: .env is NOT ignored\" })",
      "PowerShell(npx expo start -c)",
      "PowerShell($r = Test-NetConnection -ComputerName localhost -Port 8081 -WarningAction SilentlyContinue; \"TcpTestSucceeded: $\\($r.TcpTestSucceeded\\)\"; try { \\(Invoke-WebRequest -Uri \"http://localhost:8081/status\" -UseBasicParsing -TimeoutSec 10\\).Content } catch { \"status: $\\($_.Exception.Message\\)\" })",
      "PowerShell(npx expo install react-dom react-native-web 2>&1)",
      "PowerShell(\"react-dom: $\\(Test-Path node_modules/react-dom\\)\"; \"react-native-web: $\\(Test-Path node_modules/react-native-web\\)\")",
      "PowerShell(npx expo start --web)",
      "PowerShell(Start-Process \"http://localhost:8081\")",
      "PowerShell(\"Opened browser to http://localhost:8081\")",
      "PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 40; \"---EXIT $LASTEXITCODE---\")",
      "PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 20; \"---EXIT $LASTEXITCODE---\")",
      "PowerShell(npx expo install expo-image-picker 2>&1)",
      "PowerShell(\"---\")",
      "PowerShell(npx expo start --web --tunnel)",
      "PowerShell(npm install --save-dev \"@expo/ngrok@^4.1.0\" 2>&1)",
      "Bash(git check-ignore *)",
      "Bash(git add *)",
      "Bash(git config *)",
      "PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 30; \"---EXIT $LASTEXITCODE---\")",
      "PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 60; \"---EXIT $LASTEXITCODE---\")",
      "PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 80; \"---EXIT $LASTEXITCODE---\")",
      "Bash(git commit -m ' *)",
      "PowerShell(npx expo start --web -c)",
      "PowerShell(npx expo start)",
      "Bash(python3 -c \"import qrcode; print\\('available'\\)\")",
      "Bash(python -c \"import qrcode; print\\('available'\\)\")",
      "Bash(mkdir -p \"/c/Users/mdmah/AppData/Local/Temp/claude/C--Users-mdmah-OneDrive-Documents-BRAZOS/c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27/scratchpad\")",
      "Read(//c/Users/mdmah/AppData/Local/Temp/claude/C--Users-mdmah-OneDrive-Documents-BRAZOS/c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27/scratchpad/**)",
      "Bash(npx --yes qrcode \"exp://192.168.1.139:8081\" -o expo-qr.png -w 500)",
      "Bash(npm view *)",
      "WebFetch(domain:docs.expo.dev)",
      "Bash(npx expo *)",
      "Bash(npx --yes expo-doctor)",
      "Bash(rm -rf node_modules)",
      "Bash(npm install *)",
      "Bash(npx tsc *)",
      "Bash(echo \"EXIT_CODE=$?\")",
      "PowerShell(Set-Location \"C:\\\\Users\\\\mdmah\\\\OneDrive\\\\Documents\\\\BRAZOS\"; $m = \\(Select-String -Path .\\\\start.ps1 -Pattern 'postgresql://\\\\S+' | Select-Object -First 1\\).Matches.Value; if \\(-not $m\\) { \"no conninfo found in start.ps1\" } else { psql -X -A -t -c \"select 'CONNECT-OK as ' || current_user\" $m })",
      "Bash(node scripts/verify-schema.mjs)",
      "Bash(psql:*)",
      "Bash(npm test:*)",
      "Bash(npm run:*)",
      "Bash(node:*)",
      "Bash(git:*)"
    ]
  }
}
```

### Secret check

**No credential value appears in either file** — nothing was withheld above.
Three things are worth flagging anyway:

1. **`settings.local.json` line 57 is a pre-approved credential *reader*.** It
   greps `start.ps1` for `postgresql://\S+` and pipes the captured connection
   string — password included — straight into `psql`. The secret is not in
   this file, but the file grants standing permission to extract and use it
   without a prompt. Confirm `start.ps1` is git-ignored before this repo is
   ever shared.
2. **`.claude/launch.json` targets the frozen web surface.** Its only
   configuration is `brazos-web` → `npm run web` on port 8081. CLAUDE.md:9
   freezes web/PWA work; a launch config pointing there is a live foot-gun.
3. **Broad wildcards:** `Bash(git:*)`, `Bash(npm run:*)`, `Bash(node:*)`,
   `Bash(psql:*)`, `Bash(rm -rf node_modules)`, `Bash(git add *)`,
   `Bash(git commit -m ' *)`. `Bash(git:*)` in particular pre-approves
   `git push`, `git checkout` and `git reset --hard` — the first is forbidden
   outright by CLAUDE.md:49 (*"No `git push`"*), and the second collides with
   the required-branch rule in CLAUDE.md's "Before editing anything" section.
   The settings file and CLAUDE.md disagree about what is allowed.

`.claude/_claude_bak/settings.local.json` (331 B, 2026-06-29) is an older
backup of the same file; not reproduced.

---

## 7. PROTECT LIST

**Verified by: command (`find`, per-file `test -f`) + source.**

### 🚩 `docs/emerald-v2/references/` DOES NOT EXIST

CLAUDE.md:160 states:

> docs/emerald-v2/references/screen_map.json + NN_slug.png (immutable).

```
$ ls docs/emerald-v2/references/
ls: cannot access 'docs/emerald-v2/references/': No such file or directory

$ find . -type d -name "references"     (node_modules pruned)
(no results)
```

`docs/emerald-v2/` exists and holds 16 markdown files (`00_EXECUTIVE_SUMMARY.md`
… `SCREEN_CROSSWALK.md`), but **no `references/` subdirectory, no
`screen_map.json`, and no `NN_slug.png` anywhere in the repo.**

The real reference assets live under a different top-level directory:

```
$ find . -name "screen_map.json"        (node_modules pruned)
./design-reference/screen_map.json
./design-reference/emerald-auth-v1/_extracted/BRAZOS_Emerald_Trust_UI/screen_map.json
```

plus `design-reference/emerald-auth-v1/BRAZOS_Emerald_Trust_Full_Package.zip`
and `.../BRAZOS_Emerald_Trust_Full_UI_Atlas.pdf`.

**Any mechanical protect list must use `design-reference/`, not
`docs/emerald-v2/references/`.** The path in CLAUDE.md protects nothing,
because it matches nothing.

### Locked screens 01–07 and 48 → file paths

Mapping from `docs/emerald-v2/SCREEN_CROSSWALK.md` (rows 1–7 at lines 47-52 and
60; row 48 at line 108). Every path below was confirmed present on disk this
session.

| Atlas # | Title | File(s) |
| --- | --- | --- |
| 01 | Launch | `screens/LaunchScreen.tsx` |
| 02 | Welcome | `screens/WelcomeScreen.tsx` |
| 03 | Sign in | `screens/SignInScreen.tsx`, `screens/EmailSignInScreen.tsx` |
| 04 | Create account | `screens/CreateAccountScreen.tsx`, `screens/EmailCreateAccountScreen.tsx` |
| 05 | Verify phone | `screens/VerifyPhoneScreen.tsx` |
| 06 | Setup | `screens/SetupScreen.tsx`, `screens/LegalGateScreen.tsx` |
| 07 | Home (Customer Home) | `screens/HomeScreen.tsx` |
| 48 | Find jobs (Worker Home) | `screens/BrowseJobsScreen.tsx` |

`SCREEN_CROSSWALK.md:60` and `:108` mark 07 and 48 **LOCKED** explicitly
(*"do not modify layout/styling/behavior"*). Rows 01–06 are marked COMPLETE and
are covered by CLAUDE.md:166's *"App screens 01–07 … finished"*, but carry no
per-row LOCKED marker of their own.

### Mechanical protect list (11 paths, all verified to exist)

```
screens/LaunchScreen.tsx
screens/WelcomeScreen.tsx
screens/SignInScreen.tsx
screens/EmailSignInScreen.tsx
screens/CreateAccountScreen.tsx
screens/EmailCreateAccountScreen.tsx
screens/VerifyPhoneScreen.tsx
screens/SetupScreen.tsx
screens/LegalGateScreen.tsx
screens/HomeScreen.tsx
screens/BrowseJobsScreen.tsx
design-reference/**
```

Two caveats for whoever writes the enforcement:

- `screens/HomeScreen.tsx` and `screens/BrowseJobsScreen.tsx` are both on
  `lib/theme.ts` (§3). Any future token migration collides with their locked
  status — `lib/theme.ts:21-23` already records this constraint explicitly.
- `docs/LOCKED_FILE_PATCHES.md` exists at the repo root of `docs/` and was not
  opened during this audit; it likely holds the sanctioned-exception process
  for these files and should be read before the protect list is finalised.

---

## Proof that nothing changed except this file

```
$ git status
On branch mainexpo
Your branch is ahead of 'origin/mainexpo' by 2 commits.
  (use "git push" to publish your local commits)

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        docs/CLAUDE_MD_AUDIT.md

nothing added to commit but untracked files present (use "git add" to track)

$ git status --porcelain
?? docs/CLAUDE_MD_AUDIT.md
```

One untracked file, zero modifications, zero staged changes, branch unchanged
at `mainexpo`, HEAD unchanged at `48169f8`.

---

## Summary of contradictions found (no fixes applied)

| # | CLAUDE.md says | Repo says |
| --- | --- | --- |
| 1 | :199 "work on `v2`" | `v2` is 66 behind `mainexpo`, 0 ahead — abandoned |
| 2 | :181 statuses move via `advance_job_status` | No such function exists anywhere |
| 3 | :117 only `transition_job_status` moves status | True — but redefined 5× and CLAUDE.md contradicts itself vs. #2 |
| 4 | :109 `accept_bid` / `respond_job_request` are the two assignment paths | Both are deprecated shims delegating to `accept_offer`; **no app code calls either**, yet both stay granted to `authenticated` |
| 5 | :75 tokens live in `lib/theme.ts` — vs — :188 every screen uses `ui/tokens.ts` | 85 importers vs 18; `lib/theme.ts` wraps `ui/tokens.ts` |
| 6 | :71-73 single 5-tab navigator | Dual `CustomerRoot`/`WorkerRoot` trees switched by `ModeShell` |
| 7 | :160 references at `docs/emerald-v2/references/` | Path does not exist; assets are in `design-reference/` |
| 8 | :49 no `git push` | `.claude/settings.local.json` pre-approves `Bash(git:*)` |
| 9 | :9 web/PWA frozen | `.claude/launch.json` is a `npm run web` launch config |
| 10 | :69 cites `docs/architecture.md` as verified architecture | Last updated 2026-08-04; documents the removed single-tree model |

All CLAUDE.md line numbers above were read from the file in this session, not
estimated.
