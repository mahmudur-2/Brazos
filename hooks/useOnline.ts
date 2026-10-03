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

/**
 * F13 — ONE NetInfo subscription, fanned out: the offline banner and React
 * Query's onlineManager (lib/queryClient.ts) both listen through here. A later
 * listener is told the last known answer at once. Without NetInfo nothing is
 * ever reported, which reads as online.
 */
const listeners = new Set<(online: boolean) => void>();
let lastOnline = true;
let stopNetInfo: (() => void) | null = null;

export function subscribeOnline(listener: (online: boolean) => void): () => void {
  if (!netInfo) return () => {};
  listeners.add(listener);
  if (stopNetInfo) {
    listener(lastOnline);
  } else {
    stopNetInfo = netInfo.addEventListener((state) => {
      lastOnline = isOnline(state);
      for (const each of listeners) each(lastOnline);
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopNetInfo) {
      stopNetInfo();
      stopNetInfo = null;
    }
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (!netInfo) return;
    return subscribeOnline(setOnline);
  }, []);
  return online;
}
