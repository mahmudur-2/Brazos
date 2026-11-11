# Critical blueprint: privacy, access and abuse limits (ledger B2, B3, B9, B10, B12, B14, two parts of B17)

Written 2026-11-11 by Fable. Design only: nothing is built and nothing was run (no database, no
test, no app). The reading was stopped early by the orchestrator's cost rule, so each flaw says how
far it got. An Opus builder continues from this file.

**How to read a proof.** Every claim is a static read of the code. `(R)` = the lines were opened
again at the end and the text is there. `(N)` = read once in this task and quoted from notes, **not
re-checked**: open it before you rely on it. Short names: `baseline` =
`supabase/migrations/20260901000000_baseline.sql`, `lean_v1` =
`supabase/migrations/20261108000000_lean_v1.sql`, `grants` =
`supabase/migrations/20261108010000_lean_v1_grants.sql`, `040` = `supabase/tests/040_authz.sql`,
`matrix` = the new test file `supabase/tests/330_access_matrix.sql` (take the next free number if
another group used 330). Ledger rows: `docs/lean/AUDIT-LEDGER.md:68,69,75,76,78,80,83` (R).

## Where each flaw stands

| Flaw | Status | Fix in one line | Depth reached |
|---|---|---|---|
| B2 trilateration | confirmed | distance and membership from the 0.27-mile cell centre | design complete; alert fixtures not read |
| B3 address forever | confirmed | hired worker reads the address only while assigned or in progress | design complete; worker screen after completion not read |
| B9 bucket listing | confirmed | each person lists only own folders and own jobs' folder | design complete |
| B10 caps and rates | confirmed in part | 2,000-character caps and four rate limits, by triggers | caps and rates designed; **payment functions not investigated** |
| B12 ban evasion | confirmed | the ban records the sign-in phone; phone-only sign-up is the owner's choice | part 1 designed; account deletion by a banned user not investigated |
| B14 forged cards | confirmed | client message rows may not carry card columns | design complete; update path not investigated |
| B17 status oracles | confirmed for 2 functions, rest **not investigated** | bid counts only for jobs the caller may see | partial |
| B17 completion-photo deletion | confirmed | worker may add or remove completion files only while in progress | design complete |

## B2: exact location from three searches

1. **Confirmed.** `supabase/migrations/20260930000500_radius_cap_3000.sql:34-37` (R): the distance is a
   haversine between the caller's `p_lat, p_lng` and `loc.lat, loc.lng`, the exact point from
   `job_locations` (join at line 29). Line 43 (R) decides membership from the same value. The caller
   picks any origin, so moving the origin until the half-mile value flips finds the exact point.
   Same root in the nearby alert: `supabase/migrations/20260930000600_needed_today.sql:237-243` (N),
   function `notify_nearby_for_job` (body 204-258, ACL 260).
2. **Root cause.** Distance and membership come from the exact point; rounding the answer does not
   help when the caller chooses the origin.
3. **Fix** (file 1).
   - New helper `public.market_cell_centre(p_lat double precision, p_lng double precision)
     returns table (cell_lat double precision, cell_lng double precision)`, `language sql immutable`,
     not security definer. Body: the grid of `job_hotspots()` copied verbatim (`baseline:2415-2416`
     and `2434-2435` (R)): `dlat = 0.27 / 69.0`, `dlng = 0.27 / (69.0 * cos(radians(40.7128)))`,
     centre `(floor(x / d)::bigint + 0.5) * d`. Keep the same number types so a test can compare
     with `=`. `revoke all … from public, anon, authenticated` (only definer functions call it).
   - `create or replace function public.jobs_within_radius(double precision, double precision,
     double precision)`: same signature, columns, clamp, snap and order as today (lines 16-45 (R)).
     One change: `cross join lateral public.market_cell_centre(loc.lat, loc.lng) c`, and the
     haversine reads `c.cell_lat, c.cell_lng` in place of `loc.lat, loc.lng`. Restate lines 49-50
     (revoke from public, anon; grant to authenticated). Update the comment (line 47).
   - `create or replace function public.notify_nearby_for_job(…)`: the newest body, with the job's
     point taken from `market_cell_centre`. Restate its ACL (revoked from public, anon,
     authenticated).
   - `job_hotspots()` and `jobs_in_cell()` (`baseline:2655-2675` (R), same grid) are not touched.
   - New behaviour: every job in one cell has the same distance from any origin. A search can only
     find the cell centre, which the map already shows. No new precision number.
