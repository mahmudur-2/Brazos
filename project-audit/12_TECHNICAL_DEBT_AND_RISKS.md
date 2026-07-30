# Technical Debt and Risks

## Risk matrix

| Risk | Likelihood | Impact | Evidence class | Recommended control |
|---|---|---|---|---|
| Environment cannot be recreated | High | Critical | VERIFIED | Create and test a canonical baseline migration. |
| Unauthorized/orphan storage uploads | Medium–High | High | INFERRED from policies | Owner/domain-scoped policies and adversarial tests. |
| Partial marketplace state writes | Medium | High | VERIFIED in source | Transactional RPCs with state preconditions. |
| Private profile-field exposure | Medium | High | PARTIALLY VERIFIED | Public-profile view and explicit field grants/selects. |
| Notification system fails in release | High | High | BROKEN/UNKNOWN | Platform guard, EAS linkage, deployed/tested pipeline. |
| Regression reaches users | High | High | VERIFIED absence | Test pyramid, lint, CI, staged releases. |
| Demo data reaches production/misattributed | Medium | High | VERIFIED | Seed markers, environment guardrails, clean production. |
| Schema drift causes runtime/data exposure | High | Medium–High | VERIFIED | Generated types and migration CI. |
| External geocoder throttles/fails | Medium | Medium | INFERRED | Proxy/cache/provider strategy. |
| Accessibility blocks web/native users | Medium–High | Medium–High | PARTIALLY VERIFIED | Semantic component baseline and assistive testing. |
| Incidents are invisible | High | High | VERIFIED absence | Crash, analytics, logs, alerts, runbooks. |

## Database and backend debt

### Manual phase scripts

Schema changes, seed data, and repair operations coexist under `supabase/phase*.sql`. The sequence depends on prior remote state and later scripts revise earlier constraints. There is no machine-enforced migration checksum or blank-environment test.

Risk: two Supabase projects can both appear “up to date” while having materially different baselines, policies, functions, or data.

### Client-driven transactions

`lib/bids.ts::acceptBid` and job/location functions in `lib/jobs.ts` implement multi-row business transitions as separate requests. Network interruption, RLS drift, or concurrent actions can leave partial state.

Risk: inconsistent accepted bid/job worker, job without location, or stale conflict resolution.

### Weak schema typing

Data modules commonly use `any`, `select('*')`, manually declared interfaces, and `string` statuses. This is flexible during prototyping but bypasses compile-time detection of deployed schema changes.

Risk: runtime breakage, silent field loss, and unintended sensitive-column reads.

## Client architecture debt

### Distributed server-state handling

Hooks independently manage loading, error, refresh, subscription, and mutation state through `useState`/`useEffect`. There is no shared cache, invalidation policy, request deduplication, retry policy, or offline model.

Risk: redundant requests, inconsistent stale state, duplicated code, race conditions, and uneven UX.

### Navigation duplication

Job/profile/chat screens are registered in several stacks, and some calls use `as any` or `navigationRef<any>`. Full domain objects are passed as params.

Risk: route-name drift, stale data, untyped deep links, and divergent back-stack behavior.

### Styling/theming fragmentation

`lib/theme.ts` exists, but many screens hardcode colors and large local style blocks. Dark-mode support is incomplete. Web deprecation warnings are already visible.

Risk: expensive redesigns, inconsistent platform presentation, and gradual framework breakage.

### Excessive explanatory inline commentary

`App.tsx` contains long comments around tab sizing and deferred theme decisions. Documentation is useful, but implementation-specific essays can become stale and obscure actual constraints.

Risk: maintainers trust historical rationale that no longer matches current framework behavior.

## Quality-system debt

- No lint command/config.
- No unit, integration, RLS, storage-policy, or E2E tests.
- No CI.
- No automated production export/build validation.
- No dependency/security scan.
- No generated schema-type check.
- No accessibility test.
- No performance budget.

Configured TypeScript passes, but a stricter unused-symbol check already fails. This demonstrates that the current green check has a limited quality scope.

## Operational debt

- No EAS project linkage or `eas.json`.
- No dev/staging/production environment declarations.
- No store/hosting automation.
- No migration deployment workflow.
- No Edge Function/cron deployment record.
- No monitoring, alerting, analytics, or crash reporting.
- No backup/restore, incident, rollback, privacy-deletion, or moderation runbook.
- No release versioning strategy beyond `app.json` version `1.0.0`.

## Product and documentation debt

`brazos-product-spec.md` materially understates current code scope and does not define the implemented status model, notification system, moderation, repeat-work workflow, legal gate, or operational requirements. SQL file order has become an implicit architecture document.

Risk: senior engineers must reverse-engineer product intent from code and live data, increasing rework and contradictory decisions.

## Performance/scalability risks

- Web production bundle is approximately 2.11 MB and the dev bundle loads many icon-font assets.
- Feed/query pagination and load behavior need dedicated review.
- Realtime subscriptions across multiple features may grow connection/event volume.
- Nominatim is called directly without a shared cache.
- Public storage can accumulate orphaned media.
- Notification outbox needs throughput, retry, poison-row, and receipt tests.
- Client-side bid scoring cannot be trusted as a marketplace ranking authority.

No load test or profiler was run; these are **INFERRED** risks, not measured failures.

## Upgrade risk

The app is on Expo SDK 54 while repository instructions point engineers at SDK 56 documentation. Upgrading affects React Native, React, native modules, notification behavior, maps, styling deprecations, and build toolchains. It should be a dedicated, test-backed change rather than incidental feature work.

## Debt-reduction principle

Do not begin by broadly refactoring screens. First make the deployed backend reproducible, secure the authorization boundaries, define business transactions, and add tests that lock current behavior. Refactoring without that baseline risks making an undocumented prototype harder to compare against its only working environment.

