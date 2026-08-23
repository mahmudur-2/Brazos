# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## THE PER-RUN RECORDS ARE ARCHIVED — read docs/handoff-archive/

This file carries ONLY the live edge. Every dated per-run record that used
to accumulate here now lives, verbatim and byte-preserved, in
`docs/handoff-archive/` — one file per run, listed oldest-to-newest by
`docs/handoff-archive/INDEX.md`. Consult the archive for any past run's
measurements, decisions, reversals and evidence. Nothing there is an
authority on current state, and nothing here restates what a record already
says.

## THE MASTER SET IS SPLIT — read this before citing any mockup

**Binding design authority, highest first:** the NUMBERED masters
(`docs/mockups/1_*.png` … `44_*.png`) · the emerald dispatch's D1–D11 ·
`docs/mockups/PRESTIGE_RUN_REPORT.md` (a "mismatch" logged there is CORRECT and
must not be reverted) · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`.

**The WORD-NAMED masters are NOT authority and the operator has REJECTED them**
as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`,
`Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`,
`My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`,
`Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`,
`Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`,
`Profile_Past_Work_Settings_Dark.png`. Never cite one to justify a change; never
"restore" a detail that appears only there. You may read one to understand
intent where a numbered master is silent, but the change still needs a numbered
master, a dispatch decision or the run report behind it — and you log that you
read it.

**There is NO master for light mode.** Every mockup is dark. Never align a light
surface to one. **Six numbered masters the emerald dispatch cites do not exist
on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42) — all of
them concern things D9 freezes as UNBUILT.

*Unchanged by the home reconstruction (2026-08-20), which cited no master: its
dispatch superseded `docs/dispatch/` and pre-decided every product question it
needed. Reaffirmed unchanged by the verification run (2026-08-19) and restated
at the head of the "Verification 2026-08-19" section of
`docs/mockups/PRESTIGE_RUN_REPORT.md`.*


## Current state — after the 2026-08-23 overnight chat/motion/visual run

Thirteen functional commits plus this HANDOFF, in order:

| # | commit | what landed |
|-|-|-|
|C1|`5e76df1`|the ONE serif role moves to the platform's Georgia; no font file is registered any more and the launch gate drops its second condition|
|C2|`8ef2901`|light stops reinterpreting dark on four controls — promo CTA, bottom-bar [ + ], Home search field, Online toggle — recoloured, never restructured|
|C3|`8313a13`|the Map's chrome floats: the map is the ground edge-to-edge, header and count row are inset translucent capsules|
|C4|`285f104`|one hero picture in both themes (the room-baked scene), plus the byte-level probe of it|
|C5|`47b33d7`|the motion boundary (`lib/motion120/`) and the feature-flag table — built WITHOUT the five native packages, whose install the repo's own guard refused|
|C6|`72de723`|the chat composer rises on a native-driven transform instead of KeyboardAvoidingView padding; jank sweep fenced|
|C7|`a268c99`|the composer is three zones ([ + ] · field · mic/send morph); dictation and the voice recorder become two different mics; QuickReplies deleted|
|C8|`b24ef85`|the voice recorder gets a REAL waveform — expo-audio metering enabled — and an indeterminate pulse where it cannot|
|C9|`bf5c381`|the chat header gets the counterparty's face and one gold-dots menu; the report sheet can block; profiles share|
|C10|`0ae7430`|delivery ticks: all three states drawn and tested, one of them wired|
|C11|`a7df684`|`/profile/{id}` on the web build — the landing page a shared link needs|
|C12|`e236297`|inbox filter pills and a second action tier; MUTE leaves the flag table|
|C13|`3b3d395`|in-chat translation UI in front of an UNDEPLOYED, review-pending edge function|

The offline suite stands at **903 pass / 0 fail / 0 skipped**, bare
`npm run verify` exit 0 (from 864 at run start: +41 new, −2 retired with the
feature they described). Branch and commit state are Git's to report, never
this file's.

### THE DEPENDENCY INSTALL WAS REFUSED — read this before anything else

`npx expo install react-native-gesture-handler react-native-reanimated
expo-document-picker expo-task-manager expo-local-authentication` is blocked by
this repository's own PreToolUse guard:

```
BLOCK GUARD-DEPS dependency-mutation
```

