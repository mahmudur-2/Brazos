import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { JOB_CATEGORIES, type JobCategory } from '../lib/jobs';
import { fetchWorkerServices } from '../lib/services';
import { SKILL_CATEGORIES } from '../lib/skillCategories';
import {
  deriveWorkerSkillKeys,
  deriveWorkerSkillsState,
  type WorkerSkillsState,
} from '../lib/workerSkills';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';

export type { WorkerSkillsState } from '../lib/workerSkills';

/**
 * THE WORKER'S SKILLS, derived ONCE (P3-31) — what Best Match, Smart Match
 * and Worker Home's "skill matches" all rank by. The rules are
 * lib/workerSkills.ts; this hook feeds them the live reads.
 *
 * 2026-09-20 (sitting 2). The phone walk found the Filters sheet saying
 * "Pick job categories on your profile to unlock Best Match" on an account
 * whose profile DOES list them, as ticked rows — real keys, written by
 * `update_my_profile`, read back by `get_my_profile`, through the one
 * profile store every screen shares. Nothing offline explained it, so this
 * hook does three things the map's inline derivation did not: it unions
 * the profile's categories with the categories of the worker's own listed
 * services (the operator's ruling — a worker listing a Cleaning service has
 * cleaning as a skill); it tolerates a stored label in place of a key; and
 * it reports WHY the set may be empty, so the sheet's note can say so
 * instead of assuming the worker never picked anything.
 *
 * The services read is a module store like `useProfile`'s: one read per
 * account, shared by every mounted consumer, republished to all of them.
 */

type ServicesSnapshot = {
  userId: string | null;
  categories: string[] | null;
  loading: boolean;
  error: boolean;
};

let snapshot: ServicesSnapshot = { userId: null, categories: null, loading: false, error: false };
const listeners = new Set<() => void>();

function publish(next: Partial<ServicesSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ServicesSnapshot {
  return snapshot;
}

const JOB_CATEGORY_KEYS: ReadonlySet<string> = new Set<string>(JOB_CATEGORIES);
const LABEL_TO_KEY: ReadonlyMap<string, string> = new Map(
  SKILL_CATEGORIES.map((c) => [c.label, c.key] as const)
);

export function useWorkerSkills(): {
  skills: ReadonlySet<JobCategory>;
  state: WorkerSkillsState;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const services = useSyncExternalStore(subscribe, getSnapshot);

  const refresh = useCallback(async () => {
    if (!user) {
      publish({ userId: null, categories: null, loading: false, error: false });
      return;
    }
    publish({ loading: true, error: false });
    const { data, error } = await fetchWorkerServices(user.id);
    if (error) publish({ loading: false, error: true });
    else publish({ userId: user.id, categories: data.map((s) => s.category), loading: false, error: false });
  }, [user]);

  useEffect(() => {
    const id = user?.id ?? null;
    // Another account's services are not ours: blank them and read again.
    // The same account, a second consumer: keep what is already there.
    if (snapshot.userId !== id) {
      publish({ userId: id, categories: null, loading: id !== null, error: false });
      void refresh();
    } else if (snapshot.categories === null && !snapshot.loading && id !== null) {
      void refresh();
    }
  }, [refresh, user]);

  const skills = useMemo(
    () =>
      deriveWorkerSkillKeys(
        profile?.categories,
        services.categories,
        JOB_CATEGORY_KEYS,
        LABEL_TO_KEY
      ) as Set<JobCategory>,
    [profile?.categories, services.categories]
  );
  const state = deriveWorkerSkillsState({
    skillCount: skills.size,
    profileLoading: profile === null && profileLoading,
    profileError: profile === null && profileError !== null,
    servicesLoading: services.categories === null && services.loading,
  });

  return { skills, state, refresh };
}
