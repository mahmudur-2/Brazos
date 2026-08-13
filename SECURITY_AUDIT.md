# BRAZOS SECURITY AUDIT — staging, 2026-08-12

Scope: `public` schema, `storage`, and the client bundle, on the **staging**
project `zzkumxcjtbqoselzptig`. Production was never contacted.

Method: live introspection of `pg_policy`, `pg_class`, `pg_proc`,
`information_schema` grants and `storage.buckets`/`storage.objects`, plus
**empirical role simulation** (`set local role anon` / `authenticated` with
`request.jwt.claims`) for every exposure claim that could be tested. Where a
finding says "confirmed", it means a query was run as that role and the row
count is quoted. Secrets are referenced by file and variable name with values
redacted throughout (R10).

## Severity counts

| Severity | Count |
|---|---|
| CRITICAL | **0** |
| HIGH | **3** |
| MEDIUM | **6** |
| LOW | **5** |

## Was anything introduced by Phases 1–4 of this run?

**No.** Not one finding below originates in phase60, phase61, phase62 or
phase63. Each was audited against the same bar as the pre-existing surface:

- **phase60 `can_delete_own_job(uuid)`** — SECURITY DEFINER, `stable`, explicit
  `set search_path = public, pg_temp` (already in the safe form the rest of this
  audit recommends), no dynamic SQL, no `EXECUTE`, reads only `jobs`, `bids`,
  `job_offers`, returns a bare boolean, `revoke all … from public, anon` +
  `grant execute … to authenticated`. It is an *authorization* function, so the
  risk to test is whether it leaks: a non-owner receives `false` for
  "not yours", "has bids", "has offers" and "no such job" alike — verified, so
  it cannot be used to probe for another user's jobs. **Access is identical to
  the policy it replaced**, term for term (see FINDINGS.md Phase 1).
- **phase61 `create_offer` / `notify_on_message`** — the new root message is
  written into the pair's `direct_threads` row, which `messages` RLS already
  restricts to those two participants (`phase36:110-125`); both parties could
  already see the bid amount through `job_offers` party-only SELECT. No new
  reader gains anything. The `notify_on_message` change only **suppresses** a
  notification; it cannot widen delivery.
- **phase62 `notify_on_offer_counter`** — sends a first name where it previously
  sent a full legal name, i.e. strictly *less* PII in a push payload.
- **phase63 `counter_offer`** — same body, same locks, a larger numeric cap.

No 5-REVERT was required.

---

# HIGH

## H-1 · The `job-photos` storage bucket is public **and enumerable by anonymous callers**

- **Where:** `storage.buckets.id = 'job-photos'`, `public = true`; policy
  `job_photos_read` — `SELECT` to role `public`, `USING (bucket_id = 'job-photos')`.
  `anon` additionally holds `SELECT` on `storage.objects`.
- **Confirmed, not inferred:** running as the `anon` role,
  `select count(*) from storage.objects where bucket_id = 'job-photos'` returned
  **8**. Anonymous callers can therefore **list object paths**, not merely fetch
  a URL they already knew.
- **Attack:** anyone holding the app's anon key — which is, by design, inlined
  into every shipped bundle (`lib/supabase.ts:4`, `babel.config.js:7-15`) and so
  is public — can enumerate every object in the bucket and download all of them.
  That bucket holds job posting photos, **completion evidence**, and review
  photos: home exteriors and interiors, faces, vehicles, and anything visible at
  a customer's address. `AUD-P3-24` separately records that private
  direct-offer job media lands in this same bucket, so media from jobs that were
  never public at all is included.
- **Why it is HIGH and not MEDIUM:** the two mitigations one would normally
  claim — "you need the URL" and "paths are unguessable" — are both false here,
  because listing is permitted.
- **Not fixed (report-only per the run brief).** Flipping a bucket private
  breaks every existing image URL in the app, so it needs your decision plus a
  signed-URL migration. `chat-photos` and `chat-audio` are already private with
  correct party-scoped read policies (`chat_photos_read_party`,
  `chat_audio_read_party`) and are the model to copy.

## H-2 · Every review is readable by anonymous callers, exposing the whole who-worked-for-whom graph

- **Where:** policy `reviews are viewable by everyone` on `public.reviews` —
  `SELECT`, role `public` (so `anon` too), `USING (true)`. `anon` holds table
  `SELECT` with **no column restriction**.
- **Confirmed:** as the `anon` role, `select count(*) from public.reviews`
  returned **8** — i.e. every row in the table.
