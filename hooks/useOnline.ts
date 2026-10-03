import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

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

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(isOnline(state))), []);
  return online;
}