4. **Tests first** (`matrix`, section B2).
   - B2-1: two open-market jobs in one cell, exact points about 0.1 mile apart; an origin about
     0.75 mile away on their line. Both get the same `distance_miles`. Today: 0.5 and 1.0.
   - B2-2: a job's `distance_miles` equals the half-mile snap of the haversine from the origin to
     the `cell_lat, cell_lng` that `job_hotspots()` returns (fixture where the exact point differs).
   - B2-3: radius 0.5; a job whose exact point snaps to 0.5 but whose cell centre snaps to 1.0 is
     not returned. Today it is.
   - B2-4: nearby alert: a worker whose alert circle holds the exact point but not the cell centre
     gets no alert; the mirror case gets one. Fixtures: `supabase/tests/100_nearby_alerts_default.sql`
     (not read).
   - Guard (passes today): `market_cell_centre` of a job's point equals `job_hotspots()`'s centre.
5. **App.** Fix the comment at `lib/hotspots.ts:222-231` (N) (it says the distance is exact).
   `tests/jobFilterRules.test.mjs:245-248` (N) reads the old radius file's text: point it at the new
   file. `npm run db:types` (a new function). One line in `docs/ARCHITECTURE.md`.
   Not investigated: how Home search, results and map pass origin and radius. Seen, left alone:
   `jobs_within_radius` has no filter for a banned poster's jobs (lines 41-43 (R)).

## B3: the hired worker reads the address forever

1. **Confirmed.** `baseline:7266-7268` (N): policy `job_locations_select_party` lets the job's owner
   and its assigned worker read the row, with no status or time condition.
2. **Root cause.** The policy checks who reads, never where the job stands.
3. **Fix** (file 2). `alter policy "job_locations_select_party" on public.job_locations using (…)`:
   the owner always; the hired worker only while `j.status in ('assigned', 'in_progress')`. Keep
   every other condition of the current text. After `completed` or `cancelled` the worker's read
   returns no row (not an error). No clock: status only. The code shows no reason for longer: flow
   05 reads the address while the job is `assigned` (`.maestro/05-worker-start-complete.yml:93-96` (N)).
4. **Tests first** (`matrix`, B3). B3-1: the hired worker reads 0 rows for a completed job (today
   1). B3-2: 0 rows for a cancelled job that had a hired worker. Guards: the worker reads 1 row
   while assigned and while in progress; the owner reads 1 row in every status; a bidder and a
   stranger read 0.
5. **App.** None if the worker's screen copes with a missing address on a finished job. **Not
   investigated**: `lib/jobs.ts` near 662 and `screens/WorkerJobScreen.tsx` near 271 (N): check that
   a missing row hides the address block. Also grep the migrations for a definer function that
   returns `address_line` to the worker (none was found, but the search was not complete).

## B9: any signed-in user can list every job photo

1. **Confirmed.** `baseline:7685` (N): `job_photos_read` is `USING (bucket_id = 'job-photos')`, so
   the storage list call returns every object: `<job id>/…`, `postings/<user id>/…`,
   `reviews/<user id>/…`. `040:1141-1142` (N) asserts it (a stranger reads all three, "by design").