- **Attack:** an unauthenticated party with the public anon key reads every
  review row in full: `rating`, free-text `comment`, `job_id`, `reviewer_id`
  and `reviewee_id`. That is not just "reviews are public" — joined on
  `reviewer_id`/`reviewee_id` it is a complete, downloadable graph of which
  customer hired which worker, when, and for what, plus whatever customers wrote
  in free text. `profiles` is correctly closed to `anon`, but the ids are stable
  join keys against anything else that leaks.
- **Contrast:** `jobs`, `messages` and `bids` are properly closed — as `anon`,
  all three returned **0 rows**. `reviews` is the single unauthenticated
  full-table read in `public`.
- **Not fixed (report-only).** Narrowing an existing policy is explicitly out of
  scope for this run, and this one is load-bearing for whatever renders public
  worker reputation. The fix is a policy restricted to `authenticated` plus a
  column grant that drops `job_id`, or a `security definer` reader that returns
  only rating/comment aggregates.

## H-3 · The `avatars` bucket is public and enumerable

- **Where:** `storage.buckets.id = 'avatars'`, `public = true`; policy
  `avatars_read` — `SELECT` to role `public`, `USING (bucket_id = 'avatars')`.
- **Attack:** same enumeration path as H-1. Every user's profile photo is
  downloadable in bulk by an unauthenticated caller and, because upload paths are
  `<uid>/…` (see `avatars_update`'s
  `(storage.foldername(name))[1] = auth.uid()::text`), each photo is directly
  attributable to a user id. Face images at scale, bound to stable identifiers.
- Rated HIGH rather than MEDIUM only because it composes with H-2: review rows
  hand an anonymous caller the user ids, and this hands them the faces.
- **Not fixed (report-only).**

---

# MEDIUM

## M-1 · 28 SECURITY DEFINER functions pin `search_path = public` without `pg_temp`

- **Where:** 28 of 87 SECURITY DEFINER functions in `public`. Full list in
  FINDINGS.md; they include `enqueue_notification`, `is_blocked_between`,
  `handle_new_user`, `notify_display_name`, `unsend_message`, `ban_user`,
  `unban_user`, `admin_open_reports`, `jobs_within_radius`, `job_hotspots`,
  `worker_job_stats`, `register_push_token`, `claim_notification_batch`.
- **Attack:** PostgreSQL searches `pg_temp` **first** for relation names unless
  `pg_temp` appears explicitly in `search_path`. A function declared
  `set search_path = public` therefore still resolves unqualified table
  references against the caller's temp schema before `public`. Any role that can
  create temp tables — `authenticated` can — could create `pg_temp.jobs` and
  have a SECURITY DEFINER function read *their* table while running as
  `postgres`. (Functions and operators are never resolved from `pg_temp`, so the
  exposure is limited to unqualified **relation** references.)
- **Zero functions are missing `search_path` altogether** — the literal FIX-1
  target was empty. This is the real residue.
- **FIXED** in this run — see "Applied fixes" below.

## M-2 · `anon` holds INSERT / UPDATE / DELETE / TRUNCATE on 14 tables

- **Where:** `anon` has the full DML set plus `TRUNCATE` on `banned_phones`,
  `blocks`, `conversations`, `direct_threads`, `job_requests`,
  `legal_acceptances`, `message_reactions`, `message_reads`, `messages`,
  `mutes`, `notification_prefs`, `portfolio_items`, `push_tokens`, `reports`;
  and `DELETE`/`TRUNCATE` on `bids`, `jobs`, `job_locations`, `reviews`.
- **Why it is MEDIUM, not HIGH:** RLS is enabled on all of them and every DML
  policy requires `auth.uid()`, which is NULL for `anon` — confirmed by the
  0-row reads in H-2's contrast. And `TRUNCATE`, which **bypasses RLS entirely**,
  is not expressible through PostgREST, which speaks only
  SELECT/INSERT/UPDATE/DELETE. So there is no path from the shipped anon key to
  these grants today.
- **Why it is still a finding:** the entire protection is "RLS happens to deny
  it" and "the API happens not to expose TRUNCATE". One permissive policy added
  later, or one direct connection as `anon`, converts a grant nobody intended
  into data loss. Grants should not be the layer you are relying on being
  unreachable.
- **Not fixed (report-only** — revoking grants from `anon` is explicitly on the
  do-not-touch list, and a wrong revoke silently breaks sign-up/auth flows).

## M-3 · `authenticated` holds TRUNCATE on `jobs`, `bids`, `reviews`, `job_locations`

