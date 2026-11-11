# BRAZOS

BRAZOS is a two-sided local-labor marketplace: customers post jobs (handyman work, cleaning,
moving, errands), workers respond with offers, and hiring, payment and the job lifecycle run in
the app. It is an Expo iOS app: every account can post work and take work, shown as two
switchable modes.

## Stack

- App: Expo (SDK from `package.json`), React Native, React, TypeScript.
- Backend: Supabase (Postgres, row-level security, SQL RPCs, edge functions), Twilio Verify for
  phone codes (configured in the Supabase dashboard).
- Payments: Stripe in test mode (card checkout, Connect payouts).
- Errors: Sentry.
- Node: the version in `.nvmrc`.

## What is in v1

- One account, two modes (customer and worker), switched with `switchMode()`.
- Sign in with email or phone (Supabase).
- Post a job with photos or video, a posted price or open bids; the address stays private until hire.
- Worker discovery as a list and a map, with deterministic matching (no AI).
- Offers, counter-offers, and accept (`accept_offer()` is the only way a worker gets assigned).
- Stripe test-mode card checkout, a held then released ledger, tips, Stripe Connect payouts.
- Chat (text and photos, unsend, block, report) once an offer is accepted.
- Notifications and quiet hours, reviews, disputes, account deletion, admin reports.
- Light and dark themes.

## Not in v1 (now in `docs/BACKLOG.md`)

Saved workers, portfolio, work checklist, lock-screen live card, live location sharing, voice and
document messages, translation, read ticks, reactions, inbox archive and mute, semantic (AI)
search, the voice search mic (dictation in Post Job stays), practice money, PostHog analytics,
i18n, Android, web/PWA, feature flags, price guidance.

## Run it

```
npm install
cp .env.example .env     # fill in the Supabase staging values
npx expo start           # Metro dev server; open in a dev client
npm run verify           # type-check, then every test (offline)
npm run db:reset         # local database from the migrations (needs Docker)
npm run db:test          # database tests (needs Docker and db:reset first)
```

`.env` and `start.ps1` are git-ignored and supplied by the owner. `.env.example` lists the
variable names without values. `npm run db:*` touch only the local Docker stack, never a remote
project. Details: `docs/TESTING.md`.

## Where the rules live

| File | What it holds |
|---|---|
| `CLAUDE.md` | policy and invariants; binding on all automated work |
| `HANDOFF.md` | now, blocked, next, revert |
| `docs/ARCHITECTURE.md` | how the app and the database work today |
| `docs/DECISIONS.md` | the rulings the code follows |
| `docs/TESTING.md` | verify, database tests, Maestro, TestFlight, reviewer accounts |
| `docs/BACKLOG.md` | v1 bugs, ranked v1.2 work, parked owner decisions |

Branch, HEAD and the working tree are Git's: read them with `git`, never from a document.

## Database migrations

Schema changes are timestamped files in `supabase/migrations/`, never edited once applied. A push
to `mainexpo` that touches `supabase/` starts `.github/workflows/staging.yml`: verify, apply every
pending migration, then deploy the edge functions. A migration that drops or renames something
stops the pipeline for the owner. Production has its own button, `.github/workflows/production.yml`,
which only the owner starts and approves (`docs/production/owner-steps.md`).
