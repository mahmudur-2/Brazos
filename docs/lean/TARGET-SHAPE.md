# TARGET-SHAPE (Phase C2, Fable). What the repo looks like when Phase D is done.

## Folders that remain
```
App.tsx  index.ts  app.config.ts  eas.json  package.json  package-lock.json
babel.config.js  metro.config.js  tsconfig.json  .nvmrc  .gitignore  .gitattributes  LICENSE
README.md  CLAUDE.md  HANDOFF.md  .env.example
assets/        brand (2 PNG), glyphs (8), prestige (3 webp + 4 soft layers)
components/    ~125 files (from 159)
hooks/         ~38 files (from 45)
lib/           ~128 files (from 148)
modes/         5 files
navigation/    4 files
screens/       ~45 files (from 54)
ui/            ~22 files (from 28): tokens.ts, colorAlpha.ts, primitives/, templates/
config/env.ts  types/database.ts
supabase/      config.toml, seed.sql, migrations/ (35 + lean_v1 + lean_v1_grants),
               functions/ (9), tests/ (pgTAP, minus cut features, plus grants + trigger tests)
tests/         ~105 files (from 140)
scripts/       eas-build-pre-install.mjs, supabase-ref.mjs, staging-scan.sh
.maestro/      flows written in Phase F (one per screen group)
.github/workflows/  ci.yml, pgtap.yml, staging.yml, e2e-ios.yml (new, macOS runner)
.claude/       settings.json (deny list), rules/, skills/testsprite-*
docs/          ARCHITECTURE.md, DECISIONS.md, TESTING.md, BACKLOG.md
_archive/2026-11-lean/   git-ignored: everything moved, with MOVED.txt
```
Gone: dev-tools/, public/, hosting/, .eas/, .openai/, docs/mockups and 560 other docs files,
41 scripts, the web and android config, every `*.web.*` file.

## Numbers to hit (checked in Phase H against `git ls-files`)
| measure | before | target |
|---|---|---|
| tracked files | 1,497 | under 650 |
| code lines (.ts .tsx .mjs .sql, no types/database.ts) | 32,794 | under 27,000 |
| dependencies | 54 | 38 |
| devDependencies | 7 | 4 (supabase, typescript, babel-preset-expo, @types/react) |
| docs files | 570 | 4 (+ README, CLAUDE, HANDOFF at root) |
| tests (node) | 140 files, 1,630 cases | about 105 files; every kept case green |
| pgTAP | 32 files, 1,893 cases | minus cut features; every kept case green |
| edge functions | 12 | 9 (translate, send-live-cards, worker-search gone) |
| tables | 41 | 29 (12 dropped: 3 dead, 9 cut) |
| SQL functions | 208 | about 115 (41 probes, 13 cut, 12 dead, ~27 maybe-dropped) |
| feature flags | 12 | 0 |
| themes | 2 | 2 |

## Dependencies that stay (38)
@expo/vector-icons, @react-native-async-storage/async-storage, @react-native-community/netinfo,
@react-navigation/bottom-tabs, native, native-stack, @sentry/react-native,
@stripe/stripe-react-native, @supabase/supabase-js, @tanstack/react-query, expo, expo-blur,
expo-dev-client, expo-device, expo-file-system, expo-haptics, expo-image, expo-image-picker,
expo-location, expo-notifications, expo-secure-store, expo-sharing, expo-speech-recognition,
expo-status-bar, expo-updates, expo-video, react, react-native, react-native-gesture-handler,
react-native-keyboard-controller, react-native-maps, react-native-reanimated,
react-native-safe-area-context, react-native-screens, react-native-url-polyfill,
react-native-worklets, zod.

## Architecture rules that stay (unchanged, now in CLAUDE.md + ARCHITECTURE.md only)
- `accept_offer()` is the only assignment path; `transition_job_status()` the only status mover.
- `job_offers` is RPC-write-only; messaging opens after an accepted offer.
- Money is integer cents through `formatBudget()`; `quote_job_price()` is the only fee math;
  the ledger is the payment state machine; no work before `held`.
- Payments mode is `stripe` or `disabled`; there is no practice-money path.
- Exact address only in `job_locations`; open-market surfaces show the approximate area.
- One account, two modes; `switchMode()` is the only mode change.
- Production Supabase is never contacted; `.env` stays on staging; migrations go to staging only
  through the pipeline.

## Env (names only)
EXPO_PUBLIC_APP_VARIANT, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY,
EXPO_PUBLIC_PAYMENTS_MODE (`stripe`), EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, EXPO_PUBLIC_SENTRY_DSN,
EXPO_PUBLIC_PHONE_AUTH_MODE (`supabase` for real SMS; `mock` in dev only).
Removed: EXPO_PUBLIC_POSTHOG_KEY, the TWILIO_* values (they belong in the Supabase dashboard).
