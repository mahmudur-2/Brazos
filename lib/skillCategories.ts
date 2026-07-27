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

const BY_KEY = new Map(SKILL_CATEGORIES.map((c) => [c.key, c]));

/** Display label for a key, falling back to the raw value for custom "Other" entries. */
export function skillCategoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function skillCategoryIcon(key: string): IoniconName | undefined {
  return BY_KEY.get(key)?.icon;
}