Same mechanism and same reachability argument as M-2 (`TRUNCATE` is not a
PostgREST verb), one trust level closer to an attacker. **Report-only.**

## M-4 · Two tables have RLS enabled with **zero** policies while holding broad grants

- **Where:** `public.banned_phones` (`rls_on = t`, 0 policies, `anon` and
  `authenticated` hold full DML + TRUNCATE) and `public.worker_semantic_docs`
  (`rls_on = t`, 0 policies).
- **Today this is fail-closed** — RLS with no policy denies everyone, so neither
  table is readable or writable by a client role right now. That is the correct
  outcome by accident, not by design.
- **Attack (latent):** the tables hold, respectively, banned phone numbers and
  worker semantic documents. A single future `create policy … using (true)` — the
  reflex fix when someone finds a feature "doesn't work" — opens both to
  everyone, because the grants are already maximal. The grant and the policy
  disagree about intent, and only the policy is holding the line.
- **Report-only** (enabling/adjusting policies is on the do-not-touch list).

## M-5 · `v_bids_projection_drift` runs with its owner's privileges

- **Where:** `public.v_bids_projection_drift`, `reloptions` empty — no
  `security_invoker`. Owner `postgres`, which holds `BYPASSRLS`.
- **Not currently exploitable:** grants are `postgres` and `service_role` only —
  **neither `anon` nor `authenticated` can select it at all** — and both
  grantees already hold `BYPASSRLS`, so the view grants them nothing they did not
  already have. The client never references it (`AUD` DB-7 uses it as an ops
  drift check).
- The one view the client *does* select from, `public.conversations`
  (`lib/conversations.ts:68-72`), **already carries `security_invoker = true`**
  (set at `phase36:611-612`, pinned by `tests/hardening.test.mjs:397`). The
  "silent full-table-read hole" this class is famous for does not exist here.
- **FIXED** in this run as defence in depth — see below.

## M-6 · `start.ps1` holds a staging Postgres URL and a Stripe test secret in plaintext on disk

- **Where:** `start.ps1` — variables `SUPABASE_DB_URL_STAGING`,
  `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY` (`sk_test_` prefix),
  `STRIPE_PUBLISHABLE_KEY`. **Values redacted; not reproduced anywhere.**
- **Attack:** anyone reading that workstation, a synced OneDrive copy, a backup,
  or an over-broad agent session gets **direct Postgres access to staging,
  bypassing every RLS policy in this document**, plus Stripe test-mode API
  control.
- Held at MEDIUM because the file is untracked, is gitignored (`.gitignore:48`,
  with a comment saying exactly why), has **never** been committed
  (`git log --all -- start.ps1` is empty), and the Stripe key is test-mode. It
  becomes CRITICAL the moment that key is swapped for `sk_live_` or the DB URL is
  pointed at production.
- **Report-only** — this needs credential rotation and a secrets-manager
  decision, not a code edit.

---

# LOW

## L-1 · `profiles` row filter is `true`; only column grants restrict it

`profiles_select_authenticated` is `SELECT … USING (true)` for `authenticated`,
so every signed-in user can read every profile **row**. The actual protection is
the column grant, which is correct and tight: `authenticated` may select 15
columns and is denied `phone`, `banned`, `is_admin`, `active_mode`,
`stripe_account_id` and `created_at`. `anon` has **no** column SELECT on
`profiles` at all. Working as designed; recorded because a future
`grant select on profiles` would instantly widen it, with no policy change to
review.

## L-2 · The exact-address invariant holds, but not where the docs say

`CLAUDE.md` and `BRAZOS_MASTER_PLAN.md` state that the exact address lives in
`job_private_details`, owner + hired worker only. **`public.job_private_details`
does not exist on staging.** `address_line`, `lat` and `lng` live on
`public.job_locations`, protected by `job_locations_select_party` —
`USING (exists (select 1 from jobs j where j.id = job_locations.job_id and
(j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())))`. So the
invariant is enforced in RLS, by the party rule the docs describe, under a
different table name. Documentation defect, not a security defect.

## L-3 · `job_locations_delete_owner` is unreachable

`authenticated` holds no `DELETE` grant on `job_locations`, and staging carries
only one policy on that table (`job_locations_select_party`). `phase14:46-55`
created a delete policy for the edit flow; it is not present. `updateJob()`'s
stale-coordinate cleanup therefore deletes 0 rows silently. Functional, not a
security exposure — a stale map pin survives an address edit.

## L-4 · `npm audit --omit=dev`: 25 advisories — 14 high, 11 moderate, **0 critical**

