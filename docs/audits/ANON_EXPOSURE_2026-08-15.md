# residual anon exposure - phase70/71/72 audit

Run date: 2026-08-14 (local clock). Base: `mainexpo` @ `7a25013`, clean tree,
baseline `npm run verify` green (519 tests, 0 fail).

No database was contacted at any point in this run, and no SQL was executed.
Every claim below is derived from the SQL text under `supabase/`, the
TypeScript under `lib/`, `screens/`, `components/`, `hooks/`, `navigation/`,
the Deno sources under `supabase/functions/`, `scripts/`, and `tests/`. Claims
that only the live database can settle are labelled as such and are taken from
the staging inventory in the dispatch prompt, read from `zzkumxcjtbqoselzptig`
on 2026-08-15: phase67, phase68, phase69 and phase69_default_privileges are
applied and verified there, and exactly two functions in schema `public` are
callable by `anon` - `unsend_message(uuid)` (SECURITY DEFINER, the bug) and
`job_categories_expanded()` (SECURITY INVOKER, deliberate).

## Verdict up front

No stop condition fired.

- **Q1**: `unsend_message` has exactly one functional caller and it always
  carries a signed-in JWT. The only null-uid invoker is the verify-schema
  existence probe, which by contract treats a refusal as proof of existence
  and cannot be broken by the guard or the revoke. No `service_role` caller,
  so phase70 grants `authenticated` only.
- **Q2**: exactly one live fail-open guard compares against `auth.uid()` with
  `<>` - `unsend_message` (Finding A). Four more instances of the same shape
  exist one variable-hop away, all in superseded phase29/phase34 bodies whose
  live replacements null-check first. `phase60:101` is the house-correct
  `is distinct from` reference form.
- **Q3**: every third-party review read goes through the two SECURITY DEFINER
  RPCs; the one direct `from('reviews')` read is self-scoped
  (`reviewer_id = user.id`) at every call site; there are zero SECURITY
  INVOKER readers and zero views over `reviews`. **Phase71 proceeds.**
- **Q4**: no `.list()` call exists in app code; `.createSignedUrl()` touches
  only the chat buckets; `.getPublicUrl()` is offline URL construction. Every
  calling screen is below the auth gate. Phase72 affects no app surface.
- **Q5**: no test asserts on the policy name `"reviews are viewable by
  everyone"`, the `unsend_message` body text, or the roles of `avatars_read` /
  `job_photos_read`. The Section 6 test-edit exception is not needed.

## Q1. Every caller of `unsend_message`

| # | Site | Kind | auth.uid() at call time |
| --- | --- | --- | --- |
| 1 | `lib/messages.ts:93-94` - `unsendMessage()` -> `supabase.rpc('unsend_message', { p_message_id })` | app RPC wrapper | **non-null.** Sole invoker is `screens/ChatScreen.tsx:773` (`handleUnsend`, long-press menu, gated client-side by `canUnsend()` at `lib/messages.ts:85`). ChatScreen renders inside the mode trees under `navigation/ModeShell.tsx`, which mounts only after auth + legal + setup resolve, and the shared client carries the session JWT. |
| 2 | `scripts/verify-schema.mjs:322-323` - phase25 group probe `checkRpc('unsend_message', { p_message_id: ZERO_UUID })` | harness existence probe, publishable key | **null - but not a functional caller.** `checkRpc` (`scripts/verify-schema.mjs:141-155`) counts ANY non-PGRST202 answer as existence. Today it logs `exists (responded 400)` on P0001 `Message not found`; after phase70 it logs `exists (responded 403)` on 42501. The guard cannot break it, which is the stop condition's whole concern. |

Nothing else calls it:

- `supabase/*.sql`: only `phase25_unsend_messages.sql:18` (creates it) and
  `phase64_security_definer_search_path.sql:86` (`alter function ... set
  search_path`) name it. No trigger body, no other function body.
- `supabase/functions/send-push/index.ts`, `supabase/functions/worker-search/index.ts`:
  zero references.
- `tests/`: zero references.
- `hooks/useChat.ts:76` and `hooks/useConversationChat.ts:120` mention Unsend
  in comments about realtime UPDATE handling; they never call the RPC.

**No caller runs with a null `auth.uid()` as a functional invocation - no
stop. No `service_role` caller - phase70 emits no `service_role` grant.**

## Q2. Guards comparing against `auth.uid()` without null safety

### Direct comparisons in guard position (complete, repo-wide)

| file:line | Function | Form | Verdict |
| --- | --- | --- | --- |
| `supabase/phase25_unsend_messages.sql:36` | `unsend_message` | `if v_sender_id <> auth.uid() then raise` | **FAIL-OPEN** under a null uid (`x <> NULL` is NULL, branch never fires). Per the Section 2 live inventory this is the ONLY anon-reachable function with this shape. Finding A; phase70 fixes it. |
| `supabase/phase60_jobs_delete_policy_recursion.sql:101` | `can_delete_own_job` | `if v_client_id is distinct from auth.uid() then raise` | Null-safe. The house-correct form; listed as the reference pattern, not a finding. |

