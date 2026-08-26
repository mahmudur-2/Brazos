/**
 * RUN S2 (C3) — THE PANEL'S GEOMETRY, PURE.
 *
 * The design studio panel is draggable, resizable and collapsible, and every
 * one of those gestures runs through `clampPanelRect` below — as does every
 * frame change (rotation, inset change, the nav bar's own dials moving). The
 * contract, which ended the panel-dragged-off-screen-with-no-way-back defect:
 *
 *   - the top edge never rises above the safe-area top inset (never under
 *     the status bar or Dynamic Island);
 *   - the bottom edge never covers the bottom nav (the frame's bottomInset
 *     is the nav's live footprint, so the bar stays tappable — the panel is
 *     NON-MODAL by construction);
 *   - the sides never leave the screen;
 *   - the height runs from PANEL_MIN_HEIGHT to the full available area, and
 *     a non-finite input (the worst a gesture can produce) resolves to a
 *     safe value rather than propagating.
 *
 * Pure and import-free so tests/designStudio.test.mjs executes it directly:
 * the clamp fence proves the header can never leave the safe interactive
 * area at min and max height, whatever the gesture feeds in.
 */

/** The panel's side margin when the window allows it. */
export const PANEL_MARGIN = 12;

/** The shortest the panel may be resized. */
export const PANEL_MIN_HEIGHT = 180;

/** The collapsed pill's box height, for the same clamp. */
export const PANEL_COLLAPSED_HEIGHT = 44;

export type PanelRect = {
  x: number;
  y: number;
  /** The EXPANDED height; while collapsed the pill box is clamped instead,
   *  and this value survives so restoring gets the height back. */
  height: number;
};

export type PanelFrame = {
  windowWidth: number;
  windowHeight: number;
  /** The safe-area top inset — the status bar / Dynamic Island floor. */
  topInset: number;
  /** The height the bottom nav owns at the window's bottom edge — the
   *  panel may never cover it. */
  bottomInset: number;
};

export function panelWidthFor(frame: PanelFrame): number {
  return Math.max(0, frame.windowWidth - 2 * PANEL_MARGIN);
}

export function clampPanelRect(
  rect: PanelRect,
  frame: PanelFrame,
  collapsed: boolean,
): PanelRect {
  const minY = frame.topInset;
  const maxY = Math.max(minY, frame.windowHeight - frame.bottomInset);
  const available = maxY - minY;

  let height = Number.isFinite(rect.height) ? rect.height : PANEL_MIN_HEIGHT;
  height = Math.min(height, available);
  height = Math.max(height, Math.min(PANEL_MIN_HEIGHT, available));

  const box = collapsed ? Math.min(PANEL_COLLAPSED_HEIGHT, available) : height;

  let y = Number.isFinite(rect.y) ? rect.y : minY;
  y = Math.min(y, maxY - box);
  y = Math.max(y, minY);

  const maxX = Math.max(0, frame.windowWidth - panelWidthFor(frame));
  let x = Number.isFinite(rect.x) ? rect.x : PANEL_MARGIN;
  x = Math.min(x, maxX);
  x = Math.max(x, 0);

  return { x, y, height };
}
