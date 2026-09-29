import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { nativeConfirm, registerConfirmHost, type ResolvedConfirm } from '../lib/dialog';
import { modalSettleDelay } from '../lib/modalPresence';

type Pending = { options: ResolvedConfirm; resolve: (ok: boolean) => void };

/** If the dialog has not appeared by then, the system alert takes the question. */
const SHOW_WATCHDOG_MS = 1000;

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-31) — A HOST OF THE ONE CONFIRM ENGINE.
 * One sits at the app's root (App.tsx, level 0); a sheet that asks while it
 * stays up carries its own inside it (the [+] create sheet, level 1), because
 * iOS presents a Modal from the screen that owns it. Each registers with
 * lib/dialog.ts, and confirmAsync() — the mode switch's, the Inbox's clean-ups,
 * sign-out, delete — draws this app's own ConfirmDialog through the right one:
 * the same glass card, Cancel on the left and the action on the right, the same
 * words as every dialog a screen renders itself.
 *
 * One at a time: a second confirm waits its turn. The root host waits for a
 * sheet or menu that is still leaving (lib/modalPresence.ts). And a WATCHDOG: a
 * dialog that has not appeared within a second hands its question to the system
 * alert, so no confirmation can ever hang.
 */
export function ConfirmHost({ level = 0 }: { level?: number }) {
  const queue = useRef<Pending[]>([]);
  const [current, setCurrent] = useState<Pending | null>(null);
  const busy = useRef(false);
  const shown = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pump = useCallback(() => {
    if (busy.current) return;
    const next = queue.current.shift();
    if (!next) return;
    busy.current = true;
    const show = () => {
      shown.current = false;
      setCurrent(next);
      watchdog.current = setTimeout(() => {
        if (shown.current) return;
        // It never appeared: the system alert asks instead.
        setCurrent(null);
        busy.current = false;
        void nativeConfirm(next.options).then((ok) => {
          next.resolve(ok);
          pump();
        });
      }, SHOW_WATCHDOG_MS);
    };
    const wait = level === 0 ? modalSettleDelay() : 0;
    if (wait > 0) setTimeout(show, wait);
    else show();
  }, [level]);

  useEffect(() => {
    const unregister = registerConfirmHost({
      level,
      present: (options) =>
        new Promise<boolean>((resolve) => {
          queue.current.push({ options, resolve });
          pump();
        }),
    });
    return () => {
      unregister();
      if (watchdog.current) clearTimeout(watchdog.current);
    };
  }, [level, pump]);

  function settle(ok: boolean) {
    const done = current;
    if (watchdog.current) clearTimeout(watchdog.current);
    setCurrent(null);
    busy.current = false;
    done?.resolve(ok);
    // The next one presents afresh (its own onShow), a tick after this one closes.
    setTimeout(pump, 0);
  }

  const options = current?.options;
  return (
    <ConfirmDialog
      visible={!!current}
      title={options?.title ?? ''}
      message={options?.message || undefined}
      confirmText={options?.confirmText}
      cancelText={options?.cancelText}
      destructive={options?.destructive}
      onShow={() => {
        shown.current = true;
      }}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );
}