### The same defect one variable-hop away

`v_user/v_actor/v_client := auth.uid()` captured, then compared with `<>`
with **no null check anywhere in the body**:

| file:line | Function (body revision) | Guard | Live status |
| --- | --- | --- | --- |
| `supabase/phase29_security_hardening.sql:418` | `update_job_details` (phase29, 4-arg) | `if not found or v_job.client_id <> v_user` | Superseded by phase34:190, then by the LIVE phase49 body, which null-checks first (`phase49:285`). |
| `supabase/phase29_security_hardening.sql:541` | `accept_bid` (phase29) | `if not found or v_job.client_id <> v_user` | Superseded by the LIVE phase30 body: `if not found or v_user is null or v_job.client_id <> v_user` (`phase30:24`). |
| `supabase/phase29_security_hardening.sql:597` | `transition_job_status` (phase29, 3-arg) | `if not found or v_job.assigned_worker_id <> v_user` | Superseded through phase31:28 -> phase35:100 -> phase58:160 -> LIVE phase68:211, every one inline null-safe. |
| `supabase/phase34_job_videos.sql:190` | `update_job_details` (phase34, 9-arg) | `if not found or v_job.client_id <> v_user` | Superseded by the LIVE phase49 body (null check at `phase49:285`). |

None of the four is anon-reachable: all are granted to `authenticated` only
(phase32 for their own grants, phase69 for the pre-phase32 stragglers), and
the Section 2 live inventory confirms only `unsend_message` and
`job_categories_expanded` answer to `anon`.

### Everything else, verified null-safe

All remaining captured-uid guards were correlated capture-line against
null-check-line; every body checks `is null` before (or inline with) its
first comparison: phase18:199/296, phase20:117, phase21:90, phase29:148 /
339 / 502 / 663, phase30:24, phase31:28, phase34:90, phase35:100,
phase36:236/289/428, phase37:121, phase39:550, phase40:120, phase42:100,
phase46:327/527/615/675, phase49:137/285, phase50:202/279/380/448/553/636/702,
phase51:227/290/381/459/527/594/651, phase53:158, phase55:34, phase58:78/160,
phase61:237, phase63:90, phase67:347, phase68:211/341, phase68_rollback:155/285.

Policy expressions and WHERE filters using `= auth.uid()` fail CLOSED under a
null uid (a NULL comparison hides the row) and are not guards; they are out of
scope by construction.

**AUDIT ONLY: nothing beyond phase70 is changed by this run.**

## Q3. Every consumer of `reviews` data

### (i) RPC readers - `profile_reviews` / `profile_review_summary`

| Site | Detail |
| --- | --- |
| `lib/reviews.ts:85` (`fetchProfileReviews`) | `rpc('profile_reviews', ...)` - third-party page read, by design. |
| `lib/reviews.ts:105` (`fetchProfileReviewSummary`) | `rpc('profile_review_summary', ...)`. |
| `screens/ProfileReviewsScreen.tsx:62-63, 91` | The only app consumer of both wrappers. |
| `scripts/verify-schema.mjs:498-501` | Existence probes of both RPCs; refusal-tolerant `checkRpc`. |

Write path, for completeness: `lib/reviews.ts:36` (`createReview` ->
`rpc('create_review')`) from `components/ReviewSection.tsx`, and
`scripts/lifecycle-proof.mjs:351-356` calling `create_review` with two
signed-in sessions.

### (ii) Direct PostgREST table reads

| Site | Whose reviews | Verdict |
| --- | --- | --- |
| `lib/reviews.ts:140-146` (`fetchMyReviewForJob`) - `.from('reviews')` filtered `.eq('reviewer_id', reviewerId).eq('job_id', jobId)` | **CURRENT USER's own.** Every call site passes `reviewerId={user.id}`: `components/ReviewSection.tsx:139`, hosted at `screens/ClientJobDetailScreen.tsx:976-979`, `screens/ReviewAndTipScreen.tsx:218-221`, `screens/WorkerJobScreen.tsx:588-591`. | Covered by `reviews_select_party` (`reviewer_id = auth.uid()`); unaffected by the phase71 drop. |
| `scripts/verify-schema.mjs:497` - `checkColumn('reviews', 'photos')`, phase37 group | n/a - `limit=0` schema probe with the publishable key | Needs the anon SELECT **grant** (deliberately kept by phase71), never a row. With the policy dropped it still answers 200 with zero rows. |

### (iii) SQL readers inside SECURITY DEFINER bodies owned by the table owner - exempt from RLS

