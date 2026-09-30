/**
 * 2026-09-30 (the build run, idea 9) — THE LOCK-SCREEN LIVE CARD's boundary. The card is drawn by a
 * Live Activities add-on's native module (expo-live-activity, approved for this run; its install is
 * the operator's — the run's guard refuses dependency changes). This file speaks to that NATIVE module
 * directly, by its registered name, and only after the registry says it is in the binary — it never
 * imports the add-on's JavaScript, so a bundle delivered over the air to a binary without it (every
 * Beta before the add-on's build) resolves to "no card" and can never crash: the shape
 * lib/motion120/vendor.ts gives the motion libraries. tests/liveCard.test.mjs holds the rule that
 * nothing else names the module.
 *
 * What a card SAYS is the server's (live_card_state(), migration 20260930001300): this file only
 * starts, updates and ends the card with those words, and reports the card's push token.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { darkColors } from './theme';

/** The words a card shows, as live_card_state() returns them. */
export type LiveCardState = {
  stage: 'on_the_way' | 'arrived' | 'started' | 'finished' | 'cancelled';
  title: string;
  subtitle: string;
  progress: number;
  ended: boolean;
};

/** The add-on's native module, as its own JavaScript calls it (expo-live-activity 0.4.2, build/index.js). */
type NativeLiveActivity = {
  startActivity: (state: object, config?: object) => string | undefined;
  updateActivity: (id: string, state: object) => void;
  stopActivity: (id: string, state: object) => void;
  addListener?: (
    event: 'onTokenReceived',
    listener: (event: { activityID?: string; activityPushToken?: string }) => void
  ) => { remove: () => void };
};

/** The name the add-on registers its native module under (its build/ExpoLiveActivityModule.js). */
export const LIVE_ACTIVITY_MODULE = 'ExpoLiveActivity';

let cached: NativeLiveActivity | null | undefined;

/** The native module, or null: never on Android or web, never on a binary without the add-on. */
function liveActivity(): NativeLiveActivity | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'ios') return cached;
  try {
    const native = requireOptionalNativeModule<NativeLiveActivity>(LIVE_ACTIVITY_MODULE);
    if (native && typeof native.startActivity === 'function' && typeof native.updateActivity === 'function' && typeof native.stopActivity === 'function') {
      cached = native;
    }
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether this binary can show a lock-screen card at all. */
export function liveCardAvailable(): boolean {
  return liveActivity() !== null;
}

/** The card's look: the app's dark ground and its one action green, from the tokens; the words are the server's. */
function cardConfig() {
  return {
    backgroundColor: darkColors.background,
    titleColor: darkColors.ink,
    subtitleColor: darkColors.textMuted,
    progressViewTint: darkColors.emerald,
    progressViewLabelColor: darkColors.ink,
  };
}

function stateFor(card: LiveCardState) {
  return {
    title: card.title,
    subtitle: card.subtitle,
    progressBar: { progress: Math.min(1, Math.max(0, card.progress)) },
  };
}

/** Starts a card and returns its id, or null when this phone can't show one. */
export function startLiveCard(card: LiveCardState): string | null {
  const native = liveActivity();
  if (!native) return null;
  try {
    return native.startActivity(stateFor(card), cardConfig()) ?? null;
  } catch {
    return null;
  }
}

export function updateLiveCard(id: string, card: LiveCardState): void {
  const native = liveActivity();
  if (!native) return;
  try {
    native.updateActivity(id, stateFor(card));
  } catch {
    // A card the system already ended: nothing to update.
  }
}

export function endLiveCard(id: string, card: LiveCardState): void {
  const native = liveActivity();
  if (!native) return;
  try {
    native.stopActivity(id, stateFor(card));
  } catch {
    // Already gone.
  }
}

/** Each card's push token as the system issues it — handed to the server for updates by push. */
export function onLiveCardToken(listener: (activityId: string, pushToken: string) => void): () => void {
  const native = liveActivity();
  let subscription: { remove: () => void } | undefined;
  try {
    subscription = native?.addListener?.('onTokenReceived', (event) => {
      if (event?.activityID && event?.activityPushToken) listener(event.activityID, event.activityPushToken);
    });
  } catch {
    subscription = undefined;
  }
  return () => subscription?.remove();
}
