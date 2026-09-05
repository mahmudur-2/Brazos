import { useCallback, useEffect, useState } from 'react';
import { fetchLegalStatus } from '../lib/legal';
import { Sentry } from '../lib/observability/sentry';
import { useAuth } from './useAuth';

type GateState = 'loading' | 'accepted' | 'needs_acceptance' | 'unknown';

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
  const [state, setState] = useState<GateState>('loading');

  const check = useCallback(async () => {
    if (!user) {
      setState('accepted');
      return;
    }
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
    setState(gateStateForStatus(status));
  }, [user?.id]);

  useEffect(() => {
    setState('loading');
    check();
  }, [check]);

  /** Called by the gate screen once acceptance is recorded. */
  const markAccepted = useCallback(() => setState('accepted'), []);

  return { state, markAccepted, recheck: check };
}
