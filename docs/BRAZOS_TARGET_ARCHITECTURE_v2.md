# BRAZOS — Target Architecture, file by file

> **SUPERSEDED 2026-08-29 by `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` (run V3, commit `462f5b3`). Kept for history only: nothing below is authoritative, and where this file and v3 disagree, v3 wins.**

**Revision 2 (2026-08-27).** Revision 1 is superseded. Evidence basis: the project
bundles as uploaded (SNAPSHOT of `mainexpo`), read this session, plus a second-model
review of revision 1 adjudicated point by point. Stripe, Supabase and Apple claims
that could cost money or a dispatch were re-verified against current vendor
documentation this session and are marked **VERIFIED**. Anything marked **INFERRED**
is a design judgment, not a repo fact. Anything marked **UNKNOWN** names the probe
that settles it.

Vocabulary: **held in protection** everywhere in copy, code and docs. Never the e‑word.

### What changed from revision 1

Nine correctness fixes to the payment code, five business decisions promoted out of
the schema into §12 where you decide them, three launch blockers added to the critical
path, and one re-sequencing. The three that would have shipped broken:

1. `brazos://` Connect return URLs **fail at account-link creation in live mode** —
   VERIFIED: Stripe accepts non-HTTPS only in test mode and requires HTTPS URLs before
   going live. Fixed in §5.3 with an edge-function bounce page that needs no domain.
2. The webhook returned **200 on a Stripe retry without ever applying the event** —
   a permanently stuck ledger row after any transient apply failure. Fixed in §5.3.
3. Tips were **born `released` before the customer paid**. Fixed in §5.2.

Revision 1's engineering skeleton is unchanged and was correct: ledger as the only
truth moved by provider events, separate charges and transfers, one config path, CLI
migrations with tests, broadcast instead of table listeners, screen-shaped queries.

---

## 0. The six principles every change below follows

1. **The ledger is the state machine; providers are event sources.** `payments`
   keeps `unfunded → held → released → paid_out` (+ failed / voided / refunded /
   partially_refunded). Stripe never *is* the truth in the app; Stripe *events* move
   the ledger through one idempotent SQL function. Screens read the ledger only.
2. **The promise is the product: no work starts before the ledger says `held`.**
   "Held in protection" is the reason a stranger lets a stranger into their kitchen.
   If a job can be worked and completed with nothing held, the promise is decoration.
   The gate lives in the database (§5.2), not in a screen.
3. **One mechanism per concern.** One config path (`EXPO_PUBLIC_*` + EAS
   environments), one data-access pattern (TanStack Query + screen-shaped RPCs),
   one realtime transport (Broadcast from DB triggers), one test pyramid
   (pgTAP → unit → Maestro), one trunk with a PR gate.
4. **Push composition into Postgres.** A screen that needs six queries gets one
   RPC/view shaped for it (`my_inbox()`, `job_detail(p_job_id)`). RLS stays on the
   tables; the RPC is SECURITY INVOKER unless it must cross a policy.
5. **Native dependencies travel in batches, one build per batch.** Every lazy,
   caught `require()` boundary in the repo (`lib/blur.tsx`, `lib/haptics.ts`,
   `components/RemoteImage.tsx`, `lib/secureSessionStorage.ts`,
   `lib/motion120/vendor.ts`) exists only because installed binaries lagged
   `package.json`. Fix the cadence (fingerprint check in CI), then delete the
   boundaries.
6. **Comments say *why* in one line. Decisions live in `docs/adr/`.** The repo is
   21 % comment prose (HomeScreen 43 %). Every agent read pays for it.

---

## 1. Target tree

`NEW` create · `CHG` modify · `MOV` move · `DEL` delete. Unmarked = unchanged.

```
brazos/
├── app.config.ts                         NEW  replaces app.json (variants, plugins, appVersion policy)
├── app.json                              DEL
├── eas.json                              CHG  development / preview / production / e2e-test; no keys inline
├── babel.config.js                       CHG  dotenv plugin removed
├── env.d.ts                              DEL
├── package.json                          CHG  deps batch + scripts
├── tsconfig.json                         CHG  paths for @/features, @/lib; include supabase/functions typecheck separately
├── .env.example                          CHG  EXPO_PUBLIC_* names
├── .github/workflows/
│   ├── ci.yml                            CHG  on PR: verify + supabase start + db reset + test db + gen-types drift
│   └── db-push.yml                       NEW  on merge → staging migrate; production stays hand-applied (§4.4)
├── .eas/workflows/
│   ├── e2e-ios.yml                       NEW  simulator build + Maestro ON MERGE, not on every PR
│   └── release.yml                       NEW  production build → TestFlight; OTA with rollout
├── .maestro/
│   ├── smoke.yml                         NEW
│   ├── customer-post-hire-pay.yml        NEW
│   └── worker-bid-complete.yml           NEW
├── config/
│   └── env.ts                            NEW  zod-validated typed env
├── types/
│   └── database.ts                       NEW  generated (`supabase gen types`), committed
├── lib/
│   ├── supabase.ts                       CHG  createClient<Database>, env from config/env, static SecureStore import
│   ├── supabase.web.ts                   CHG  same env source
│   ├── remoteConfig.ts                   NEW  reads public.app_config: kill switch + minimum build (§5.2)
│   ├── query/
│   │   ├── client.ts                     NEW  QueryClient + persister + online/focus managers
│   │   ├── keys.ts                       NEW  query-key factory
│   │   └── realtime.ts                   NEW  broadcast → invalidate bridge
│   ├── observability/
│   │   ├── sentry.ts                     NEW
│   │   └── analytics.ts                  NEW  typed funnel events, customer AND worker side
│   ├── i18n/
│   │   ├── index.ts                      NEW
│   │   ├── money.ts                      NEW  Intl-based formatBudget (replaces the one in lib/jobs.ts)
│   │   └── locales/en.json               NEW  English only until a cohort justifies a second locale (§8)
│   ├── payments/
│   │   ├── ledger.ts                     MOV  from lib/payments.ts (types + pure predicates only)
│   │   ├── provider.ts                   NEW  PaymentProvider interface + result types
│   │   ├── stripe.ts                     NEW
│   │   ├── sandbox.ts                    MOV  from lib/adapters/payments.ts
│   │   ├── mode.ts                       MOV  from lib/adapters/paymentsMode.ts (+ 'stripe')
│   │   └── index.ts                      NEW  selection
│   ├── adapters/                         DEL  (contents moved above)
│   ├── payments.ts                       DEL  (→ lib/payments/ledger.ts)
│   ├── featureFlags.ts                   CHG  12-line table; history → docs/adr/0007-feature-flags.md
│   ├── blur.tsx / haptics.ts             CHG  static imports; fallbacks deleted
│   └── motion120/vendor.ts               CHG  static import of gesture-handler
├── features/                             NEW  skeleton in R10a, populated as the redesign sweep rewrites screens
│   ├── jobs/  offers/  payments/  messaging/  discovery/  profile/  notifications/
├── components/RemoteImage.tsx            CHG  static expo-image import; blurhash + transform support
├── components/AppErrorBoundary.tsx       CHG  Sentry.captureException
├── App.tsx                               CHG  provider stack (see §3, §7)
├── supabase/
│   ├── config.toml                       NEW  (`supabase init`)
│   ├── seed.sql                          NEW  from scripts/seed-phase-*.sql
│   ├── migrations/
│   │   ├── 20260901000000_baseline.sql   NEW  `supabase db dump --schema public,storage` of staging, once
│   │   ├── 20260901000001_roles.sql      NEW  `--role-only` dump, same pass
│   │   ├── 20260905000000_stripe_foundation.sql   NEW  §5.2 — payments + indexes, one file
│   │   ├── 20260912000000_broadcast.sql           NEW  §6.2
│   │   └── 20260913000000_screen_rpcs.sql         NEW  §7 (my_inbox, job_detail)
│   ├── phase*_*.sql                      MOV  → docs/archive/migrations-v1/ (history; never applied again)
│   ├── functions/
│   │   ├── _shared/{stripe.ts,supabase.ts,sentry.ts,cors.ts}   NEW
│   │   ├── create-payment/index.ts       NEW
│   │   ├── stripe-webhook/index.ts       NEW  platform events (deployed --no-verify-jwt)
│   │   ├── stripe-connect-webhook/index.ts NEW connected-account events (--no-verify-jwt)
│   │   ├── connect-onboarding/index.ts   NEW
│   │   ├── connect-return/index.ts       NEW  HTTPS bounce into the app; no domain required
│   │   ├── connect-status/index.ts       NEW  on-demand payouts_enabled refresh
│   │   ├── process-transfers/index.ts    NEW  (pg_cron + pg_net, like drain_notification_outbox)
│   │   ├── payments-sweeper/index.ts     NEW  unprocessed events + expired funding windows
│   │   ├── moderate-upload/index.ts      NEW  (image moderation + blurhash) — R10, not launch
│   │   └── send-push/ translate/ worker-search/   (exist; not in bundles)
│   └── tests/
│       ├── _helpers.sql                  NEW  auth-as-user helpers
│       ├── 010_offers.sql                NEW  from scripts/phase5/6-proof.sql
│       ├── 020_lifecycle.sql             NEW  from scripts/lifecycle-proof.mjs + phase6-proof
│       ├── 030_payments.sql              NEW  the money file; R4's gate
│       ├── 040_conversations.sql         NEW  from phase7/77 proofs
│       └── 001_rls_matrix.sql            NEW  DEFERRED past launch except the payments/profile rows
├── scripts/
│   ├── verify-schema.mjs                 DEL  after R3 (replaced by `supabase migration list` + pgTAP)
│   ├── eas-build-pre-install.mjs         CHG  ~60 lines: profile → expected project ref only
│   ├── phase*-proof.sql                  MOV  → docs/archive/proofs-v1/ after pgTAP conversion
│   ├── staging-acl-bootstrap.sql         DEL  (baseline migration carries grants)
│   └── shots.mjs                         keep (harness); registry extended per screen as today
├── docs/
│   ├── adr/0001-payments-ledger-as-projection.md ... NEW
│   ├── policies/money.md                 NEW  fees, cancellation, change orders, disputes, 72h — the text ToS quotes
│   ├── runbooks/refunds.md               NEW  the manual refund + chargeback runbook (§5.5)
│   ├── archive/                          + PROD_APPLY.md, PROD_APPLY_READY.sql, PROD_VERIFY.sql, DIAG_*.md, mockups/PRESTIGE_RUN_REPORT.md
│   └── mockups/                          keep numbered masters; rejected/ DEL
├── design-reference/screen_map.json      DEL  (byte-duplicate of the _extracted copy)
├── HANDOFF.md                            CHG  ≤ 200 lines, fenced
├── CLAUDE.md                             CHG  §11 lists every edit
├── PROD_APPLY.md / PROD_APPLY_READY.sql / PROD_VERIFY.sql   MOV → docs/archive/
├── DECISIONS.md                          MOV  → docs/adr/0000-phases-6-12-decisions.md
└── tests/
    ├── handoffBudget.test.mjs            NEW
    └── (existing fences)                 frozen count; new fences require an ADR reference
```

`screens/`, `components/`, `hooks/`, `ui/`, `navigation/`, `modes/` stay where they
are; nothing moves for the sake of moving, and nothing moves ahead of the redesign
sweep that is going to rewrite those files anyway (§9).

Deferred past the first paid job and deliberately absent above: `20260910000000_rls_initplan_indexes.sql`
(the 42-policy `(select auth.uid())` rewrite), `20260911000000_postgis.sql`, the full
240-assertion RLS matrix, `lib/i18n/locales/es.json`. Rationale in §11.

---

## 2. Config and release — R1

### 2.1 `app.config.ts` (replaces `app.json`)

```ts
import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';
const VARIANT = (process.env.APP_VARIANT ?? 'development') as Variant;

const BUNDLE_SUFFIX: Record<Variant, string> = { development: '.dev', preview: '.preview', production: '' };
const DISPLAY_NAME: Record<Variant, string> = { development: 'BRAZOS Dev', preview: 'BRAZOS Beta', production: 'BRAZOS' };
const ICON: Record<Variant, string> = {
  development: './assets/brand/app-icon-dev.png',
  preview: './assets/brand/app-icon-beta.png',
  production: './assets/brand/app-icon-b-leaf.png',
};

const PROJECT_ID = 'c870820e-40cf-4367-9ae5-3eb2c6c8c481';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: DISPLAY_NAME[VARIANT],
  slug: 'BRAZOS',
  version: '1.0.0',
  scheme: 'brazos',
  orientation: 'portrait',
  icon: ICON[VARIANT],
  userInterfaceStyle: 'automatic',
  // Expo's current recommendation. Fingerprint stays a CI DETECTOR (see .github/workflows/ci.yml),
  // not the runtime key — so a .gitignore edit can never move the runtime again.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: `https://u.expo.dev/${PROJECT_ID}`, fallbackToCacheTimeout: 0 },
  ios: {
    bundleIdentifier: `app.brazos.mobile${BUNDLE_SUFFIX[VARIANT]}`,
    supportsTablet: false, // phone-tuned UI; iPad support is a separate, tested decision
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryAddUsageDescription: 'Brazos saves job and work photos you choose to share to your photo library.',
      NSFaceIDUsageDescription: 'Unlock hidden chats with Face ID.',
      // Foreground-only location by decision (lib/featureFlags.ts LIVE_LOCATION). No Always string,
      // no UIBackgroundModes — declaring an unused background mode is an App Review flag (2.5.4).
    },
  },
  android: { package: `com.brazos.app${BUNDLE_SUFFIX[VARIANT]}`, adaptiveIcon: { backgroundColor: '#082F27', foregroundImage: './assets/icon.png' } },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-font',
    ['expo-image-picker', { photosPermission: '…', cameraPermission: '…', microphonePermission: '…' }],
    ['expo-location', { locationWhenInUsePermission: 'BRAZOS uses your location to show nearby jobs and to place job locations on the map.' }],
    ['expo-audio', { microphonePermission: '…' }],
    ['expo-notifications', { color: '#1F4D3A' }],
    ['expo-speech-recognition', { microphonePermission: '…', speechRecognitionPermission: '…' }],
    'expo-video',
    'expo-secure-store',
    'expo-localization',
    ['@stripe/stripe-react-native', { merchantIdentifier: 'merchant.app.brazos.mobile', enableGooglePay: false }],
    ['@sentry/react-native/expo', { organization: 'brazos', project: 'brazos-ios', url: 'https://sentry.io/' }],
  ],
  extra: { eas: { projectId: PROJECT_ID }, variant: VARIANT },
  owner: 'mah_r2',
});
```

Why three bundle IDs: the co-founder's phone holds Dev (staging) and Beta at once
and can never post a real job into the wrong database by accident.

### 2.2 `config/env.ts` — the only place `process.env` is read

```ts
import { z } from 'zod';

