import { dataForAction } from '../lib/notificationActions';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { handleNotificationData } from '../lib/notificationRoutes';
import { registerPushToken, settlePendingPushDeactivation } from '../lib/pushNotifications';
import { Sentry } from '../lib/observability/sentry';
import { useAuth } from './useAuth';
import { useNotificationModeBridge } from './useNotificationModeBridge';
import { invalidateAfterPush } from '../lib/queryClient';

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
  // A failed sync is retried once, and the failure is HELD (F-042): the sync
  // re-runs on the next app foreground until it lands, instead of leaving the
  // user silently without notifications for the whole session. Classed
  // best-effort rather than alerted: this is an unprompted background re-sync
  // of an already-granted permission, and an alert would misfire on every
  // routine offline launch. 'denied'/'unsupported'/'no_project_id' are
  // terminal answers, not failures — they neither retry nor re-arm.
  const syncFailedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const sync = async () => {
      // A deactivation owed from a previous sign-out settles first, so this
      // account's registration below cannot be undone by paying it later.
      await settlePendingPushDeactivation();
      if (!active) return;
      // interactive:false — never trigger the OS permission dialog on launch.
      // iOS grants exactly one prompt per install, and it's spent deliberately
      // after a meaningful action instead (see maybePromptForPush).
      // This only re-syncs a token the user has already agreed to, which is
      // what keeps a rotated token (OS reissue, reinstall, restore to a new
      // phone) attached to the right account.
      let result = await registerPushToken({ interactive: false });
      if (!active) return;
      if (!result.ok && result.reason === 'error') {
        result = await registerPushToken({ interactive: false });
        if (!active) return;
      }
      if (!result.ok && result.reason === 'error') {
        console.error('[push] token sync failed:', result.message);
        Sentry?.captureException(new Error(`[push] token sync failed: ${result.message}`), {
          extra: { site: 'usePushNotifications.sync' },
        });
        syncFailedRef.current = true;
      } else {
        syncFailedRef.current = false;
      }
    };
    void sync();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && syncFailedRef.current) void sync();
    });
    return () => {
      active = false;
      subscription.remove();
    };
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
        // Idea 6: a reminder's button (Message, Route) leads where it says.
        handleNotificationData(dataForAction(response.notification.request.content.data, response.actionIdentifier), modeBridge);
      })
      .catch((err) => {
        console.error('[push] getLastNotificationResponseAsync failed', err);
        Sentry?.captureException(err, { extra: { site: 'usePushNotifications.coldStartEffect' } });
      });

    return () => {
      active = false;
    };
  }, [modeBridge]);

  // F13 — a push that arrives while the app is open changes the bell's count,
  // and the jobs it is about (lib/queryClient.ts invalidateAfterPush).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      invalidateAfterPush();
    });
    return () => subscription.remove();
  }, []);

  // --- Warm start: app was backgrounded or already open -------------------
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Any tap arriving through this listener is a fresh one, so the
      // cold-start replay is no longer relevant.
      handledColdStart.current = true;
      invalidateAfterPush();
      handleNotificationData(dataForAction(response.notification.request.content.data, response.actionIdentifier), modeBridge);
    });

    return () => subscription.remove();
  }, [modeBridge]);
}