It was not worked around, not weakened, and not retried in another form.
`package.json` and `package-lock.json` are byte-untouched and all five packages
are confirmed absent from `node_modules`. **Everything the run built is shaped
by that**, and the architecture was designed for exactly this binary: the motion
boundary resolves both capabilities false, every surface takes its fallback, and
the app boots. What is NOT here is the `*.motion120.tsx` fast-path siblings —
they import worklets and recognisers directly, so they cannot exist, or
type-check, until the packages do.

The two config steps that TRAVEL WITH the install are deliberately absent for
the same reason: a babel plugin naming a package that is not installed fails the
bundler outright, and an Info.plist promising Face ID and background location on
a binary that has neither is a config that lies about its build. Both are
written out verbatim in the operator steps below.

### Flags inventory — `lib/featureFlags.ts`, eleven flags, all false

This flags inventory is the daytime schema run's input: each row names the
exact table, column, policy, deploy or key its flag waits on, and flipping one
is a one-line change in that file once its dependency lands.

|flag|unmet dependency|
|-|-|
|`LIVE_LOCATION`|a location-sharing table (sharer, coordinates, heartbeat, expiry) + RLS restricting reads to the thread's two participants, AND expo-location background permission with expo-task-manager installed|
|`DOCUMENTS`|expo-document-picker installed, plus a storage bucket and the message-attachment column naming it|
|`TIMED_BLOCK`|an expiry column on the existing block relation, and the block checks reading it. The PERMANENT block already works and stays reachable where it lives today|
|`HIDDEN_CHATS`|expo-local-authentication installed, plus a per-user hidden-thread list|
|`ARCHIVE`|a per-participant archived flag on the conversation membership|
|`CLEAR_CHAT`|a per-participant cleared-at watermark on the membership, and every message read filtering by it|
|`DELETE_CHAT`|the same watermark plus a membership-level hidden flag, and a decision about what re-opens a thread when the other person writes again|
|`MARK_UNREAD`|a client-callable path that can move a read position BACKWARD on BOTH thread kinds — see the verdict below|
|`READ_TICKS`|a client-readable counterparty read position for JOB threads — see the verdict below|
|`DELIVERED_TICKS`|a per-recipient `delivered_at`, written when a device actually receives the row. Nothing in the schema distinguishes "the insert succeeded" from "the other device has it"|
|`TRANSLATION`|the `translate` edge function reviewed and DEPLOYED, and `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION` set in its environment|

**`MUTE` was REMOVED from the table rather than shipped false.** The dispatch
specified it as flag-gated; measured against the repo that premise is wrong.
`mutes` has existed since `supabase/phase13_moderation_photos_location.sql`,
`lib/moderation.ts`'s `muteUser`/`unmuteUser` are live, and the inbox long-press
sheet has been calling them all along. A conversation in BRAZOS IS a person (the
inbox is keyed by counterparty), so per-user and per-conversation mute are the
same feature here — flagging it would have HIDDEN working behaviour. The chat
overflow menu now calls the same two functions.

### C10 read-model verdicts — BOTH ANSWERS ARE "HALF"

Measured against the repo's own migrations. Repo SQL is evidence of INTENDED
schema only; the live database is not inspectable from an offline run and only a
green `node scripts/verify-schema.mjs` proves what is applied.

**Is the counterparty's read position client-readable?**

- **Direct threads — YES.** `direct_threads` carries BOTH parties' read columns
  on the row, and `direct_threads_select_party`
  (`supabase/phase36_direct_offer_threads.sql`) lets either participant SELECT
  that whole row — the other person's `user_a_read_at` / `user_b_read_at`
  included.
- **Job threads — NO.** `message_reads` is per-user and
  `message_reads_select_own` (`supabase/phase9_messages_inbox.sql`) is
  `using (user_id = auth.uid())`.

**Can a user rewind their OWN read position?**

- **Job threads — YES.** `message_reads_update_own` constrains WHO may write,
  not WHAT: an earlier `last_read_at` is a legal write, which is exactly a
  rewind.
- **Direct threads — NO.** `direct_threads` has no INSERT or UPDATE policy at
  all by deliberate design, and its only writer,
  `mark_direct_thread_read()`, hard-codes `now()`.