const Schema = z.object({
  EXPO_PUBLIC_APP_VARIANT: z.enum(['development', 'preview', 'production']).default('development'),
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_KEY: z.string().min(20),
  EXPO_PUBLIC_PAYMENTS_MODE: z.enum(['sandbox', 'stripe', 'disabled']).default('disabled'),
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  EXPO_PUBLIC_PHONE_AUTH_MODE: z.enum(['mock', 'supabase']).default('mock'),
});

// Metro inlines ONLY static `process.env.EXPO_PUBLIC_X` reads — never loop or destructure here.
export const env = Schema.parse({
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY,
  EXPO_PUBLIC_PAYMENTS_MODE: process.env.EXPO_PUBLIC_PAYMENTS_MODE,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_PHONE_AUTH_MODE: process.env.EXPO_PUBLIC_PHONE_AUTH_MODE,
});

export const isProduction = env.EXPO_PUBLIC_APP_VARIANT === 'production';
```

A malformed environment fails at app start with a named field, not on the first
screen that touches it. `paymentsMode.ts`'s allow-list survives as the zod enum.

**`EXPO_PUBLIC_PAYMENTS_MODE` is a build-time value and therefore cannot be a kill
switch.** The switch that can be flipped without shipping lives in the database:
`public.app_config` (§5.2), read by `lib/remoteConfig.ts` at launch and enforced
server-side inside `begin_job_payment()`. An old build cannot route around it.

### 2.3 `lib/supabase.ts`

```ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { env } from '../config/env';
import { secureSessionStorage } from './secureSessionStorage';

export const supabase = createClient<Database>(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, {
  auth: { storage: secureSessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
```

`createClient<Database>` is the whole point: every `.from('jobs').select(...)`
and every `.rpc('accept_offer', …)` becomes compile-checked. The `as Payment`
casts in `lib/payments.ts` and the "status is a plain string" note in CLAUDE.md
go away in R3.

### 2.4 `lib/remoteConfig.ts` — the kill switch and the version floor

```ts
import { supabase } from './supabase';
import Constants from 'expo-constants';

export type RemoteConfig = { paymentsEnabled: boolean; minSupportedBuild: number; notice: string | null };
const FALLBACK: RemoteConfig = { paymentsEnabled: true, minSupportedBuild: 0, notice: null };

export async function loadRemoteConfig(): Promise<RemoteConfig> {
  const { data, error } = await supabase.from('app_config').select('payments_enabled, min_supported_build, notice').single();
  if (error || !data) return FALLBACK;   // never block the app on a config read
  return { paymentsEnabled: data.payments_enabled, minSupportedBuild: data.min_supported_build, notice: data.notice };
}

export function isBuildTooOld(cfg: RemoteConfig) {
  return Number(Constants.expoConfig?.ios?.buildNumber ?? 0) < cfg.minSupportedBuild;
}
```

Read once at launch into a `useQuery` with a 5-minute `staleTime`. `paymentsEnabled: false`
hides every checkout CTA and shows `notice`; the database refuses regardless, so a
stale client cannot start a payment. Flipping it is one SQL Editor statement.

### 2.5 `eas.json`

```json
{
  "cli": { "version": ">= 16.0.1", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true, "distribution": "internal",
      "channel": "development", "environment": "development",
      "env": { "APP_VARIANT": "development" }
    },
    "preview": {
      "distribution": "internal", "channel": "preview", "environment": "preview",
      "autoIncrement": true, "env": { "APP_VARIANT": "preview" }
    },
    "production": {
      "channel": "production", "environment": "production",
      "autoIncrement": true, "env": { "APP_VARIANT": "production" }
    },
    "e2e-test": {
      "withoutCredentials": true, "ios": { "simulator": true },
      "environment": "preview", "env": { "APP_VARIANT": "preview" }
    }
  },
  "submit": { "production": {} }
}
```

Environment mapping (EAS dashboard, `eas env:create`):

| EAS environment | Supabase project | Payments mode | Who |
| --- | --- | --- | --- |
| development | staging | sandbox | you, Metro/dev client |
| preview | staging | stripe (test keys) | you + co-founder, internal builds, E2E |
| production | production | stripe (live) | TestFlight testers and App Store |

This dissolves "preview means two things": **TestFlight is a distribution of a
`production` build, not its own environment.** `share` and `testflight` profiles
are deleted. No key ever appears in `eas.json` again — the legacy `eyJ…` key there
today moves to the EAS environment as `EXPO_PUBLIC_SUPABASE_KEY` and is replaced by
the `sb_publishable_…` key (legacy keys deprecate end of 2026).

**`e2e-test` builds on the `preview` environment, not `development`.** Revision 1 put
it on `development`, which maps to `sandbox` payments — so the Maestro flow whose whole
purpose is to run Stripe test card `4242` could never have reached Stripe. EAS supports
exactly three environments, so the e2e profile has to borrow one; `preview` is the one
with test-mode Stripe keys. `APP_VARIANT` moves with it so the build-time variant and
the runtime variant can never disagree, and the Maestro `appId` becomes
`app.brazos.mobile.preview`.

### 2.6 `scripts/eas-build-pre-install.mjs` — keep the pin, drop the rest

```js
#!/usr/bin/env node
import { refFromRestUrl, STAGING_REF, PRODUCTION_REF } from './supabase-ref.mjs';
const EXPECTED = { development: STAGING_REF, preview: STAGING_REF, 'e2e-test': STAGING_REF, production: PRODUCTION_REF };
const profile = process.env.EAS_BUILD_PROFILE;
if (!profile) { console.error('gate: not an EAS build'); process.exit(1); }
if (!(profile in EXPECTED)) { console.error(`gate: unknown profile ${profile}`); process.exit(1); }
const ref = refFromRestUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
if (ref !== EXPECTED[profile]) { console.error(`gate: profile ${profile} expects ${EXPECTED[profile]}, got ${ref ?? 'none'}`); process.exit(1); }
console.log(`gate: ${profile} → ${ref} ok`);
```

Everything else the 271-line version defended against (dotenv files on the
worker, key decoding) no longer exists once the Babel plugin is gone.

### 2.7 `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request: { branches: [mainexpo] }
  workflow_dispatch:
permissions: { contents: read }
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run verify                       # lint + node --test
      - uses: supabase/setup-cli@<sha>
        with: { version: latest }
      - run: supabase start -x studio,imgproxy,logflare,vector
      - run: supabase db reset                     # migrations + seed.sql on the local DB
      - run: supabase test db                      # pgTAP
      - run: supabase gen types typescript --local > /tmp/database.ts && git diff --no-index --exit-code types/database.ts /tmp/database.ts
      - run: npx expo-updates fingerprint:generate --platform ios > /tmp/fp.json   # native surface changed? label the PR
```

### 2.8 `.eas/workflows/e2e-ios.yml`

```yaml
name: E2E iOS
on:
  push: { branches: [mainexpo] }
  workflow_dispatch:
jobs:
  build_ios_simulator:
    type: build
    params: { platform: ios, profile: e2e-test }
  maestro_test:
    needs: [build_ios_simulator]
    type: maestro
    params:
      build_id: ${{ needs.build_ios_simulator.outputs.build_id }}
      flow_path: ['.maestro/smoke.yml', '.maestro/customer-post-hire-pay.yml']
```

**On merge, not on every PR.** Revision 1 triggered a full iOS simulator build per
pull request. EAS build minutes are metered and a JS-only PR does not need a new
binary. Trigger on merge to `mainexpo` plus `workflow_dispatch` for the PRs that
warrant it, and let EAS reuse the previous binary by fingerprint when the native
surface is unchanged. **Check your EAS plan's included build count before R1** —
this is the one line item in the plan with an unbounded meter.

This is also your iOS-simulator screenshot source: `takeScreenshot` in a flow gives
a real iOS render of any screen without a Mac, which the Playwright web export cannot.

> **AMENDMENT — 2026-08-29, run A1. Dispatch only. Never a branch push.**
>
> The YAML above still shows `push: { branches: [mainexpo] }`, and the paragraph
> above still reasons about pull requests. Both predate agent runs pushing their
> own commits. `.eas/workflows/e2e-ios.yml` does not exist yet; when it is built,
> **its trigger is `workflow_dispatch` only**, optionally plus a *tag* push —
> never a branch push.
>
> The reason is arithmetic, not taste. A run now ends by pushing its own work,
> and a single session can land several commits on `mainexpo`. Triggered on
> branch push, this workflow would start one metered iOS simulator build **per
> commit** — against the one line item in the plan with an unbounded meter, as
> the paragraph above itself warns. "On merge, not on every PR" was the right
> instinct; merges are simply no longer rare enough for it to be far enough.
>
> A tag push is the sanctioned automatic trigger if one is wanted later: tags
> are cut deliberately, so they cannot arrive at commit frequency.
>
> Nothing else in §2.8 is amended — the job shape, the Maestro flow list and the
> screenshot use above all stand.

### 2.9 `.maestro/smoke.yml`

```yaml
appId: app.brazos.mobile.preview
env:
  EMAIL: ${MAESTRO_EMAIL}
  PASSWORD: ${MAESTRO_PASSWORD}
---
- launchApp: { clearState: true }
- assertVisible: 'Welcome'
- tapOn: 'Sign in'
- inputText: ${EMAIL}
- tapOn: 'Password'
- inputText: ${PASSWORD}
- tapOn: 'Continue'
- assertVisible: 'Nearby'
- takeScreenshot: customer-home
```

### 2.10 `package.json` — dependency batch (one approval, one build)

Add: `@stripe/stripe-react-native`, `@sentry/react-native`, `expo-localization`,
`@tanstack/react-query`, `@tanstack/react-query-persist-client`,
`@tanstack/query-async-storage-persister`, `@react-native-community/netinfo`,
`@shopify/flash-list`, `i18next`, `react-i18next`, `zod`, `posthog-react-native`.
Dev: `i18next-parser`, `supabase` (CLI).
Remove: `react-native-dotenv`, `expo-task-manager`, `@expo/ngrok` (dev only; keep if
you still tunnel).

Scripts:

```json
"typecheck": "tsc --noEmit --pretty false",
"lint": "tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters",
"test": "node --test tests/*.test.mjs",
"test:db": "supabase test db",
"verify": "npm run lint && npm test",
"db:types": "supabase gen types typescript --local > types/database.ts",
"db:reset": "supabase db reset",
"i18n:extract": "i18next-parser",
"fingerprint": "npx expo-updates fingerprint:generate --platform ios"
```

---

## 3. Observability — R2

### 3.1 `lib/observability/sentry.ts`

```ts
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { env } from '../../config/env';

const PII = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}\d/g;
const scrub = (s: string) => s.replace(PII, '[redacted]');

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v, depth + 1)]));
  }
  return value;
}

export function initSentry() {
  if (!env.EXPO_PUBLIC_SENTRY_DSN) return;
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env.EXPO_PUBLIC_APP_VARIANT,
    sendDefaultPii: false,
    enableAutoSessionTracking: true,
    tracesSampleRate: env.EXPO_PUBLIC_APP_VARIANT === 'production' ? 0.1 : 1,
    beforeSend(event) {
      // No PII leaves the device. A Supabase/PostgREST error carries row data in the
      // EXCEPTION VALUE and in `extra` — scrubbing only message + breadcrumbs (rev 1)
      // left the actual leak untouched.
      if (event.message) event.message = scrub(event.message);
      event.breadcrumbs = event.breadcrumbs?.map((b) => ({
        ...b,
        message: b.message && scrub(b.message),
        data: b.data ? (scrubDeep(b.data) as typeof b.data) : b.data,
      }));
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((v) => ({ ...v, value: v.value && scrub(v.value) }));
      }
      if (event.extra) event.extra = scrubDeep(event.extra) as typeof event.extra;
      if (event.request) delete event.request.data;
      return event;
    },
  });
  Sentry.setTag('updateId', Updates.updateId ?? 'embedded');
  Sentry.setTag('channel', Updates.channel ?? 'none');
  Sentry.setTag('runtimeVersion', Updates.runtimeVersion ?? 'unknown');
}

export function setSentryUser(id: string | null) {
  Sentry.setUser(id ? { id } : null); // id only — never email or name
}

export { Sentry };
```

### 3.2 `lib/observability/analytics.ts`

```ts
import PostHog from 'posthog-react-native';
import { env } from '../../config/env';

export type FunnelEvent =
  // customer side
  | { name: 'job_posted'; category: string; hasBudget: boolean }
  | { name: 'offer_accepted' }
  | { name: 'checkout_started' }
  | { name: 'payment_held'; amountCents: number }
  | { name: 'payment_released'; reason: 'approved' | 'auto_approved' }
  | { name: 'review_left'; stars: number }
  // worker side — the numbers that say whether the marketplace has a supply side
  | { name: 'worker_onboarded' }
  | { name: 'job_viewed'; source: 'nearby' | 'map' | 'search' | 'push' }
  | { name: 'offer_sent'; kind: 'bid' | 'direct'; secondsSincePosted: number }
  | { name: 'bid_viewed' }
  | { name: 'job_completed'; hasEvidencePhoto: boolean }
  | { name: 'connect_onboarding_started' }
  | { name: 'connect_onboarding_completed' }
  // both
  | { name: 'mode_switched'; to: 'customer' | 'worker' };

