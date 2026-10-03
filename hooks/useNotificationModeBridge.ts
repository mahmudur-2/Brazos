import { useEffect, useMemo, useRef } from 'react';
import type { NotificationModeBridge } from '../lib/notificationRoutes';
import type { AppMode } from '../modes/types';
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
  // FIX-RUN B8: taps that arrived before the mode resolved (a cold start from a
  // push) wait here and are answered the moment `ready` flips.
  const waiters = useRef(new Set<(mode: AppMode | null) => void>());
  useEffect(() => {
    latest.current = { mode, ready, switchMode };
    if (ready && waiters.current.size) {
      const pending = [...waiters.current];
      waiters.current.clear();
      for (const resolve of pending) resolve(mode);
    }
  });
  return useMemo(
    () => ({
      getMode: () => (latest.current.ready ? latest.current.mode : null),
      // Resolves with the mode once it is known, or null after `timeoutMs`
      // (Setup or the legal gate can hold resolution back indefinitely; the
      // caller then keeps its both-trees fallback).
      whenReady: (timeoutMs) =>
        latest.current.ready
          ? Promise.resolve(latest.current.mode)
          : new Promise<AppMode | null>((resolve) => {
              const done = (value: AppMode | null) => {
                clearTimeout(timer);
                waiters.current.delete(done);
                resolve(value);
              };
              const timer = setTimeout(() => done(null), timeoutMs);
              waiters.current.add(done);
            }),
      switchMode: (target, options) => latest.current.switchMode(target, options),
    }),
    []
  );
}
