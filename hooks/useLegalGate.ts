import { useCallback, useEffect, useState } from 'react';
import { deriveGateAnswer } from '../lib/gateAnswer';
import type { GateAnswer } from '../lib/gateAnswer';
import { fetchLegalStatus } from '../lib/legal';
import { Sentry } from '../lib/observability/sentry';
import { useAuth } from './useAuth';

type GateState = 'loading' | 'accepted' | 'needs_acceptance' | 'unknown';

/** Signed out there is no one to gate; App.tsx never reads this answer then. */
const SIGNED_OUT: GateState = 'accepted';

/**
 * The gate's read→state mapping, pure so the fail-closed rule is executable
 * by tests/errorHonesty.test.mjs. Allow-list, never block-list: only the two
 * positive answers the read can return map to themselves; everything else —
 * a failed read's 'unknown' included — stays 'unknown'.
 */
export function gateStateForStatus(status: string): GateState {
  if (status === 'accepted') return 'accepted';
  if (status === 'needs_acceptance') return 'needs_acceptance';
  return 'unknown';
}

/**
 * Whether the signed-in user still owes acceptance of the current legal
 * documents.
 *
 * FAILS CLOSED (F-013, operator decision 2026-08-22). A failed or thrown
 * acceptance read resolves to 'unknown' — never 'accepted' — and App.tsx
 * holds the shared error state with a Retry that re-runs this read. Nothing
 * is persisted and nothing is admitted by default: a network blip must not
 * be a consent bypass whose only record is a console line.
 */
export function useLegalGate() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // The stored answer, tagged with the user it was read or marked for.
  const [answer, setAnswer] = useState<GateAnswer<GateState>>({
    forUser: null,
    value: SIGNED_OUT,
  });

  /** Stores `value` as the current user's answer (tagged signed-out when there is none). */
  const setState = useCallback(
    (value: GateState) => setAnswer({ forUser: userId, value }),
    [userId]
  );

  const check = useCallback(async () => {
    if (!user) {
      setState('accepted');
      return;
    }
    const id = user.id;
    // Tagged with this user FIRST, so a recheck for the same account shows
    // 'loading' while its read is in flight.
    setState('loading');
    let status: string;
    try {
      ({ status } = await fetchLegalStatus(user.id));
    } catch (err) {
      // The read itself threw (an offline fetch failure rejects before
      // fetchLegalStatus can shape it): the same fact as a failed read.
      console.error('[legal] acceptance check failed:', err);
      Sentry?.captureException(err, { extra: { site: 'useLegalGate.check' } });
      status = 'unknown';
    }
    // Kept only while this account's own in-flight answer is still what is
    // stored: a read that lands after a sign-out, or after another account
    // has written, is dropped rather than tagged onto them — the rule
    // useSetupStatus's `active` flag applies to its own late reads.
    setAnswer((prev) =>
      prev.forUser === id ? { forUser: id, value: gateStateForStatus(status) } : prev
    );
  }, [user?.id, setState]);

  // Starts the read for whoever is signed in. The 'loading' this effect used
  // to set is derived below instead, in the same render the user appears.
  useEffect(() => {
    check();
  }, [check]);

  // m1 (2026-09-05): derived for the CURRENT user in the same render the user
  // appears. The effect above used to flip to 'loading' one render late, and
  // for that render this hook still said 'accepted' from its signed-out
  // branch — long enough for MainTabs to mount and resolve the mode before
  // Setup could park its "Start in" choice. See lib/gateAnswer.ts.
  const state = deriveGateAnswer(userId, answer, SIGNED_OUT);

  /** Called by the gate screen once acceptance is recorded. */
  const markAccepted = useCallback(() => setState('accepted'), [setState]);

  return { state, markAccepted, recheck: check };
}