const client = env.EXPO_PUBLIC_POSTHOG_KEY ? new PostHog(env.EXPO_PUBLIC_POSTHOG_KEY, { host: 'https://us.i.posthog.com' }) : null;

export function track(event: FunnelEvent) {
  const { name, ...props } = event;
  client?.capture(name, props);
}
export function identify(userId: string | null) { userId ? client?.identify(userId) : client?.reset(); }
```

Typed, no free-text. Money in cents only. Called from the mutation layer (R8), never
from screens. **The single number that decides whether Brazos lives is bids per job**,
and revision 1's event list could not compute it: it tracked the customer's funnel
and almost nothing the worker does. `offer_sent.secondsSincePosted` gives you
time-to-first-bid, which is the leading indicator of the same thing.

### 3.3 `App.tsx` and `AppErrorBoundary.tsx`

- `App.tsx`: `initSentry()` at module top; `export default Sentry.wrap(App)`;
  `AuthProvider` calls `setSentryUser(user?.id)` and `identify(...)` on session change.
- `AppErrorBoundary.componentDidCatch`: `Sentry.captureException(error, { extra: { componentStack: info.componentStack } })` in every build — the `__DEV__`-only log stays for the console.
- `lib/errorMessage.ts`: `userMessage()` adds a breadcrumb with the raw code (`Sentry.addBreadcrumb({ category: 'supabase', message: code, level: 'warning' })`) so a "Something went wrong" report carries the PostgREST code that caused it.

### 3.4 `supabase/functions/_shared/sentry.ts`

```ts
import * as Sentry from 'npm:@sentry/deno';
Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), environment: Deno.env.get('SUPABASE_ENV') ?? 'staging' });
export const withSentry = (handler: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await handler(req); } catch (e) { Sentry.captureException(e); await Sentry.flush(2000); throw e; }
};
```

---

## 4. Database tooling and tests — R3

### 4.1 One-time baseline (operator + Fable, local only)

1. `supabase init` (writes `supabase/config.toml`; agents may edit it).
2. `supabase link --project-ref zzkumxcjtbqoselzptig` (operator, once).
3. `supabase db dump --linked --schema public,storage -f supabase/migrations/20260901000000_baseline.sql`
   then `supabase db dump --linked --role-only -f supabase/migrations/20260901000001_roles.sql`.
   The baseline **contains the grants** — the 2026-08-09 "staging has no application-role privileges" incident cannot recur.
4. `supabase migration repair --status applied 20260901000000 20260901000001` on the linked project so staging's history matches.
5. **Production gets the same treatment in the same run, or the first automated
   production push fails or double-applies.** Production was hand-applied and has no
   migration history. Before anything is ever pushed to it:
   `supabase db dump --db-url <production> --schema public,storage -f /tmp/prod_baseline.sql`,
   then diff it against the staging baseline. Every difference is either drift to fix
   by hand or a hand-applied step staging never got. Only when the diff is empty does
   production get `migration repair --status applied` for the same two stamps.
   The diff output goes in the run report; you approve it before any repair runs.
6. Move every `supabase/phase*_*.sql` to `docs/archive/migrations-v1/`. They are history now; nothing applies them again.
7. `supabase db reset` locally → `supabase gen types typescript --local > types/database.ts` → commit.

Local prerequisites the migrations assume, asserted at the top of the baseline so a
missing extension fails with a named cause instead of a confusing syntax error:
`pgtap` (for `supabase test db`), `pg_cron` and `pg_net` (for the drains). If
`pg_cron` is unavailable on the local stack, the schedule statements are wrapped in
a `do` block that skips with a notice rather than aborting the reset — see §5.2.

### 4.2 `supabase/tests/_helpers.sql`

```sql
-- Test-only helpers. Loaded by supabase test db before the numbered files.
create schema if not exists tests;

create or replace function tests.create_user(p_email text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, crypt('brazos-test-1234', gen_salt('bf')), now(),
          jsonb_build_object('full_name', split_part(p_email, '@', 1)), now(), now());
  return v_id;  -- handle_new_user trigger creates the profile row
end $$;

create or replace function tests.authenticate_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.clear_auth() returns void language sql as $$
  select set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
```

### 4.3 `supabase/tests/010_offers.sql` (shape; content lifted from `scripts/phase5-proof.sql` / `phase6-proof.sql`)

```sql
begin;
select plan(8);

select tests.create_user('customer@test') as customer \gset
select tests.create_user('worker@test')   as worker   \gset

select tests.authenticate_as(:'customer');
select lives_ok($$ select public.create_job('Fix the sink', 'Kitchen sink leaks', 'handyman', 'Flatbush', 40.65, -73.95, 8000) $$, 'customer can post');
select id as job from public.jobs where client_id = :'customer' \gset

select tests.authenticate_as(:'worker');
select lives_ok($$ select public.create_offer(:'job', 7500, 'I can do it today') $$, 'worker can bid');
select throws_ok($$ insert into public.job_offers (job_id, worker_id, amount_cents) values (:'job', :'worker', 1) $$, '42501', null, 'job_offers is RPC-write-only');

select tests.authenticate_as(:'customer');
select id as offer from public.job_offers where job_id = :'job' and worker_id = :'worker' \gset
select lives_ok($$ select public.accept_offer(:'offer') $$, 'customer accepts');
select is((select status from public.jobs where id = :'job'), 'assigned', 'accept_offer is the only assignment path');
select is((select assigned_worker_id from public.jobs where id = :'job'), :'worker'::uuid, 'assignment lands on the worker');

select tests.authenticate_as(:'worker');
select throws_ok($$ select public.accept_offer(:'offer') $$, null, null, 'worker cannot accept their own offer');

select tests.clear_auth();
select * from finish();
rollback;
```

Every `scripts/phaseN-proof.sql` converts the same way. **R3 converts only the offer
and lifecycle proofs; `030_payments.sql` is written in R4 as that run's gate.** The
generated 15-table × 4-role × 4-op RLS matrix is deferred past the first paid job
(§11) — except the `payments`, `payment_accounts` and `payment_events` rows, which
are written in R4 because that is where new grants appear.

`tests/030_payments.sql` must prove, at minimum:

- `apply_payment_event` is idempotent under the same event id replayed 3×.
- Every refusal in `release_job_payment` (not completed, open in-app dispute, open
  chargeback, not held, wrong caller, already requested).
- A job cannot leave `assigned` while its payment is not `held` (§5.2 gate).
- Voiding an unfunded payment frees the `payments_one_active_per_job_kind` slot so a
  fresh checkout can start. **This is the assertion that catches a partial-unique-index
  predicate that does not exclude `voided`** — if it fails, the index needs widening
  before R4 ships, and that is a stop.
- A tip row is born `unfunded` and only reaches `released` on `payment_intent.succeeded`.
- `transfer.reversed` returns the row to `held` and does not re-queue itself.

### 4.4 `.github/workflows/db-push.yml`

```yaml
name: DB migrate (staging)
on:
  push: { branches: [mainexpo], paths: ['supabase/migrations/**'] }
  workflow_dispatch:
jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: staging     # GitHub environment holds the ref + password
    steps:
      - uses: actions/checkout@<sha>
      - uses: supabase/setup-cli@<sha>
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
      - run: supabase db push --include-all
        env: { SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }} }
      - run: supabase migration list
```

**Staging automates; production stays hand-applied.** Revision 1 reversed your
standing rule for both. Half of that reversal is right and half is not:

- *Staging:* hand-application is the source of every "SQL Editor success is not proof"
  line in the repo. `db push` + `migration list` makes drift impossible, and the
  secrets live in a GitHub environment your account controls — agents still never hold
  a remote credential. Automate it.
- *Production:* your rule that production SQL passes through your hands is the last
  thing standing between an agent-authored migration and real money. Keep it. The CLI
  still helps: generate the exact statements with `supabase db push --dry-run`
  against production, paste that output into the SQL Editor, then run
  `supabase migration repair --status applied <version>` so the history stays honest.
  You get drift detection without giving up the gate.

Revisit after the first three staging cycles have run clean and production's history
has been repaired (§4.1 step 5). Recorded as ADR-0010.

---

## 5. Payments — R4 (schema), R5 (edge), R6 (client)

### 5.1 Flow (decided pattern: separate charges and transfers, capture at hire)

```
Customer accepts an offer                job: assigned, payment: none
Customer taps "Protect payment"
  app → create-payment (user JWT)
        → rpc begin_job_payment(job)     ledger row: unfunded, provider 'stripe',
                                         BOTH fee sides frozen from fee_schedule,
                                         charge_amount_cents = bid + 7.5% protection,
                                         funding_due_at = now + 24h
        → Stripe: customer (get/create, idempotent) + ephemeral key
                  + PaymentIntent(amount, transfer_group=job, metadata.payment_id)
        → rpc attach_provider_ref(payment, pi_…)   (service role)
  app ← client_secret, ephemeral key, customer id  → PaymentSheet (Apple Pay included)
Stripe → stripe-webhook: payment_intent.succeeded → payment_events
        → apply_payment_event → HELD ("held in protection")
                                         >>> ONLY NOW can the job leave 'assigned' <<<
Worker starts   transition_job_status(assigned → in_progress)   refuses unless held
Worker completes transition_job_status(in_progress → completed) requires ≥1 evidence photo
Customer approves (or the 72h cron, and only if the completion notification went out)
  app → rpc release_job_payment(job)     guards + chargeback guard; sets release_requested_at
  pg_cron (1 min) → process-transfers → Stripe Transfer(amount − fee,
                    destination = worker acct, source_transaction = charge,
                    metadata.payment_id, idempotency tr:<payment_id>)
Stripe → stripe-webhook: transfer.created → RELEASED
Payout to the worker's bank: tracked in the worker's Stripe Express dashboard, not in
        our ledger at launch (§5.2 note 9)
In-app dispute → open_job_dispute freezes (unchanged) → resolution by hand in the
        Stripe dashboard per docs/runbooks/refunds.md → charge.refunded →
        REFUNDED / PARTIALLY_REFUNDED
Card chargeback → charge.dispute.created → chargeback_at set, release blocked,
        evidence pack assembled from job_completions
Tip → separate PaymentIntent with transfer_data.destination (destination charge),
        row born UNFUNDED, released on payment_intent.succeeded.
        CUSTOMER fee only: platform_fee_cents = 0, transfer_data.amount = the full tip.
        The worker keeps 100% of every tip; the 7.5% on top covers Stripe's cut.
Worker onboarding → connect-onboarding: Express account + Account Link (HTTPS)
        → account.updated on the CONNECT endpoint → payment_accounts.payouts_enabled
        → plus an on-demand refresh when the app returns from onboarding
```

Capture at hire, not authorize-only: card authorizations expire in about a week
and a job can take longer; captured funds on the platform balance are what
"held in protection" honestly describes. **The cost of that choice is now written
down rather than implied:** Stripe does not return its processing fee on a refund
(VERIFIED against Stripe's own support documentation), so every cancellation after
hire costs the platform the original fee. Who absorbs that is a decision, not an
accident — §12.2.

A worker may be hired before Connect onboarding; the transfer waits on
`payouts_enabled`, and `WorkerJobScreen` shows one nudge. Recorded as ADR-0001 / ADR-0002.

**Rates, decided 2026-08-27: 750 bps each side, worker-side minimum $1.00, tips carry the
customer side only.** On a $100 accepted bid the customer is charged $107.50, the worker
receives $92.50, Stripe takes $3.42 on the charge and $0.48 on the payout, and Brazos
keeps $11.10. Recorded as ADR-0013. The rate is never edited in place — a change is a new
`fee_schedule` row with a future `effective_from`, so a payment already quoted keeps the
fee it was quoted at.

### 5.1a All-in display — a constraint, not a preference

Every customer-facing surface shows `charge_amount_cents` as *the* price, at least as
prominently as any other number. There is no screen anywhere in the app where a customer
sees a job price without the protection fee already in it, and no point in the flow where
the total goes up.

This is not a design opinion. **VERIFIED:** on 2026-07-08 the NYC Department of Consumer
and Worker Protection proposed an industry-neutral rule making it a deceptive and
unconscionable trade practice to advertise, display or offer a price without clearly and
conspicuously disclosing the total price including all mandatory fees, displayed at least
as prominently as any other pricing information — with penalties starting at $350 per
violation, no cure period, and a separate prohibition on misrepresenting the nature,
purpose, amount or refundability of a fee. The rule was still at proposal stage at the
August 7 hearing; **confirm its status before TestFlight.** The hotel-specific version is
already adopted, and the city's own comparison points to existing laws in CA, MA and MN.

Practical rules the R6 screens and the Step 5 sweep both follow:

- A bid card shows **"$107.50"** as the headline number, with "$100 to Alex · $7.50 Brazos
  Protection" as secondary text. Never "$100" with the fee revealed at checkout.
- `quote_job_price()` is the only arithmetic. No screen multiplies by a literal rate, and
  the fee percentage never appears as a hard-coded string in a component.
- The worker sees all three numbers on their own side: what the customer pays, what Brazos
  keeps, what lands in their account. Full symmetry costs nothing and is the opposite of
  what workers complain about on the lead-fee platforms.
- The fee is named **Brazos Protection**, and `docs/policies/money.md` documents what it
  buys — funds held until approval, dispute handling, chargeback absorption, ID-verified
  workers. The proposed rule requires that documentation for any named fee.
- Search, sort and CompareBids rank on `charge_amount_cents`. Since the fee is a flat
  percentage, relative ordering is unchanged, so nothing about bid comparison breaks.

### 5.2 `supabase/migrations/20260905000000_stripe_foundation.sql`

One file, one run, applied to the local DB and staging before anything else touches it.
It also carries the R7 index set — indexes are `if not exists`, additive, and share a
revert boundary with the payments work harmlessly. It does **not** carry the 42-policy
`(select auth.uid())` rewrite: rewriting every RLS policy is security-surface work that
deserves its own revert boundary and its own proof run, whatever revision 1's reviewer
thought about it being "cheap and safe."

```sql
begin;

