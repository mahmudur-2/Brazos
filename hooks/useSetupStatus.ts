import { useCallback, useEffect, useState } from 'react';
import { deriveGateAnswer } from '../lib/gateAnswer';
import type { GateAnswer } from '../lib/gateAnswer';
import { readSetupRecord } from '../lib/setupStorage';
import { DEFAULT_LANDING, type LandingPreference } from '../lib/setupState';
import { useAuth } from './useAuth';

type SetupState = 'loading' | 'complete' | 'incomplete';

/** Signed out there is nothing to gate, so setup counts as complete. */
const SIGNED_OUT: SetupState = 'complete';

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

  // The stored answer, tagged with the user it was read or marked for.
  const [answer, setAnswer] = useState<GateAnswer<SetupState>>({
    forUser: null,
    value: SIGNED_OUT,
  });
  const [landing, setLanding] = useState<LandingPreference>(DEFAULT_LANDING);

  /** Stores `value` as the current user's answer (tagged signed-out when there is none). */
  const setState = useCallback(
    (value: SetupState) => setAnswer({ forUser: userId, value }),
    [userId]
  );

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

  // m1 (2026-09-05): derived for the CURRENT user in the same render the user
  // appears. The effect above used to flip to 'loading' one render late, and
  // for that render this hook still said 'complete' from its signed-out
  // branch — long enough for MainTabs to mount and resolve the mode before
  // Setup could park its "Start in" choice. See lib/gateAnswer.ts.
  const state = deriveGateAnswer(userId, answer, SIGNED_OUT);

  /** Called by the setup screen once completion has actually been written. */
  const markComplete = useCallback(
    (next: LandingPreference) => {
      setLanding(next);
      setState('complete');
    },
    [setState]
  );

  return { state, landing, markComplete };
}
