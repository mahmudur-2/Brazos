import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { userMessage } from '../lib/errorMessage';
import { fetchMyProfile, type Profile } from '../lib/profiles';
import { useAuth } from './useAuth';

/**
 * The signed-in user's own profile row — ONE copy, shared by every caller.
 *
 * WHY THIS IS A STORE AND NOT A useState (emerald(6), D5's underlying bug).
 * This used to be a plain per-component hook: each screen that called it got
 * its own `useState`, its own fetch, and its own idea of what the row said.
 * The device pass caught the consequence — Worker Home's "Online" and Services
 * & availability's "Taking new work" are the SAME phase53 `accepting_work`
 * fact, and they disagreed on screen. They could hardly do otherwise: Services
 * & availability re-fetches on focus (useFocusEffect) while Worker Home only
 * fetched when the account changed, so flipping the toggle on one and walking
 * back to the other showed the old value indefinitely.
 *
 * No amount of paint fixes that. D5's "track colour and knob position must
 * derive from ONE boolean in ONE place" is satisfied at two levels now: the
 * Toggle primitive makes the track state-blind so nothing about it can
 * contradict anything, and this store makes the boolean itself singular so two
 * surfaces cannot be reading different values of it in the first place.
 *
 * The subscription is React 19's useSyncExternalStore, so every mounted
 * consumer re-renders on a publish and no provider has to be threaded through
 * App.tsx. Snapshot identity changes only on publish, which is what that API
 * requires.
 *
 * Fetch behaviour is deliberately unchanged: each mount still calls refresh(),
 * exactly as each hook instance did before, so this is not a new caching layer
 * with new staleness rules — it is the same reads landing in one place. What
 * DID change is that `loading` no longer flaps for everyone when a second
 * screen mounts: it is true only while there is genuinely nothing to show for
 * the current account.
 */

type ProfileSnapshot = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Which account the snapshot describes. A different id means it is not ours. */
  userId: string | null;
};

let snapshot: ProfileSnapshot = { profile: null, loading: true, error: null, userId: null };

const listeners = new Set<() => void>();

function publish(next: Partial<ProfileSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ProfileSnapshot {
  return snapshot;
}

/** Loads the signed-in user's own profile row. */
export function useProfile() {
  const { user } = useAuth();
  const { profile, loading, error } = useSyncExternalStore(subscribe, getSnapshot);

  const refresh = useCallback(async () => {
    if (!user) {
      publish({ profile: null, loading: false, error: null, userId: null });
      return;
    }
    publish({ error: null });
    const { data, error: fetchError } = await fetchMyProfile(user.id);
    // A5: the store belongs to whoever is signed in NOW. A response for an account that was
    // signed out or switched away while this was in flight must not be published as theirs.
    if (snapshot.userId !== user.id) return;
    if (fetchError) publish({ error: userMessage(fetchError), loading: false });
    else publish({ profile: data, loading: false, error: null, userId: user.id });
  }, [user]);

  useEffect(() => {
    const id = user?.id ?? null;
    // A sign-out or an account switch: what the store holds is not theirs, and
    // showing one account's name while the next one's row loads is the failure
    // this clears. Same account, second consumer: keep what is already there
    // rather than blanking every other screen back to a spinner.
    if (snapshot.userId !== id) {
      publish({ profile: null, loading: id !== null, error: null, userId: id });
    }
    void refresh();
  }, [refresh, user]);

  /**
   * Publish a freshly written row to EVERY consumer. Callers that write
   * through lib/profiles.ts hand the returned row straight to this, so a save
   * on one screen is visible on the others without a round-trip — which is the
   * half of the availability bug that a shared read alone would not fix.
   */
  const setProfile = useCallback((next: Profile | null) => {
    publish({ profile: next });
  }, []);

  return { profile, loading, error, refresh, setProfile };
}
