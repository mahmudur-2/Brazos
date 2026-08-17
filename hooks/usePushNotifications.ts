import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { handleNotificationData } from '../lib/notificationRoutes';
import { registerPushToken } from '../lib/pushNotifications';
import { useAuth } from './useAuth';
import { useNotificationModeBridge } from './useNotificationModeBridge';

/**
 * Wires push notification taps to navigation, and keeps the device's token
 * fresh for the signed-in user.
 *
 * Mounted once, inside the NavigationContainer (see App.tsx), so the routing
 * it triggers always has a container to talk to.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  // ModeContext for the router's cross-mode gate — a stable object reading
  // the LATEST mode at tap time, so the [] -deps listener effects below never
  // capture a stale mode.
  const modeBridge = useNotificationModeBridge();
  // A cold-start tap must only be consumed once. Without this guard, any
  // re-render that re-ran the effect would re-navigate to the same screen,
  // because getLastNotificationResponseAsync() keeps returning that response
  // for the lifetime of the process.
  const handledColdStart = useRef(false);

  // --- Token upkeep --------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    // interactive:false — never trigger the OS permission dialog on launch.
    // iOS grants exactly one prompt per install, and it's spent deliberately
    // after a meaningful action instead (see maybePromptForPush).
    // This only re-syncs a token the user has already agreed to, which is what
    // keeps a rotated token (OS reissue, reinstall, restore to a new phone)
    // attached to the right account.
    registerPushToken({ interactive: false }).then((result) => {
      if (!result.ok && result.reason === 'error') {
        console.error('[push] token sync failed:', result.message);
      }
    });
  }, [user?.id]);

  // --- Cold start: app was closed, tapping the notification launched it ----
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (handledColdStart.current) return;

    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!active || !response || handledColdStart.current) return;
        handledColdStart.current = true;
        handleNotificationData(response.notification.request.content.data, modeBridge);
      })
      .catch((err) => console.error('[push] getLastNotificationResponseAsync failed', err));

    return () => {
      active = false;
    };
  }, [modeBridge]);

  // --- Warm start: app was backgrounded or already open -------------------
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Any tap arriving through this listener is a fresh one, so the
      // cold-start replay is no longer relevant.
      handledColdStart.current = true;
      handleNotificationData(response.notification.request.content.data, modeBridge);
    });

    return () => subscription.remove();
  }, [modeBridge]);
}
