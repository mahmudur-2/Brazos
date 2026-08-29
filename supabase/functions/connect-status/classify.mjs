// ============================================================================
// Brazos · connect-status / classify.mjs
//
// Turns one provider Account object (Accounts v2, fetched with
// include[0]=configuration.recipient and include[1]=requirements) into the ONE
// app-facing payout state the database stores on
// payment_accounts.payouts_status. Pure: no imports, no I/O, no clock — so
// tests/connect.test.mjs can execute it under node while the Deno function
// imports it unchanged.
//
// THE RULE (R5b D6), in order:
//   1. capability stripe_transfers status 'active'            → 'enabled'
//   2. else any requirement entry whose minimum_deadline.status is
//      currently_due or past_due (the summary's minimum_deadline.status is
//      read the same way), or capability status 'restricted' → 'action_needed'
//   3. else                                                     → 'under_review'
//   4. an unrecognised shape                                    → 'action_needed'
//
// WHY THE UNRECOGNISED CASE IS action_needed AND NOT enabled: a needless
// "finish setting up payouts" costs the worker a tap; a false "enabled" would
// let process-settlements send a transfer to an account that cannot receive
// it. Every path that cannot prove 'active' must land somewhere harmless.
//
// PATHS READ (the account object, as the reference documents it):
//   configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
//   requirements.entries[].minimum_deadline.status
//   requirements.summary.minimum_deadline.status
// Nothing else on the object is read, and nothing here is logged.
// ============================================================================

/** The four values payment_accounts.payouts_status admits. */
export const PAYOUT_STATUSES = Object.freeze(['none', 'action_needed', 'under_review', 'enabled']);

/** A requirement with one of these deadlines needs the worker now. */
export const DUE_STATUSES = Object.freeze(['currently_due', 'past_due']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @param {unknown} account  the provider's Account object, or anything else
 * @returns {'enabled' | 'action_needed' | 'under_review'}
 */
export function classifyAccount(account) {
  if (!isObject(account)) return 'action_needed';

  const capability = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  const capabilityStatus = isObject(capability) ? capability.status : undefined;
  if (typeof capabilityStatus !== 'string') return 'action_needed';

  if (capabilityStatus === 'active') return 'enabled';

  const requirements = account.requirements;
  if (!isObject(requirements)) return 'action_needed';
  const entries = requirements.entries;
  if (entries !== undefined && entries !== null && !Array.isArray(entries)) return 'action_needed';

  if (capabilityStatus === 'restricted') return 'action_needed';

  const dueEntry = (entries ?? []).some(
    (entry) => isObject(entry) && DUE_STATUSES.includes(entry.minimum_deadline?.status)
  );
  const dueSummary = DUE_STATUSES.includes(requirements.summary?.minimum_deadline?.status);
  if (dueEntry || dueSummary) return 'action_needed';

  return 'under_review';
}
