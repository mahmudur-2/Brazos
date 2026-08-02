# BRAZOS — Current Implementation Handoff

Read this file first in any new session before continuing this work. It is
the single source of truth for what's done, what's next, and why.

---

## SESSION 3 — Major implementation pass (current, read this first)

**Baseline:** branch `mainexpo`, HEAD `5fc25be`, tree clean.
**Tip after this session:** `62aceb0`. Tree clean.

Driven by the 13-page requirements PDF (supplied by the user, not stored
in-repo). Phases below are numbered as the task numbered them.

### Status at a glance

| Phase | Subject | Status |
|---|---|---|
| 1 | Canonical job data + cross-screen consistency | **Done** — `01fb2e0` |
| 2 | Completion photo + video evidence | **Done** — `fa6493f` |
| 3 | First-time direct job offers | **Done** — `249589f` |
| 4 | Profile reviews screen + review photos | **Done** — `19738f6` |
| 5 | Marketplace confirmation dialogs | **Done** — `83415c3` |
| 6 | Video thumbnails + fullscreen playback | **NOT STARTED** |
| 7 | Semantic worker matching | **NOT STARTED** |
| 8 | Profile action polish | **Done** — carried by Session 1 + Phases 3/4 |
| 9 | Nearby / All Open Jobs discovery | **Partial** — bid counts done `62aceb0`; nearest-hotspot NOT started |
| 10 | Regression hardening | **Partial** — per-phase guard tests added; no final sweep |

### Migrations written this session (NONE DEPLOYED)

Apply in this order, in the Supabase SQL editor, **before** shipping an app
build from this branch:

1. `supabase/phase35_completion_videos.sql`
2. `supabase/phase36_direct_offer_threads.sql`
3. `supabase/phase37_profile_reviews_and_photos.sql`
4. `supabase/phase38_job_bid_counts_batch.sql`

Then `node scripts/verify-schema.mjs` — it has been extended with a block per
migration and should report all objects present. Until they are applied,
`verify-schema` will report phase35–38 as MISSING; that is expected and is
not a regression.

phase35/36/37 each **replace an existing function's signature** (drop + create
+ re-grant), so an app build that predates them will break against a migrated
database and vice versa. Deploy the SQL first, then the build. phase38 is
purely additive and can be applied at any time.

### Phase 1 — canonical job data (`01fb2e0`)

Root cause confirmed by reading the source: `jobs_in_cell()` (phase11/12)
predates the `photos` (phase13) and `videos` (phase34) columns, so anything
reached from the map carried no media at all. Separately, every list passed a
navigation-param snapshot that went stale the moment the poster edited.

- `lib/jobs.ts`: `fetchOpenJobById`, `fetchOpenJobsByIds`, `jobThumbnailUrl`.
  All read the same `OPEN_JOB_COLUMNS` allowlist the browse feed uses.
- `lib/hotspots.ts`: `fetchJobsInCell` keeps the RPC for *which* jobs are in a
  cell, then widens the projection for those ids in **one batched query**,
  falling back to the RPC's own rows if that read fails.
- `hooks/useJobDetail.ts` (new): `useOpenJobDetail` / `useOwnedJobDetail` —
  seed from the route param, re-read canonically on every focus. Distinct from
  `hooks/useJob.ts`, which is for screens navigated to by id alone.
- `JobDetailScreen` gains a "no longer available" state when the canonical read
  comes back empty.
- `HubCard` gained thumbnail / category+location / posting age.
  `fetchPendingBidsByWorker` now selects `photos, videos` so a pending-bid card
  can draw one.

**Deliberately not done:** owner Edit/Delete were NOT duplicated onto hub list
rows — they stay on the detail screen the card opens.

### Phase 2 — completion media (`fa6493f`)

`phase35_completion_videos.sql`: `jobs.completion_videos` + replaces
`transition_job_status()` with a 4-arg signature carrying it. Body is
phase31's, unchanged, with video validation mirroring the photo validation.

