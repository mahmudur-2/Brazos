import { formatBudget } from './jobs';

/**
 * Static "typical range" guidance for the posting flow (4D-3 §3). Pure data +
 * lookup, no screen imports, so tests execute it directly.
 *
 * Keyed by the exact category keys in lib/skillCategories.ts — the enum-backed
 * JOB_CATEGORIES keys the post flow offers are a subset of that list (plus
 * 'other', which is deliberately absent here and resolves to null). Values are
 * integer cents like every other money figure; render only through
 * formatBudget().
 *
 * dog_walking and packing carry an explicit null: no range was seeded for
 * them, and inventing one to fill the gap is exactly what this table must not
 * do. A null renders NO guidance.
 *
 * The copy makes no locality claim ("here", "in your area", "nearby") — the
 * table is static and cannot support one.
 */
export type PriceRange = { minCents: number; maxCents: number };

export const PRICE_GUIDANCE: Readonly<Record<string, PriceRange | null>> = Object.freeze({
  cleaning: { minCents: 6000, maxCents: 12000 },
  moving: { minCents: 8000, maxCents: 20000 },
  furniture_assembly: { minCents: 5000, maxCents: 12000 },
  tv_mounting: { minCents: 7000, maxCents: 15000 },
  handyman: { minCents: 6000, maxCents: 15000 },
  yard_work: { minCents: 5000, maxCents: 12000 },
  errands: { minCents: 2500, maxCents: 6000 },
  painting: { minCents: 15000, maxCents: 40000 },
  dog_walking: null,
  packing: null,
});

/** The range for a category, or null — for unknown keys ('other', free text)
 *  exactly as for the explicit-null rows: no guidance. */
export function priceGuidanceFor(category: string | null | undefined): PriceRange | null {
  if (!category) return null;
  return PRICE_GUIDANCE[category] ?? null;
}

/**
 * The two guidance lines exactly as the posting screen renders them, or null
 * when the category has no range. Kept here so the rendered copy is the
 * executed copy — a test asserts the no-locality rule against these strings.
 */
export function priceGuidanceLines(
  category: string | null | undefined
): [string, string] | null {
  const range = priceGuidanceFor(category);
  if (!range) return null;
  return [
    `Typical range: ${formatBudget(range.minCents)}–${formatBudget(range.maxCents)}`,
    'A guide, not a quote. You set the budget.',
  ];
}
