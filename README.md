# BRAZOS

BRAZOS is a two-sided local-labor marketplace: customers post jobs (handyman
work, cleaning, moving, errands and similar), workers respond with offers,
and hiring, payment state and job lifecycle are coordinated in-app. It ships
as an Expo iOS app — every account carries both capabilities (posting work
and taking work), presented as two switchable UI modes.

## Stack

- **App:** Expo / React Native / React / TypeScript — exact versions in
  `package.json`, which is the single source (`AGENTS.md` forbids pinning one
  here). iOS is the shipping target; Android is deferred (config exists,
  nothing is built or tested for it); the web/PWA surface is frozen.
- **Backend:** Supabase (`@supabase/supabase-js`), with all
  assignment/lifecycle writes behind SQL RPCs and row-level security.
- **Navigation:** React Navigation, two separately-typed trees
  (`navigation/CustomerRoot.tsx`, `navigation/WorkerRoot.tsx`) under
  `navigation/ModeShell.tsx`.
- **Node:** the version in `.nvmrc` (currently 24) — CI installs from it.

## Install and run

```
npm install
cp .env.example .env   # then fill in the Supabase staging values
npx expo start         # Metro dev server; open in a dev client / Expo Go
```

**Credentials are not in the repository.** `.env` and `start.ps1` are
gitignored, have never been committed on any ref, and are supplied by the
operator. `.env.example` documents the required variables without secrets.

## Tests

```
npm run verify
```

That is the canonical offline check: `npm run lint` (a strict `tsc --noEmit`
with `noUnusedLocals`/`noUnusedParameters`) followed by `npm test`
(`node --test tests/*.test.mjs`). It contacts no network and no database. A
failing test is a failure — there are no blessed reds. `.github/workflows/`
runs the same check in CI.

## Where things live

| Area | Path |
| --- | --- |
| App entry | `index.ts` → `App.tsx` |
| Screens / components / shared UI | `screens/`, `components/`, `ui/` (tokens in `ui/tokens.ts`, themed via `lib/theme.ts`) |
| Domain and data logic | `lib/`, `hooks/`, `modes/` |
| Navigation trees and route types | `navigation/`, `lib/navigation.ts` |
| Tests (fences included) | `tests/` |
| Repo tooling and harnesses | `scripts/` (e.g. `shots.mjs` screenshot harness, `verify-schema.mjs`) |
| Dev-only tools and launchers | `dev-tools/` |
| Database migrations | `supabase/` |
| Documentation | `docs/` — see `docs/README.md` for the index |

## Database migrations

Schema changes are timestamped files under `supabase/migrations/`. A push that
touches `supabase/` starts `.github/workflows/staging.yml`, which verifies, then
applies every pending migration, then deploys the edge functions — in that order,
so a function never reaches staging ahead of the migration it depends on. There
is no SQL Editor step for staging and no operator tap. The one exception is a
migration that drops or renames a database object: the safety scan stops the
pipeline and a human decides.

**Production is never automated.** It stays hand-applied by the operator, one
migration at a time; no job in this repository targets it. Applied migration
files are history — never edited, renamed or reordered.

`CLAUDE.md` §Supabase owns this policy; the lines above are a pointer to it, not
a second copy.

## Design authority

The Emerald Prestige screen designs live in `docs/mockups/`: the NUMBERED
masters (`1_*.png` … `44_*.png`) are binding, indexed and measured by
`docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`, with implementation history in
`docs/mockups/PRESTIGE_RUN_REPORT.md`. The word-named renders in
`docs/mockups/rejected/` were rejected by the operator and are not
authority. Design tokens have one source, `ui/tokens.ts`; `docs/design/` is
operator-authored reference material.

## Governing documents

| Document | Role |
| --- | --- |
| `CLAUDE.md` | Permanent policy and invariants. Binding on all automated work. |
| `docs/GATES.md` | The phase gates: the open Gate 3 (closed Gates 0–2 are in `docs/archive/`). Binding — named by `CLAUDE.md`. |
| `docs/SCOPE.md` | The v1 feature list, plus the frozen list of what already exists beyond it. Binding — named by `CLAUDE.md`. |
| `AGENTS.md` | Reading order for an agent starting a session. |
| `HANDOFF.md` | Current operational context: Now / Blocked / Next / Revert only (per-run history is in `docs/handoff-archive/`). |
| `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` | The one roadmap owner — never current state. |
| `docs/architecture.md` | Implemented architecture. |
| `docs/README.md` | Index and classification of every documentation surface. |

Machine state — branch, HEAD, tree cleanliness — belongs to `git`, never to
a document.