| Site | Detail |
| --- | --- |
| `supabase/phase37_profile_reviews_and_photos.sql:200` | `profile_reviews` body, `from public.reviews r`. SECURITY DEFINER (`:187`), created by the same postgres-role migration channel that owns `reviews`. phase71's precondition (c) proves `prosecdef` and owner-equality in-database before dropping anything. |
| `supabase/phase37_profile_reviews_and_photos.sql:242` | `profile_review_summary` body, same properties (`:231`). |
| `supabase/phase6_reviews_and_storage.sql:67, 69` | `recompute_profile_rating()` trigger function (SECURITY DEFINER, `:59`) - counts/averages ALL of a reviewee's rows. Its correctness after the drop rests on the owner's RLS exemption, which phase71's precondition (b) (`relforcerowsecurity` false) proves in-database. |
| `supabase/phase29_security_hardening.sql:679`, `supabase/phase37_...sql:148` | `create_review` bodies - writers, not readers. |
| `scripts/seed-review.mjs:36, 153-156`; `scripts/lifecycle-proof.mjs:112` | Owner-context psql over `SUPABASE_DB_URL_STAGING` (refuses the production ref); RLS-exempt, staging-only fixtures. |

### (iv) SECURITY INVOKER readers or views - the phase71 blockers

**None.** No `create view` in `supabase/*.sql` reads `reviews`
(`conversations` reads messages+jobs; `v_bids_projection_drift` reads
job_offers/bids). No SECURITY INVOKER function reads it
(`job_categories_expanded` reads the enum catalog).

**No (ii) third-party read and no (iv) reader exists -> phase71 is written.**

## Q4. App calls against buckets `avatars` / `job-photos` (informational)

- `.list()`: **zero occurrences** in app code (`*.ts`, `*.tsx`, `*.mjs`).
- `.createSignedUrl()`: `lib/storage.ts:53` only - `chat-photos` /
  `chat-audio`, not in scope.
- `.getPublicUrl()`: `lib/storage.ts:82` (inside `uploadAsset`), an OFFLINE
  URL constructor - no request is made, so no policy affects it. Reached from:

| Helper | Bucket | Calling screen | Auth gate |
| --- | --- | --- | --- |
| `uploadAvatar` (`lib/storage.ts:90`) | avatars | `screens/ProfileScreen.tsx:254` | below |
| `uploadJobPhoto` (`:102`) | job-photos | `screens/WorkerJobScreen.tsx:196` | below |
| `uploadCompletionVideo` (`:280`) | job-photos | `screens/WorkerJobScreen.tsx:228` | below |
| `uploadJobAttachment` (`:183`) | job-photos | `screens/PostJobScreen.tsx:547` | below |
| `uploadJobVideo` (`:311`) | job-photos | `screens/PostJobScreen.tsx:560` | below |
| `uploadReviewPhoto` (`:197`) | job-photos | `components/ReviewSection.tsx:169`, hosted by ClientJobDetail / ReviewAndTip / WorkerJob | below |

Every host screen lives inside `CustomerRoot` / `WorkerRoot` beneath
`navigation/ModeShell.tsx`, which mounts only after auth + legal + setup have
resolved (`ModeShell.tsx:33-36`) - all BELOW the auth gate. Display surfaces
render stored URLs with `<Image>` and make no storage API calls. phase72
alters the two SELECT policies only; uploads (INSERT policies) and deletes
(phase26 DELETE policy) are untouched.

## Q5. Test assertions on the literals this run changes

**None.**

- `"reviews are viewable by everyone"`: appears only in `SECURITY_AUDIT.md`,
  `AUDIT_2026-08-12.md` and `docs/archive/` - never in `tests/`.
- `unsend_message` body text: no test reads `phase25_unsend_messages.sql` or
  asserts on the function's text.
- `avatars_read` / `job_photos_read` roles: no `tests/` hit.
  `tests/hardening.test.mjs:197-208` asserts the INSERT policies
  (`avatars_insert`, `job_photos_insert`) in `phase29`, which this run does
  not touch.

Adjacent suites checked and unaffected:

- `tests/reviews.test.mjs:23-31` asserts `phase54_review_integrity.sql` text -
  file untouched; phase71 is a new file.
- `tests/hardening.test.mjs:400-456` asserts `phase6` / `phase37` text -
  files untouched.
- `tests/platformFee.test.mjs:32-52` iterates EVERY `supabase/*.sql` for
  `insert into public.payments` - the six new files contain none.
- `tests/governance.test.mjs` constrains `HANDOFF.md` (no `HEAD:` stamp, no
  retired names without same-line negation) - the C6 rewrite complies.

The Section 6 narrow test-edit exception is therefore not needed; any test
failure in this run would be a genuine STOP.
