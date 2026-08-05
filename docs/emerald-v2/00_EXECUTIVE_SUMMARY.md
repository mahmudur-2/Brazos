# 00 — Executive Summary: BRAZOS → Emerald Trust V2 Audit

Audit date: 2026-08-04.

## Branch and working-tree status

**Branch:** `feature/setup-onboarding-v1` (HEAD `0b1f170`), **not**
`mainexpo` — the branch CLAUDE.md names as required. This deviation was
flagged to the user before this audit proceeded; the user explicitly
authorized auditing this branch as-is. It is flagged again here because it
governs everything else in this summary: this branch, not `mainexpo`, is
where the newest and most atlas-relevant work (the auth/onboarding redesign)
actually lives. **Working tree: clean**, no uncommitted changes, before or
after this audit — the only new files this audit produced are the
`docs/emerald-v2/*.md` documents themselves.

## Current architecture summary

Expo SDK 54 / React Native 0.81.5 / React 19, TypeScript, Supabase as the
entire backend (`@supabase/supabase-js`, no other server). Navigation is
`@react-navigation` — one signed-out auth stack, a two-screen onboarding
stack, and **a single five-tab bottom bar** (Home / Map / My Jobs / Messages
/ Profile) shared by every signed-in user. There is no customer/worker mode
split anywhere in the app today — that is the single largest structural gap
against the Emerald atlas, not a missing screen here or there.

## What already works

The marketplace vertical is real and RPC-hardened, not a prototype shell:
job posting, browsing, bidding, bid acceptance, job-status transitions,
completion photo/video evidence, reviews with photos, text/photo/voice
messaging, direct job offers (a phase36 fix that removed a structural gating
bug), and semantic worker search (phase39/40, backed by 29 regression tests
including a guard that its deterministic fallback is byte-for-byte
unchanged) — all confirmed by direct source trace to real Supabase RPCs, not
just UI. `npm run typecheck`, `npm run lint` (strict, unused-symbol
checking), and `npm test` (172/173, one pre-existing unrelated failure) are
all clean on this branch. Separately, and more relevant to the atlas
specifically: the auth/onboarding redesign on this branch already implements
atlas Screens 01–06 (Launch through Setup) to a near-atlas visual and
structural standard, confirmed by a direct PNG comparison for Welcome and
Setup — this is materially further along than the task's framing ("Screen 06
is the next screen under consideration") suggested going in.

## What is incomplete

Two different kinds of incompleteness, worth keeping separate:

1. **Genuinely missing product surface**, confirmed absent: AI Concierge (3
   screens), any payment/checkout/earnings/payout surface (7 screens),
   services & pricing, availability, live worker tracking/route, a shared
   work checklist, saved workers (unconfirmed either way), tips, and a
   dedicated in-app notification feed (the backend outbox already exists;
   no screen reads it).
2. **Existing functionality that simply hasn't been re-skinned or re-shaped**
   into the atlas's screen boundaries yet — most of the Customer posting
   flow (Screens 12–15), bid comparison (27–30), and both public profile
   screens (22/63) are functionally complete today but merged into fewer,
   differently-organized screens than the atlas specifies. This is UI/IA
   work over working logic, not new product.

The full 66-row breakdown, with a status and classification for each, is in
[02_SCREEN_CROSSWALK.md](02_SCREEN_CROSSWALK.md).

## Highest-risk areas

1. **Mode persistence has no home.** The Setup screen's "Start in" choice is
   a one-time, device-local navigation hint (`AsyncStorage`, consumed once)
   — not a durable mode. Building the atlas's dual-navigation architecture
   on top of this without first deciding where "mode" actually lives would
   create rework. See [05](05_DATA_AND_STATE_MODEL_PLAN.md).
2. **The mode-split navigation change itself (Phase 3) touches the root
   navigator every signed-in user hits** — the single highest
   regression-risk phase in the whole plan, by construction, not by guesswork.
3. **Payments are entirely unbuilt**, and the atlas has money-language rules
   (never say "paid" for authorized/held funds) that this repo's existing
   `budget_cents`-integer-money discipline is well-positioned to extend
   correctly, but only once a provider and fee model are chosen — a product
   decision, not an engineering one.
4. **Live-deployment verification gap.** `scripts/verify-schema.mjs` checks
   phases 15–39 only; phases 1–14 and phase 40 have no live-existence check
   at all, and `supabase/tests/phase29_security_contract.sql` is stale
   (asserts a signature phase37 already replaced). Cheap to fix, currently
   unfixed.
5. **Two open schema design questions** flagged rather than guessed at:
   whether open-job bid counteroffers reuse the existing `job_requests`
   negotiation mechanism or need their own, and whether the existing
   moderation `reports` table is extended for job disputes or a parallel
   table is added.

## Largest opportunities for reuse

