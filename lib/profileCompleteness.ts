/**
 * Worker profile completeness (4D-3 §6.4) — pure, import-free, executed by
 * tests.
 *
 * Four steps, own worker-mode profile only: job categories, a profile photo,
 * a bio, and three or more PUBLISHED worker_services rows (lean D5 removed
 * the portfolio step with the portfolio). The meter is a prompt, not a
 * scoreboard: at 4/4 it disappears entirely, and it never renders on anyone
 * else's profile.
 *
 * 2026-09-26 (the refresh, audit M-29): categories lead. They are the
 * fastest tick and the one that makes skill matches, Best Match and nearby
 * alerts work at all, so the step a new worker is told to do first is first.
 */

export const SERVICES_TARGET = 3;

export type CompletenessStepKey = 'categories' | 'avatar' | 'bio' | 'services';

export type CompletenessStep = {
  key: CompletenessStepKey;
  label: string;
  done: boolean;
};

export type CompletenessInput = {
  categoryCount: number;
  avatarUrl: string | null | undefined;
  bio: string | null | undefined;
  publishedServiceCount: number;
};

export type Completeness = {
  steps: CompletenessStep[];
  done: number;
  total: number;
  complete: boolean;
};

export function profileCompleteness(input: CompletenessInput): Completeness {
  const steps: CompletenessStep[] = [
    {
      key: 'categories',
      label: 'Pick your job categories',
      done: input.categoryCount > 0,
    },
    {
      key: 'avatar',
      label: 'Add a profile photo',
      done: !!input.avatarUrl,
    },
    {
      key: 'bio',
      label: 'Write a short bio',
      done: !!input.bio && input.bio.trim().length > 0,
    },
    {
      key: 'services',
      label: `Publish ${SERVICES_TARGET} services`,
      done: input.publishedServiceCount >= SERVICES_TARGET,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
