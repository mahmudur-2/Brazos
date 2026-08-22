import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { confirmAsync } from './dialog';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Push registration.
//
// Delivery is decided entirely server-side (see phase20 SQL): the client's
// only jobs are to hand the database a device token and to keep the user's
// preferences up to date. Nothing here decides whether a notification is
// *allowed* — should_notify() does that, so a stale or modified client cannot
// push past someone's settings, mute or block.
// ---------------------------------------------------------------------------

/** Android channel id. Must match `channelId` in the send-push Edge Function. */
export const ANDROID_CHANNEL_ID = 'default';

const ASKED_KEY = 'brazos.push.asked';

export type PushRegistration =
  | { ok: true; token: string }
  | {
      ok: false;
      /**
       * denied        — user said no (or previously said no and we can't re-ask)
       * unsupported   — simulator, web, or Expo Go where remote tokens don't exist
       * no_project_id — app isn't linked to an EAS project, so Expo can't mint a token
       * error         — anything else, message carries the detail
       */
      reason: 'denied' | 'unsupported' | 'no_project_id' | 'error';
      message: string;
    };

/**
 * True when running inside the Expo Go sandbox app rather than a build of
 * this project. Remote push tokens are not available there:
 *   * Android — removed from Expo Go in SDK 53.
 *   * iOS     — needs the app's own APNs entitlement, which Expo Go can't lend out.
 * A development build fixes both.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * The EAS project id Expo's push service issues tokens against. Populated by
 * `eas init` (which writes extra.eas.projectId into app.json) and injected
 * automatically into development/production builds.
 */
export function getProjectId(): string | null {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return (fromConfig as string | undefined) ?? fromEas ?? null;
}

/**
 * Foreground presentation + the Android channel. Safe to call on every start;
 * both are idempotent. Called from App.tsx before anything can arrive.
 */
export async function configurePushHandling(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // A push that lands while the user is already looking at the app should
      // still be visible — they may be on a different screen than it points to.
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Job & message alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (err) {
      // A missing channel degrades presentation, not delivery — never let it
      // take down app startup.
      console.error('[push] setNotificationChannelAsync failed', err);
    }
  }
}

/** Whether we've already shown the OS permission prompt on this device. */
export async function hasAskedForPush(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
  } catch {
    // Treat an unreadable flag as "already asked" rather than risk prompting
    // on a loop.
    return true;
  }
}

async function markAskedForPush(): Promise<void> {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Best effort; the in-session flow still completes.
  }
}

/**
 * Requests permission if needed, mints an Expo push token, and stores it
 * against the signed-in user.
 *
 * `interactive: false` skips the OS prompt and only re-syncs a token the user
 * has already granted — use that on startup so launching the app never
 * triggers a cold permission dialog.
 */
export async function registerPushToken(
  options: { interactive?: boolean } = {}
): Promise<PushRegistration> {
  const { interactive = true } = options;

  if (Platform.OS === 'web') {
    return { ok: false, reason: 'unsupported', message: 'Push is not supported on web.' };
  }
  if (!Device.isDevice) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Push notifications need a physical device — simulators cannot receive them.',
    };
  }
  if (isExpoGo()) {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'Expo Go cannot receive push notifications. Install a development build to test them.',
    };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: 'no_project_id',
      message:
        'This app is not linked to an EAS project yet, so Expo cannot issue a push token. Run `eas init`.',
    };
  }

  let status: Notifications.PermissionStatus;
  try {
    const existing = await Notifications.getPermissionsAsync();
    status = existing.status;

    if (status !== 'granted') {
      // Only ask when the caller says it's an appropriate moment. iOS shows
      // this dialog exactly once per install — spending it on a cold launch
      // would waste the only chance we get.
      if (!interactive) {
        return { ok: false, reason: 'denied', message: 'Notification permission not granted yet.' };
      }
      if (!existing.canAskAgain) {
        await markAskedForPush();
        return {
          ok: false,
          reason: 'denied',
          message: 'Notifications are turned off for Brazos in your device settings.',
        };
      }
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
      await markAskedForPush();
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: `Could not check notification permission: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (status !== 'granted') {
    return { ok: false, reason: 'denied', message: 'Notification permission was declined.' };
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: `Could not get a push token: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Upsert through an RPC rather than a direct insert: the same physical
  // device can move between accounts, and register_push_token() reassigns the
  // row instead of erroring on the unique token constraint.
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
  });

  if (error) {
    return { ok: false, reason: 'error', message: error.message };
  }

  return { ok: true, token };
}