One combined "Add photos or video" control in `WorkerJobScreen`: the library
opens once for both types (`mediaTypes: ['images','videos']`), results are
partitioned, and limits are 5 photos / 1 video / 2 minutes / 100 MB. Anything
over a limit is refused with its own reason while everything under it is still
kept. Uploads happen on pick; "Mark complete" is disabled while one is in
flight.

**No storage change needed** — `{jobId}/completion/…` is already covered by
phase29's insert policy and phase26's delete policy, both of which key on the
first path segment being a job the caller is the assigned worker on.

`rejectionForPickedVideo()` in `lib/storage.ts` is now the one shared
format/length/size check, used by both PostJob and WorkerJob.

### Phase 3 — first-time direct offers (`249589f`) — the flagship fix

**Root cause (confirmed in source, correcting Session 1's reading):** Session 1
recorded the PDF page-3 behavior as "a designed gate, not a bug". That was
half right — it *was* deliberate — but the reason was structural, not a product
decision: phase18 required a request to live in an existing conversation, a
conversation only existed around a job, therefore `create_job_request()` had to
gate on a shared completed job. The gate existed to satisfy the schema.

`phase36_direct_offer_threads.sql` removes what forced it:

- `direct_threads` — one row per unordered pair (`user_a < user_b`), with the
  two read timestamps on the row.
- `messages.job_id` nullable + `messages.direct_thread_id`, exactly-one check.
- `job_requests.thread_job_id` nullable + `direct_thread_id` + `videos`.
- Message RLS keeps phase8's job branch and phase13's block/ban enforcement and
  adds a same-shaped direct-thread branch.
- `create_job_request()` — completed-job gate removed; thread resolution keeps
  the existing order (explicit → most recent shared completed job) and only
  falls back to a direct thread where phase18 used to raise. **Nobody's
  existing Hire Again conversation moves.**
- `respond_job_request()` — events post into whichever thread the request has;
  created job carries videos; a **retried accept returns the job it already
  created** instead of raising.
- `conversations` view is now a union of job threads and direct threads, still
  `security_invoker = true`.

**Why read state is on `direct_threads` and not in `message_reads`:**
`message_reads` is keyed `(user_id, job_id)` and the client upserts against
that exact conflict target. Making `job_id` nullable there would mean replacing
the primary key with partial unique indexes, which an `ON CONFLICT (user_id,
job_id)` upsert can no longer infer — it would break read receipts on every
existing conversation in order to add them to a new one.

**Known boundary, deliberate:** chat photo/voice attachments and message
reactions stay job-conversation only. Their storage paths and
`message_reactions.job_id` are keyed by job, so a direct thread has no path to
key an upload on. The composer hides both controls and the React menu item
there rather than offering an action guaranteed to fail. Text and offer cards
work fully. **If the user wants attachments in direct threads, that needs a new
storage prefix + policies and a `message_reactions` thread column — a further
migration, not a client change.**

`WorkerProfileScreen`: `canOffer` is now `signed in && not self && recipient
active` (via the new `isProfileActive()` → phase29's `is_profile_active` RPC,
because `banned` is not publicly readable). `canRehireWorker` still runs but
only chooses the wording.

### Phase 4 — profile reviews + review photos (`19738f6`)

`phase37_profile_reviews_and_photos.sql`. phase6's `reviews_select_party` is
**not widened**; two narrow SECURITY DEFINER readers are added instead
(`profile_reviews`, `profile_review_summary`), both requiring a signed-in
caller.

**The related job's TITLE is deliberately never returned, only its category** —
a job created by accepting a private direct offer never appears publicly and
its title is the client's own words about their own home.

`reviews.photos` (max 5) + `create_review()` 5-arg signature. Review photos go
to `reviews/<uid>/…` under two NEW narrow policies; neither of phase29's
existing job-photos branches was loosened (a review is written by either party,
so it matches neither).

New `screens/ProfileReviewsScreen.tsx`, registered in all five stacks.

### Phase 5 — confirmation dialogs (`83415c3`)

Accept bid and send-direct-offer moved onto `ConfirmDialog`. Accept/decline of
an offer were done in Phase 3. Counter-offer already used `AmountPrompt` (an
in-app modal with an amount field) and was reused rather than duplicated. OS
permission prompts untouched.

### Phase 9 (partial) — batched bid counts (`62aceb0`)

`phase38_job_bid_counts_batch.sql` adds `job_bid_counts(uuid[])` — the plural
of phase15's `job_bid_count()`, identical count, capped at 200 ids. This is the
blocker Session 1 documented and could not clear. `hooks/useBidCounts.ts` +
`BrowseJobCard` now show "No bids yet" / "1 bid" / "3 bids" (poster sees the
"pending" wording). An unknown count omits the line rather than guessing zero,
so cards degrade quietly until phase38 is deployed.

---

## Exact next action for the following session

1. Read this file, run `git log --oneline -8` and `git status` (expect clean,
   `62aceb0`).
2. **Phase 6 — video thumbnails and fullscreen.** Not started. Needs:
   - `npx expo install expo-video-thumbnails` (verify SDK-54 compatibility at
     `https://docs.expo.dev/versions/v54.0.0/` first — nothing is installed
     for this today, confirmed).
   - `jobs.videos` / `job_requests.videos` / `jobs.completion_videos` currently
     hold **plain URL strings**. A thumbnail needs `{ url, thumbnailUrl,
     durationMs, width, height, mimeType }`. Plan for a normalizer that accepts
     both shapes so legacy string entries keep working, and widen
     `jobThumbnailUrl()` (Phase 1 left it photos-only on purpose, with a
     comment) to fall through to a video's `thumbnailUrl`.
   - `components/JobVideo.tsx` is the single playback component and already
     uses `expo-video` with `nativeControls` / `contentFit="contain"` /
     `allowsFullscreen`. Extend it rather than writing a second player.
3. **Phase 7 — semantic worker matching.** Not started, largest remaining.
   Needs pgvector + an embedding store + a Supabase Edge Function + a provider
   adapter + a hybrid ranking RPC. `tests/hardening.test.mjs` already has
   "worker search ranks on stored evidence and claims nothing more" — read it
   before touching `screens/WorkerSearchScreen.tsx`, it constrains the copy.
   **No embedding provider is configured in this repo today** (checked). The
   deterministic search must stay as the labelled fallback, and fallback
   results must not be called AI.
4. **Phase 9 remainder — nearest-hotspot selection.** `hooks/useHotspots.ts`
   returns zone data but there is still no "nearest zone to the user" selector;
   `lib/geolocation.ts` has `resolveCurrentPlace()`. This is new geolocation
   logic plus a Map bottom sheet.
5. **Phase 10 — final regression sweep.** Per-phase guard tests exist; a whole
   final pass has not been done.

## Do not touch

- `stash@{0}` — "WIP international phone input after 5fc25be". Unrelated,
  preserved deliberately. (It was `stash@{1}` before this session dropped the
  Phase 1 WIP stash; the index shifted.)
- The frozen web/PWA surface (see CLAUDE.md).

## Validation performed this session

| Command | When | Result |
|---|---|---|
| `npm run lint` | after every phase | clean each time |
| `npm test` | after every phase | 16 pass / 1 fail |
| `npm run verify` | end of session | lint clean; 16/17 |

The single failure is the pre-existing `tests/pwa.test.mjs` `config.js`
version mismatch on the frozen web surface, documented in CLAUDE.md.

`node scripts/verify-schema.mjs` was **not run** this session — it requires
`.env` and would report phase35–38 as MISSING until they are deployed, which
is expected rather than informative right now. Run it *after* deploying.

**Nothing in this session has been tested on a real iPhone/Android device or
simulator.** Everything below is unverified on-device:
- completion-media picker (combined photo+video selection, duration rejection)
- the direct-offer flow end to end, including a first-time offer to someone
  with no shared history
- the direct-thread conversation (header, composer with attachments hidden)
- the reviews screen (pagination, photo viewer)
- every new `ConfirmDialog` (backdrop, Android hardware back)

## Known failure (pre-existing, unrelated)

`tests/pwa.test.mjs` → expects `config.js?v=20260731-1`, ships `-2`. Both sides
are on the frozen web/PWA surface and are left alone deliberately.

## Commits (this session)

| Hash | Subject |
|---|---|
| `01fb2e0` | refactor: unify job data and marketplace presentation |
| `fa6493f` | feat: support completion photo and video evidence |
| `249589f` | feat: enable secure first-time direct job offers |
| `19738f6` | feat: add profile review pages and review photos |
| `83415c3` | feat: add consistent marketplace confirmation dialogs |
| `62aceb0` | feat: show bid counts on open-job cards |

---

## SESSION 2 — Bounded Profile Fix Pass (complete, HEAD `5fc25be`)

Two isolated Profile/Edit Profile fixes.

**Subphase 1 — avatar action menu (`5fc25be`).** There was no regression in the
sense of something deleted: a camera capture path never existed at all. The
avatar's short tap called library-only `pickAvatar()`; the fuller menu was
behind a 350ms long-press. Fixed by giving the short tap a reused `ActionSheet`
(library / camera / remove / cancel), adding
`ImagePicker.requestCameraPermissionsAsync()` + `launchCameraAsync()`, and
routing removal through `ConfirmDialog`. Both paths stage the same
`pendingAsset` draft, so there is still exactly one upload implementation.
Storage deletion on avatar removal was deliberately not added —
`uploadAvatar()` writes a stable per-user path with `upsert: true`, so there is
no orphan accumulation.

Known minor inconsistency, untouched: the long-press menu's "Change photo" row
still calls `pickAvatar()` directly rather than opening the new sheet.

**Subphase 2 — international phone input. NOT COMPLETED.** Preserved in
`stash@{0}`.

**Dependency decision — read this before touching phone code again:**
`react-native-international-phone-number@0.12.3` depends on
`react-native-country-select@0.3.9`, which depends on
`@agnoliaarisian7180/string-argv@"latest"` — a nonexistent package under an
unofficial-looking personal scope, standing in for the well-known unscoped
`string-argv`. Confirmed via `npm view <pkg> dependencies` on each package in
the chain. An unpinned `"latest"` dependency on a currently-404ing scoped
package is the shape of a dependency-confusion supply-chain attack: harmless
today because nothing is published there, but the account behind that scope
could publish at any time and it would be pulled in on the next install.
**This chain must not be installed.** Re-verify rather than assuming it was a
transient fluke.

Installed instead: `libphonenumber-js@1.13.10` only — zero dependencies of its
own, pure JS, Expo-Go safe, used via the `libphonenumber-js/mobile` entry
point. `lib/countries.ts` (in the stash) hand-authors a complete ISO-3166-1
name table and derives flag emoji from the ISO2 code, because
`Intl.DisplayNames` is not reliably available in Hermes without a second
polyfill dependency.

---

## SESSION 1 — Original bounded pre-reset pass (complete, HEAD `713c6fa`)

Subphases A–D, all frontend-only, no migrations:

| Hash | Subject |
|---|---|
| `a734a15` | docs: add BRAZOS implementation handoff |
| `5e3fc10` | feat: add BRAZOS marketplace confirmation dialog |
| `40ea046` | polish: improve own-profile actions |
| `c174de3` | polish: clarify job discovery navigation |
| `713c6fa` | feat: show job ownership and bid status |

Covering: the `ConfirmDialog` component (listed-price bid + delete job),
own-profile "Edit" button and "Add photos" restyle, Home/Map/list labels
("Find Jobs Nearby", "See All Jobs", "All Open Jobs"), and the "Your job"
ownership badge.

**Settings icon (requirement 10): skipped, deliberately.** There is no
dedicated Settings *screen* — settings live inline in a `Card` on
`ProfileMain` itself, directly below where Edit already is. An icon that
re-opens the screen it is already on would be the decorative dead action the
requirement itself forbids. Revisit only if a real Settings route is added.

**"3 photos problem" (requirement 10 caption): still unresolved.** The PDF
names it only as a caption — no screenshot, description, or repro anywhere.
Not investigated, not guessed at. Needs a follow-up description from the user
before it can be scoped at all.