The entire marketplace core (§ above), the phone-auth provider-adapter
pattern (`lib/phoneAuth/` — mock/supabase/disabled, chosen by an env var,
screens never branch on mode directly) as the **direct template** for every
other deferred integration in [06](06_DEFERRED_INTEGRATIONS.md), and the
`useSetupPermissions.ts` three/four-state permission model as the reference
pattern for every future OS-permission screen the atlas requires (location
tracking, camera access, notifications).

## Atlas-package limitations

The supplied package is richer than the task's framing assumed: alongside
the PDF, `README.md`, and `screen_map.json`, `design-reference/` also
contains all 66 full-resolution PNGs directly (not just inside the nested
`_extracted/` folder, which additionally has a working HTML
gallery/prototype). This audit used the PDF's text (cross-confirmed
identical in content to `screen_map.json`) for all 66 screens' purpose/
actions/transitions, and spot-checked 2 of 66 PNGs (Welcome, Setup) for exact
visual comparison. **The remaining 64 screens' colors/spacing/type are
VISUAL DETAIL UNVERIFIED** — the crosswalk and design-system plan say so
explicitly rather than inventing hex values.

## Recommended implementation order

Per [07_PHASED_IMPLEMENTATION_PLAN.md](07_PHASED_IMPLEMENTATION_PLAN.md):
Phase 0 (close cheap verification gaps) → Phase 1 (design-system tokens,
starting from the already-close auth surface) → Phase 2 (resolve the mode-
persistence decision) → Phase 3 (mode-split navigation + the posting/bidding
vertical slice, which functionally already exists) → Phases 4–6 (completion/
trust/messaging, in any order the user prefers) → Phase 7 (AI Concierge,
after manual posting stays reliable — it already is) → Phase 8 (all
production integrations, gated on product/legal decisions, never bundled).

## Top 10 decisions that must remain consistent throughout V2

1. One account, two **modes** — never a role field, never a second
   authentication identity. Already correctly unenforced at the schema
   level; keep it that way.
2. Money is integer cents everywhere (`budget_cents`, `amount_cents`,
   `final_amount_cents`), formatted only through the existing formatter —
   already upheld throughout, including in every net-new payment/tip/payout
   table this plan proposes.
3. A job is only ever assigned by the database, through `accept_bid()` or
   `respond_job_request()` — never client-set. Already true; every future
   RPC must follow the same shape.
4. Bids and job requests stay two separate systems — do not merge them to
   "simplify" the open-job counteroffer question in
   [05](05_DATA_AND_STATE_MODEL_PLAN.md); resolve it as its own decision.
5. Every new deferred/paid integration gets a provider-adapter interface
   before it gets a UI screen, following `lib/phoneAuth/`'s exact shape —
   this is not a suggestion, it is the only pattern this codebase has
   actually proven works.
6. Never claim a trust signal that isn't real — no fabricated ratings,
   reviews, verification, or "paid" language for authorized/held funds.
   Already correctly upheld (`VerificationBadge` is honestly labeled
   UI-only; nothing found fabricates review data).
7. Exact job location and any future live-tracking coordinate data stay off
   the Realtime publication and behind a narrow SECURITY DEFINER function —
   `job_locations`' existing pattern must be repeated exactly for Screens
   33/56, not reinvented.
8. Never weaken an existing RLS policy or grant to ship a feature faster —
   add a narrow new SECURITY DEFINER function instead. Already the
   established pattern across all 40 migration phases; CLAUDE.md already
   states this rule explicitly.
9. Migrations are hand-written, sequential, idempotent SQL files handed to
   the user to run — never executed against production by an agent, and
   every new function needs an explicit `grant execute` (the phase32
   lesson).
10. Route names are preserved, not renamed to match atlas slugs — the atlas
    slugs are documentation, not a code contract; renaming working routes is
    pure regression risk with zero functional benefit.

## Direct assessment: incremental refactor, not rewrite

**Incrementally refactor. Do not rewrite.** This is not a hedge —
`npm run typecheck`/`lint`/`test` are clean, the marketplace vertical is
RPC-hardened end to end with real regression tests guarding the security
posture, and the newest work on this exact branch already tracks the atlas
closely for the first six screens. A rewrite would discard a working,
tested, security-hardened backend and a genuinely-advanced onboarding
redesign to rebuild what already works. The real gap — dual-mode navigation
and the payment/trust surfaces the atlas adds — is additive work layered
onto this foundation, not a reason to discard it.

## Recommended immediate next task

[09_SETUP_IMPLEMENTATION_HANDOFF.md](09_SETUP_IMPLEMENTATION_HANDOFF.md) /
[10_NEXT_CLAUDE_PROMPT.md](10_NEXT_CLAUDE_PROMPT.md): a bounded token-
verification pass on the already-built Setup/LegalGate screens against the
real atlas source, explicitly **not** touching the mode-persistence question
(that's Phase 2, a separate decision). This is deliberately the smallest
possible next step, not the mode-split work — that comes after the user
decides how mode should be stored.
