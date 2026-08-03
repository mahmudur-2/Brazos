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
