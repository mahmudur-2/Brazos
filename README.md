# BRAZOS

BRAZOS is a two-sided local-labor marketplace: customers post jobs (handyman
work, cleaning, moving, errands and similar), workers respond with offers,
and hiring, payment state and job lifecycle are coordinated in-app. It ships
as an Expo iOS app — every account carries both capabilities (posting work
and taking work), presented as two switchable UI modes.

## Stack

- **App:** Expo SDK 54 (`expo` 54.0.36) / React Native 0.81 / React 19 /
  TypeScript 5.9. iOS is the shipping target; Android is deferred (config
  exists, nothing is built or tested for it); the web/PWA surface is frozen.
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
| Repo tooling and harnesses | `scripts/` (e.g. `home-shots.mjs` screenshot harness, `verify-schema.mjs`) |
| Dev-only tools and launchers | `dev-tools/` |
| Database migrations | `supabase/` |
| Documentation | `docs/` — see `docs/README.md` for the index |

## Database migrations

Schema changes are numbered files, `supabase/phaseNN_*.sql`. They are
**hand-applied by the operator** (staging first; production only through the
human-executed queue in `PROD_APPLY.md`) — no tool in this repository
executes SQL. A migration counts as applied only when
`node scripts/verify-schema.mjs` (which needs `.env` and live staging)
comes back green. Applied migration files are history: they are never
edited, renamed or reordered.

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
| `AGENTS.md` | Reading order for an agent starting a session. |
| `HANDOFF.md` | Current operational context (live edge only; per-run history is in `docs/handoff-archive/`). |
| `BRAZOS_MASTER_PLAN.md` | Roadmap intent — never current state. |
| `docs/architecture.md` | Implemented architecture. |
| `docs/README.md` | Index and classification of every documentation surface. |

Machine state — branch, HEAD, tree cleanliness — belongs to `git`, never to
a document.
