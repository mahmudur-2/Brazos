import { useCallback, useEffect, useState } from 'react';
import { readSetupRecord } from '../lib/setupStorage';
import { DEFAULT_LANDING, type LandingPreference } from '../lib/setupState';
import { useAuth } from './useAuth';

type SetupState = 'loading' | 'complete' | 'incomplete';

/**
 * Whether this user still owes the final setup step.
 *
 * FAILS TOWARDS SHOWING SETUP, which is the opposite of the legal gate's
 * fail-open and deliberate: the two are guarding different things. The legal
 * gate must not lock a working app over a dropped connection, whereas the
 * worst case here is one extra screen that takes a few seconds to complete.
 * Skipping it on a bad read would skip the legal review it fronts.
 *
 * Re-reads whenever the signed-in user changes, so a second account on the
 * same device gets its own answer rather than inheriting the first one's.
 */
export function useSetupStatus() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<SetupState>('loading');
  const [landing, setLanding] = useState<LandingPreference>(DEFAULT_LANDING);

  useEffect(() => {
    if (!userId) {
      // Signed out: nothing to gate. Reported as complete so the signed-out
      // tree never renders a spinner waiting on a read that will not happen.
      setState('complete');
      setLanding(DEFAULT_LANDING);
      return;
    }

    let active = true;
    setState('loading');

    readSetupRecord(userId).then((record) => {
      if (!active) return;
      setState(record?.completed ? 'complete' : 'incomplete');
      setLanding(record?.landing ?? DEFAULT_LANDING);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  /** Called by the setup screen once completion has actually been written. */
  const markComplete = useCallback((next: LandingPreference) => {
    setLanding(next);
    setState('complete');
  }, []);

  return { state, landing, markComplete };
}
