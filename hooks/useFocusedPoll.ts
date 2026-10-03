import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/** How often a settling payment is re-read while its screen is on top. */
export const SETTLE_POLL_MS = 30_000;

/**
 * FIX-RUN B14 — calls `onTick` every `ms` while `enabled` AND the screen is
 * focused; stops on blur, on unmount, and the moment `enabled` turns false.
 * For a state that only the server moves on (an approved payment on its way
 * to the worker), so the screen shows "released" without the person leaving
 * and coming back.
 */
export function useFocusedPoll(enabled: boolean, onTick: () => void, ms: number = SETTLE_POLL_MS): void {
  const tick = useRef(onTick);
  tick.current = onTick;
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const timer = setInterval(() => tick.current(), ms);
      return () => clearInterval(timer);
    }, [enabled, ms])
  );
}
