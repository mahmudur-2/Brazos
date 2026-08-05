import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type SkillCategory = {
  key: string;
  label: string;
  icon: IoniconName;
};

/**
 * What a worker can advertise skill in on their own profile — broader than
 * JOB_CATEGORIES (lib/jobs.ts), which backs the `job_category` Postgres enum
 * used by jobs/bids/portfolio_items and can't be freely extended. profiles.
 * categories is a plain text[] with no enum constraint, so this list can be
 * a longer, real-gig-platform-shaped set (TaskRabbit/Thumbtack/Handy-style)
 * without touching the DB schema. Six keys intentionally match JOB_CATEGORIES
 * so existing saved profiles still resolve to a known label/icon here.
 */
export const SKILL_CATEGORIES: SkillCategory[] = [
  { key: 'furniture_assembly', label: 'Furniture Assembly', icon: 'construct' },
  { key: 'moving', label: 'Moving Help', icon: 'cube' },
  { key: 'cleaning', label: 'House Cleaning', icon: 'sparkles' },
  { key: 'handyman', label: 'Handyman/Repairs', icon: 'hammer' },
  { key: 'yard_work', label: 'Yard Work/Landscaping', icon: 'leaf' },
  { key: 'dog_walking', label: 'Dog Walking/Pet Care', icon: 'paw' },
  { key: 'errands', label: 'Errands/Delivery', icon: 'bag-handle' },
  { key: 'tv_mounting', label: 'TV/Furniture Mounting', icon: 'tv' },
  { key: 'painting', label: 'Painting', icon: 'color-palette' },
  { key: 'packing', label: 'Packing/Unpacking', icon: 'archive' },
];

/**
 * The six one-tap chips on Home, in the reference's order.
 *
 * Deliberately a named list rather than `SKILL_CATEGORIES.slice(0, 6)`, which
 * is what Home used before: the reference's six are not the first six of that
 * array, and slicing silently re-picks them whenever SKILL_CATEGORIES is
 * reordered. "Plumbing" is the customer-facing wording for the `handyman`
 * category — plumbing is what people search for, `handyman` is what the
 * category is called, and CATEGORY_KEYWORDS in lib/workerSearch.ts already
 * files 'plumbing'/'plumber'/'leak'/'faucet' under it.
 */
export const HOME_QUICK_SERVICES: SkillCategory[] = [
  { key: 'furniture_assembly', label: 'Furniture Assembly', icon: 'construct' },
  { key: 'moving', label: 'Moving Help', icon: 'cube' },
  { key: 'cleaning', label: 'House Cleaning', icon: 'sparkles' },
  { key: 'tv_mounting', label: 'TV Mounting', icon: 'tv' },
  { key: 'handyman', label: 'Plumbing', icon: 'water' },
  { key: 'yard_work', label: 'Yard Work', icon: 'leaf' },
];

/**
 * The longer service list behind Home's "Other" chip.
 *
 * Every entry carries a `key` that is already a real category — the same keys
 * `HOME_QUICK_SERVICES` uses — so choosing one here runs exactly the same
 * downstream search as tapping a visible chip. These are *search entry
 * points*, not new categories: `profiles.categories` and the `job_category`
 * enum are unchanged, and nothing here needs a migration.
 *
 * Several rows intentionally share a key (Electrical, Drywall Repair and
 * Appliance Installation are all `handyman` work). That is the honest mapping
 * — the alternative is inventing categories the marketplace cannot actually
 * filter on.
 */
export const MORE_SERVICES: SkillCategory[] = [
  { key: 'handyman', label: 'Handyman & General Repairs', icon: 'hammer' },
  { key: 'handyman', label: 'Electrical (light fixtures, outlets)', icon: 'flash' },
  { key: 'painting', label: 'Interior Painting', icon: 'color-palette' },
  { key: 'handyman', label: 'Appliance Installation', icon: 'build' },
  { key: 'moving', label: 'Junk Removal', icon: 'trash' },
  { key: 'tv_mounting', label: 'Picture & Shelf Hanging', icon: 'image' },
  { key: 'cleaning', label: 'Pressure Washing', icon: 'water' },
  { key: 'yard_work', label: 'Gutter Cleaning', icon: 'rainy' },
  { key: 'cleaning', label: 'Carpet & Upholstery Cleaning', icon: 'bed' },
  { key: 'cleaning', label: 'Window Washing', icon: 'browsers' },
  { key: 'handyman', label: 'Pest Control', icon: 'bug' },
  { key: 'packing', label: 'Home Organization', icon: 'file-tray-stacked' },
  { key: 'yard_work', label: 'Landscaping & Gardening', icon: 'flower' },
  { key: 'yard_work', label: 'Snow Removal', icon: 'snow' },
  { key: 'dog_walking', label: 'Pet Sitting & Dog Walking', icon: 'paw' },
  { key: 'errands', label: 'Personal Assistant / Errands', icon: 'bag-handle' },
  { key: 'packing', label: 'Packing & Unpacking', icon: 'archive' },
  { key: 'handyman', label: 'Drywall Repair', icon: 'square' },
];

const BY_KEY = new Map(SKILL_CATEGORIES.map((c) => [c.key, c]));

/** Display label for a key, falling back to the raw value for custom "Other" entries. */
export function skillCategoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function skillCategoryIcon(key: string): IoniconName | undefined {
  return BY_KEY.get(key)?.icon;
}