2. **Root cause.** The read policy names the bucket only.
3. **Fix** (file 3). `alter policy "job_photos_read" on storage.objects using (…)` (name kept:
   `040:1051-1056` (N) and `310_grants.sql` list eleven policy names). New rule: `bucket_id =
   'job-photos'` and one of: the path is `postings/<my id>/…`; the path is `reviews/<my id>/…`; the
   first folder is the id of a job where I am `client_id` or `assigned_worker_id`. Reuse the path
   expressions of the bucket's own insert and delete policies (`baseline:7661-7677` (N)); compare
   the job id as text.
   - Why these three: an upload with `upsert: true` (`lib/storage.ts:167-169` (N)) and a remove
     (`lib/storage.ts:210-215` (N)) need the caller to see the row. The app shows photos by public
     URL (`lib/storage.ts:176` (N)), which does not use this policy. The app never lists the bucket
     (no `.list(` today or at build 10's commit `9b0064f`; checked with `git grep`).
   - The bucket stays public (`docs/DECISIONS.md:27` (N), D-20261108-12): a photo is still open to
     anyone who has its URL.
   - If `alter policy` is refused on `storage.objects`: `drop policy` + `create policy` with the
     same name in the same file (the scan flags neither).
4. **Tests first** (`matrix`, B9). B9-1: a stranger sees 0 objects in `job-photos` (today 3); this
   replaces `040:1141-1142`. B9-2: a bidder sees 0 of the owner's and the worker's objects. Guards:
   the owner sees the own posting photo and the job's completion photo; the hired worker sees the
   job's completion photo and the own review photo; an owner upload to `postings/<owner>/` and a
   worker upload to `<job>/` still succeed.
5. **App.** None required. Recommended (open question 2): `lib/storage.ts:199` (N) names a completion
   photo `<jobId>/<Date.now()>.<ext>`; add the random suffix the other uploads use.

## B10: no server length caps, no rate limits

1. **Confirmed in part.** No cap: `baseline:5741` (N) `messages.content`, `baseline:6129` (N)
   `reports.description`; the report form has no client limit (`components/ReportDialog.tsx:212-221`
   (N)). No rate limit was found in the SQL; the only brakes are the role statement timeouts
   (`supabase/migrations/20260901000001_roles.sql` (N)). **Payment functions: not investigated**
   (`supabase/functions/` was never opened).
2. **Root cause.** Limits live only in the app's text fields; the server takes any size at any pace.
3. **Fix.** Both parts raise a plain short sentence (SQLSTATE P0001), the way `reject_blocked_terms`
   does (`supabase/tests/280_content_filter.sql:28` (R)). Reason: `lib/errorMessage.ts` (N) shows a
   server sentence only when it is at most 160 characters and has none of the words column,
   relation, table, constraint, schema, function, type, operator, syntax, "null value", violates,
   `pg_`, `public.`; a CHECK constraint or an RLS refusal would show a generic or a wrong message.
   - **Caps** (file 5). Trigger function `public.reject_overlong_text()` (arguments: column name,
     maximum, sentence), `before insert or update of <column>`; an update that leaves the text
     unchanged is not judged. `messages.content` at most 2,000 characters; `reports.description` at
     most 2,000. Sentences: "That message is too long. Keep it under 2,000 characters." and "That
     report is too long. Keep it under 2,000 characters." The ban's own message (`lean_v1:250-255`
     (N), 83 characters) and empty card rows pass.
   - **Rates** (file 6). New table `public.rate_counters (user_id uuid references public.profiles
     (id) on delete cascade, action text, window_start timestamptz, hits integer, primary key
     (user_id, action, window_start))`; RLS on, no policy, `revoke all … from public, anon,
     authenticated`. One security definer trigger function `public.enforce_rate_limit()`
     (arguments: action, maximum, window, owner column, sentence; search path pinned; revoked from
     public, anon, authenticated). Steps: (1) if `auth.uid()` is null or the row's owner column is
     not `auth.uid()`, return (server jobs, the ban's message written by an admin, fixtures written
     by the test runner are not counted); (2) add 1 to the caller's counter for the current fixed
     window; (3) above the maximum: raise the sentence (the raise also undoes the +1); (4) remove
     the caller's own rows older than 2 days (inside the function body). `before insert … for each
     row` triggers:

     | Table | Owner column | Limit | Sentence |
     |---|---|---|---|
     | `messages` | `sender_id` | 30 per minute | You're sending messages too fast. Wait a minute and try again. |
     | `jobs` | `client_id` | 10 per hour | You've posted a lot of jobs in the last hour. Try again later. |
     | `job_offers` | the offer's author (column not read) | 30 per hour | You've sent a lot of offers in the last hour. Try again later. |
     | `reports` | `reporter_id` | 10 per day | You've sent a lot of reports. Try again later. |

   - Triggers, not new RPC bodies: `create_job`, `create_offer` and `ban_user` stay as the earlier
     groups leave them. No new service, no new dependency.
   - Not covered: issue reports (`open_job_dispute`), profile and job edits, read RPCs, and the
     payment functions. Server caps on other free text (review comment, bio, offer message, service
     listing) were not checked.
4. **Tests first** (`matrix`, B10). B10-1: a 2,001-character message is refused with the sentence
   (today it is stored); 2,000 passes. B10-2: the same for a report's description. B10-3: the 31st
   message a hired party sends in one transaction is refused (today it is stored). B10-4: the 11th
   `create_job` by one user is refused. B10-5: the 31st offer by one worker (jobs made by the
   runner) is refused. B10-6: the 11th report is refused. B10-7: `anon` and `authenticated` hold no
   privilege on `rate_counters` (fails today: no table). Guard: `ban_user` on an account with 31
   active jobs still succeeds.
   **Risk for the builder**: `now()` is frozen inside a test transaction, so an existing test file
   that calls `create_job` more than 10 times, or `create_offer` more than 30 times, as one user
   will trip. Not counted. Fix the fixture; never raise a limit or add a bypass. Also not read: how
   many `jobs` rows one user call of the repeat feature inserts (`supabase/tests/180_job_series.sql`).
5. **App.** `components/ReportDialog.tsx:212-221` (N): add `maxLength` 2,000 (a constant exported
   from `lib/moderation.ts`). Chat already has `CHAT_MESSAGE_MAX = 2000`
   (`components/ChatComposer.tsx:48-50` (N)). No new screen: both chat and the report form already
   show `userMessage(error)` (`screens/ChatScreen.tsx:704-715`, `components/ReportDialog.tsx:99-111`
   (N)). `npm run db:types` (a new table).

## B12: a banned person can come back

1. **Confirmed.** `lean_v1:183-190` (N): `ban_user` records only `profiles.phone`. That phone is
   edited by its owner through `update_my_profile` (`baseline:5354, 5366-5370, 5408-5411` (N)).
   `handle_new_user` checks the ban list only when a phone is present (`grants:100-109` (N)); an
   email sign-up sends a typed, unverified phone as metadata (`lib/AuthContext.tsx:172-190` (N)).
   **Sign-up methods in the app**: (a) phone + SMS code (`lib/phoneAuth/supabase.ts:80-106` (N));
   (b) email + password (`screens/EmailCreateAccountScreen.tsx:68-114` (N)). No Apple, no other
   provider, no anonymous sign-in (`supabase/config.toml:187` (N), local config only).
2. **Root cause.** The ban list holds a phone the banned person can edit, and one sign-up path
   needs no verified phone at all.
3. **Fix.**
   - **Part 1** (file 7): ban the sign-in identity. Security definer trigger function
     `public.ban_record_sign_in_phone()` on `public.profiles`, `after update of banned`, when
     `banned` turns true: insert the account's `auth.users.phone`, written the way
     `handle_new_user` writes it (`'+' || ltrim(btrim(phone), '+')`), into `banned_phones` with
     `banned_profile_id`, `on conflict (phone) do nothing`. `ban_user` is **not** replaced (its body
     holds money logic of another group). `unban_user` already removes rows by `banned_profile_id`
     (`baseline:5095-5109` (N)). `handle_new_user` already refuses a banned sign-in phone
     (`supabase/tests/300_signup_and_push_schedule.sql:80-89` (N)).
   - **Part 2** (file 9, **owner's choice**, open question 1): new accounts need a sign-in phone.
     `create or replace function public.handle_new_user()` (newest body: `grants:93-125` (N)) plus
     one refusal when `new.phone` is empty; ACL restated (line 125). Existing email accounts keep
     signing in. Hosted auth settings must then have phone confirmation ON: with it off, the
     sign-in service marks any phone verified without a text message, and no SQL can tell.
   - Accepted and stated: a person who owns a second phone number can sign up again.
   - **Not investigated**: whether a banned account can delete itself, and whether the
     `banned_phones` row survives that (its foreign key and `delete_my_account` were not read). The
     ban record must outlive the account.
4. **Tests first** (`matrix`, B12). B12-1: a user with a sign-in phone P edits the profile phone to
   Q and is banned: `banned_phones` holds P (today only Q). B12-2: a new `auth.users` row with phone
   P is then refused with "This phone number is not eligible to register." (today accepted).
   B12-3 (only with part 2): an `auth.users` row with an email and no phone is refused. Guard: after
   `unban_user`, P registers again.
   Existing tests: `tests.create_user` (`supabase/tests/_helpers.sql` (N)) makes email-only users, so
   part 1 changes no existing assertion. Part 2 does: the helper must give each test user a unique
   sign-in phone, `300_signup_and_push_schedule.sql:25-53` (N) (metadata-only cases) must be
   rewritten, and `040:971` (N) (one ban row) becomes two.
5. **App.** Part 1: none. Part 2: hide the "Create account with email" entry
   (`screens/EmailCreateAccountScreen.tsx` and its route); email sign-in stays. An old build's email
   form shows "We couldn't create this account. Contact support if you think this is a mistake."
   (`authMessage` in `lib/errorMessage.ts` (N)). `lib/phoneAuth/` is not edited.

## B14: forged negotiation cards

1. **Confirmed.** `lean_v1:103-124` (N): `messages_insert_party` ends (120-123) with
   `public.messaging_unlocked(job_id, direct_thread_id) or (job_offer_id is not null and
   coalesce(btrim(content), '') = '' and image_url is null)`. Nothing ties `job_offer_id`,
   `request_event` or `request_amount_cents` to a real offer event. `040:529-536` (N) records that a
   party can insert an empty fake event row.
2. **Root cause.** The policy checks the sender and the thread, not the card columns.
3. **Fix** (file 4). `alter policy "messages_insert_party" on public.messages with check (…)`: the
   current party and sender conditions unchanged, then `public.messaging_unlocked(job_id,
   direct_thread_id) and job_offer_id is null and request_event is null and request_amount_cents
   is null`. The pre-hire exception goes. Real cards are written only by definer code
   (`create_offer` `baseline:1576-1580`, `offer_post_event` `baseline:3665-3669` (N)), which the
   policy does not bind: the ban's message is written with another sender and is stored
   (`supabase/tests/230_ban_refund.sql:106` (R)). The app never sends a card column
   (`lib/messages.ts:271-289` (N); same at `9b0064f`).
4. **Tests first** (`matrix`, B14). B14-1: a hired party's insert with `job_offer_id` and
   `request_event` set is refused with 42501 (today stored). B14-2: before hire, an empty row with
   `job_offer_id` set is refused (today stored; flip `040:529-536`). Guards: a plain text message
   after hire is stored; `create_offer` still writes its card.
   **Not investigated**: whether a client UPDATE on `messages` can set the three columns. Add the
   test (sender updates an own row to set `request_event`); if it passes today, nothing to fix.
5. **App.** None.

## B17, part 1: status oracles

The ledger row has no detail (`docs/lean/AUDIT-LEDGER.md:83` (R)), so this list comes from the code.

1. **Confirmed for two functions.** `baseline:2451-2460` (R): `job_offer_count(uuid)` is security
   definer and counts bids for any job id, with no check of the caller or of the job's state; the
   comment at 2466 (R) calls that deliberate. `baseline:2470-2483` (R): `job_offer_counts(uuid[])`
   only asks for a signed-in caller. A person who once saw a job id can read its bid count after
   the job is hired, finished or private. Low severity.
   Also seen, **not fixed here**: `update_job_details` answers "Job not found" or "Only the job
   poster can edit this job" (`supabase/migrations/20260930000400_job_pricing_mode.sql:263-267` (N)),
   so it tells whether a job id exists; `is_profile_active(uuid)` (`baseline:2352-2363` (N)) tells
   whether any account is banned or deleted, and an RLS policy needs it. **Not investigated**:
   `can_delete_own_job`, `client_job_stats`, `worker_job_stats`.
2. **Root cause.** Definer helpers answer for objects the caller may not see.
3. **Fix** (file 8). `create or replace` both count functions, same signatures and ACL restated:
   join `jobs` and count only when the job is `open` and `open_market`, or the caller is its
   owner, or the caller has an offer on it. For `update_job_details`: merge the two sentences into
   "Job not found" only if another group already replaces that function (open question 4).
4. **Tests first** (`matrix`, B17a). A stranger's `job_offer_count` on a completed job with bids
   returns 0 (today 1 or more); the same through `job_offer_counts`. Guards: the owner and a bidder
   still get the count; anyone signed in gets it for an open-market job (`040:390` (N) asserts
   stranger access: check which job it uses).
5. **App.** None expected. Not investigated: whether a screen shows a count on a closed job to
   someone who never bid.

## B17, part 2: completion-photo deletion

1. **Confirmed.** `baseline:7661-7663` (N): `job_photos_delete_own_completion` lets the hired worker
   remove objects under `<job id>/` with no status condition. `baseline:7675-7677` (N):
   `job_photos_insert` has none either, so the worker can also add files after completion. Remove
   plus add swaps the proof under a public URL.
2. **Root cause.** The storage policies check the person, not the job's status.
3. **Fix** (file 3, with B9). `alter policy` on both: the hired worker's branch also needs
   `j.status = 'in_progress'`. The `postings/` and `reviews/` branches stay as they are. Flow 05
   uploads after "Start job" and before "Mark complete", so the app's own path is inside the window
   (when the app offers upload or removal on a worker's screen was not read).
4. **Tests first** (`matrix`, B17b). As the hired worker on a completed job, with
   `set_config('storage.allow_delete_query', 'true', true)` set first (the repo does this at
   `grants:77-83` (N); without it `protect_objects_delete` refuses everyone, `040:1146-1165` (N)):
   the removal affects 0 rows (today 1), and an insert under `<job id>/` is refused (today stored).
   Guards: both work while the job is in progress. Fallback if the storage trigger blocks the test:
   assert on `pg_policies` that both texts name `in_progress`.
5. **App.** None.

## Access matrix (after the fixes; "→" marks a cell that changes)

| Object and action | Not signed in | Signed-in stranger | Job owner | Worker with an offer | Hired worker | Banned user |
|---|---|---|---|---|---|---|
| `job_locations`: read the exact address | no | no | yes | no | always → only while assigned or in progress | not investigated |
| `jobs_within_radius`: distance | no | from the exact point → from the cell centre | same | same | same | not investigated |
| Nearby alert membership (server only) | n/a | exact point → cell centre | n/a | same | same | n/a |
| `job-photos`: list or select by the storage API | no | all → none | all → own posting folder and own jobs' folder | all → own folders only | all → own folders and the hired job's folder | not investigated |
| `job-photos`: open a public URL | yes | yes | yes | yes | yes | yes (unchanged, D-20261108-12) |
| `job-photos`: add or remove under `<job id>/` | no | no | not read | no | any status → only while in progress | not investigated |
| `messages`: text or photo row | no | no | after hire | no | after hire | no |
| `messages`: row with card columns | no | no | yes → no | empty card before hire → no | yes → no | no |
| `messages`, `reports`: size and pace | n/a | any → 2,000 characters; 30 a minute; 10 reports a day | same | same | same | n/a |
| `jobs` insert, `job_offers` insert: pace | n/a | any → 10 jobs an hour; 30 offers an hour | same | same | same | n/a |
| `job_offer_count(s)` | no | any job id → open-market jobs only | own jobs | jobs they bid on | same | not investigated |
| `banned_phones`, `rate_counters` (new) | no | no | no | no | no | no |
| Sign up again with the banned sign-in phone | n/a | n/a | n/a | n/a | n/a | allowed if the profile phone was edited → refused |
| Sign up with email and no phone | yes → no (owner's choice) | | | | | |

Cells not marked "→" were read from the policies once (N) or are asserted by `040`; the banned
column was not worked through beyond `040` section 16.

## Migration files, in order

All are additive: `create or replace function`, `alter policy`, `create table`, `create trigger`.
Each is one transaction. Every function restates its revoke and grant. Dollar-quote tags carry no
digit.

| # | File | Content |
|---|---|---|
| 1 | `20261112030000_distance_from_cell_centre.sql` | B2: `market_cell_centre`; `jobs_within_radius` and `notify_nearby_for_job` replaced |
| 2 | `20261112030500_address_while_working.sql` | B3: `alter policy job_locations_select_party` |
| 3 | `20261112031000_job_photos_access.sql` | B9 and B17 part 2: `alter policy` on `job_photos_read`, `job_photos_delete_own_completion`, `job_photos_insert` |
| 4 | `20261112031500_message_cards_server_only.sql` | B14: `alter policy messages_insert_party` |
| 5 | `20261112032000_text_caps.sql` | B10: `reject_overlong_text()`; triggers on `messages`, `reports` |
| 6 | `20261112032500_rate_limits.sql` | B10: table `rate_counters`; `enforce_rate_limit()`; triggers on `messages`, `jobs`, `job_offers`, `reports` |
| 7 | `20261112033000_ban_sign_in_phone.sql` | B12 part 1: `ban_record_sign_in_phone()`; trigger on `profiles` |
| 8 | `20261112033500_offer_count_scope.sql` | B17 part 1: `job_offer_count`, `job_offer_counts` replaced |
| 9 | `20261112035000_signup_needs_phone.sql` | B12 part 2, **only if the owner says yes**: `handle_new_user` replaced |

## Objects replaced or altered (for ordering against the money and job-lifecycle groups)

- Functions replaced, same signature: `jobs_within_radius(double precision, double precision,
  double precision)`, `notify_nearby_for_job` (signature not noted), `job_offer_count(uuid)`,
  `job_offer_counts(uuid[])`, and in file 9 `handle_new_user()`. This group is built last: start
  each from the newest body at that time.
- Policies altered: `job_locations_select_party`, `messages_insert_party`, and on `storage.objects`
  `job_photos_read`, `job_photos_delete_own_completion`, `job_photos_insert`.
- New: functions `market_cell_centre`, `reject_overlong_text`, `enforce_rate_limit`,
  `ban_record_sign_in_phone`; table `rate_counters`; triggers on `messages` (2), `reports` (2),
  `jobs` (1), `job_offers` (1), `profiles` (1).
- Not touched: `ban_user`, `unban_user`, `accept_offer`, `cancel_job`, `create_job`, `create_offer`,
  `transition_job_status`, `update_job_details`, `job_hotspots`, `jobs_in_cell`, the buckets.
- Existing tests to edit: `040:1141-1142` (3 becomes 0); `040:529-536` (fake card row); with file 9
  also `_helpers.sql`, `300_signup_and_push_schedule.sql:25-53`, `040:971`. `040` section 17
  (`997-1002` (N)) lists the definer functions `authenticated` may run: no new function is granted
  to it, so no change is expected. `310_grants.sql`: check whether it lists tables or functions by
  name. `280_content_filter.sql:159-164` (R) counts only `reject_blocked_terms` triggers: not
  affected. `phase29_security_contract.sql` (R): no asserted grant or signature changes.
  `types/database.ts`: regenerate.

## New numbers and choices

| Number or choice | New or reused | Why |
|---|---|---|
| 0.27-mile cell for distance and alerts | reused (`baseline:2415-2416`) | the precision the map already shows |
| Address readable while `assigned` or `in_progress` | new choice | the worker needs it to get there and to work, not after |
| Completion files added or removed only while `in_progress` | new choice | proof must not change after "Mark complete" |
| Message at most 2,000 characters | reused (`components/ChatComposer.tsx:49`) | the app's own limit |
| Report description at most 2,000 characters | reused (`screens/ApproveOrDisputeScreen.tsx:447` (N), the issue-report limit) | same kind of text |
| 30 messages a minute per sender | new | no person types faster; stops floods and push spam |
| 10 job posts an hour per account | new | each post alerts nearby workers; a test run posts 3 |
| 30 offers an hour per account | new | each offer alerts a job owner; a test run sends 4 |
| 10 reports a day per account | new | protects the review queue; a test run sends 0 |
| Fixed windows; counter rows kept 2 days | new | simplest counter; up to twice the limit across a window edge is accepted |
| The ban records the sign-in phone | new choice | the profile phone is editable |
| Bid counts only for open-market jobs, the owner, or a bidder | new choice | no answer about a job the caller cannot see |
| New accounts need a phone (file 9) | owner's choice | the only way a ban holds against a new email |

## Open questions, with the recommended answer

1. **Must a person have a verified phone before posting a job or sending an offer?** Recommended:
   yes, by making sign-up phone-only for new accounts (file 9, hide the email create-account
   screen), and in the hosted auth settings: phone confirmation on, email sign-up off (ledger O6).
   Production has no users, so nobody is locked out. This design assumes yes and keeps it in the
   last file, so a "no" removes one file, three tests and one screen change.
2. **Completion-photo links can be guessed** (`<job id>/<milliseconds>.<ext>` in a public bucket).
   Recommended: add the random suffix now (one line in `lib/storage.ts`); the private bucket stays
   in v1.2 as already decided.
3. **Are the four rate numbers right?** Recommended: accept; each is far above the test run's use.
4. **`update_job_details` tells whether a job id exists.** Recommended: leave it unless another
   group already replaces that function; a job id cannot be guessed.
5. **May a banned account delete itself?** Recommended: yes, but the ban record must stay. The
   builder checks the foreign key of `banned_phones` first.
6. **Rate limits for the payment functions.** Not designed (not read). Recommended: a follow-up
   that reads `supabase/functions/` before production.

## Effect on the phone tests and on the installed test build

"Old build" = TestFlight build 10 (`9b0064f`) and the e2e build `c14fa739…`. No fix needs new app
code to keep an old build working. Flows 01, 04, 08, 09, 10 and `.maestro/config.yaml` were not read.

| Fix | Flow step or test data must change? | Old build |
|---|---|---|
| B2 | No. The simulator stands on the posted job's point; exact and cell-centre distances both show the 0.5 minimum (reasoned, not run) | Works: same RPC shape |
| B3 | No. Flow 05 reads the address while `assigned` (lines 93-96). Flow 09's job row not read | Address read returns no row after completion; the screen's handling was not read |
| B9 | No. No flow and no build lists photos. Flow 02's add and remove of a posting photo and flow 05's upload stay inside the uploader's own rows | Works |
| B17 part 2 | No. Flow 05 uploads while in progress | Works |
| B14 | No. No build inserts a card row itself | Works |
| B10 caps | No. Flow texts are short | Build 10 has no chat limit: a longer text gets the server sentence (its error mapping at `9b0064f` was not read) |
| B10 rates | No. Per run: account A 3 jobs, 3 messages, 1 offer row; account B 4 offer rows, 1 message; 0 reports. The pile of open test jobs (E6) trips nothing: there is no cap on open jobs | Works; a refusal is a plain sentence |
| B12 part 1 | No. The test accounts are not banned | Works |
| B12 part 2 | No. Both test accounts sign up by phone. TestSprite's sign-in method was not read: an email sign-up there would be refused | Email create-account shows "We couldn't create this account…" |
| B17 part 1 | No | Works |

## Staging scan

No file is flagged. None contains, outside a function body: drop table, drop column, drop schema, a
truncate statement, rename to, rename column, delete from. The only row removal is the counter
clean-up in file 6, inside the function body. `on delete cascade` in file 6 does not match the
scan's pattern. Rule for the builder: keep those words out of `comment on` texts and trigger
sentences too (a quoted string is scanned), and use `$$` or a tag without a digit. If a policy
must be dropped and created again (B9 fallback), `drop policy` is not flagged.

## Not investigated (stopped early)

- `supabase/functions/` (payment functions, B10); server caps on other free text.
- `lib/jobs.ts` near 662, `screens/WorkerJobScreen.tsx` near 271 (address on a finished job); how the
  search screens call `jobs_within_radius`; when the worker's screen offers photo upload or removal.
- `can_delete_own_job`, `current_user_is_banned`, `client_job_stats`, `worker_job_stats`,
  `notify_on_job_location`; the `banned_phones` foreign key and `delete_my_account`; the UPDATE
  policy and grants on `messages`; the author column of `job_offers`; the repeat feature's inserts.
- How many times existing test files call `create_job` and `create_offer` as one user.
- `.maestro/config.yaml`, flows 01, 04, 08, 09, 10; TestSprite's accounts; build 10's error mapping.
- Hosted auth settings (a run never reads a remote project).

## Undo

Each fix is undone by a new migration that restores the earlier text: the policy or function at
the path:line cited in its section. Files 5, 6, 7: `drop trigger` (not flagged). Never edit or
delete an applied file.