**Why half is not enough, in both cases.** One conversation folds a pair's job
threads AND their direct thread together (`targets` in `screens/ChatScreen.tsx`).
Wiring only the readable half would make the SAME conversation show gold ticks
on some bubbles and never on others — an absent tick meaning "not read yet" on
one message and "unknowable here" on the next. The same shape sinks Mark as
Unread: an inbox where it works on some rows and silently does nothing on others
is worse than one where it is not offered.

**What the schema run needs:** for `READ_TICKS`, a party-scoped select policy on
`message_reads` OR a security-definer function returning the other party's
`last_read_at` for a job the caller is party to. For `MARK_UNREAD`, a
`mark_direct_thread_read` sibling accepting an explicit timestamp, or one RPC
owning both surfaces so the client stops writing `message_reads` directly.

### C4 hero-asset probe — `assets/prestige/hero_armchair_customer.png`

Byte-level, by a self-contained node script (IHDR, chunk walk, tRNS, inflate +
unfilter, alpha census, corner sampling). **No image file was edited,
regenerated or replaced**, and nothing was changed off the probe — it is
reported so the device pass can decide.

```
400 x 351, 8-bit RGBA, non-interlaced, no tRNS, 176,718 bytes
chunks: IHDR sRGB gAMA pHYs tEXt eXIf IDAT x3 IEND
alpha:  2,881 of 140,400 samples at 0 (2.05%), 35 partial (0.02%),
        137,484 fully opaque (97.92%), minimum alpha 0
corners (6x6 means, inset 2px):
        top-left #000708 a255 · top-right #010203 a255
        bottom-right #010404 a255 · bottom-left #000000 a0
centre: #06100d
```

**Read it as:** a BAKED NEAR-BLACK ROOM with a trimmed bottom strip. The three
live corners are opaque and within a few units of black; the alpha that exists
is the trim, not a cut-out. Both themes now mount this file, so on the LIGHT
Home 97.9% of it renders as a dark rectangle over `#FAF5F1`. That is the
operator's stated choice and may well be what master 44's composition needs in
both palettes, but it is a DEVICE question and no container or background style
was invented to pre-answer it. The upscale cost is now a light-mode cost too
(400x351 into a 151pt slot, ~1.3x at @3x); the fix is unchanged — re-export the
scene larger into the same path.

### Jank sweep (C6)

|site|finding|action|
|-|-|-|
|`screens/ChatScreen.tsx`|KeyboardAvoidingView `behavior="padding"` — a LAYOUT property, so every frame of the keyboard's rise re-ran Yoga over the message list, its cells, the reply chip and the composer, on the JS thread|**FIXED.** `hooks/useKeyboardOffset.ts`: native-driven `translateY`, the system's own duration, and the nav clearance subtracted (closing a dead band the padding version always had)|
|`useNativeDriver: false` literals|NONE anywhere|nothing to do; `tests/motionDriver.test.mjs` already forbids a literal at any call site|
|`LayoutAnimation`|NONE anywhere|**newly fenced** so none arrives|
|`components/AuthField.tsx`|`JS_DRIVER` — interpolates a border COLOUR|**deliberately left.** Colour cannot be driven natively on any platform; now pinned by file WITH the reason, and re-checked that it is still a colour|
|`components/PhoneNumberInput.tsx`|`JS_DRIVER` — the same hairline on the phone field|**deliberately left**, same reason|
|`components/PulseDot.tsx`, `components/Skeleton.tsx`, `screens/HomeScreen.tsx`|three `Animated.loop`s, all native-driven on opacity/scale|**untouched** — already smooth|
|layout-prop animations|NONE. With every loop native-driven there is nowhere for a width/height/top animation to hide|nothing to do|
|KeyboardAvoidingView, fifteen other files|ordinary forms whose submit control must stay reachable|**all left.** None animates a list under a composer, which is the combination that made chat expensive|

**Note for the operator:** the repository's native-UI rules file states the
KeyboardAvoidingView requirement unconditionally, so it now has one sanctioned
exception (chat). That file is in the agent-config directory and was not edited.

### WHAT ONLY THE NEXT EAS DEV BUILD CAN TURN ON

Nothing below is broken; all of it is dark by construction on today's binary,
and each degrades to hidden rather than to failing:

