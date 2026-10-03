# Runbook — resolve a reported issue (job dispute)

**Who:** the operator, by hand. There is no admin UI for this in v1 (FIX-RUN A12, 2026-10-03).
**Promise the app makes (A12a):** "Brazos will look at it and reply by email within 2 business
days." The clock starts when the report is opened (`job_disputes.created_at`).

While a report is open the payment stays held: `transfers_due` excludes the job, and the 72-hour
auto-release does not run. Nothing moves until this procedure runs or the customer withdraws the
report in the app.

## 1. Find the open reports

In the project's SQL editor (staging or production — the operator's own session, never a run):

```sql
select d.id, d.job_id, d.reason, d.details, d.created_at, d.opened_by,
       j.title, j.status as job_status, j.client_id, j.assigned_worker_id,
       p.id as payment_id, p.status as payment_status, p.charge_amount_cents, p.amount_cents
  from public.job_disputes d
  join public.jobs j on j.id = d.job_id
  left join public.payments p on p.job_id = d.job_id and p.kind = 'job_payment'
                               and p.status not in ('failed', 'voided')
 where d.status = 'open'
 order by d.created_at;
```

Reply-to addresses are in `auth.users.email` for `client_id` and `assigned_worker_id`.

## 2. Read the record before deciding

- The thread: `select sender_id, content, created_at from public.messages where job_id = :job order by created_at;`
- The completion evidence on `jobs` (`completion_photos`, `completion_videos` — public job-photos URLs).
- The agreement snapshot: `select * from public.job_agreements where job_id = :job;`
- Both people's histories: `public.reviews` and earlier `job_disputes` for either party.

Write to both parties if the record is not enough to decide. The 2-business-day promise is a reply,
not necessarily a decision — say what is still needed and by when.

## 3. Decide, and run the resolver

`resolve_job_dispute(p_job_id, p_in_favour_of, p_note)` is **service_role only** — run it from the
SQL editor as the service role, never from the app. `p_in_favour_of` is `'worker'` or `'customer'`;
`p_note` is kept on the dispute row (`resolution_note`) and should say why, in one or two sentences.

```sql
select public.resolve_job_dispute('<job id>', 'worker',   'Photos show the work complete as agreed.');
select public.resolve_job_dispute('<job id>', 'customer', 'Work not done; customer refunded in full.');
```

What it does, by the job's state (the function body is the authority —
`supabase/migrations/20260905000000_stripe_foundation.sql`):

| Job state | In favour of | Money |
|-|-|-|
| completed | worker | release requested; the transfer of the agreed price less the platform fee is queued (`transfers_ready`). Refused while a chargeback is open on the row. |
| completed | customer | a full refund of the card charge is queued (`refunds_ready`, reason `dispute_refund`). |
| cancelled (customer no-show claim) | worker | the frozen cancellation fee goes to the worker, the rest is refunded. |
| cancelled (customer no-show claim) | customer | a full refund. |
| cancelled (no open claim, undirected held row — e.g. after a ban) | customer only | a full refund; `'worker'` is refused. |

The queued transfer or refund leaves on the next `process-settlements` tick (every five minutes).
Transfers land only once the worker's payout account is enabled; until then the row sits in
`transfers_due` but not `transfers_ready`, and the worker's job screen asks them to set it up.

## 4. Reply by email

To both parties, within the 2 business days: the decision, the reason, and what happens to the money
and when. Keep the thread. If a party disagrees, nothing in the app re-opens a resolved dispute — a
second look is a new email thread and, if warranted, a hand refund or transfer in the provider's
dashboard (recorded on the payments row by the webhook).

## 5. Close out

- `job_disputes.status` is `resolved` with `resolved_at` and your note.
- Both parties can now leave reviews; the customer can tip once the transfer lands.
- Account deletion is unblocked for both once the payment reaches a final state.
