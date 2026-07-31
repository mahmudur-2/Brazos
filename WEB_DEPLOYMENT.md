# BRAZOS web deployment

BRAZOS is deployed as an installable Expo web app. The native EAS/TestFlight
configuration remains available separately.

## Production configuration

The host stores `SUPABASE_URL` and `SUPABASE_KEY` as production environment
variables. Only the Supabase publishable client key belongs here. Never use or
upload a Supabase service-role key.

The browser receives these publishable values at runtime from `/config.js`.
They are not committed to Git or baked into the production JavaScript bundle.

## Release workflow

1. Make and review a focused code change.
2. Run `npm run typecheck`, `npm run lint`, and `npm test`.
3. Run `npm run build:web`.
4. Ask Codex to deploy the validated BRAZOS web build to production with Sites.
5. Open the production URL and confirm sign-in and the changed flow.

The service worker uses network-first navigation and intentionally does not
cache JavaScript bundles. Future deployments therefore remain easy to refresh.

## Install on iPhone

1. Open the production HTTPS URL in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Confirm **Add**.

BRAZOS then opens from its own Home Screen icon in standalone mode.
