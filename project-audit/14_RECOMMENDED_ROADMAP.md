# Recommended Roadmap

The sequence below prioritizes preservation and verification of existing behavior before adding product scope.

## Phase 0 — Freeze the current truth

Goal: make the existing system understandable and reproducible.

1. Export and review the complete deployed Supabase schema without production data or secrets.
2. Convert it into canonical timestamped migrations, including core tables/enums/indexes/RLS/storage.
3. Apply from zero to a new staging project.
4. Generate Supabase TypeScript types and replace the highest-risk `any`/`select('*')` paths.
5. Mark all seed records and hard-block seed scripts outside disposable environments.
6. Rewrite `brazos-product-spec.md` as a current, versioned system/product source of truth.

Exit criteria:

- a blank environment can be created automatically;
- schema diff against the intended remote state is clean;
- no secret or production data is required;
- a new engineer can install and start the app from documented steps.

## Phase 1 — Close correctness and security blockers

Goal: protect data and make core transitions atomic.

1. Replace `lib/bids.ts::acceptBid` with a validated transactional RPC.
2. Replace job/location multi-call writes with transactional RPCs.
3. Introduce a public-profile view and explicit column allowlists.
4. Redesign Storage object paths and policies around user/job/conversation ownership.
5. Add multi-identity automated RLS and Storage tests.
6. Decide and enforce legal-acceptance semantics; remove the fail-open mutation path if acceptance is mandatory.
7. Add upload size/MIME limits, orphan cleanup, and retention rules.
8. Add basic rate limiting/anti-abuse controls.

Exit criteria:

- attacker/victim policy tests pass;
- no core status transition can partially commit;
- private profile fields are not generally readable;
- unauthorized storage overwrite/upload/delete tests fail as expected.

## Phase 2 — Establish engineering safety

Goal: make regressions visible before release.

1. Add ESLint and enable unused-symbol checks or an equivalent rule set.
2. Add unit tests for row mappers, status rules, bid scoring, error mapping, and notification routing.
3. Add integration tests against a disposable Supabase project.
4. Add E2E smoke flows for auth, browse, post, bid, accept, chat, complete, review, and moderation using seeded test identities.
5. Add CI for `npm ci`, typecheck, lint, tests, schema setup/verification, and Expo export.
6. Add crash reporting, structured logs, release IDs, and alert ownership.
7. Add accessibility checks and manual native screen-reader/keyboard test cases.

Exit criteria:

- every merge runs repeatable gates;
- core flows have happy-path and authorization-failure coverage;
- runtime failures are attributable to a release and visible to an owner.

## Phase 3 — Complete deployment and notifications

Goal: produce controlled staging builds and verify external services.

1. Configure the EAS project and checked-in `eas.json`.
2. Define development, preview/staging, and production environments.
3. Guard web notification APIs.
4. Deploy/version `send-push` and its scheduler through an auditable workflow.
5. Verify token registration, foreground/background/terminated routing, rotation, retries, receipts, and invalid-token cleanup on physical iOS and Android devices.
6. Define web hosting/support or explicitly remove web from the supported product matrix.
7. Add staged rollout and rollback runbooks.

Exit criteria:

- signed staging builds install on both native platforms;
- a database event reaches a device and routes correctly;
- failed notifications are observable;
- releases can be rolled back without improvisation.

## Phase 4 — Stabilize the existing marketplace UX

Goal: complete the prototype's current promises before introducing money movement.

1. Fix accessibility roles, labels, keyboard/focus behavior, contrast, and dynamic type.
2. Standardize loading/error/empty/offline/retry patterns.
3. Replace stale object navigation with identifiers and destination refetch.
4. Consolidate query/subscription behavior and define cache/invalidation rules.
5. Finish theme adoption or explicitly scope to light mode.
6. Add browse search/filter/sort, pagination, and performance budgets.
7. Validate chat media, reactions, unsend, moderation, and Hire Again with two-account E2E tests.
8. Upgrade Expo SDK in a dedicated branch after behavior is covered.

Exit criteria:

- supported flows are accessible and resilient under offline/slow/error conditions;
- no framework deprecation warnings remain in supported web flows;
- primary feed/chat workloads meet agreed performance targets.

## Phase 5 — Product strategy gates

Goal: decide which expensive systems Brazos will own.

### Gate A — Off-platform payment marketplace

If Brazos remains lead-generation/direct payment:

- make that model explicit throughout UI/legal/product docs;
- focus on trust, safety, discovery, scheduling, and communication;
- avoid UI implying escrow/guarantee/payment protection.

### Gate B — Transaction marketplace

If Brazos processes money:

- design payment ledger/webhooks/idempotency first;
- select connected-account/KYC/payout architecture;
- define fees, refunds, disputes, taxes, chargebacks, and reconciliation;
- revise legal/privacy/risk obligations;
- add financial operations and monitoring before UI launch.

### Identity verification

Define what “verified” means, select a provider/process, store only necessary evidence, implement expiry/revocation/audit, and remove or relabel the badge until the meaning is real.

### Localization/translation

Implement an actual i18n foundation before LLM translation. Treat model translation as assistive, with privacy, cost, latency, failure, and disclosure rules.

## Suggested ownership

| Workstream | Primary owner |
|---|---|
| Schema/RLS/transactions | Senior backend/Supabase engineer |
| EAS/native/push | Senior Expo/mobile engineer |
| Client state/accessibility | Senior frontend/mobile engineer |
| CI/testing/observability | Platform/quality engineer with product teams |
| Payments/verification | Staff architect + product/legal/operations |
| Product source of truth | Product lead + engineering lead |

## First two-week target

Do not attempt the whole roadmap. The highest-value first increment is:

1. capture canonical schema;
2. boot a blank staging environment;
3. add RLS/storage tests;
4. make bid acceptance and job/location writes transactional;
5. establish CI with the existing typecheck/export plus initial tests;
6. fix the web push error and decide the EAS project/environment layout.

