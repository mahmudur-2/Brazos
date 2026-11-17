import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { fetchRemoteConfig, mustUpdate } from '../lib/remoteConfig';

/**
 * The running build's version: app.config.ts `version`. The runtime-version
 * policy is `appVersion`, so an over-the-air update carries the same version
 * as the binary it runs on. Null where the manifest cannot say.
 */
export function runningAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * U1 (A4-M5) — whether this build must stop at 'Update Brazos'. Read at
 * launch and again each time the app comes to the front, so lowering or
 * raising the minimum reaches a phone that is already open.
 *
 * It starts at false and the launch never waits for it: a slow, failed or
 * malformed read never stops anyone (lib/remoteConfig.ts mustUpdate). When two
 * reads overlap, only the newest one decides.
 */
export function useUpdateStop(): boolean {
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const check = () => {
      const mine = ++latest;
      void fetchRemoteConfig().then((config) => {
        if (active && mine === latest) setStopped(mustUpdate(config, runningAppVersion()));
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return stopped;
}
