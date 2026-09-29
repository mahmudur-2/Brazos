/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-31) — HOW MANY MODALS ARE ON SCREEN, and
 * when the last one to leave will have finished leaving.
 *
 * The one confirm engine (lib/dialog.ts confirmAsync → components/ConfirmHost)
 * draws the app's own ConfirmDialog, which is a Modal, and iOS presents a Modal
 * from the screen that owns it: a confirm hosted at the app's root cannot show
 * while a sheet is up, nor while one is still animating away. So the engine asks
 * this module how many modals are up (a host inside a sheet presents over that
 * sheet; the root host waits for a closing one to finish) — and every component
 * that renders a Modal reports itself through hooks/useModalPresence.ts.
 *
 * No imports: the rule is plain arithmetic, and the node suite runs it.
 */

/** An animated modal's leaving (the sheets slide, the dialogs fade: ~300 ms). */
export const MODAL_SETTLE_MS = 400;
/** A modal with no animation of its own (the menus and popups): a frame or two. */
export const MODAL_SETTLE_INSTANT_MS = 60;

let openCount = 0;
let settledAt = Number.NEGATIVE_INFINITY;

export function modalOpened(): void {
  openCount += 1;
}

export function modalClosed(nowMs: number = Date.now(), settleMs: number = MODAL_SETTLE_MS): void {
  openCount = Math.max(0, openCount - 1);
  settledAt = Math.max(settledAt, nowMs + settleMs);
}

/** How many of the app's own modals are on screen. */
export function openModalCount(): number {
  return openCount;
}

/** True while any of the app's own modals is on screen. */
export function anyModalOpen(): boolean {
  return openCount > 0;
}

/** How long before a new root-level modal may present: zero once the last one to leave has left. */
export function modalSettleDelay(nowMs: number = Date.now()): number {
  return Math.max(0, settledAt - nowMs);
}

/** Tests only: back to no modal ever opened. */
export function resetModalPresence(): void {
  openCount = 0;
  settledAt = Number.NEGATIVE_INFINITY;
}