-- 0. Pre-flight. Fail with a named cause rather than at runtime six weeks from now. --
do $$
begin
  if not exists (select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
                 where t.typname = 'payment_status' and e.enumlabel = 'partially_refunded') then
    raise exception
      'payment_status has no partially_refunded label. Run "alter type public.payment_status add value ''partially_refunded'';" as its own statement first — ALTER TYPE ADD VALUE cannot be used in the transaction that adds it.';
  end if;
  if to_regclass('public.notification_outbox') is null then
    raise exception 'notification_outbox is missing; the auto-release gate depends on it';
  end if;
end $$;

-- 1. Ledger widening ----------------------------------------------------------
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('sandbox', 'stripe'));
alter table public.payments
  add column if not exists customer_fee_bps integer,
  add column if not exists customer_fee_cents integer not null default 0,
  add column if not exists worker_fee_bps integer,
  add column if not exists transfer_ref text,
  add column if not exists refund_ref text,
  add column if not exists release_requested_at timestamptz,
  add column if not exists funding_due_at timestamptz,
  add column if not exists chargeback_ref text,
  add column if not exists chargeback_at timestamptz,
  add column if not exists last_error text;

-- The number Stripe charges the card. amount_cents keeps its existing meaning — the
-- agreed job price, i.e. the worker's accepted bid — so nothing that reads it today
-- changes meaning. Generated, so the two can never drift.
alter table public.payments
  add column if not exists charge_amount_cents integer
  generated always as (amount_cents + coalesce(customer_fee_cents, 0)) stored;

comment on column public.payments.amount_cents is
  'The agreed job price (the accepted bid). NOT what the card is charged — see charge_amount_cents.';
comment on column public.payments.customer_fee_cents is
  'Brazos Protection, added on top of the job price and paid by the customer. 0 for legacy sandbox rows.';
comment on column public.payments.platform_fee_cents is
  'The WORKER-side deduction. Worker receives amount_cents - platform_fee_cents. Always 0 for tips.';
comment on column public.payments.charge_amount_cents is
  'What the PaymentIntent charges and what every customer-facing surface must display. All-in pricing is not optional (NYC DCWP).';
comment on column public.payments.chargeback_at is
  'A CARD NETWORK dispute (charge.dispute.created), not the in-app job_disputes flow. Blocks release while set.';

create index if not exists payments_release_queue_idx on public.payments (release_requested_at)
  where release_requested_at is not null and transfer_ref is null;
create index if not exists payments_funding_window_idx on public.payments (funding_due_at)
  where status = 'unfunded' and funding_due_at is not null;
create unique index if not exists payments_provider_ref_uniq on public.payments (provider, provider_ref)
  where provider_ref is not null;

-- 2. Remote config: the kill switch and the version floor ----------------------
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  payments_enabled boolean not null default true,
  min_supported_build integer not null default 0,
  notice text,
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (true) on conflict (id) do nothing;
alter table public.app_config enable row level security;
grant select on public.app_config to anon, authenticated;
drop policy if exists "app_config is world-readable" on public.app_config;
create policy "app_config is world-readable" on public.app_config for select to anon, authenticated using (true);
-- Writes: service_role and the SQL Editor only. Flipping the switch is one UPDATE.

-- 3. Fee schedule: BOTH sides, time-versioned, read by the ledger. No client constant.
create table if not exists public.fee_schedule (
  id bigint generated always as identity primary key,
  effective_from timestamptz not null,
  customer_bps integer not null check (customer_bps between 0 and 3000),
  worker_bps integer not null check (worker_bps between 0 and 3000),
  worker_min_fee_cents integer not null default 0 check (worker_min_fee_cents >= 0),
  tip_customer_bps integer not null default 0 check (tip_customer_bps between 0 and 3000),
  created_at timestamptz not null default now()
);
alter table public.fee_schedule enable row level security;   -- no policies: reachable only through the function below

-- DECIDED 2026-08-27: 7.5% each side, worker-side minimum $1.00 so a small job is not a
-- loss against the fixed $0.30 (Stripe) + $0.25 (payout). Tips carry the CUSTOMER fee
-- only — the worker keeps 100% of every tip, and the 7.5% on top covers Stripe's cut of
-- the tip charge. Changing the rate is an INSERT with a future effective_from, never an
-- UPDATE: rows already funded keep the fee they were quoted.
insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps)
  select '2026-01-01', 750, 750, 100, 750 where not exists (select 1 from public.fee_schedule);

-- ONE function returns every number, all time-filtered together. Reading one rate with
-- `effective_from <= now()` and another without it is how a future-dated row starts
-- charging today.
create or replace function public.current_fee(p_at timestamptz default now())
returns table (customer_bps integer, worker_bps integer, worker_min_fee_cents integer, tip_customer_bps integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.customer_bps, f.worker_bps, f.worker_min_fee_cents, f.tip_customer_bps
  from public.fee_schedule f
  where f.effective_from <= p_at
  order by f.effective_from desc
  limit 1
$$;
revoke all on function public.current_fee(timestamptz) from public, anon;
grant execute on function public.current_fee(timestamptz) to authenticated, service_role;

-- The quote a screen shows BEFORE a payment row exists (a bid card, the market feed,
-- CompareBids). One source of arithmetic for every surface, so no screen ever multiplies
-- by a hard-coded rate.
create or replace function public.quote_job_price(p_amount_cents integer, p_at timestamptz default now())
returns table (job_price_cents integer, customer_fee_cents integer, total_cents integer,
               worker_fee_cents integer, worker_receives_cents integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select p_amount_cents,
         round(p_amount_cents * f.customer_bps / 10000.0)::integer,
         p_amount_cents + round(p_amount_cents * f.customer_bps / 10000.0)::integer,
         greatest(round(p_amount_cents * f.worker_bps / 10000.0)::integer, f.worker_min_fee_cents),
         p_amount_cents - greatest(round(p_amount_cents * f.worker_bps / 10000.0)::integer, f.worker_min_fee_cents)
  from public.current_fee(p_at) f
$$;
revoke all on function public.quote_job_price(integer, timestamptz) from public, anon;
grant execute on function public.quote_job_price(integer, timestamptz) to authenticated, service_role;

-- 4. Provider event inbox (idempotency key = Stripe event id) ------------------
create table if not exists public.payment_events (
  id text primary key,
  type text not null,
  account_id text,                       -- event.account for connected-account events
  payment_id uuid references public.payments (id),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
create index if not exists payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;

comment on table public.payment_events is
  'Raw Stripe events. The payload carries cardholder billing details — service_role only, and the sweeper prunes payloads older than 90 days (keeping id/type/processed_at).';

-- 5. Stripe identity lives in ITS OWN owner-only table, never on profiles ------
--    profiles is read through column grants; hanging Stripe identifiers off it makes
--    every future `select *` a leak question. This table answers it once.
create table if not exists public.payment_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  payouts_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_accounts enable row level security;
revoke all on public.payment_accounts from anon, authenticated;
-- No policies and no grants: reachable only through SECURITY DEFINER functions and
-- service_role. The one fact a user needs about their own row is payouts_enabled,
-- and get_my_profile() returns it (R6).

create or replace function public.my_payouts_enabled() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select payouts_enabled from public.payment_accounts where user_id = auth.uid()), false)
$$;
revoke all on function public.my_payouts_enabled() from public, anon;
grant execute on function public.my_payouts_enabled() to authenticated;

-- 6. Completion evidence: the chargeback defence and the approval input --------
create table if not exists public.job_completions (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id),
  photo_paths jsonb not null default '[]'::jsonb,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
alter table public.job_completions enable row level security;
revoke all on public.job_completions from anon, authenticated;
grant select on public.job_completions to authenticated;
drop policy if exists "parties read completion evidence" on public.job_completions;
create policy "parties read completion evidence" on public.job_completions for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id
                 and ((select auth.uid()) in (j.client_id, j.assigned_worker_id))));
-- Written only by transition_job_status() when it moves in_progress -> completed.

