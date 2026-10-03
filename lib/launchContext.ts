import { createContext, useContext } from 'react';

/**
 * True once the branded launch layer has finished crossfading out.
 *
 * Screens that play an entrance animation read this so they don't run it
 * underneath the launch layer, where nobody would see it. Defaults to true so
 * any screen rendered outside the gate (a test harness, a future entry point)
 * animates normally rather than sitting invisible forever.
 */
export const LaunchCompleteContext = createContext(true);

export function useLaunchComplete(): boolean {
  return useContext(LaunchCompleteContext);
}

/**
 * F1 (fix run, 2026-10-03) — THE LAUNCH LAYER WAITS FOR THE FIRST REAL SCREEN.
 * It used to lift on the session alone, uncovering one loader while the legal
 * and setup reads ran and then a second while the mode resolved. Now whatever
 * first renders real content calls this — every RootNavigator branch but the
 * loader and the tabs, and ModeShell once its tree has laid out — and App.tsx
 * caps the wait (LAUNCH_HOLD_CAP_MS), so a slow network still reaches the
 * loaders instead of a logo that never leaves. Defaults to a no-op, so a
 * screen rendered outside the gate reports to nobody.
 */
export const LaunchHoldContext = createContext<() => void>(() => {});

export function useReportLaunchReady(): () => void {
  return useContext(LaunchHoldContext);
}
