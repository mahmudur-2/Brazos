import { useCallback, useEffect, useState } from 'react';
import { fetchLegalStatus } from '../lib/legal';
import { useAuth } from './useAuth';

type GateState = 'loading' | 'accepted' | 'needs_acceptance';

/**
 * Whether the signed-in user still owes acceptance of the current legal
 * documents.
 *
 * FAILS OPEN, on purpose. If the check itself errors — offline, or the
 * phase21 migration hasn't been run yet — this reports 'accepted' rather than
 * blocking. A gate that fails closed would lock every user out of a working
 * app over a dropped connection, and would make deploying the client before
 * the migration a hard outage instead of a missing feature. The gate exists to
 * capture consent from reachable users, not to be a second authentication
 * layer.
 */
export function useLegalGate() {
  const { user } = useAuth();
  const [state, setState] = useState<GateState>('loading');

  const check = useCallback(async () => {
    if (!user) {
      setState('accepted');
      return;
    }
    const { status, error } = await fetchLegalStatus(user.id);
    if (error) {
      console.error('[legal] acceptance check failed, allowing through:', error);
    }
    setState(status === 'needs_acceptance' ? 'needs_acceptance' : 'accepted');
  }, [user?.id]);

  useEffect(() => {
    setState('loading');
    check();
  }, [check]);

  /** Called by the gate screen once acceptance is recorded. */
  const markAccepted = useCallback(() => setState('accepted'), []);

  return { state, markAccepted, recheck: check };
}
