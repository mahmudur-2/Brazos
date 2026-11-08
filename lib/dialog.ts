import { Alert } from 'react-native';
import { openModalCount } from './modalPresence';

/**
 * Dialogs as Promises, so callers can `await` the result instead of relying
 * on button callbacks.
 */

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export type ResolvedConfirm = Required<ConfirmOptions>;

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-31) — ONE CONFIRM ENGINE. Every
 * confirmation, the mode switch's included, draws the app's own ConfirmDialog
 * through a components/ConfirmHost.tsx — the same glass card, button order and
 * words as the dialogs screens render directly.
 *
 * WHICH HOST. iOS presents a Modal from the screen that owns it, so a host sits
 * at the app's root (level 0) and another inside any sheet that asks while it
 * stays up (the [+] sheet's mode switch, M-38 — level 1). The request goes to the
 * newest host whose level is the number of modals on screen: over the sheet
 * when it asks with the sheet up; at the root once a menu or sheet that was
 * closed by the same tap has finished leaving (waited for, briefly).
 *
 * THE FALLBACK is the system alert: before any host has
 * mounted, while a modal with no host of its own is on top, and — the host's
 * watchdog — if the in-app dialog does not appear in time. No confirm can hang.
 */
export type ConfirmHostEntry = {
  level: number;
  present: (options: ResolvedConfirm) => Promise<boolean>;
};
const hosts: ConfirmHostEntry[] = [];

export function registerConfirmHost(entry: ConfirmHostEntry): () => void {
  hosts.push(entry);
  return () => {
    const at = hosts.indexOf(entry);
    if (at >= 0) hosts.splice(at, 1);
  };
}

/** How long a request waits for a closing sheet or menu to finish leaving. */
const HOST_WAIT_MS = 700;
const HOST_POLL_MS = 40;

function hostForNow(): ConfirmHostEntry | null {
  const top = hosts[hosts.length - 1];
  return top && top.level === openModalCount() ? top : null;
}

async function settledHost(): Promise<ConfirmHostEntry | null> {
  const deadline = Date.now() + HOST_WAIT_MS;
  // First let the tap's own state change commit — a sheet or menu it closed.
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (;;) {
    const host = hostForNow();
    if (host) return host;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, HOST_POLL_MS));
  }
}

export async function confirmAsync({
  title,
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  const options = { title, message, confirmText, cancelText, destructive };
  const host = hosts.length > 0 ? await settledHost() : null;
  return host ? host.present(options) : nativeConfirm(options);
}

/** The system's own confirm — the engine's fallback, never a second design. */
export function nativeConfirm({
  title,
  message,
  confirmText,
  cancelText,
  destructive,
}: ResolvedConfirm): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export function alertAsync(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}
