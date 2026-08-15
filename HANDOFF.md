# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-15 - stage2: fail-closed EAS build gate + dev-build prep

`scripts/eas-build-pre-install.mjs` now fails closed for EVERY profile:
development/preview expect staging, testflight/production expect the
production ref; unset or unknown profile, absent/unparseable
SUPABASE_URL/KEY, or any disagreeing source (env vars or a dotenv file the
bundler could see) is a named exit 1. `tests/buildGate.test.mjs` spawns the
real gate per matrix row. eas.json gained a `development` profile
(developmentClient, internal distribution, staging env verified through
supabase-ref.mjs before writing). app.json: permission strings set to the
stage-2 exact copy; bundleIdentifier com.brazos.app and extra.eas.projectId
kept as-is. No SQL changes; no push-code changes (getExpoPushTokenAsync
already passes projectId, foreground handler already in App.tsx).

## Human actions before the first dev build

1. `npx expo install expo-dev-client` (resolves ~6.0.21). The run's one
   permitted install was mechanically blocked (GUARD-DEPS); run it once,
   then commit package.json + package-lock.json.
2. `eas build --profile development --platform ios` - no bundle-id prompt
   is expected. TestFlight note: the gate now requires the EAS "preview"
   environment to carry PRODUCTION refs (testflight builds -> production).
3. One push end-to-end still needs: deploy send-push, enable pg_net +
   pg_cron, set app.push_function_url / app.push_service_key, then the
   cron block from phase20 §8 (or invoke send-push manually with the
   service key). phase70/71/72 stay written but applied NOWHERE; staging
   is current through phase69 (docs/audits/ANON_EXPOSURE_2026-08-15.md).