/**
 * Called after a meaningful action (posting a job, placing a bid) — the point
 * where notifications have obvious value — rather than on first launch.
 * No-ops once the prompt has been shown on this device.
 *
 * `rationale` is shown in an in-app dialog BEFORE the OS one. iOS allows the
 * system prompt exactly once per install: if it's shown cold and dismissed,
 * the only way back is the Settings app. Asking in-app first means a reflexive
 * "not now" costs nothing — the real prompt is only spent on a yes.
 */
export async function maybePromptForPush(rationale: string): Promise<PushRegistration | null> {
  if (await hasAskedForPush()) return null;

  // Don't burn the one-shot iOS dialog somewhere it can't possibly succeed.
  if (Platform.OS === 'web' || !Device.isDevice || isExpoGo() || !getProjectId()) {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync().catch(() => null);
  if (existing?.status === 'granted') {
    // Already granted (e.g. reinstall): just sync the token, no prompt needed.
    return registerPushToken({ interactive: false });
  }
  if (existing && !existing.canAskAgain) return null;

  const ok = await confirmAsync({
    title: 'Get notified?',
    message: rationale,
    confirmText: 'Turn on',
    cancelText: 'Not now',
  });

  if (!ok) {
    // Declining in-app is remembered so this doesn't nag after every action.
    // Notifications remain switchable from Profile → Notifications, which is
    // the documented way back in.
    await markAskedForPush();
    return null;
  }

  return registerPushToken({ interactive: true });
}

/**
 * The deactivation debt marker (F-042). Written when sign-out could not
 * deactivate this device's token after a retry, so the next sign-in settles
 * it instead of the failure living only in a console line. Holds the exact
 * token, or '*' when even resolving the token failed.
 */
const PENDING_DEACTIVATION_KEY = 'brazos.push.pendingDeactivation';

/** RLS restricts this to the caller's own rows, so a user can only ever
 *  deactivate a token registered to themselves. */
function deactivateToken(token: string) {
  return supabase.from('push_tokens').update({ active: false }).eq('token', token);
}

/**
 * Detaches this device from the signed-out account, so the next person to use
 * the phone doesn't receive the previous user's notifications. Deactivates
 * rather than deletes — signing back in re-activates the same row.
 *
 * Best-effort BY DESIGN (F-042): it runs in the closing seconds of a session
 * and must not block sign-out on a dead network. The contract is one retry,
 * then the debt is RECORDED for settlePendingPushDeactivation() to pay on
 * the next sign-in — never a console line as the only handling.
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice || isExpoGo()) return;
  const projectId = getProjectId();
  if (!projectId) return;

  let token: string | null = null;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (err) {
      console.error('[push] unregisterPushToken could not resolve this device token', err);
    }
  }

  let owed = true;
  if (token) {
    let { error } = await deactivateToken(token);
    if (error) ({ error } = await deactivateToken(token));
    if (error) console.error('[push] unregisterPushToken failed after retry', error);
    owed = !!error;
  }

  if (owed) {
    try {
      await AsyncStorage.setItem(PENDING_DEACTIVATION_KEY, token ?? '*');
    } catch {
      // An unwritable flag leaves only the console record above — storage
      // and network both failing at once has no client-side remedy.
    }
  }
}

/**
 * Pays the deactivation debt a failed sign-out recorded. Called on sign-in,
 * BEFORE registerPushToken: if the same account returns, its row is
 * deactivated here and deliberately re-activated by the registration that
 * follows; a different account's registration reassigns the row anyway, so
 * settling is idempotent in every path.
 */
export async function settlePendingPushDeactivation(): Promise<void> {
  let pending: string | null = null;
  try {
    pending = await AsyncStorage.getItem(PENDING_DEACTIVATION_KEY);
  } catch {
    return;
  }
  if (!pending) return;

  let token: string | null = pending === '*' ? null : pending;
  if (!token) {
    if (Platform.OS === 'web' || !Device.isDevice || isExpoGo()) return;
    const projectId = getProjectId();
    if (!projectId) return;
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      // Still owed — the next sign-in tries again.
      return;
    }
  }

  const { error } = await deactivateToken(token);
  if (!error) {
    try {
      await AsyncStorage.removeItem(PENDING_DEACTIVATION_KEY);
    } catch {
      // The debt is paid; a sticky flag only costs a redundant settle later.
    }
  }
}
