import { useEffect, useState } from 'react';
import type { NetInfoState } from '@react-native-community/netinfo';

/**
 * FIX-RUN B6 — whether this device can reach the internet. Optimistic by
 * design: true until NetInfo says otherwise, and "unknown" reachability counts
 * as online, so a slow first probe never flashes an offline banner. Only an
 * explicit `false` (no connection, or a connection with no internet) is
 * offline.
 */
export function isOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

type NetInfoApi = { addEventListener: (listener: (state: NetInfoState) => void) => () => void };

/**
 * Loaded behind a guard, the lib/payments/stripe.ts way: the package throws at
 * import when its native module is missing, and this hook sits in App.tsx, so
 * an update reaching a binary built without it must degrade to "online", never
 * crash the launch.
 */
function loadNetInfo(): NetInfoApi | null {
  try {
    const mod = require('@react-native-community/netinfo') as { default?: NetInfoApi } & Partial<NetInfoApi>;
    const api = (mod?.default ?? mod) as Partial<NetInfoApi> | undefined;
    return typeof api?.addEventListener === 'function' ? (api as NetInfoApi) : null;
  } catch {
    return null;
  }
}

const netInfo = loadNetInfo();

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (!netInfo) return;
    return netInfo.addEventListener((state) => setOnline(isOnline(state)));
  }, []);
  return online;
}
