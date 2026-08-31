# DOMAIN — the model every run reads before writing

Written before the first migration; edited only by the operator. Pointers are fine once an architecture doc exists — never copies.

In BRAZOS this file was written AFTER the schema, so every entry below is a pointer and
nothing here is a definition. Where a pointer and the code disagree, the code wins and the
pointer gets fixed. `CLAUDE.md` outranks this file everywhere.

## State machines
- Job: `open → assigned → in_progress → completed`. `transition_job_status()` is the only status mover and `accept_offer()` the only assignment path; the client never writes `status` or `assigned_worker_id` — CLAUDE.md §Critical business invariants. Implemented shape: `docs/architecture.md` §Jobs and lifecycle. The derivation exists once and is never duplicated (P3-31): `lib/jobLifecycle.ts`, `lib/jobStage.ts`.
- Offer / bid: one chain of `job_offers` rows — the first is the root, every counter a child — and the table is RPC-write-only, with no direct authenticated INSERT / UPDATE / DELETE (CLAUDE.md §Critical business invariants). Chain and write rules: `docs/architecture.md` §Offers — one negotiation model. Bidding is SEALED: `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 D-1, which also binds every future ranking, push-copy and price-guidance surface.
- Payment: the LEDGER is the state machine, provider EVENTS move it through one idempotent function, and no work starts before the ledger says `held` — the gate lives inside `transition_job_status()`. `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 D-5 and §1.2.1; `docs/architecture.md` §Money. Money is integer cents and every label follows this machine — CLAUDE.md §Critical business invariants.
- Availability: THERE IS NO AVAILABILITY STATE MACHINE, and nothing should be written as if there were. Availability is declared, never inferred: an offer message appends at most one availability line ("Can start …") — `docs/architecture.md` §Offers, `lib/offerMessage.ts`.
- Dispute: `job_disputes` is the live table name (CLAUDE.md §Supabase). Client-side states and their union: `lib/disputes.ts`. Resolution is service-role only and a cancelled job is terminal — `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 D-7.

## Tables (real names, not planned names)
| Table | Owner of writes | Who may read |
|---|---|---|
| `jobs` | RPC only — `accept_offer()` assigns, `transition_job_status()` moves status; never the client (CLAUDE.md) | owner; assigned worker; the open-market projection — `docs/architecture.md` §Jobs and lifecycle |
| `job_offers` | RPC only — RPC-write-only by invariant (CLAUDE.md) | parties; `authenticated` holds SELECT and nothing else — `docs/architecture.md` §Offers |
| `payments` | RPC + webhook — writes go through `lib/adapters/payments.ts` into SECURITY DEFINER RPCs, never from a screen | its two parties and no one else — `docs/architecture.md` §Money; `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §1.2.1 |
| `job_locations` | RPC | owner + assigned worker only, enforced by RLS and never only by the frontend; `job_private_details` was never built and this is that surface (CLAUDE.md §Critical business invariants) — `docs/architecture.md` §Location privacy |

The rest of the live-name map — `job_disputes`, `portfolio_items`, `push_tokens`,
`notification_outbox` + `notification_prefs`, and the two tables that were never built
(`completion_records`, `job_media`; completion media lives on `jobs` as jsonb) — is
CLAUDE.md §Supabase. Never restate it here.

## RPC contracts
| RPC | Caller | Guarantees |
|---|---|---|
| `accept_offer()` | customer | the ONLY assignment path — CLAUDE.md §Critical business invariants; `docs/architecture.md` §Offers |
| `transition_job_status()` | assigned worker | the ONLY status mover, and the funding gate: no work before the ledger says `held` — CLAUDE.md; `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 D-5 |

`accept_bid()` and `respond_job_request()` are deprecated compatibility shims with no app
callers. Never call, extend, or imitate them — CLAUDE.md §Critical business invariants.
Every new SECURITY DEFINER function in `public` carries explicit `revoke`/`grant` in the
migration that creates it — CLAUDE.md §Supabase.

## Product rules (decide once, here)
Each rule points at its decision. `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 is the
decision table; `docs/DECISIONS.md` is where anything decided from now on is dated.

- Fee split — v3 §2.2 D-3: 750 bps each side, $1.00 worker-side minimum, a rate change is a new `fee_schedule` row and never an UPDATE. Recorded as ADR-0013 in `docs/BRAZOS_TARGET_ARCHITECTURE_v2.md` §12.1.
- Cancellation policy — v3 §2.2 D-7: a cancelled job is terminal; a no-show claim moves no money until resolved.
- Accept = fund — v3 §2.2 D-5: capture at hire, separate charges and transfers.
- Sealed bids — v3 §2.2 D-1: a worker sees that other bids exist and their count, never a competitor's amount, before or after bidding.
- Address reveal moment — CLAUDE.md §Critical business invariants: exact address is in `job_locations`, owner and hired worker only; open-market surfaces show approximate location. `docs/architecture.md` §Location privacy.
- Review reveal — NOT DECIDED. No reveal rule exists; what a profile may show is `docs/architecture.md` §Profiles and reputation, whose binding half is CLAUDE.md's "never invent marketplace data".
- Tips — v3 §2.2 D-3: the customer side only, and the worker keeps 100% of every tip.
- Dispute resolution path — v3 §2.2 D-7, with the client union in `lib/disputes.ts`.
- Tax as a price component — the MECHANISM exists at rate 0 (v3 §1.2.1); only the rate row and its display remain, and who collects on which category is operator-owned (v3 §4.1). Open in `docs/BACKLOG.md` item 14.
- All-in display — v3 §2.2 D-4: `charge_amount_cents` is THE price on every customer surface, `quote_job_price()` is the only arithmetic, and the total never rises between the bid card and checkout.
- Completion photo required — v3 §2.2 D-14: at least one, unless the operator says otherwise.
