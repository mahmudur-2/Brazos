# Missing Features and Product Gaps

This file separates true product gaps from features that merely require hardening.

## Marketplace trust and transactions

| Gap | State | Why it matters |
|---|---|---|
| In-app payments | NOT IMPLEMENTED | No checkout, card handling, ledger, or settlement. |
| Escrow/milestones | NOT IMPLEMENTED | No mechanism protects either party during job completion. |
| Worker payouts | NOT IMPLEMENTED | No connected accounts, KYC, payout status, or reconciliation. |
| Refunds/disputes | NOT IMPLEMENTED | Cancellation exists at a status level, but no mediated financial/product resolution. |
| Real identity verification | PLACEHOLDER / UI ONLY | Badge/status exists without a provider or workflow. |
| Guarantee/insurance | NOT IMPLEMENTED | No eligibility, claim, underwriting, or terms workflow. |
| Marketplace fees | NOT IMPLEMENTED | No pricing/commission/tax model or receipts. |
| Transactional state machine | PARTIAL | Status fields/actions exist, but atomic validated transitions are incomplete. |

The existing legal terms explicitly describe direct user-to-user payment, so adding payments is a product/legal architecture change, not a small integration.

## Discovery and matching

| Gap | State |
|---|---|
| Browse search | NOT IMPLEMENTED |
| Category/distance/price/status filters | NOT IMPLEMENTED |
| Sorting/ranking controls | NOT IMPLEMENTED |
| Saved searches and alerts | NOT IMPLEMENTED |
| Worker availability/calendar | NOT IMPLEMENTED |
| Scheduled start/end windows | NOT IMPLEMENTED |
| Express/urgent automated matching | NOT IMPLEMENTED |
| Arrival tracking/check-in | NOT IMPLEMENTED |
| Recommendation/personalization engine | NOT IMPLEMENTED |

Hotspot discovery is useful but only partially verified and the web experience is a list, not a geographic map.

## Language and accessibility

| Gap | State |
|---|---|
| Localized interface strings | NOT IMPLEMENTED |
| LLM bid/message translation | NOT IMPLEMENTED |
| Locale-aware currency/date formatting | PARTIAL / inconsistent |
| RTL support | NOT IMPLEMENTED |
| Formal accessibility baseline | NOT IMPLEMENTED |
| Keyboard/screen-reader automated tests | NOT IMPLEMENTED |

The English/Spanish profile preference is currently a stored setting without product localization.

## Account lifecycle and safety

- Password reset/recovery — **NOT IMPLEMENTED**.
- MFA — **NOT IMPLEMENTED**.
- Social sign-in — **NOT IMPLEMENTED**.
- Account deletion — **NOT IMPLEMENTED**.
- User data export — **NOT IMPLEMENTED**.
- Session/device management — **NOT IMPLEMENTED**.
- Privacy/contact-field controls — **PARTIAL/UNKNOWN**.
- Appeals after moderation/ban — **NOT IMPLEMENTED**.
- Emergency/safety resources — **NOT IMPLEMENTED**.
- Attachment scanning/EXIF removal — **NOT IMPLEMENTED**.
- Rate limits and anti-spam controls — **UNKNOWN/NOT IMPLEMENTED in repository**.

## Messaging and notification gaps

- Web push/platform guard — **BROKEN**.
- EAS project linkage — **NOT IMPLEMENTED**.
- Native push end-to-end delivery — **UNKNOWN**.
- Email/SMS notifications — **NOT IMPLEMENTED**.
- Push receipt monitoring and token cleanup — **PARTIAL/UNKNOWN**.
- Offline send queue and delivery state — **NOT IMPLEMENTED**.
- Attachment size/type UX and scanning — **PARTIAL/NOT IMPLEMENTED**.
- Chat retention/export/deletion policy — **NOT IMPLEMENTED**.
- Support/operator conversation tooling — **NOT IMPLEMENTED**.

## Operations and administration

- Production/admin dashboard beyond reports — **NOT IMPLEMENTED**.
- Moderation audit log — **NOT IMPLEMENTED**.
- Granular staff roles — **NOT IMPLEMENTED**.
- Seed-data administration — **NOT IMPLEMENTED**.
- Feature flags — **NOT IMPLEMENTED**.
- User support tooling — **NOT IMPLEMENTED**.
- Financial operations — **NOT IMPLEMENTED**.
- Data migration/repair runbooks — **NOT IMPLEMENTED**.
- Backup/restore verification — **UNKNOWN**.

## Engineering/product operations

| Gap | State |
|---|---|
| Reproducible baseline database | BROKEN |
| Automated lint | NOT IMPLEMENTED |
| Unit/integration/E2E tests | NOT IMPLEMENTED |
| CI/CD | NOT IMPLEMENTED |
| EAS build/update profiles | NOT IMPLEMENTED |
| Web hosting configuration | NOT IMPLEMENTED |
| Analytics | NOT IMPLEMENTED |
| Crash/performance monitoring | NOT IMPLEMENTED |
| Environment separation | NOT IMPLEMENTED in source |
| Release/rollback runbook | NOT IMPLEMENTED |
| Dependency/security scanning | NOT IMPLEMENTED |
| Synthetic uptime/flow monitoring | NOT IMPLEMENTED |

## Product-definition gaps

`brazos-product-spec.md` is no longer a reliable “what exists” document. It lacks:

- current delivered scope through database phase 28;
- explicit MVP release boundary;
- state-transition definitions;
- trust/safety and moderation service levels;
- payment strategy decision;
- identity-verification definition;
- notification channel requirements;
- privacy/retention requirements;
- operational ownership and success metrics;
- acceptance criteria for primary flows.

Before further feature implementation, product and engineering should establish a current, versioned source of truth and decide whether Brazos is:

1. a lead-generation marketplace with off-platform payment, or
2. a transaction marketplace responsible for payment, disputes, and trust guarantees.

That decision changes the architecture, compliance surface, and roadmap.