All high advisories are **build-time tooling**, not app runtime: `expo` (direct)
and `react-native` (direct) pull `@expo/cli`, `@expo/metro`, `@expo/metro-config`,
`metro`, `metro-config`, `metro-transform-worker`,
`@react-native/community-cli-plugin`, and transitively `postcss`
(GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849,
GHSA-fxqj-rqcc-2cmp), `js-yaml` (GHSA-5p4m-2wfm-xmqj), `image-size`
(GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq), `nanoid` (GHSA-2v37-7h3g-55p8),
`brace-expansion` (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895), and `uuid` via
`xcode` → `@expo/config-plugins`. The exploit surface is a developer machine or
CI worker processing hostile input, not an end user's device.
**REPORT-ONLY — nothing installed, updated or fixed.** Remediation means an Expo
SDK bump, which is a release decision.

## L-5 · Client-bundle secrets: clean, with two notes

**No private key material is reachable from the client bundle.** The only
credential inlined is `SUPABASE_KEY`, whose decoded `role` claim is `anon` —
expected and not a finding. Verified four ways: the `@env` type surface is
limited to two names (`env.d.ts:2-5`); only `lib/supabase.ts:4` and
`lib/supabase.web.ts:4` import from `@env`; four test files already assert that
shipped source contains no `service_role`; and the built web bundle
(`dist/client/_expo/static/js/web/index-*.js`) contains zero JWT-shaped literals
and zero project refs. No `sk_live`, `rk_live`, `AIza`, `AKIA`, `ghp_`, `xoxb-`
or `-----BEGIN` anywhere in the repo. No secret-bearing file is tracked or has
ever been committed (`.env` is gitignored at `.gitignore:44` and absent from all
history). Two notes:

- Plaintext test-account passwords sit in `.env` under the key names
  `PROBE_WORKER_A_PASSWORD`, `PROBE_WORKER_B_PASSWORD`,
  `PROBE_CUSTOMER_PASSWORD` (values redacted). Untracked and gitignored; they
  authenticate as three seeded staging fixtures.
- The EAS production gate does not fail closed on an unresolvable key ref:
  `scripts/supabase-ref.mjs:25-29` returns `null` for the newer
  `sb_publishable_…` format and `scripts/eas-build-pre-install.mjs:47` treats a
  null key ref as a pass. The `SUPABASE_URL` check still holds the line, so the
  impact is a weaker guarantee than the comment at `:16` claims, not a leak.

---

# Cross-tenant leakage — traced policy by policy (5c)

Every row below was traced through the live policy text, and the "blocked by"
column says **RLS** only where a policy — not the UI — does the work.

| Can X read Y? | Verdict | Blocked by |
|---|---|---|
| A worker reads another worker's bid amount on the same job | **No** | RLS. `bids`: `workers view own bids` (`auth.uid() = worker_id`) and `bids_select_own`; the only other reader is the job owner (`bids_select_job_owner`, `job owner views bids on their job`). `job_offers` has exactly one SELECT policy, party-only (`customer_id = auth.uid() or worker_id = auth.uid()`), and `authenticated` holds **SELECT only** on it. |
| A customer reads another customer's jobs | **No** | RLS. `jobs` SELECT policies are `jobs_select_own`, `jobs_select_assigned_worker`, `jobs_select_offer_party`, and `jobs_select_open` (which is restricted to `status='open' and visibility='open_market'` and an unbanned owner). Draft/assigned/completed jobs of others are unreachable. |
| A user reads another user's messages | **No** | RLS. `messages` is party-scoped through either the job (`client_id`/`assigned_worker_id`) or the `direct_threads` pair. Confirmed: as `anon`, `messages` returns 0 rows. |
| A user reads another user's payments / earnings | **No** | RLS. `payments` has one policy — `parties view own payments`, `USING (auth.uid() = payer_id or auth.uid() = payee_id)` — and `authenticated` holds **SELECT only**. |
| A user reads another user's payout details | **No** | Column grant. `profiles.stripe_account_id` is not in `authenticated`'s SELECT column list. |
| A user reads another user's phone | **No** | Column grant (`phone` excluded), plus `anon` has no profile column grant at all. |
| **Anyone unauthenticated reads every review** | **YES** | **Nothing** — see H-2. |
| **Anyone unauthenticated lists and downloads all job photos** | **YES** | **Nothing** — see H-1. |

# Money-path writes (5e)

