import { useLayoutEffect } from 'react';
import { MODAL_SETTLE_INSTANT_MS, MODAL_SETTLE_MS, modalClosed, modalOpened } from '../lib/modalPresence';

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-31) — a component that renders a Modal
 * says when it is on screen, so the one confirm engine never asks iOS for a
 * modal it cannot present (lib/modalPresence.ts). Pass exactly what the Modal's
 * own visibility is, and whether it animates away (`animationType` other than
 * "none"). A LAYOUT effect, so the count is right by the time a tap that closed
 * this modal asks for a confirm on the next tick.
 */
export function useModalPresence(visible: boolean, animated: boolean = true): void {
  useLayoutEffect(() => {
    if (!visible) return;
    modalOpened();
    return () => modalClosed(Date.now(), animated ? MODAL_SETTLE_MS : MODAL_SETTLE_INSTANT_MS);
  }, [visible, animated]);
}
