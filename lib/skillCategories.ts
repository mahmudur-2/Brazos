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
 * The six Home shortcuts, in the reference's order — the first six tiles of
 * the Home row (HOME_SERVICE_TILES), and the six the row leads with.
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

// 2026-09-17: HOME_SERVICE_ROWS — the two-row chip arrangement both Home
// screens drew (four quick services plus "Other") — is gone. The Home rows are
// one sliding tile row now, HOME_SERVICE_TILES below, and nothing laid chips
// out in rows any more.

/**
 * The longer service list behind Home's "Other" tile.
 *
 * Every entry carries a `key` that is already a real category — the same keys
 * `HOME_QUICK_SERVICES` uses — so choosing one here runs exactly the same
 * downstream search as tapping a visible tile. These are *search entry
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

/**
 * A Home tile: one of the entries above, plus the short label the tile draws
 * under its glyph. The key and the icon are the entry's own, never retyped.
 */
export type ServiceTile = SkillCategory & { tileLabel: string };

/**
 * The short label each Home tile draws, keyed by the entry's full label.
 *
 * This is the ONLY place the short forms live, and the tile is the only thing
 * that reads them: the full names stay everywhere else in the app — the
 * "Other" sheet, worker services, search results. A tile is 68pt wide, so a
 * label is one or two short words, and it has to name the same category the
 * full label names, nothing more specific ("Plumbing" is still the customer's
 * word for the `handyman` key, exactly as HOME_QUICK_SERVICES records).
 *
 * Every entry of HOME_QUICK_SERVICES and MORE_SERVICES has a row here, in
 * their order; tests/workerHome.test.mjs holds the resulting tile set to the
 * operator's list, so a full label renamed above without its row here fails
 * there rather than quietly drawing the long name.
 */
const TILE_LABELS: Readonly<Record<string, string>> = {
  'Furniture Assembly': 'Assembly',
  'Moving Help': 'Moving',
  'House Cleaning': 'Cleaning',
  'TV Mounting': 'TV mounting',
  Plumbing: 'Plumbing',
  'Yard Work': 'Yard work',
  'Handyman & General Repairs': 'Repairs',
  'Electrical (light fixtures, outlets)': 'Electrical',
  'Interior Painting': 'Painting',
  'Appliance Installation': 'Appliances',
  'Junk Removal': 'Junk removal',
  'Picture & Shelf Hanging': 'Shelf hanging',
  'Pressure Washing': 'Pressure washing',
  'Gutter Cleaning': 'Gutters',
  'Carpet & Upholstery Cleaning': 'Carpet cleaning',
  'Window Washing': 'Windows',
  'Pest Control': 'Pest control',
  'Home Organization': 'Organizing',
  'Landscaping & Gardening': 'Landscaping',
  'Snow Removal': 'Snow removal',
  'Pet Sitting & Dog Walking': 'Pet sitting',
  'Personal Assistant / Errands': 'Errands',
  'Packing & Unpacking': 'Packing',
  'Drywall Repair': 'Drywall',
};

/**
 * The tile row both Home screens draw (components/ServiceTileRow.tsx): every
 * service the app knows, as ONE list — the six shortcuts first, in their
 * order, then the eighteen behind "Other", in theirs. The trailing "Other"
 * tile is not here because it is not a category: it has no key and opens the
 * sheet, and the component draws it last.
 *
 * Built from the two lists rather than retyped, so a tile can only ever carry
 * a key and an icon an entry already carries. One definition, because the
 * customer and worker rows must be the SAME tiles in the same order — a
 * per-screen list would let them drift.
 */
export const HOME_SERVICE_TILES: ServiceTile[] = [...HOME_QUICK_SERVICES, ...MORE_SERVICES].map(
  (service) => ({ ...service, tileLabel: TILE_LABELS[service.label] ?? service.label })
);

const BY_KEY = new Map(SKILL_CATEGORIES.map((c) => [c.key, c]));

/** Display label for a key, falling back to the raw value for custom "Other" entries. */
export function skillCategoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function skillCategoryIcon(key: string): IoniconName | undefined {
  return BY_KEY.get(key)?.icon;
}
