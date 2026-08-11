# BRAZOS — Repository Instructions

These are permanent working rules for this repository. Follow them every
session, not just when reminded.

## Development mode

- Default and primary target: **Expo / iOS / Android** native app development.
- **Web and PWA development is frozen.** Do not touch web-specific code,
  styling, behavior, or deployment unless the user explicitly asks for
  web/PWA work in that specific message. Adjacent-looking tasks do not
  imply web work is in scope.
- Expo's APIs change significantly between SDKs. Before writing any
  Expo-related code, check the versioned docs for the SDK actually installed
  (see the `expo` version in `package.json`) at
  `https://docs.expo.dev/versions/vXX.0.0/` — don't assume from general
  knowledge or an older SDK's behavior.

## Do not modify unless explicitly requested

This is the frozen web/PWA surface. Leave it untouched even when a task
seems adjacent to it:

- `public/`
- `hosting/`
- `dist/`
- `WEB_DEPLOYMENT.md`
- the service worker
- PWA startup/bootstrap logic
- web deployment configuration
- `*.web.ts` / `*.web.tsx` platform-split files
- the web-specific map implementation

If a task genuinely requires touching one of these, stop and confirm with
the user first — don't assume it's in scope because it seemed necessary.

## Engineering rules

- **Scope discipline** — only inspect files actually required for the
  current task. Never perform repository-wide audits or sweeps unless
  explicitly requested.
- **Smallest safe change** — prefer the minimal diff that correctly
  addresses the request over a more thorough rewrite.
- **No unrelated refactors** — don't restructure, rename, or "clean up"
  working code that isn't part of the request, no matter how improvable it
  looks.
- **No unrequested features** — implement what was asked, not adjacent
  functionality that seems like a natural next step.
- **No `git push`.**
- **No deploys** — web, mobile, or otherwise.
- **No modifying production Supabase** — schema, data, or config. Write new
  migrations as SQL files for the user to review and run themselves; never
  execute changes against production directly.
- **Minimal validation** — run only the validation/build/typecheck commands
  relevant to what actually changed, not the full suite by default.

## Before editing anything

Always run `git status` first and report the current branch and whether the
tree is clean, before making any change. If the branch or tree state looks
unexpected, flag it to the user rather than proceeding silently.

**Required branch: `mainexpo`.** If HEAD is on any other branch, stop and
report it — do not switch branches and do not edit.

## Verified architecture

Full detail (tables, RPCs, buckets, who-may-do-what) lives in
[docs/architecture.md](docs/architecture.md). The short version:

- Entry point `index.ts` → `App.tsx`. Navigation is a 5-tab bottom bar
  (Home / Map / My Jobs / Messages / Profile), each tab a native stack. All
  route param types live in `lib/navigation.ts`.
- `screens/` are routed screens, `components/` are shared UI, `hooks/` are
  data hooks, `lib/` is data access + domain logic. Design tokens are in
  `lib/theme.ts` — never hardcode a hex value in a screen.
- Supabase is the entire backend. `lib/supabase.ts` is the client; every
  table read/write and RPC call goes through a module in `lib/`.
- Migrations are hand-run SQL files in `supabase/phaseNN_*.sql`, applied in
  numeric order. They are the schema's source of truth; there is no
  Supabase CLI migration directory.

## Test and validation commands

| Command | What it does |
| --- | --- |
| `npm run verify` | Lint + tests. The default check after a change. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | typecheck plus `--noUnusedLocals --noUnusedParameters` |
| `npm test` | `node --test tests/*.test.mjs` (source-level guard tests) |
| `node scripts/verify-schema.mjs` | Asks the live database what actually exists. Needs `.env`. |

Run the narrowest one that covers what changed; `npm run verify` once at the
end of a batch of work.

Known pre-existing failure: `tests/pwa.test.mjs` → "web build is installable
and receives hosted runtime configuration" expects `config.js?v=20260731-1`
while `public/index.html` ships `-2`. Both sides are on the frozen web/PWA
surface, so it is left alone deliberately. 12 of 13 tests pass; treat that as
green for native work.

## Critical business invariants

Break any of these and the marketplace is wrong, not just ugly.

- **Money is integer cents** (`budget_cents`, `amount_cents`,
  `final_amount_cents`). Never store or compare dollars. Format only through
  `formatBudget()`.
- **A job is only ever assigned by the database.** `accept_bid()` (open-job
  bidding) and `respond_job_request()` (private direct offers) are the only
  two paths. Never set `assigned_worker_id` or `status` from the client.