-- 7. begin_job_payment(): the authenticated entry -----------------------------
create or replace function public.begin_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor    uuid := auth.uid();
  v_job      public.jobs;
  v_payment  public.payments;
  v_amount   integer;
  v_fee      record;
  v_reuse    boolean := false;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;

  if not coalesce((select payments_enabled from public.app_config where id), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;

  -- Only 'assigned'. Revision 1 also accepted in_progress and completed, which is the
  -- same thing as saying the protection is optional.
  if v_job.assigned_worker_id is null or v_job.status <> 'assigned' then
    raise exception 'Accept an offer before protecting a payment';
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then raise exception 'This job has no agreed amount'; end if;
  select * into v_fee from public.current_fee();

  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided')
   for update;

  if found then
    if v_payment.status <> 'unfunded' then raise exception 'This job already has a protected payment'; end if;

    if v_payment.amount_cents = v_amount then
      v_reuse := true;                       -- plain resume: same money, same intent
    elsif v_payment.provider_ref is null then
      update public.payments set                                  -- nothing exists at Stripe yet
        amount_cents = v_amount,
        customer_fee_cents = round(v_amount * v_fee.customer_bps / 10000.0)::integer,
        platform_fee_cents = greatest(round(v_amount * v_fee.worker_bps / 10000.0)::integer, v_fee.worker_min_fee_cents),
        customer_fee_bps = v_fee.customer_bps, worker_fee_bps = v_fee.worker_bps,
        funding_due_at = now() + interval '24 hours', updated_at = now()
      where id = v_payment.id returning * into v_payment;
      v_reuse := true;
    else
      -- A PaymentIntent exists at a stale amount and nothing has been charged.
      -- Abandon it; the sweeper cancels it at Stripe. Then fall through to a fresh row.
      update public.payments
        set status = 'voided', last_error = 'agreed amount changed before funding', updated_at = now()
      where id = v_payment.id;
    end if;

    if v_reuse then
      if v_payment.funding_due_at is null then
        update public.payments set funding_due_at = now() + interval '24 hours', updated_at = now()
        where id = v_payment.id returning * into v_payment;
      end if;
      return v_payment;
    end if;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               customer_fee_cents, platform_fee_cents,
                               customer_fee_bps, worker_fee_bps, provider, status, funding_due_at)
  values (p_job_id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'job_payment', v_amount,
          round(v_amount * v_fee.customer_bps / 10000.0)::integer,
          greatest(round(v_amount * v_fee.worker_bps / 10000.0)::integer, v_fee.worker_min_fee_cents),
          v_fee.customer_bps, v_fee.worker_bps, 'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.begin_job_payment(uuid) from public, anon;
grant execute on function public.begin_job_payment(uuid) to authenticated;

-- 8. Service-role only: attach the PaymentIntent id ----------------------------
create or replace function public.attach_provider_ref(p_payment_id uuid, p_ref text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.payments set provider_ref = p_ref, updated_at = now()
   where id = p_payment_id and provider = 'stripe' and provider_ref is null;
$$;
revoke all on function public.attach_provider_ref(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_provider_ref(uuid, text) to service_role;

-- 9. apply_payment_event(): THE state mover -----------------------------------
--    Idempotent per event id; monotonic per ledger row; NEVER raises past its own
--    boundary. Revision 1 recorded the error and then re-raised, which rolled the
--    error write back — the error column could never have contained anything.
create or replace function public.apply_payment_event(p_event_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ev      public.payment_events;
  v_obj     jsonb;
  v_payment public.payments;
  v_pid     uuid;
begin
  select * into v_ev from public.payment_events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown event'); end if;
  if v_ev.processed_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  v_obj := v_ev.payload -> 'data' -> 'object';

  begin
    -- Resolve the ledger row. metadata.payment_id FIRST: matching transfers by
    -- (job, kind) breaks the moment a job has more than one money object.
    v_pid := nullif(v_obj -> 'metadata' ->> 'payment_id', '')::uuid;
    if v_pid is not null then
      select * into v_payment from public.payments where id = v_pid for update;
    elsif v_ev.type like 'payment_intent.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'id' for update;
    elsif v_ev.type like 'charge.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'payment_intent' for update;
    end if;

    if v_payment.id is not null then
      update public.payments set
        status = case
          when v_ev.type = 'payment_intent.succeeded' then
            (case when v_payment.kind = 'tip' then 'released'
                  when status = 'unfunded' then 'held'
                  else status end)
          when v_ev.type = 'payment_intent.payment_failed' then
            (case when status = 'unfunded' then 'failed' else status end)
          when v_ev.type = 'payment_intent.canceled' then
            (case when status = 'unfunded' then 'voided' else status end)
          when v_ev.type = 'transfer.created' then
            (case when status = 'held' then 'released' else status end)
          when v_ev.type = 'transfer.reversed' then
            (case when status = 'released' then 'held' else status end)
          when v_ev.type = 'charge.refunded' then
            -- Against the CHARGED amount, not the job price. With a customer-side fee
            -- these differ, and comparing to amount_cents would mark a partial refund
            -- of the job price as a full refund.
            (case when (v_obj ->> 'amount_refunded')::integer >= charge_amount_cents
                  then 'refunded' else 'partially_refunded' end)
          when v_ev.type = 'charge.dispute.closed'
               and v_ev.payload -> 'data' -> 'object' ->> 'status' = 'lost' then 'refunded'
          else status end::public.payment_status,

        held_at      = case when v_ev.type = 'payment_intent.succeeded' and v_payment.kind = 'job_payment'
                            then coalesce(held_at, now()) else held_at end,
        released_at  = case when v_ev.type = 'transfer.created'
                              or (v_ev.type = 'payment_intent.succeeded' and v_payment.kind = 'tip')
                            then coalesce(released_at, now()) else released_at end,
        transfer_ref = case when v_ev.type = 'transfer.created' then v_obj ->> 'id'
                            when v_ev.type = 'transfer.reversed' then null
                            else transfer_ref end,
        -- A reversal must NOT re-queue itself into process-transfers. A human decides.
        release_requested_at = case when v_ev.type = 'transfer.reversed' then null else release_requested_at end,
        last_error   = case when v_ev.type = 'transfer.reversed' then 'transfer reversed at Stripe' else last_error end,
        refund_ref   = case when v_ev.type = 'charge.refunded'
                            then v_obj -> 'refunds' -> 'data' -> 0 ->> 'id' else refund_ref end,
        chargeback_ref = case when v_ev.type like 'charge.dispute.%' then v_obj ->> 'id' else chargeback_ref end,
        chargeback_at  = case when v_ev.type = 'charge.dispute.created' then coalesce(chargeback_at, now())
                              when v_ev.type = 'charge.dispute.closed'
                                   and v_obj ->> 'status' = 'won' then null
                              else chargeback_at end,
        updated_at = now()
      where id = v_payment.id;
    end if;

    if v_ev.type = 'account.updated' then
      update public.payment_accounts
         set payouts_enabled = coalesce((v_obj ->> 'payouts_enabled')::boolean, false),
             payouts_checked_at = now(), updated_at = now()
       where stripe_account_id = v_obj ->> 'id';
    end if;

    -- payout.paid is DELIBERATELY not handled. See note 9 below.

    update public.payment_events set processed_at = now(), payment_id = v_payment.id where id = p_event_id;
    return jsonb_build_object('ok', true, 'payment_id', v_payment.id);

  exception when others then
    -- The savepoint rolls the ledger write back; this UPDATE then commits with the
    -- function because we do NOT re-raise. The caller turns ok:false into a 5xx so
    -- Stripe retries, and the sweeper picks it up if Stripe stops trying.
    update public.payment_events
       set error = left(sqlerrm, 500), attempts = attempts + 1
     where id = p_event_id;
    return jsonb_build_object('ok', false, 'error', 'apply failed');
  end;
end $$;
revoke all on function public.apply_payment_event(text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text) to service_role;

-- 10. release_job_payment(): the customer's approval ---------------------------
create or replace function public.release_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_job public.jobs; v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found then raise exception 'This job has no payment to release'; end if;
  if v_payment.status in ('released', 'paid_out') or v_payment.release_requested_at is not null then return v_payment; end if;
  if v_job.status <> 'completed' then raise exception 'Funds release only after the job is completed'; end if;
  if exists (select 1 from public.job_disputes d where d.job_id = p_job_id and d.status = 'open') then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.chargeback_at is not null then
    raise exception 'This payment is under review by the card issuer and cannot be released';
  end if;
  if v_payment.status <> 'held' then raise exception 'This payment is not held (%)', v_payment.status; end if;
  update public.payments set release_requested_at = now(), release_reason = 'approved', updated_at = now()
   where id = v_payment.id returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.release_job_payment(uuid) from public, anon;
grant execute on function public.release_job_payment(uuid) to authenticated;

-- 11. The 72h clock, gated on the customer actually having been told -----------
--     Auto-releasing money three days after a completion the customer never saw is a
--     chargeback generator. The notification must have gone out first.
create or replace function public.auto_release_due_payments() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.payments p
     set release_requested_at = now(), release_reason = 'auto_approved', updated_at = now()
    from public.jobs j
   where j.id = p.job_id
     and p.kind = 'job_payment' and p.status = 'held'
     and p.release_requested_at is null and p.chargeback_at is null
     and j.status = 'completed' and j.completed_at is not null
     and now() >= j.completed_at + interval '72 hours'
     and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
     -- THE GATE. See the note under this function about the outbox column name.
     and exists (
       select 1 from public.notification_outbox o
        where o.recipient_id = j.client_id
          and o.data ->> 'job_id' = j.id::text
          and o.type like '%complet%'
          and o.created_at <= now() - interval '1 hour'
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.auto_release_due_payments() from public, anon, authenticated;

-- 12. The funding window: an unfunded row does not sit forever -----------------
create or replace function public.expire_unfunded_payments() returns setof public.payments
language sql security definer set search_path = public, pg_temp as $$
  update public.payments
     set status = 'voided', last_error = 'funding window expired', updated_at = now()
   where status = 'unfunded' and funding_due_at is not null and funding_due_at < now()
  returning *;
$$;
revoke all on function public.expire_unfunded_payments() from public, anon, authenticated;
grant execute on function public.expire_unfunded_payments() to service_role;

-- 13. Schedules. cron.schedule() upserts on job name, so re-running is safe.
--     Wrapped so a local stack without pg_cron does not abort `supabase db reset`.
do $$
begin
  if to_regproc('cron.schedule') is null then
    raise notice 'pg_cron absent (local stack) — schedules skipped';
    return;
  end if;
  perform cron.schedule('auto-release-due-payments', '*/10 * * * *',
                        $cron$select public.auto_release_due_payments();$cron$);
  -- process-transfers and payments-sweeper are scheduled by the phase74 pattern
  -- (cron -> pg_net POST with the Vault secret), added in R5 when the functions exist.
end $$;

-- 14. Indexes (folded up from R7; additive and if-not-exists) ------------------
create index if not exists jobs_client_id_idx            on public.jobs (client_id);
create index if not exists jobs_assigned_worker_id_idx   on public.jobs (assigned_worker_id);
create index if not exists jobs_open_market_idx          on public.jobs (created_at desc) where status = 'open' and visibility = 'open_market';
create index if not exists job_locations_job_id_idx      on public.job_locations (job_id);
create index if not exists job_offers_job_id_idx         on public.job_offers (job_id);
create index if not exists job_offers_worker_id_idx      on public.job_offers (worker_id);
create index if not exists job_offers_parent_idx         on public.job_offers (parent_offer_id);
create index if not exists payments_job_kind_idx         on public.payments (job_id, kind);
create index if not exists payments_payee_status_idx     on public.payments (payee_id, status);
create index if not exists messages_direct_thread_idx    on public.messages (direct_thread_id, created_at desc);
create index if not exists messages_sender_idx           on public.messages (sender_id);
create index if not exists message_reads_user_idx        on public.message_reads (user_id);
create index if not exists message_reactions_message_idx on public.message_reactions (message_id);
create index if not exists direct_threads_parties_idx    on public.direct_threads (customer_id, worker_id);
create index if not exists reviews_reviewee_idx          on public.reviews (reviewee_id);
create index if not exists notification_outbox_recipient_idx on public.notification_outbox (recipient_id, created_at desc);
create index if not exists job_disputes_job_open_idx     on public.job_disputes (job_id) where status = 'open';
create index if not exists saved_workers_user_idx        on public.saved_workers (user_id);
create index if not exists portfolio_items_owner_idx     on public.portfolio_items (user_id);
create index if not exists worker_services_worker_idx    on public.worker_services (worker_id);
create index if not exists live_location_shares_active_idx on public.live_location_shares (job_id, direct_thread_id) where expires_at > now();

commit;
```

**Note 9 — `payout.paid` is deliberately unhandled.** Revision 1 marked *every* released
payment for that worker as `paid_out` on any payout event, which is wrong whenever a
worker has two jobs settling in different payouts. Correcting it means reconciling
payout contents, and the payout is a bank-transfer detail the worker can already see in
their own Stripe Express dashboard. For launch, `EarningsScreen` shows Pending / In
transit / Paid-to-you-by-Stripe with a link out, and the ledger stops at `released`.
The `paid_out` label stays in the enum for when this is worth building.

**The `transition_job_status` gate (same migration, written against the live body).**
`transition_job_status(uuid, text, jsonb, jsonb)` is a body stacked across phases
29/31/35/51/58 and its allow-list is exactly `assigned → in_progress` and
`in_progress → completed`. The run reads the live definition with
`select prosrc from pg_proc …` and adds exactly two guards, changing nothing else:

- before `assigned → in_progress`: refuse unless a `job_payment` row for this job is
  `held`. Message: *"The customer hasn't protected the payment yet. You'll get a
  notification the moment it's held."*
- before `in_progress → completed`: require a `public.job_completions` row with at
  least one entry in `photo_paths`, inserted in the same call from the transition's
  existing jsonb payload argument.

Any other edit to that function in this run is a stop.

**The outbox column name is UNKNOWN.** The uploaded bundles show
`notification_outbox` selected as `id, recipient_id, category, type, title, body, data,
read_at, created_at` and drained by `drain_notification_outbox()`, but the DDL lives in
a phase file that is not in the bundles, so whether there is a delivery-state column
(`sent_at`, `pushed_at`) is not established. The gate above is written against columns
that are VERIFIED to exist plus a one-hour age test. **Continue-path for the run:** read
the live DDL; if a delivery-state column exists, tighten the gate to it and drop the age
test; if not, keep what is written and say so in the report. Not a stop either way.

`sandbox_*` functions stay for the `sandbox` mode; `job_payment_state()` loses its
UPDATE branch in the same migration. `tests/paymentsMode.test.mjs` (the fence that
forbids the word "stripe" in money code) is rewritten to fence the new invariant:
**no screen imports `@stripe/stripe-react-native`; only `lib/payments/stripe.ts` does.**

### 5.3 Edge functions

`supabase/functions/_shared/stripe.ts`

```ts
import Stripe from 'npm:stripe@^17';
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
```

`supabase/functions/_shared/supabase.ts`

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const asUser = (req: Request) =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
```

`supabase/functions/create-payment/index.ts`

```ts
import { stripe } from '../_shared/stripe.ts';
import { admin, asUser } from '../_shared/supabase.ts';
import { withSentry } from '../_shared/sentry.ts';

// UNKNOWN AT WRITING: the ephemeral key apiVersion must match the Stripe API version
// that the installed @stripe/stripe-react-native pins, or PaymentSheet fails to init.
// R5 reads it from the SDK's own docs for the version in package.json — never from memory.
const EPHEMERAL_KEY_API_VERSION = '<pin from the installed SDK at R5>';

Deno.serve(withSentry(async (req) => {
  const { jobId } = await req.json();
  const user = asUser(req);
  const { data: payment, error } = await user.rpc('begin_job_payment', { p_job_id: jobId });   // RLS + guards run as the caller
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const db = admin();
  const { data: acct } = await db.from('payment_accounts').select('stripe_customer_id').eq('user_id', payment.payer_id).maybeSingle();
  let customerId = acct?.stripe_customer_id;
  if (!customerId) {
    // Idempotency key: two fast taps must not create two Stripe customers for one user.
    const c = await stripe.customers.create(
      { metadata: { user_id: payment.payer_id } },
      { idempotencyKey: `cus:${payment.payer_id}` },
    );
    customerId = c.id;
    await db.from('payment_accounts').upsert({ user_id: payment.payer_id, stripe_customer_id: customerId }, { onConflict: 'user_id' });
  }
  const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: EPHEMERAL_KEY_API_VERSION });

  let intent = null;
  if (payment.provider_ref) {
    intent = await stripe.paymentIntents.retrieve(payment.provider_ref);
    // A canceled or already-succeeded intent cannot be reused; begin_job_payment has
    // already voided the row in the amount-changed case, so this is the leftover case.
    if (intent.status === 'canceled') intent = null;
  }
  if (!intent) {
    intent = await stripe.paymentIntents.create({
      amount: payment.charge_amount_cents, currency: 'usd', customer: customerId,   // job price + Brazos Protection
      transfer_group: payment.job_id, automatic_payment_methods: { enabled: true },
      metadata: { payment_id: payment.id, job_id: payment.job_id, kind: payment.kind },
    }, { idempotencyKey: `pi:${payment.id}` });
    await db.rpc('attach_provider_ref', { p_payment_id: payment.id, p_ref: intent.id });
  }
  return Response.json({ paymentIntentClientSecret: intent.client_secret, ephemeralKeySecret: ephemeralKey.secret, customerId });
}));
```

`supabase/functions/stripe-webhook/index.ts` — platform events (deploy `--no-verify-jwt`)

```ts
import { stripe, cryptoProvider } from '../_shared/stripe.ts';
import { admin } from '../_shared/supabase.ts';

const EVENTS = new Set([
  'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled',
  'transfer.created', 'transfer.reversed',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed',
]);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch { return new Response('bad signature', { status: 400 }); }
  if (!EVENTS.has(event.type)) return new Response('ignored', { status: 200 });

  const db = admin();
  const { error: ins } = await db.from('payment_events').insert({ id: event.id, type: event.type, payload: event });
  // 23505 means WE ALREADY STORED IT — not that we already applied it. Revision 1
  // returned 200 here, so any event whose apply failed once was never retried and the
  // ledger row stayed wrong forever. apply_payment_event is idempotent; just apply.
  if (ins && ins.code !== '23505') return new Response('store failed', { status: 500 });

  const { data, error } = await db.rpc('apply_payment_event', { p_event_id: event.id });
  if (error || !data?.ok) return new Response('apply failed', { status: 500 });   // 5xx → Stripe retries
  return new Response('ok', { status: 200 });
});
```

`supabase/functions/stripe-connect-webhook/index.ts` — connected-account events
(deploy `--no-verify-jwt`, register with `connect: true`, its own signing secret)

```ts
import { stripe, cryptoProvider } from '../_shared/stripe.ts';
import { admin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, req.headers.get('stripe-signature')!, Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch { return new Response('bad signature', { status: 400 }); }
  if (event.type !== 'account.updated') return new Response('ignored', { status: 200 });

  const db = admin();
  const { error: ins } = await db.from('payment_events').insert({ id: event.id, type: event.type, account_id: event.account, payload: event });
  if (ins && ins.code !== '23505') return new Response('store failed', { status: 500 });
  const { data, error } = await db.rpc('apply_payment_event', { p_event_id: event.id });
  if (error || !data?.ok) return new Response('apply failed', { status: 500 });
  return new Response('ok', { status: 200 });
});
```

**Why two endpoints.** VERIFIED against Stripe's API reference: an endpoint created
with `connect: true` receives events from all connected accounts, and a normal endpoint
receives only your own account's events. `account.updated` for a worker's Express
account is a connected-account event, so a single platform endpoint would never have
delivered it — and `payouts_enabled` is what gates every transfer. Two endpoints, two
signing secrets, one shared inbox table keyed by Stripe's event id.

`supabase/functions/connect-onboarding/index.ts`

```ts
import { stripe } from '../_shared/stripe.ts';
import { admin, asUser } from '../_shared/supabase.ts';

const FN_BASE = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

Deno.serve(async (req) => {
  const { data: { user } } = await asUser(req).auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });
  const db = admin();
  const { data: p } = await db.from('payment_accounts').select('stripe_account_id').eq('user_id', user.id).maybeSingle();
  let account = p?.stripe_account_id;
  if (!account) {
    const a = await stripe.accounts.create(
      { type: 'express', country: 'US', email: user.email, capabilities: { transfers: { requested: true } }, metadata: { user_id: user.id } },
      { idempotencyKey: `acct:${user.id}` },
    );
    account = a.id;
    await db.from('payment_accounts').upsert({ user_id: user.id, stripe_account_id: account }, { onConflict: 'user_id' });
  }
  const link = await stripe.accountLinks.create({
    account,
    type: 'account_onboarding',
    refresh_url: `${FN_BASE}/connect-return?to=refresh`,
    return_url: `${FN_BASE}/connect-return?to=return`,
  });
  return Response.json({ url: link.url });
});
```

`supabase/functions/connect-return/index.ts` — the HTTPS bounce

```ts
Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') === 'refresh' ? 'refresh' : 'return';
  const deep = `brazos://connect/${to}`;
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=${deep}">
     <body style="font:16px -apple-system;padding:40px;text-align:center">
     <p>Returning to Brazos…</p><p><a href="${deep}">Tap here if nothing happens</a></p></body>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
});
```

**This is a launch blocker fixed, not a polish item.** VERIFIED against Stripe's
Connect onboarding documentation: non-HTTPS `return_url` / `refresh_url` values are
accepted only in a testing environment, and live mode accepts HTTPS only — the
`accountLinks.create` call itself fails. Revision 1 used `brazos://` for both, so
worker payout onboarding would have worked in test and died on the day you went live.
Routing through an edge function means no domain purchase, no DNS, no
apple-app-site-association file. Stripe-hosted onboarding must also open in a system
browser rather than an embedded WebView, which `WebBrowser.openAuthSessionAsync`
satisfies (ASWebAuthenticationSession) and a `react-native-webview` would not.

`supabase/functions/connect-status/index.ts` — on-demand refresh

Called by the app the moment it comes back from onboarding: retrieves the account,
writes `payouts_enabled` + `payouts_checked_at`, returns the boolean. The webhook is
the durable path; this is what makes the "Set up payouts" nudge disappear immediately
instead of whenever the webhook lands. `process-transfers` calls the same logic when
it finds a payment whose payee is not yet enabled and whose `payouts_checked_at` is
older than an hour.

`supabase/functions/process-transfers/index.ts` — selects `release_requested_at is not
null and transfer_ref is null and chargeback_at is null` joined to an enabled payee,
creates the Transfer (`amount_cents − platform_fee_cents`, `destination`,
`source_transaction` = the charge behind `provider_ref`, `transfer_group = job_id`,
**`metadata.payment_id`**, idempotency key `tr:${payment.id}`), and never writes status
— the webhook does. Scheduled by the phase74 pattern.

`supabase/functions/payments-sweeper/index.ts` — one cron, three jobs the happy path
does not cover:

1. `payment_events` where `processed_at is null and attempts < 10` → re-`apply`. This is
   the net under a Stripe delivery that gave up.
2. `expire_unfunded_payments()` → for each returned row with a `provider_ref`, cancel
   the PaymentIntent at Stripe, and enqueue one notification to the customer
   ("Your payment window closed — tap to protect the payment again") and one to the
   worker ("The customer hasn't protected payment yet").
3. Prune `payment_events.payload` older than 90 days to `'{}'::jsonb`, keeping id, type
   and timestamps. Stripe event payloads carry cardholder billing details.

`supabase/functions/moderate-upload/index.ts` — storage webhook; image moderation,
blurhash, `media_meta`, quarantine of flagged objects. **R10, not launch.**

### 5.4 Client

`lib/payments/provider.ts`

```ts
import type { Payment } from './ledger';
export type PaymentsMode = 'sandbox' | 'stripe' | 'disabled';
export type Outcome<T = void> = { ok: true; data: T } | { ok: false; canceled?: boolean; error: string };

export type PaymentProvider = {
  mode: PaymentsMode;
  /** Runs the whole checkout: ledger row, provider sheet, and returns when the customer is done. Truth arrives by webhook. */
  fundJobPayment(jobId: string): Promise<Outcome>;
  releaseJobPayment(jobId: string): Promise<Outcome<Payment>>;
  tipWorker(jobId: string, amountCents: number): Promise<Outcome<Payment>>;
  /** Worker side: URL to open for payout onboarding, or null when not applicable. */
  connectOnboardingUrl(): Promise<Outcome<string | null>>;
  /** Worker side: force a payouts_enabled refresh after returning from onboarding. */
  refreshPayoutStatus(): Promise<Outcome<boolean>>;
};
```

`lib/payments/stripe.ts`

```ts
import { initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';
import { supabase } from '../supabase';
import { userMessage } from '../errorMessage';
import type { PaymentProvider } from './provider';

export function createStripeProvider(): PaymentProvider {
  return {
    mode: 'stripe',
    async fundJobPayment(jobId) {
      const { data, error } = await supabase.functions.invoke('create-payment', { body: { jobId } });
      if (error || !data) return { ok: false, error: userMessage(error, 'Could not start checkout.') };
      const init = await initPaymentSheet({
        merchantDisplayName: 'BRAZOS',
        customerId: data.customerId,
        customerEphemeralKeySecret: data.ephemeralKeySecret,
        paymentIntentClientSecret: data.paymentIntentClientSecret,
        applePay: { merchantCountryCode: 'US' },
        returnURL: 'brazos://checkout/return',
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) return { ok: false, error: init.error.message };
      const res = await presentPaymentSheet();
      if (res.error?.code === 'Canceled') return { ok: false, canceled: true, error: 'Checkout was closed before paying.' };
      if (res.error) return { ok: false, error: res.error.message };
      return { ok: true, data: undefined };
    },
    async releaseJobPayment(jobId) {
      const { data, error } = await supabase.rpc('release_job_payment', { p_job_id: jobId });
      return error ? { ok: false, error: userMessage(error) } : { ok: true, data };
    },
    async tipWorker(jobId, amountCents) { /* create-tip edge fn → PaymentSheet, same shape */ },
    async connectOnboardingUrl() {
      const { data, error } = await supabase.functions.invoke('connect-onboarding');
      return error ? { ok: false, error: userMessage(error) } : { ok: true, data: data.url };
    },
    async refreshPayoutStatus() {
      const { data, error } = await supabase.functions.invoke('connect-status');
      return error ? { ok: false, error: userMessage(error) } : { ok: true, data: !!data.payoutsEnabled };
    },
  };
}
```

`lib/payments/index.ts`

```ts
import { env } from '../../config/env';
import { createSandboxProvider } from './sandbox';
import { createStripeProvider } from './stripe';
import { createDisabledProvider } from './disabled';
export const paymentsMode = env.EXPO_PUBLIC_PAYMENTS_MODE;
export const paymentProvider =
  paymentsMode === 'stripe' ? createStripeProvider() :
  paymentsMode === 'sandbox' ? createSandboxProvider() :
  createDisabledProvider();
```

`App.tsx` gains `<StripeProvider publishableKey={env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''} merchantIdentifier="merchant.app.brazos.mobile" urlScheme="brazos">` directly under `SafeAreaProvider` (rendered only when `paymentsMode === 'stripe'`).

Screens (R6, no redesign — behaviour only):

| File | Change |
| --- | --- |
| `screens/CheckoutScreen.tsx` | one CTA → `paymentProvider.fundJobPayment(job.id)`; headline is `charge_amount_cents` with the job price and Brazos Protection as secondary lines — **the total must not change between the bid card and this screen**; on `ok` show "Confirming…" and poll `keys.payments.byJob(job.id)` until `held` (the webhook lands in ~1–3 s); sandbox banner only in `sandbox` mode; hidden entirely when `remoteConfig.paymentsEnabled` is false; copy: "Protected in Brazos until you approve the work" |
| `screens/ApproveOrDisputeScreen.tsx` | `releaseJobPayment`; state copy "Releasing…" until `released`; shows the worker's completion photos above the approve button |
| `screens/ReviewAndTipScreen.tsx` | `tipWorker` via PaymentSheet; tip preset buttons show the all-in charge ("Tip $20 · you pay $21.50") and the line "Alex keeps 100% of your tip" |
| `screens/EarningsScreen.tsx` | per-job breakdown shows customer paid / Brazos fee / you received; "Cash out (simulated)" removed; buckets Pending / In protection / Sent to you from the ledger; "Set up payouts" row when `!payouts_enabled`; link out to the Stripe Express dashboard for bank-transfer detail |
| `screens/ConnectOnboardingScreen.tsx` NEW | `WebBrowser.openAuthSessionAsync(url, 'brazos://connect/return')`, then `refreshPayoutStatus()`, then refetch profile |
| `screens/WorkerJobScreen.tsx` | one nudge card when hired and `!payouts_enabled`; "Start work" disabled with the held-payment reason when the payment is not held |
| `screens/CompleteJobScreen.tsx` (or the existing completion sheet) | at least one photo required; copy explains it protects both sides |
| `screens/ClientJobDetailScreen.tsx` | funding-window countdown while `unfunded` |
| `screens/CompareBidsScreen.tsx`, `components/OfferCard.tsx`, `screens/BidDetailScreen.tsx` | headline number is `quote_job_price(bid).total_cents`; sort on the total; never render a bare bid to a customer |
| `screens/SubmitBidScreen.tsx`, `components/OfferComposer.tsx` | worker types their ask and sees, live: customer pays / Brazos keeps / you receive |
| `lib/profiles.ts` | `get_my_profile` returns `payouts_enabled` from `payment_accounts` (never a public column grant) |

### 5.5 `docs/runbooks/refunds.md` — the part with no UI

Refunds and chargeback responses are **manual, by you, in the Stripe dashboard** at
launch, and the runbook says so in one page: how to refund fully or partially, that the
processing fee does not come back, which ledger status each action produces via webhook,
how to pull the evidence pack (`job_completions` photos + the message thread + the
accepted offer) for a dispute response, and the one case that needs a decision rather
than a procedure — a transfer already sent when the chargeback arrives. Writing this
down before launch is the difference between a ten-minute task and an improvised one
during your first dispute.

**Unclaimed funds.** A payment can be `released` while the worker never completes Connect
onboarding, in which case the money sits on the platform balance with the customer
believing it moved. The sweeper flags any `released` payment older than 30 days with a
payee whose `payouts_enabled` is false; the runbook's answer is to contact the worker
and, failing that, refund the customer. Automating this is post-launch.

---

## 6. Realtime and database performance

### 6.1 Deferred past launch (was R7)

The `(select auth.uid())` rewrite of 42 RLS policies and the PostGIS conversion are both
real wins and neither is on the path to the first paid job. The current haversine scan
is fine under roughly 10k open jobs, and the initplan rewrite is a performance
optimisation on a database with tens of users. Both come back as their own runs, each
with its own migration file and its own `explain analyze` before/after, after money
works. The index set that *is* cheap and safe rode up into R4's migration (§5.2 note 14).

### 6.2 `20260912000000_broadcast.sql` — R7 (post-launch, or with R8)

```sql
-- Payloads carry {table, id} ONLY. The client hook invalidates a query key and refetches
-- through RLS; it never reads the payload. Revision 1 broadcast full rows, which put
-- payer, payee and amount on the job:<id> topic that every losing bidder listens to.
create or replace function public.broadcast_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_topic text; v_row record;
begin
  v_row := coalesce(new, old);
  v_topic := case tg_table_name
    when 'messages'          then case when coalesce(new.job_id, old.job_id) is not null then 'thread:job:' || coalesce(new.job_id, old.job_id) else 'thread:direct:' || coalesce(new.direct_thread_id, old.direct_thread_id) end
    when 'message_reactions' then 'thread:msg:' || coalesce(new.message_id, old.message_id)
    when 'job_offers'        then 'job:' || coalesce(new.job_id, old.job_id)
    when 'jobs'              then 'job:' || coalesce(new.id, old.id)
    -- Payments get their OWN topic. The two parties listen; bidders cannot.
    when 'payments'          then 'job:' || coalesce(new.job_id, old.job_id) || ':payment'
    when 'live_location_shares' then 'thread:' || coalesce(new.job_id::text, new.direct_thread_id::text, old.job_id::text, old.direct_thread_id::text)
  end;
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'id', v_row.id, 'op', tg_op),
    tg_op, v_topic, true);
  return coalesce(new, old);
end $$;

create trigger messages_broadcast          after insert or update or delete on public.messages          for each row execute function public.broadcast_row_change();
create trigger message_reactions_broadcast after insert or update or delete on public.message_reactions for each row execute function public.broadcast_row_change();
create trigger job_offers_broadcast        after insert or update           on public.job_offers        for each row execute function public.broadcast_row_change();
create trigger jobs_broadcast              after update                     on public.jobs              for each row execute function public.broadcast_row_change();
create trigger payments_broadcast          after insert or update           on public.payments          for each row execute function public.broadcast_row_change();

-- Market feed: one topic per H3-ish cell (reuse the phase11 cell key), and ONLY for rows
-- that belong in the open market. Without the filter a private or assigned job leaks
-- its existence to every worker in the cell.
create trigger jobs_market_broadcast after insert or update on public.jobs for each row
  when (new.status = 'open' and new.visibility = 'open_market')
  execute function public.broadcast_market_cell();   -- topic 'market:' || public.cell_key_for(job)

-- Authorization: who may listen to which topic.
create policy "parties listen to their threads" on realtime.messages for select to authenticated
  using ( public.can_listen(realtime.topic()) );    -- SECURITY DEFINER; parses 'thread:job:<id>', 'job:<id>', 'job:<id>:payment' and checks the right membership per shape
create policy "authenticated listen to market cells" on realtime.messages for select to authenticated
  using ( realtime.topic() like 'market:%' );

-- After the client switch lands: remove tables from supabase_realtime publication (postgres_changes off).
```

`can_listen()` must distinguish shapes: `job:<id>` admits the customer and anyone with
an offer on the job; `job:<id>:payment` admits the customer and the assigned worker
only. That distinction is the whole point of the separate topic and gets its own pgTAP
assertions.

`lib/query/realtime.ts`

```ts
import { useEffect } from 'react';
import { supabase } from '../supabase';
import { queryClient } from './client';
import type { QueryKey } from '@tanstack/react-query';

/** Subscribe to a private broadcast topic and invalidate the given query keys on any event. */
export function useTopicInvalidation(topic: string | null, keys: QueryKey[]) {
  useEffect(() => {
    if (!topic) return;
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k })))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [topic, JSON.stringify(keys)]);
}
```

This single hook replaces the per-instance channel-topic dance in `useOpenJobs`,
`useConversations`, `useConversationChat`, `useJobOffers`, `useReactions`,
`useHotspots`, `useLiveLocation` (13 subscriptions today). Topic names are stable, so
the "dedupe by topic string" hazard disappears — and because the hook ignores the
payload entirely, shrinking the payload to `{table, id}` costs nothing.

---

## 7. Data layer — R8

### 7.1 `lib/query/client.ts`

```ts
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000, retry: 2, refetchOnReconnect: true, networkMode: 'offlineFirst' },
    // Mutations are ONLINE-ONLY by default. A queued release_job_payment that fires an
    // hour later from a pocket is not a feature. Individual non-money mutations
    // (send message, toggle checklist) opt back in with networkMode: 'offlineFirst'.
    mutations: { retry: 1, networkMode: 'online' },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'brazos.query.v1', throttleTime: 1000 });

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)));
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return () => sub.remove();
});
```

`App.tsx`: `<PersistQueryClientProvider client={queryClient} persistOptions={{ persister, buster: '1.0.0', dehydrateOptions: { shouldDehydrateQuery } }}>` wraps `ThemedNavigation`.

**What is written to disk in plaintext, and what is not.** AsyncStorage is not
encrypted. Revision 1 opted out only `payments.*` and `profile.me`, which left every
chat message the user had read sitting in a plain file — including the threads the
product hides behind Face ID. The rule:

```ts
const NEVER_PERSIST = ['messages', 'payments', 'profile'];
export const shouldDehydrateQuery = (q) =>
  q.meta?.persist !== false && !NEVER_PERSIST.includes(String(q.queryKey[0]));
```

and `my_inbox()` omits `last_message.content` for any thread the caller has hidden, so
the persisted inbox preview cannot contain hidden-thread text either. Offline value is
preserved where it matters — the job list, the map cell, your own jobs — and lost only
for message bodies, which need a live connection to be useful anyway.

### 7.2 `lib/query/keys.ts`

```ts
export const keys = {
  jobs: {
    open:   (cell: string | null) => ['jobs', 'open', cell] as const,
    detail: (id: string)          => ['jobs', 'detail', id] as const,
    mine:   (userId: string)      => ['jobs', 'mine', userId] as const,
  },
  offers:   { byJob: (jobId: string) => ['offers', jobId] as const },
  payments: { byJob: (jobId: string) => ['payments', jobId] as const },
  inbox:    (userId: string) => ['inbox', userId] as const,
  messages: (threadKey: string) => ['messages', threadKey] as const,
  profile:  { me: ['profile', 'me'] as const, byId: (id: string) => ['profile', id] as const },
  config:   ['config', 'remote'] as const,
};
```

### 7.3 Screen-shaped RPC: `20260913000000_screen_rpcs.sql`

```sql
-- One read for the inbox: conversations + read state + per-user state + counterparty + last-message reactions.
create or replace function public.my_inbox() returns setof jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'key', c.conversation_key, 'job_id', c.job_id, 'direct_thread_id', c.direct_thread_id,
    'last_message', jsonb_build_object(
      'id', c.last_message_id,
      -- Hidden threads return no preview text: the row is persisted to disk by the
      -- client cache and a hidden chat must not leave its content there.
      'content', case when coalesce(s.hidden, false) then null else c.last_message end,
      'sender_id', c.last_sender_id, 'created_at', c.last_message_at),
    'counterparty', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url),
    'last_read_at', r.last_read_at,
    'state', to_jsonb(s) - 'user_id',
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'user_id', x.user_id)) from public.message_reactions x where x.message_id = c.last_message_id), '[]'::jsonb),
    'blocked', public.is_blocked_between(auth.uid(), p.id),
    'muted', exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = p.id)
  )
  from public.conversations c
  join public.profiles p on p.id = case when c.customer_id = auth.uid() then c.worker_id else c.customer_id end
  left join public.message_reads r on r.user_id = auth.uid() and r.job_id = c.job_id
  left join public.conversation_states s on s.user_id = auth.uid() and (s.job_id = c.job_id or s.direct_thread_id = c.direct_thread_id)
  order by c.last_message_at desc;
$$;
revoke all on function public.my_inbox() from public, anon;
grant execute on function public.my_inbox() to authenticated;
```

(The `hidden` column name comes from `conversation_states`; the run reads its live DDL
and uses whatever that column is actually called.)

`features/messaging/queries.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query/keys';
import { useTopicInvalidation } from '@/lib/query/realtime';
import { useAuth } from '@/hooks/useAuth';
import { InboxRow } from './types';   // zod schema over the jsonb shape

export function useInbox() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: keys.inbox(user?.id ?? ''),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_inbox');
      if (error) throw error;
      return InboxRow.array().parse(data);
    },
  });
  useTopicInvalidation(user ? `inbox:${user.id}` : null, [keys.inbox(user?.id ?? '')]);
  return q;
}
```

`hooks/useConversations.ts` (185 lines, 6 queries, one hand-rolled debounce) becomes
this. Same treatment, in order: `useJobDetail` → `job_detail(p_job_id)` (job + offers +
payment + dispute + checklist + completion evidence in one), `useMyJobsHub`,
`useConversationChat`, `useOpenJobs`, `useJobOffers`, `useProfile`.

Rule for every mutation: `useMutation` with `onMutate` optimistic update where the UI
already pretends (send message, toggle checklist, save worker), `onSettled`
invalidation everywhere else. `track()` is called in `onSuccess`. Money mutations
never get an optimistic update — the ledger is the truth and it is one webhook away.

---

## 8. i18n — framework now, second language when a cohort asks for it

`lib/i18n/index.ts`

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';

const device = getLocales()[0]?.languageCode ?? 'en';
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
export { i18n };
```

`lib/i18n/money.ts`

```ts
export function formatCents(cents: number, locale = i18n.language) {
  return new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
```

`formatBudget()` in `lib/jobs.ts` delegates here (money stays integer cents — the
CLAUDE.md invariant is untouched). The profile `language` column drives
`i18n.changeLanguage` once a second locale exists.

**Spanish is deferred, and the deferral is the point.** Hand-translating 53 screens and
then reading all of it back is real calendar time spent on a guess about who your
workers are. Brooklyn's supply side is not uniformly Spanish-speaking — Flatbush skews
Haitian Creole, Borough Park Yiddish, Gravesend Russian — and you will know which
cohort actually shows up within weeks of TestFlight. Ship the framework and English
keys; adding a locale afterwards is one JSON file and one line in `resources`, because
the extraction was already done.

**Extraction rides inside the redesign sweep, not after it.** Extracting strings from
53 screens and *then* redesigning those same screens is the same file edited twice.
`i18next-parser.config.js` scans `screens/`, `components/`, `features/`, `ui/`,
`navigation/`, `lib/`; the sweep that rewrites a screen writes `t('home.nearby')`
rather than `"Nearby"` on the way past. Key naming: `screen.element.role`
(`checkout.cta.protect`, `earnings.bucket.pending`). Plurals via i18next `_one` /
`_other`. Copy that carries a payment state is generated from the ledger vocabulary
only (`payments.status.held`), never written in a screen.

---

## 9. Structure, performance, premium feel

Split into two pieces so that neither one fights the redesign:

**R10a — skeleton, before the sweep.** `features/` folders created empty with their
`api / queries / mutations / types / components / screens` shape, shared primitives
finalised, `tsconfig.json` paths (`"@/*": ["./*"]`), the image pipeline (§9.4), and the
rendering rules (§9.3) written into the primitives. Nothing moves yet.

**R10b — the moves, inside the sweep.** Each screen the redesign rewrites lands in its
feature folder, with its strings extracted and its list virtualised, in the same pass.
The eight big splits happen when their screens are rewritten, not before.

### 9.1 Feature folders

```
features/messaging/
├── api.ts             supabase calls only (moved from lib/messages.ts, lib/conversations.ts)
├── queries.ts         useInbox, useThreadMessages, useReadState
├── mutations.ts       useSendMessage (optimistic), useSetConversationState, useUnsend
├── types.ts           zod schemas + inferred types
├── components/        ChatBubble, ChatComposer, ConversationRow, MessageTicks, ReactionPicker, VoiceNote, TranslationSheet, LiveLocationCard
└── screens/           MessagesInboxScreen, ChatScreen, HiddenChatsScreen
```

Same shape for `jobs` (PostJob, ClientJobDetail, JobDetail, MyJobsHub, JobConfirmed),
`offers` (BidDetail, CompareBids, Counteroffer, SubmitBid, BidSent, OfferCard,
OfferComposer), `payments` (Checkout, ApproveOrDispute, ReviewAndTip, Earnings,
PaymentMethods, ConnectOnboarding), `discovery` (Home, WorkerHome, Map, WorkerSearch,
WorkerResults, CellJobs), `profile`, `notifications`. `lib/` keeps only cross-cutting
modules (supabase, query, theme, i18n, observability, navigation, dialog, haptics,
storage, validation).

### 9.2 `ChatScreen.tsx` (2,276 lines) → six files

| File | Lines (target) | Owns |
| --- | --- | --- |
| `screens/ChatScreen.tsx` | ~250 | route params, assembly of hooks, layout |
| `hooks/useChatAssembly.ts` | ~150 | targets → merged timeline (from `useConversationChat`) |
| `hooks/useChatActions.ts` | ~120 | send / unsend / react / block / state changes (mutations) |
| `hooks/useChatAttachments.ts` | ~120 | photo / voice / document pickers + upload |
| `hooks/useChatLiveShare.ts` | ~100 | LIVE_LOCATION assembly |
| `components/ChatTimeline.tsx` | ~200 | `FlashList` inverted, memoized `ChatBubble` rows, day separators |
| `components/ChatHeader.tsx` | ~120 | counterparty, job chip, overflow menu |

Same split for `PostJobScreen` (2,451 → a `useJobDraft` reducer +
`steps/{Describe,Media,LocationTime,BudgetReview}.tsx`), `ClientJobDetailScreen`,
`HomeScreen`, `JobDetailScreen`, `MessagesInboxScreen`, `ProfileScreen`, `WorkerSearchScreen`.

### 9.3 Rendering discipline (enforced by one new fence, replacing none)

- Every list of more than ~10 rows is `FlashList` with `estimatedItemSize`; row components are `memo` with primitive props.
- `themedStyles` caches stay; styles never rebuilt inside render.
- `useThemeColors()` is read once per screen and passed down, not called in each row.
- Every `Text` gets `maxFontSizeMultiplier={1.3}` via the shared `ui/primitives/Text` (Dynamic Type never breaks a layout; 22 sites today, 0 in `ui/`).
- Skeletons come from `ScreenStateView` on `query.isPending`; errors from `userMessage(query.error)`. No screen holds its own `loading`/`error` state.

### 9.4 Image pipeline

`components/RemoteImage.tsx` becomes a static `expo-image` import that takes
`{ path, bucket, width }` and resolves through `lib/media/imageUrl.ts`:

```ts
export async function signedImageUrl(bucket: string, path: string, width: number) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, {
    transform: { width, resize: 'cover', quality: 75 },
  });
  if (error) throw error;
  return data.signedUrl;
}
```

with a `useQuery` cache keyed by `[bucket, path, width]` (URLs live 1 h; the cache lives
50 min). `blurhash` from `media_meta` feeds `placeholder` once `moderate-upload` exists;
until then `expo-image`'s own transition covers it. Feeds load 40 KB thumbnails instead
of 4 MB originals — the single largest perceived-speed win available, it needs no screen
redesign, and it belongs in R10a for that reason.

### 9.5 Comments → ADRs

Every multi-paragraph comment that explains a decision (the `featureFlags.ts` essays,
the `CustomerRoot.tsx` reversal history, the `RemoteImage.tsx` boundary story) moves to
`docs/adr/NNNN-slug.md` in the standard template (Context / Decision / Consequences /
Status), and the code keeps one line: `// ADR-0012: foreground-only live location`.
Target comment ratio ≤ 8 %. **The ratio fence itself is deferred past launch** — it is
a budget optimisation, and enforcing it during the redesign sweep would add a failing
gate to every UI run.

---

## 10. Process and docs — R11

### 10.1 Run → PR → merge

- `brazos-run.ps1` creates `run/<label>` from `origin/mainexpo`; the run commits there
  and ends with `gh pr create --base mainexpo --fill`. Branch protection on `mainexpo`
  requires: CI green, one approval (you, from the phone).
- Single trunk stays. Run branches are short-lived and auto-deleted on merge.
- **A second-model review is advisory on most paths and BLOCKING on `supabase/**` and
  `lib/payments/**`.** One approval tapped from a phone is a rubber stamp, and money
  code is exactly where a rubber stamp costs real dollars. A PR touching those paths
  additionally requires a plain-English money-flow summary in its description: what
  moves, when, in which direction, and what happens if the step fails. If you cannot
  read that paragraph and tell whether it is right, the PR is not ready.

### 10.2 `tests/handoffBudget.test.mjs`

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const handoff = readFileSync(new URL('../HANDOFF.md', import.meta.url), 'utf8');
test('HANDOFF.md is the live edge only', () => {
  assert.ok(handoff.split('\n').length <= 200, 'HANDOFF.md exceeds 200 lines — move the run record to docs/handoff-archive/');
  for (const h of ['## Current state', '## Blocked', '## Next', '## Waits on the operator']) assert.ok(handoff.includes(h), `missing ${h}`);
});
```

### 10.3 `docs/adr/template.md` and the first twelve ADRs

0001 payments-ledger-as-projection · 0002 capture-at-hire-transfer-on-release ·
0003 hire-before-connect-onboarding · 0004 appversion-runtime-fingerprint-detector ·
0005 three-app-variants · 0006 broadcast-over-postgres-changes ·
0007 feature-flag-table · 0008 fence-budget · 0009 comments-vs-adrs ·
0010 staging-via-cli-production-by-hand · 0011 no-work-before-held ·
0012 english-first-i18n · 0013 two-sided-750bps-all-in-pricing.

### 10.4 `CLAUDE.md` — the exact edits

| Section | Change |
| --- | --- |
| Supabase | "Never execute SQL against any database during a run" → "Never contact a REMOTE Supabase project. The local Supabase (`supabase start`, 127.0.0.1) is the run's database: `supabase db reset`, `supabase test db` and `npm run db:types` are expected in every schema run." Production literal unchanged. |
| Supabase | numbered `phaseNN` files → `supabase migration new <slug>`; "applied" = `supabase migration list` shows it on the target, never SQL Editor success; `verify-schema.mjs` retired. |
| Supabase | staging migrates via CI on merge; **production migrations stay hand-applied by the operator**, followed by `migration repair`. |
| Supabase | "There are NO generated Supabase database types" → "`types/database.ts` is generated and committed; CI fails on drift." |
| Validation | `npm run verify` = lint + unit; `npm run test:db` = pgTAP, required in any run touching `supabase/`. |
| Workflow | commits land on `run/<label>`; the run ends with `gh pr create`; direct push to `mainexpo` is denied. |
| Agent autonomy | "`git push` to mainexpo after verify" → "open a PR after verify + test:db". |
| Dependencies | the R1 batch is pre-approved by name; anything else stops. |
| New section: Money code | any change under `supabase/**` or `lib/payments/**` requires a blocking second-model review and a plain-English money-flow paragraph. |
| New section: Comments and ADRs | one-line why; rationale → `docs/adr/`; ratio fence deferred. |
| New section: Fences | count frozen at the R11 baseline; a new fence names its ADR; a fence may be deleted when its ADR is superseded. |
| Screenshots | `.maestro/` flows on EAS are the iOS render source; `scripts/shots.mjs` remains the fast web comparison aid. |
| Design system | unchanged. Typography rule unchanged. |

### 10.5 Deletions (one table, one run)

| Path | Why |
| --- | --- |
| `app.json`, `env.d.ts`, `react-native-dotenv`, Babel plugin | replaced by `app.config.ts` + `EXPO_PUBLIC_*` |
| `expo-task-manager`, `UIBackgroundModes`, `NSLocationAlwaysAndWhenInUseUsageDescription` | unused; review risk |
| `PROD_APPLY.md`, `PROD_APPLY_READY.sql`, `PROD_VERIFY.sql` | superseded by CLI migrations; → archive |
| `scripts/verify-schema.mjs`, `tests/verifySchemaGuards.test.mjs` | replaced by `migration list` + pgTAP |
| `scripts/staging-acl-bootstrap.sql` | baseline migration carries grants |
| `scripts/phase*-proof.sql`, `scripts/lifecycle-proof.mjs` | converted to pgTAP; → archive |
| `supabase/phase*_*.sql` | → `docs/archive/migrations-v1/` |
| `design-reference/screen_map.json` | byte-duplicate |
| `docs/mockups/rejected/`, `docs/mockups/PRESTIGE_RUN_REPORT.md` | rejected authority / 2,759-line run report → archive |
| `DIAG_offer_negotiation_messaging.md` (root) | → archive; `lib/offerNavigation.ts` comment updated to the archive path |
| `DECISIONS.md` | → `docs/adr/0000-…` |
| `lib/adapters/`, `lib/payments.ts` | → `lib/payments/` |
| the five lazy-`require` boundaries' fallback branches | static imports after the R1 build |
| `hooks/useChat.ts`, `components/SectionHeader.tsx`, `ui/templates/ListScreen.tsx` | dead per the 2026-08-15 review |

---

## 11. Run plan

Read scope is the budget; each run names its files. Native dependencies are installed
in R1 so ONE build (after R1) carries every native module the later runs wire.
Model: Fable max for R3/R4/R5 (schema, money, security); Opus xhigh for the rest.

**The critical path to the first real paid job is R0 → R1 (+R2) → R3 → R4 → R5 → R6 →
Launch gate → TestFlight.** Everything else is after money works.

| Run | Touches | Gates | Waits on you after |
| --- | --- | --- | --- |
| **R0** (you, ~90 min, some of it calendar-gated) | Docker Desktop; `supabase login`; **Stripe live-mode activation started** (business details, bank, Connect platform review — this has an external clock, start it first); Stripe test keys; Sentry project + auth token; PostHog key; EAS environments via `eas env:create`; **Supabase production moved to Pro**; Apple Developer Program enrolment confirmed; check your EAS plan's build quota | — | — |
| **R1 Config** | §2 files; deps batch; review-hygiene deletions; static imports | verify; `fingerprint:generate` prints the new hash | **one EAS build** (development + preview) |
| **R2 Observability** | §3 files | verify; a deliberate `Sentry.captureMessage` on the dev build shows in Sentry with source maps | confirm the event arrived |
| **R3 DB tooling** | §4; staging baseline dump; **production diff + repair**; pgTAP conversion of the offer and lifecycle proofs; CI | `supabase test db` green locally and in CI; `db:types` committed; the production diff is in the report and empty or explained | you read the production diff, then run `migration repair` on both projects (exact text in the run report) |
| **R4 Payments schema** | §5.2 — one migration file; two-sided `fee_schedule` seeded 750/750/100/750; `quote_job_price()`; the `transition_job_status` guards; `tests/030_payments.sql` | pgTAP: every state move, every refusal, idempotency under replayed events, the void-frees-the-slot assertion, the no-work-before-held gate, and `charge_amount_cents = amount + customer fee` at every rate boundary including a future-dated `fee_schedule` row | apply the migration on staging; `supabase secrets set STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET` |
| **R5 Payments edge** | §5.3; both webhooks; sweeper + transfers cron | deno check; local `supabase functions serve` + `stripe listen --forward-to` **and** `--forward-connect-to`, replaying every event type including `transfer.reversed` and `charge.dispute.created`; confirm the Express payout delay setting is actually settable by the platform | `supabase functions deploy` (staging); register BOTH webhook endpoints in Stripe (one normal, one Connect) |
| **R6 Payments client** | §5.4; nine screens; fence rewrite; `lib/remoteConfig.ts` wiring | verify; Maestro `customer-post-hire-pay` on test card 4242 against the **preview** environment | two-device walk on the preview build with test cards (this IS your Step 6) |
| **Launch gate** (you + one short run) | `docs/policies/money.md` written and ToS/Privacy updated to quote it; `docs/runbooks/refunds.md`; `delete_my_account()` extended for Stripe identity (§12.5); Stripe live activation completed; production DB rebuild | account-deletion pgTAP still green with `payment_accounts` in the picture | TestFlight submission; ~10 real Brooklyn users |
| **R7 Realtime** | §6.2; hooks on `useTopicInvalidation` | pgTAP for `can_listen` topic shapes; publication emptied last | — |
| **R8 Data layer** | §7; inbox, job detail, my jobs, chat | verify; airplane-mode Maestro flow: cached job list renders, send queues and flushes, messages are absent from disk | — |
| **R10a Skeleton** | §9 (a); feature folders; primitives; image pipeline | verify; shots harness byte-identical | — |
| **R10b + i18n** | the redesign sweep, with string extraction and feature-folder moves riding inside it | `i18n:extract` reports 0 untranslated keys; reviewed shots; **a fence asserts no customer-facing component renders a bare bid amount and no literal fee rate appears outside `lib/payments/`** | — |
| **R11 Process** | §10; CLAUDE.md; HANDOFF cap; PR workflow; deletions table | verify; first PR merged through the gate | branch protection settings (click path in the run report) |
| **Deferred** | RLS initplan rewrite; PostGIS; full 240-assertion RLS matrix; second locale; comment-ratio fence; `payout.paid` reconciliation; `moderate-upload` | each becomes its own run with its own migration and proof | — |

---

## 12. Decisions only you can make, before R4 writes them into schema and copy

Each of these is currently *implied* by the code above. Implied decisions become
permanent the day the first real customer pays.

### 12.1 Take rate, and which side pays — **RESOLVED 2026-08-27**

**750 bps customer / 750 bps worker, $1.00 worker-side minimum, tips customer-side only.**
Seeded in §5.2, displayed all-in per §5.1a, recorded as ADR-0013.

Unit economics on a $100 accepted bid (all VERIFIED against current Stripe pricing):

| | |
| --- | --- |
| Customer charged | $107.50 |
| Stripe on the charge (2.9% + $0.30) | −$3.42 |
| Transfer to the worker | −$92.50 |
| Connect payout fee (0.25% + $0.25) | −$0.48 |
| **Contribution per job** | **$11.10** |
| Less $2/month per worker who receives any payout | −$0.50 at 4 jobs/worker/month, −$2.00 at one |

The split is revenue-neutral — any two rates summing to 15% land within $0.07 of each
other, because a worker prices your commission into the bid either way. Three things
decided the split rather than the arithmetic:

1. **You can raise a customer fee; you effectively cannot raise a worker fee.** Workers
   watch deductions from their own money and leave. So the worker number is set where it
   can stay permanently, and the customer number starts low with headroom.
2. **7.5% clears the 10% threshold on the side that matters for recruiting.** TaskRabbit
   charges workers a flat 15% and layers a customer-side trust fee of 5–15% on top; at
   7.5% + 7.5% Brazos takes half their total and can say so in one sentence.
3. **Symmetry is a trust story a brand-new app can actually tell.** The partitioned-pricing
   literature is clear that a split price only outperforms an all-inclusive one when the
   total is hidden — which NYC is in the process of outlawing — and that consumers in
   low-trust, transactional relationships notice a surcharge, question its fairness, and
   buy less. Perceived fairness, not the number, is what determines whether a fee is
   accepted. "7.5% from each side, and both of you see all three numbers" is the version
   that survives that scrutiny.

Two things I considered and rejected. **Worker-only 15%** is defensible — Airbnb ran the
canonical split for a decade and consolidated to a single ~15.5% host-side fee starting
in late 2025 — and it would save a column and a display rule; rejected because supply is
the binding constraint and 15% is the number a worker repeats to another worker.
**5%/10%** is revenue-identical; rejected because it puts the higher number on the side
that can never be raised.

Revisit when GMV justifies it. The mechanism is time-versioned, so raising the customer
side later is one INSERT with a future `effective_from` and zero migration.

### 12.2 The cancellation and change-order policy

Capture happens at hire, and Stripe keeps its fee on any refund (VERIFIED). Someone
absorbs that on every weather day and every no-show. Write down: who eats the processing
fee on a customer cancellation, on a worker cancellation, and inside what window; whether
a partial refund is available after work has started; and what happens when the scope
changes mid-job.

**On change orders I disagree with the review that suggested adding an `adjustment`
payment kind now.** The repo has a `payments_one_active_per_job_kind` unique index, so a
new kind that can legitimately occur more than once per job means reworking that index,
and it needs a second checkout flow and its own UI. The launch answer is cheaper and
already built: renegotiate before funding (§5.2 re-syncs the amount on resume), and after
funding the top-up rides the existing tip rail. Say that plainly in the policy. Revisit
when a real job actually needs it.

### 12.3 Android

Every gate, test and screenshot source in this document is iOS, and Android is deferred
by your decision. That is defensible for the demand side and risky for the supply side,
because the workers you need are more likely to be on Android. **The cheapest deciding
fact: the phones the first twenty workers you would personally recruit are carrying.**
If the answer is mostly Android, an Android build profile and one Maestro Android flow
belong in R1 and R6 respectively, which is far cheaper than retrofitting them after
TestFlight. Nothing in this document blocks Android; `app.config.ts` already carries the
package name.

### 12.4 Mandatory completion photos

§5.2 makes at least one photo required to mark a job complete. That is your best
chargeback evidence, your best dispute-resolution input, and a real improvement to the
customer's approval decision — and it is also one more thing a tired worker has to do
at the end of a job. If you would rather make it optional, say so before R4; the table
and the flow stay either way, only the guard changes.

### 12.5 Account deletion with live money

**Correction to the review that prompted this revision: in-app account deletion is not
missing.** `delete_my_account()` exists (phase 67, App Store Guideline 5.1.1(v)), it
tombstones the profile rather than deleting the row, and `account_deletion_blockers()`
already refuses while money has not finished moving. What Stripe adds is narrower: a
deleted user may still have a Stripe Customer and an Express account, and a worker who
deletes their account after a `released` payment may still have tax-year activity at
Stripe. The launch-gate task is to extend the existing function to clear
`payment_accounts` identifiers into an archive and decide whether the Express account is
closed or left standing — not to build a deletion flow.

### 12.6 Legal and tax checklist for a New York labor marketplace

Pointers to raise with a lawyer and an accountant, not advice, and none of it is
engineering work you can dispatch:

- **1099 reporting** for workers paid through Connect. Stripe offers tax-form filing for
  connected accounts, but it is a product you enable and configure, not a default.
- **NYC/NYS Freelance Isn't Free Act** — written terms and payment within 30 days for
  freelance engagements. Your 72-hour release satisfies the timing; generating a
  job-agreement record at acceptance is the cheap way to satisfy the written-terms part.
- **NYC DCWP Home Improvement Contractor licensing** for home-repair work above a dollar
  threshold. A license field plus a badge per category is inexpensive to add now and
  awkward to retrofit.
- **NY sales tax** applies to some repair and maintenance services; the app currently has
  no tax line anywhere.
- **A bonus you have already paid for:** Express onboarding ID-verifies every worker.
  Surfacing `payouts_enabled` as a "verified" badge is free trust.