- **Dictation** (the composer's right-hand mic). It renders only once
  `lib/voiceSearch`'s boundary AFFIRMS on-device recognition, which needs
  expo-speech-recognition's native module in the build. Until then the send
  arrow simply appears alone when there is text.
- **Gestures and the 120Hz path.** `canSwipe()` and `canWorklet()` are false, so
  the inbox's row actions come from long-press through the existing ActionSheet
  and every animation runs core `Animated` on the native driver. Both are
  smooth; what is missing is finger-following fidelity and the swipe surface.
- **Face ID** (hidden chats) and **background location** (live location) — both
  behind flags AND behind packages.

### The two queued operator steps

**1. THE FIVE PACKAGES AND THEIR CONFIG.** Run in one sitting, since the babel
and plist edits are meaningless without the install:

```
npx expo install react-native-gesture-handler react-native-reanimated \n  expo-document-picker expo-task-manager expo-local-authentication
```

then, in `babel.config.js`, add as the **LAST** entry of `plugins`:

```js
'react-native-reanimated/plugin',
```

and in `app.json`, inside `expo.ios.infoPlist`:

```json
"NSFaceIDUsageDescription": "Unlock hidden chats with Face ID.",
"NSLocationAlwaysAndWhenInUseUsageDescription": "Share your live location in a chat while a job is underway.",
"UIBackgroundModes": ["location"]
```

then one new EAS dev build. `npm run verify` must be green after that step
before anything else is layered on it.

**2. THE AZURE TRANSLATOR KEY — and the security review that gates it.** Create
the resource, then set `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` as
Edge Function secrets. **Do not deploy `supabase/functions/translate` yet.** Its
header says DRAFT / NOT DEPLOYED / SECURITY REVIEW PENDING and its review
section names one BLOCKING item: **rate limiting is not implemented.** The
character cap bounds one call; nothing bounds a thousand calls a minute from one
account, and cost amplification is the realistic attack against an endpoint that
spends money per character for any signed-in user. It also must NEVER be
deployed with `--no-verify-jwt` — the platform's own JWT verification is the
real gate, and the in-function header check says outright that it does not
validate a signature.

**A third, smaller one:** `PROFILE_WEB_BASE_URL` in `lib/appLinks.ts` is a
PLACEHOLDER (`https://brazos.app`). No web domain is recorded anywhere in this
repository — `WEB_DEPLOYMENT.md` describes the release workflow without naming a
host and `hosting/` carries no origin — so that is the name the product implies,
not a domain this run could verify. Share Profile is LIVE and emits that URL.
Confirm or register it, or change the constant, before anything ships to
TestFlight. It is one line. (`expo-clipboard` is a fourth, optional one: the
translation sheet's Copy control renders only when a clipboard handler exists,
and nothing in this project can write the clipboard today.)

### Device checks OWED for THIS run (operator, physical device)

None of this run's work has been seen on a device. In rough order of risk:

1. **The hero on LIGHT Home.** The probe says the shared asset is a baked
   near-black room; the operator asked for one asset in both themes. Look at it.
2. **The Map's floating chrome** over live tiles, both themes — is
   `withAlpha(background, 0.82)` enough to hold a 26pt display title?
3. **The composer's rise.** Open chat, tap the field, watch the column and the
   keyboard move as one object; confirm the composer lands ON the keyboard with
   no nav-pill gap, and that messages do not paint over the header.
4. **The recorder.** [ + ] > Voice Message: does the waveform react to your
   voice (metering is on) or pulse indeterminately (it does not)? Then preview,
   X, and the send arrow.
5. **The mic/send morph** while typing, and the [ + ] drop-up's tempo.
6. **The header menu** in BOTH modes, the avatar viewer, Save Worker's toggle,
   and Share Profile's sheet.
7. **The report sheet's** block toggle and its sent state.
8. **The inbox pills**, including that Requests actually filters, and long-press
   row actions with no More entry.
9. **The Georgia hero** — one line, right weight, and no launch-gate hold.

### Device checks carried forward from earlier runs — still unperformed

Each list lives verbatim in its run's archive file:

- The five-point tap-through for the 2026-08-22 run (mode-switch repro both
  directions; light/dark Home parity; the hero's fit; pills seeding the
  filtered list and both search arrows; the card-free Map, its stepper, and
  Any-on-relaunch) → `2026-08-22-modeswitch-parity-map-serif.md`. **Its serif
  line is superseded**: the hero is Georgia now, and the launch hold it asked
  about no longer exists.
- SecureStore keychain line on a NEW dev client, silent session migration,
  chunked writes against the real keychain →
  `2026-08-22-securestore-session-adapter.md`.
- Every heading's weight in the system sans, wrapping everywhere, the two
  typography dials, cold start, LaunchScreen wordmark, chat composer
  footprint, upload-failure copy → `2026-08-22-serif-retired-g001.md` (the
  composer footprint line is superseded by this run's rebuild; the rest
  stands).
- One-job lifecycle label walk, every label at every step →
  `2026-08-22-batch-i-money-lifecycle.md`.
- Airplane-mode cold start, airplane-mode job detail, Track Worker skeleton
  → `2026-08-22-batch-h-error-honesty.md`.
- Live Nearby pulse, PhotoViewer gestures, Setup legal-row pulse,
  similar-jobs caption → `2026-08-22-run-deg-motion-assets-copy.md`.
- Safe-area seam and Live Nearby card peek on Customer Home →
  `2026-08-20-customer-home-replaced-master44.md`.

## THE LIGHT-mode parity audit — DISPATCHED, AUDITED, PARTLY FIXED

**No longer outstanding as an audit.** `ce4e6ec` wrote it
(`docs/audit/2026-08-22/light_mode_parity.md`, P0 0 / P1 0 / P2 10) and the
2026-08-22 cleanup run above closed **L-010** (`dd518d9`) and **L-002**
(`1714fd8`), skipped **L-001** at its gate, and left the rest.

**Still open from that audit:** L-003 (`lib/hotspots.ts`'s 4 heat-tier
strokes — the last live-rendering literal with no token home, and now also
recorded as G-003), L-004/L-006 (auth-surface literals whose token home
`lib/authTheme.ts` is editable again), L-005 (`CountryPicker`'s hand-mixed
scrim), L-007 (shimmer core, blocked on dark transition assets), L-008 and
L-009 (dev-only and frozen-web, no action available).

**C2's item L1 is CLOSED.** `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`
was named there as "the biggest outstanding light decision"; `1714fd8`
resolved it — the values are a theme-constant token group in `ui/tokens.ts`,
F5 continues to prove dark never paints them, and the light rendering did not
move. Do not re-open it from the run report's C2 list.

The rest of the light debt below stands as written.

Light stayed FROZEN through the home reconstruction as it did through emerald:
every colour change branched on `isDark` or moved a dark-palette value only, and
the light palettes are byte-identical to base. The structural exceptions are
stated in the run report.

**This run added to the light debt:**

* **Customer Home's promo card mounts a DIFFERENT light mark** than it did
  before (`home(1)`), because the old one had been deleted from disk. Look at it.
* **The light `heroMark` box is `79x101` holding a landscape drape**, so
  `contain` centres a `79x65` render inside a taller reserve.
* **`screens/PostJobScreen.tsx`'s photo nudge is now `surface` in light too**
  (`home(6)`), not `mint`: white on the ivory page with a mint hairline. This is
  a token swap, not a palette change, and it closes the same seam in both themes.
* **`components/HomeAtmosphere.tsx` renders NOTHING in light** — deliberate, and
  the reason light's homes keep their existing flat ground.

**CORRECTION to the standing light list:** section (c)'s item **L4** says
`assets/brand/customer-home-chair.png` bakes `#FAF5F1` opaquely and is
"invisible only because it matches `homeBackground` exactly today". **That is no
longer true** — `home(1)` measured it as a real cut-out, 62.81% of samples fully
transparent. L4 is closed. Everything else in section (c) stands.

**The scope is written out in full** as section **(c) THE LIGHT AUDIT HANDOFF
LIST** at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`, in four parts: C1
(thirteen shared components with light branches), C2 (the five D10 deferrals —
of which L1, `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`, was the biggest
outstanding light decision and is now CLOSED by `1714fd8`), C3 (both-theme
changes nobody has seen under light — read it for its debt list, NOT for the
bar's composition, which it describes wrongly as six slots), and C4
(theme-neutral changes, listed so they are not re-audited).

### Open items carried forward

0. **G-001 is CLOSED; G-002 remains open** (reconciled 2026-08-22 — the
   cleanup run had left this item stale by design). **G-001** was fixed by
   `fc5a78d` (`2026-08-22-serif-retired-g001.md`): MediaUploader's extraction
   goes through `userMessage()` and `tests/errorMessage.test.mjs` scans `ui/`
   recursively. **G-002** is genuinely open: CI cannot run the 120-test guard
   suite on `ubuntu-latest`, so either add a Windows job for it or stop
   treating a green CI badge as evidence the guards were verified.

1. **Master 34's inbox search, its four filter tabs and its per-thread unread
   COUNT** are not built — functionality, not presentation, and the data model
   has no support-thread kind and no per-thread count.
2. **Master 46's three-column grid and its "best fit" ribbon** are not built —
   bid count is unbounded, and the ribbon asserts a judgement no stored figure
   supports. The honest HIGHEST RATED badge stays.
3. **The map tiles are CLOSED, with the mechanism named.** `HotspotMap.native`
   sets the per-MapView appearance prop from the resolved theme and keys the view
   on the theme, because MKMapView will not reliably re-rasterise tiles it has
   already drawn. If light tiles ever return, that is the thing to re-test — not
   the prop, which is verified correct.
4. **The verification badge** stays removed from every user-visible surface.
5. **Disk filenames for ten masters are shuffled** relative to the manifest's
   numbering. Read by content; renaming is an operator call. Concerns the
   WORD-NAMED files, which are no longer authority at all.
6. **Master 40's "No real charge" gold pill** and **master 25's gold ledger
   amount** remain unimplemented, both for reasons already on the record.
7. **Hand-drawn standard-shaped controls inside individual screens** never got
   the gold-hairline sweep — only the shared `Button` did. The enabled-hairline
   half is still outstanding and is worth its own pass.
8. **Section (e) of the run report** lists eleven items the emerald pass logged
   and did not fix, each with its reason.
9. **`screens/ChatScreen.tsx`'s clearance double count** — see "Found and NOT
   fixed" above. New, and the most actionable item on this list.
10. **The D2 inversion is missing from the run report's §(d) reversal list.**
    Named in the report's Verification section and in this file, and fenced by
    `tests/emeraldFences.test.mjs` F6 — but §(d) itself is where a future run
    looks, and it is still six items rather than seven.
11. **`tests/verificationBadgeRemoved.test.mjs`'s `LOCKED_SCREENS` is stale.**
    It still excludes both sign-in screens, which emerald(5) converted and
    un-allowlisted elsewhere. Harmless today; the operator's call.
12. **Guard rules that fire on command TEXT rather than command effect**, now
    reproduced by a **fourth** run. Earlier runs hit: `git commit` refused for a
    message containing the bare token `Claude`
    (`GUARD-NESTED-CLAUDE` matches any whitespace-delimited `claude` token
    anywhere in the command, including inside a heredoc body); `node -e` refused
    as `GUARD-DYNEXEC`; `git stash list` refused as a forbidden subcommand
    despite being read-only; and `Write` to the session's own scratchpad refused
    as a path escape. The 2026-08-22 cleanup run reproduced the scratchpad
    refusal and added a fifth shape: **`GUARD-CLAUDEDIR` fires on any command
    whose text contains `.claude/` together with a `>` anywhere**, so the purely
    read-only `ls -la .claude/ 2>&1` is blocked as a config mutation — the `2>&1`
    is the whole trigger. All fail safe. **None has ever been worked around** —
    commit messages go through `-F` files in the allowlisted `.audit-scratch/`,
    probes are written into the project tree, `.claude/` is read with the file
    tools instead of the shell, and refused calls are dropped rather than
    rephrased. Worth fixing at the guard, because every run pays this tax and it
    is now the single most reproducible friction in the contract.
13. **`tests/customerCore.test.mjs:225` and `tests/emeraldFences.test.mjs:1485`
    own `lib/theme.ts`'s dead `emeraldColors` export.** The first asserts the
    export exists; the second uses its NAME as the slice delimiter for the light
    palette block. There are zero production importers, so the export is dead
    code that two fences keep alive. Deleting it is a three-file change (export
    + both fences) and needs a dispatch that authorises touching them — this run
    was forbidden from editing any fence and correctly skipped it.
