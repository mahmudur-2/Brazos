import { useEffect, useMemo, useRef } from 'react';
import type { NotificationModeBridge } from '../lib/notificationRoutes';
import { useMode } from '../modes';

/**
 * ModeContext, shaped for lib/notificationRoutes.ts's cross-mode gate.
 *
 * A stable object over a latest-value ref: the push listeners subscribe once
 * (their effects deliberately run with stable deps), yet a tap must read the
 * mode at TAP time, not at subscribe time — a session can switch modes many
 * times between the two. getMode() answers null until the initial resolution
 * has finished, so a cold-start replay can never prompt a switch off the
 * not-yet-resolved default mode.
 *
 * This forwards to ModeProvider's own switchMode — the one authority, whose
 * confirmation is mandatory — and adds nothing: no second mode store, no way
 * around the confirm.
 */
export function useNotificationModeBridge(): NotificationModeBridge {
  const { mode, ready, switchMode } = useMode();
  const latest = useRef({ mode, ready, switchMode });
  useEffect(() => {
    latest.current = { mode, ready, switchMode };
  });
  return useMemo(
    () => ({
      getMode: () => (latest.current.ready ? latest.current.mode : null),
      switchMode: (target, options) => latest.current.switchMode(target, options),
    }),
    []
  );
}
