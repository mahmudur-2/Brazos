/**
 * The customer's posting choice: open bids, or a posted price.
 *
 * THE DECISION. `docs/DECISIONS.md` 2026-09-05 entry (2) and the
 * `docs/SCOPE.md` "In v1" line beside it — at posting the customer chooses
 * between open bids (workers propose a price up to a stated maximum) and a
 * posted price (one figure workers request the job at). NOT Instant Book: a
 * worker's request at the posted price is an ordinary offer the customer still
 * accepts and funds, so `accept_offer()` never reads the mode and the
 * assignment path stays mode-blind.
 *
 * WHY THIS FILE IS IMPORT-FREE. It is the one place the two modes, their
 * labels and their copy are written, and it is read by the data layer
 * (`lib/jobs.ts`), the draft (`lib/postJobDraft.ts`), the editor
 * (`components/EditBudgetDialog.tsx`) and the wizard
 * (`screens/PostJobScreen.tsx`). Importing nothing keeps it free of a cycle
 * with `lib/jobs.ts` and lets its tests execute it for real.
 *
 * THE READ FAILS SAFE. `pricing_mode` is a plain `string` on the client —
 * there are no generated Supabase types (CLAUDE.md §Supabase) — so a value
 * absent from the database's allow-list must never render as a mode nobody
 * wrote. `pricingModeFrom` is an ALLOW-LIST: exactly 'posted_price' reads as
 * a posted price, everything else (a row written before migration
 * 20260930000400, an undefined column on a narrower projection, a future
 * value) reads as open bids, which is the column's own default.
 */

export type PricingMode = 'open_bids' | 'posted_price';

/** The default everywhere: the wizard opens on it, a draft without one reads
 *  as it, and it is what `create_job()` / `update_job_details()` default to. */
export const DEFAULT_PRICING_MODE: PricingMode = 'open_bids';

/** An allow-list, never a block-list — see the header. */
export function pricingModeFrom(value: unknown): PricingMode {
  return value === 'posted_price' ? 'posted_price' : DEFAULT_PRICING_MODE;
}

/** The two segments, open bids FIRST so the default is the first cell. */
export const PRICING_MODE_OPTIONS: ReadonlyArray<{ value: PricingMode; label: string }> = [
  { value: 'open_bids', label: 'Ask for bids' },
  { value: 'posted_price', label: 'Set a price' },
];

/**
 * What the budget editor says in each mode. The open-bids strings are today's
 * exact strings, moved here rather than reworded — the E2E money walk taps
 * 'Edit Budget' and 'Maximum budget in dollars' by name, and the default path
 * must stay byte-identical.
 *
 * `allowEmpty` is the one rule that differs: an open-bids budget may be blank
 * (a real state on the row — `budget_max_cents` is nullable and reads "No
 * budget set"), while a posted price cannot be, because the server refuses a
 * posted-price row without an amount.
 */
export function budgetEditorCopy(mode: PricingMode): {
  title: string;
  message: string;
  fieldLabel: string;
  allowEmpty: boolean;
} {
  return mode === 'posted_price'
    ? {
        title: 'Your price',
        message: 'Workers can request the job at this price. You still choose who gets it.',
        fieldLabel: 'Your price in dollars',
        allowEmpty: false,
      }
    : {
        title: 'Edit Budget',
        message: 'Set the maximum amount workers can bid up to.',
        fieldLabel: 'Maximum budget in dollars',
        allowEmpty: true,
      };
}

/** The summary and published-card row label for the amount. */
export function priceRowLabel(mode: PricingMode): 'Price' | 'Budget' {
  return mode === 'posted_price' ? 'Price' : 'Budget';
}

/** The review step's field label above the amount pill. */
export function priceFieldLabel(mode: PricingMode): 'Price' | 'Max budget' {
  return mode === 'posted_price' ? 'Price' : 'Max budget';
}