- **Bids and job requests are separate systems on purpose.** Bids are the
  public competition on an open job; job requests are a private two-party
  negotiation with alternating turns. Do not merge them.
- **A job request creates no job row until it is accepted.**
- **Status flow** is `open → assigned → in_progress → completed`, and only
  `transition_job_status()` may move it.
- **A user is both customer and worker.** There is no role switch, no mode,
  and no role gate — the same account posts jobs and takes work.
- **Never invent marketplace data.** No placeholder ratings, fake review
  counts, stub work history, or stock imagery standing in for real uploads.

## Supabase migration rules

- Never run anything against production. Write the SQL, hand it over.
- New file, next number: `supabase/phaseNN_short_name.sql`. Never edit an
  already-deployed migration (phase29–32 in particular are deployed and
  verified).
- Migrations must be **idempotent** — safe to paste twice.
- **phase32 revoked default EXECUTE on new functions.** Any new function
  needs an explicit `grant execute … to authenticated;` or it is unreachable
  from the app.
- Never weaken RLS, a policy, or a grant to make a feature work. If a feature
  needs data the caller cannot see, add a narrow `security definer` function
  that returns only what is needed.
- Changing an existing RPC's parameter list means `drop function` with the
  full old signature, then create the new one, then re-grant.

## Mobile UX requirements

- Every screen is wrapped in `SafeAreaView` from
  `react-native-safe-area-context` with explicit `edges`. Screens inside the
  tab bar do not add bottom padding — `MainTabs` already owns that inset
  (there is a test asserting this).
- Any screen with a text input needs `KeyboardAvoidingView`
  (`behavior="padding"` on iOS only) around a `ScrollView` with
  `keyboardShouldPersistTaps="handled"`, and the submit control must stay
  reachable with the keyboard open.
- Use `lib/dialog.ts` (`alertAsync` / `confirmAsync`), never `Alert.alert` —
  `Alert` is a no-op on web and breaks control flow.
- Touch targets ≥ 44pt; long titles and locations get `numberOfLines` plus a
  flex parent so they truncate instead of pushing siblings off-screen.
- Animation uses the built-in `Animated` API with
  `useNativeDriver: Platform.OS !== 'web'`. No animation library is installed
  and none should be added.

## BRAZOS V2 — Emerald Trust

### References
- docs/emerald-v2/references/screen_map.json + NN_slug.png (immutable).
- Audit docs: docs/emerald-v2/SCREEN_CROSSWALK.md, DESIGN_SYSTEM_STATUS.md.
- Roadmap: BRAZOS_MASTER_PLAN.md. Session state: BRAZOS_BUILD_STATE.md
  (read BUILD_STATE first, always).

### Locked — never modify
- App screens 01–07 (Launch→Customer Home) and 48 (Worker Home): finished.
- The frozen PWA/web build. The emerald-v2 reference files.

### Scope
- AI screens 09–11 and all LLM dependencies are OUT of V1. Manual posting
  produces a JobDraft; nothing may depend on AI.

### Non-negotiable architecture
- One account, two modes. Mode changes ONLY via switchMode() with confirm
  + stack reset. Customer and Worker navigator trees are separately typed;
  cross-tree navigation must be a compile error.
- Customer surfaces: EST. PRICE, no bid CTAs, no worker payout info,
  approximate location only. Worker surfaces: EST. PAY + bid actions.
  JobCard perspective comes from ModeContext, never a hand-passed prop.
- Job/offer/payment statuses come from generated DB enums via the RPCs
  advance_job_status / accept_offer. No string literals, no raw UPDATEs.
- Exact address lives in job_private_details: owner + hired worker only,
  enforced by RLS, never only by the frontend.
- Money labels follow the payment state machine. Never "paid" before
  released. Never fake production payment states.

### UI rules
- Every screen consumes ui/tokens.ts + shared primitives/templates. No
  per-screen hex, radii, or spacing. Templates provide loading/empty/
  error/offline/permission-denied — configure them, don't reinvent them.
- Recoverable errors preserve user input. Failed uploads never clobber
  existing media. Destructive actions confirm; reversible ones get undo.
- Phones stored E.164. SafeArea everywhere; no absolute positioning to
  match PNGs; references are direction, not canvases.

### Workflow
- Migrations: numbered SQL in supabase/, hand-applied; only a green
  `node scripts/verify-schema.mjs` counts as applied. Regenerate types.
- Base branch mainexpo; work on v2; one commit per milestone; clean tree.
- Flag new dependencies before adding. No unrelated cleanup.
- Follow the PROTOCOL in BRAZOS_MASTER_PLAN.md §L for every task.
