# Deployment and Environment

## Local installation

**VERIFIED from repository configuration**

Prerequisites:

- Node.js/npm compatible with Expo SDK 54.
- A Supabase project that already has the complete Brazos schema.
- Client-safe Supabase configuration.

Install:

```powershell
npm ci
```

Start:

```powershell
npm run start
npm run web
npm run android
npm run ios
```

On Windows, iOS local native execution is not available through Xcode. The audited web server is running at `http://127.0.0.1:8081/`.

## Environment variables

`.env.example` identifies:

```text
SUPABASE_URL
SUPABASE_KEY
```

No values were read or copied into this audit.

`babel.config.js` loads `.env` through `react-native-dotenv` with `safe: false` and `allowUndefined: true`. Missing configuration therefore survives transform and is rejected later by `lib/supabase.ts`. Because client variables are bundled, `SUPABASE_KEY` must be a public publishable/anon key, never the service role.

## Expo application configuration

**VERIFIED in `app.json`**

- Application name/slug: Brazos.
- Version: `1.0.0`.
- iOS bundle identifier: `com.brazos.app`.
- Android package: `com.brazos.app`.
- App icon/splash/assets configured.
- Platform permissions/plugin configuration exists for native device features.

Material gaps:

- no `extra.eas.projectId`;
- no `eas.json`;
- no build/submit profiles;
- no runtime version policy;
- no Expo Updates release-channel strategy;
- no environment-specific configuration;
- no store submission metadata workflow;
- no web hosting configuration.

## Production export result

**VERIFIED**

`npx expo export --platform all` completed to a temporary directory outside the repository:

```text
C:\Users\mdmah\AppData\Local\Temp\brazos-audit-export-43dd99b77db34bd198fa15effb680738
```

This proves Metro can produce web JavaScript and Android/iOS Hermes bytecode from the current source. It does not prove:

- native Xcode/Gradle compilation;
- native permissions/entitlements;
- signing and credentials;
- development-client behavior;
- store compliance;
- physical-device push/map/media flows;
- over-the-air update safety.

## Backend deployment

**PARTIAL / largely UNKNOWN**

The repository instructs operators through sequential SQL phases, apparently intended for manual execution in the Supabase SQL editor. There is no Supabase CLI configuration, canonical migration directory, deployment script, or environment mapping.

`scripts/verify-schema.mjs` confirms selected later-phase objects in the currently configured project, but the core baseline is absent from source.

`supabase/functions/send-push/index.ts` exists, but the repository does not prove:

- that the function is deployed;
- which environment/project it targets;
- that service-role and function secrets are configured;
- that `pg_cron` or an external scheduler invokes it;
- that Expo receipts are monitored.

## CI/CD and hosting

**NOT IMPLEMENTED**

No GitHub Actions, alternative CI, EAS Workflows, hosting manifest, Docker deployment, or release pipeline was found. No automated checks are required before merge or release.

## Environment separation

**UNKNOWN / not represented in source**

No explicit development, staging, and production project references or policies exist. The connected project contains substantial seed data. A release system should provide:

- separate Supabase projects;
- separate EAS environment variables and channels;
- non-production-only seed execution;
- migration promotion order;
- protected service-role secrets;
- release approvals;
- rollback and data-repair procedures.

## Deployment readiness checklist

### P0 — required before a credible staging release

- [ ] Build a canonical baseline Supabase migration from a reviewed schema.
- [ ] Apply it to a blank staging project and run automated RLS/storage tests.
- [ ] Remove seed execution from production paths and label demo data.
- [ ] Configure an EAS project and checked-in `eas.json`.
- [ ] Fix web notification guards and verify push on physical iOS/Android builds.
- [ ] Deploy/version the push Edge Function and scheduler through automation.
- [ ] Add CI for install, typecheck, lint, tests, schema validation, and export/build.
- [ ] Add crash/error monitoring and release identifiers.

### P1 — required before public release

- [ ] Signed Android/iOS builds and store checks.
- [ ] Web hosting/CSP/security headers if web is a supported product.
- [ ] Environment-specific legal document versions and counsel approval.
- [ ] Privacy deletion/export and data-retention jobs.
- [ ] Backup/restore and rollback drill.
- [ ] Rate limits, upload controls, abuse response, and incident runbooks.
- [ ] Analytics/consent decision and privacy review.
- [ ] Accessibility and physical-device test matrix.

## Recommended release commands

Do not invent permanent commands until the project chooses its EAS and Supabase deployment model. The current verified commands are limited to local Expo scripts, `tsc`, the targeted schema verifier, and `expo export`; there is no checked-in authoritative production deployment command.

