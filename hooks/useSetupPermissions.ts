import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

/**
 * The real state of the two permissions the setup screen shows.
 *
 * It reads; it does not ask. The OS prompt is spent exactly once per install
 * on iOS, so nothing here requests anything until the user taps the row —
 * mounting this screen must never burn that one chance.
 *
 * `blocked` is kept distinct from `denied` because the two need different
 * offers: a denied permission can be asked for again, a blocked one can only
 * be changed in Settings, and a switch that silently does nothing is the worst
 * of the three outcomes.
 */

export type PermissionState =
  /** Still reading the current status. */
  | 'unknown'
  | 'granted'
  /** Not granted, but the OS will still show a prompt. */
  | 'denied'
  /** Not granted and the OS will not ask again — Settings only. */
  | 'blocked'
  /** No such permission in this environment (Expo web, mostly). */
  | 'unavailable';

export type PermissionRow = {
  state: PermissionState;
  /** True while an OS prompt is open, so the row can't be tapped twice. */
  requesting: boolean;
  /**
   * The single thing tapping this row does. It prompts when the OS will still
   * prompt, and otherwise opens Settings — which is the only place the answer
   * can actually change once the system has stopped asking. A control that
   * did nothing in that state would be the worst of the options.
   */
  act: () => void;
  /** True when `act` will leave the app for Settings rather than prompt. */
  opensSettings: boolean;
};

/**
 * Whether the OS still has anything to say. `granted` is included because the
 * app cannot revoke a permission it holds — Settings is the only route to
 * turning one back off, so that is where the row sends you.
 */
function needsSettings(state: PermissionState): boolean {
  return state === 'granted' || state === 'blocked';
}

async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Linking.openSettings();
  } catch {
    // Nothing useful to offer if the platform refuses; the row's own copy
    // already names Settings as the place to go.
  }
}

function toState(status: string, canAskAgain: boolean): PermissionState {
  if (status === 'granted') return 'granted';
  return canAskAgain ? 'denied' : 'blocked';
}

export function useSetupPermissions(): {
  location: PermissionRow;
  notifications: PermissionRow;
} {
  const [location, setLocation] = useState<PermissionState>('unknown');
  const [notifications, setNotifications] = useState<PermissionState>('unknown');
  const [requesting, setRequesting] = useState<{ location: boolean; notifications: boolean }>({
    location: false,
    notifications: false,
  });

  // A permission prompt outlives the screen easily — the user can background
  // the app while it is open. Every resolve is checked against this.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A ref as well as state: the state update has not landed yet when a second
  // tap arrives on the same frame, so the guard has to read something
  // synchronous.
  const inFlight = useRef<{ location: boolean; notifications: boolean }>({
    location: false,
    notifications: false,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const result = await Location.getForegroundPermissionsAsync();
        if (active && mounted.current) setLocation(toState(result.status, result.canAskAgain));
      } catch {
        if (active && mounted.current) setLocation('unavailable');
      }

      // expo-notifications has no web implementation of the permission model
      // the app uses; asking would throw rather than return a status.
      if (Platform.OS === 'web') {
        if (active && mounted.current) setNotifications('unavailable');
        return;
      }

      try {
        const result = await Notifications.getPermissionsAsync();
        if (active && mounted.current) {
          setNotifications(toState(result.status, result.canAskAgain));
        }
      } catch {
        if (active && mounted.current) setNotifications('unavailable');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const actOnLocation = useCallback(() => {
    if (inFlight.current.location) return;
    if (location === 'unavailable') return;
    if (needsSettings(location)) {
      void openAppSettings();
      return;
    }

    inFlight.current.location = true;
    setRequesting((prev) => ({ ...prev, location: true }));

    (async () => {
      try {
        const result = await Location.requestForegroundPermissionsAsync();
        if (mounted.current) setLocation(toState(result.status, result.canAskAgain));
      } catch {
        if (mounted.current) setLocation('unavailable');
      } finally {
        inFlight.current.location = false;
        if (mounted.current) setRequesting((prev) => ({ ...prev, location: false }));
      }
    })();
  }, [location]);

  const actOnNotifications = useCallback(() => {
    if (inFlight.current.notifications || Platform.OS === 'web') return;
    if (notifications === 'unavailable') return;
    if (needsSettings(notifications)) {
      void openAppSettings();
      return;
    }

    inFlight.current.notifications = true;
    setRequesting((prev) => ({ ...prev, notifications: true }));

    (async () => {
      try {
        const result = await Notifications.requestPermissionsAsync();
        if (mounted.current) setNotifications(toState(result.status, result.canAskAgain));
      } catch {
        if (mounted.current) setNotifications('unavailable');
      } finally {
        inFlight.current.notifications = false;
        if (mounted.current) setRequesting((prev) => ({ ...prev, notifications: false }));
      }
    })();
  }, [notifications]);

  return {
    location: {
      state: location,
      requesting: requesting.location,
      act: actOnLocation,
      opensSettings: needsSettings(location),
    },
    notifications: {
      state: notifications,
      requesting: requesting.notifications,
      act: actOnNotifications,
      opensSettings: needsSettings(notifications),
    },
  };
}
