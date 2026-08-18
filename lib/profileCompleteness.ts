/**
 * Worker profile completeness (4D-3 §6.4) — pure, import-free, executed by
 * tests.
 *
 * Four steps, own worker-mode profile only: a profile photo, a bio, three or
 * more PUBLISHED worker_services rows, and one or more portfolio_items
 * (portfolio rows carry no draft state — existing is published). The meter is
 * a prompt, not a scoreboard: at 4/4 it disappears entirely, and it never
 * renders on anyone else's profile.
 */

export const SERVICES_TARGET = 3;
export const PORTFOLIO_TARGET = 1;

export type CompletenessStepKey = 'avatar' | 'bio' | 'services' | 'portfolio';

export type CompletenessStep = {
  key: CompletenessStepKey;
  label: string;
  done: boolean;
};

export type CompletenessInput = {
  avatarUrl: string | null | undefined;
  bio: string | null | undefined;
  publishedServiceCount: number;
  portfolioCount: number;
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
    {
      key: 'portfolio',
      label: 'Feature one past job',
      done: input.portfolioCount >= PORTFOLIO_TARGET,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