`authenticated` holds **SELECT only** on `payments`, `job_offers`,
`job_disputes` and `notification_outbox` — no INSERT, no UPDATE, no DELETE. It
cannot write an amount anywhere. A worker cannot set their own payout figure and
a customer cannot alter an agreed price after acceptance, because there is no
grant through which to try: every mutation funnels through SECURITY DEFINER RPCs
that re-derive the actor from `auth.uid()`. `jobs` and `bids` retain
`DELETE` (governed by `jobs_delete_own`, now phase60's helper) but not
`INSERT`/`UPDATE`, which `phase29:297-306` revoked. **No finding.**

# SECURITY DEFINER inventory (5f)

87 SECURITY DEFINER functions in `public`.

- **Missing `search_path` entirely: 0.**
- Pinned `search_path = public, pg_temp` (the safe form): 59.
- Pinned `search_path = public` only: 28 → **M-1**, fixed below.
- **Dynamic SQL: none.** No `EXECUTE format`, `EXECUTE '…'` or string-concatenated
  SQL in any SECURITY DEFINER body.
- None of the 28 creates or references a temp relation, which is what made M-1's
  fix provably safe.
- `enqueue_notification(...)` is executable by `anon` and by `public`, along with
  16 other functions — but 15 of those are trigger functions (`notify_on_*`,
  `handle_new_user`, `recompute_profile_rating`, `enforce_portfolio_cap`,
  `create_default_notification_prefs`, `close_requests_on_block`), which cannot
  be invoked directly in a useful way. The genuinely callable ones are
  `enqueue_notification`, `is_blocked_between`, `job_categories_expanded`,
  `job_request_parties_ok`, `notify_display_name`, `notify_nearby_for_job` and
  `unsend_message`. `notify_display_name(uuid)` returns a display name for an
  arbitrary uuid, and `enqueue_notification(...)` lets a caller write an outbox
  row addressed to an arbitrary recipient. Both are **pre-existing** and
  **report-only** here (changing a SECURITY DEFINER function's reachability is on
  the do-not-touch list), but `enqueue_notification` being reachable by `anon`
  with arbitrary title/body/recipient is worth your attention as a spam/phishing
  primitive — it is the closest thing in this schema to an unauthenticated write.

# Storage buckets (5g)

| Bucket | Public | Read policy | Paths guessable? |
|---|---|---|---|
| `job-photos` | **YES** | `job_photos_read` — SELECT to `public`, whole bucket | Irrelevant — **listing is permitted** (H-1) |
| `avatars` | **YES** | `avatars_read` — SELECT to `public`, whole bucket | `<uid>/…`, and listable (H-3) |
| `chat-photos` | no | `chat_photos_read_party` — job party only | n/a |
| `chat-audio` | no | `chat_audio_read_party` — job party only | n/a |

Writes are correctly scoped on all four: inserts are `authenticated`-only and
the delete policies are owner-scoped by path segment
(`job_photos_delete_own_posting`, `…_own_review`, `…_own_completion`).

---

# Applied fixes

Only the two authorised categories were touched. Everything else above is
report-only, by instruction.

## FIX-1 — `search_path = public, pg_temp` on 28 SECURITY DEFINER functions

**The literal target was empty**: zero functions lacked an explicit
`search_path`. What was actually fixed is M-1 — the 28 functions whose
`search_path` did not pin `pg_temp`, which is the exact form the remedy calls
for.

Proved safe before applying: none of the 28 creates or references a temp
relation, and none depends on unqualified references to objects outside
`public` (they run today under `search_path = public`, so adding `pg_temp` at
the **end** can only remove the implicit `pg_temp`-first lookup — it cannot
change how any `public` object resolves, and `pg_temp` is never searched for
functions or operators at all).

Applied with `ALTER FUNCTION … SET search_path = public, pg_temp`, not by
recreating the bodies. Migration: `supabase/phase64_security_definer_search_path.sql`.

## FIX-2 — `security_invoker` on `v_bids_projection_drift`

Applied with `ALTER VIEW … SET (security_invoker = true)`, not by recreating the
view. Migration: `supabase/phase65_view_security_invoker.sql`.

`public.conversations` was **not** touched: it already had
`security_invoker = true` before this run, and both the migration set and
`tests/hardening.test.mjs:397` pin that.

The brief's precondition — confirm a normal authenticated user can still see
their own rows through the view — is vacuous for this view, because no client
role has any grant on it. Both grantees (`postgres`, `service_role`) hold
`BYPASSRLS`, so the change cannot hide a row from either. It was applied anyway
as defence in depth, so that a future grant to `authenticated` does not silently
inherit owner privileges. Verification results are in FINDINGS.md.
