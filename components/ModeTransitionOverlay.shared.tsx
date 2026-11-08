import { StyleSheet } from 'react-native';
import { backgroundImageStyle } from '../ui/primitives/LitSurface';
import { radius, spacing, themedStyles, withAlpha, type ColorPalette } from '../lib/theme';
import type { AppMode } from '../modes/types';

/**
 * THE MODE SWITCH'S SHARED BODY — everything both drivers draw and every
 * number they time, in one module (the arrangement of SuccessMark.shared.tsx:
 * two binaries, one choreography).
 *
 * WHAT IT IS (2026-09-21, the operator's pick from six rendered ideas —
 * docs/mockups/html/lux/mode-switch-wipe-capsule.html; DECISIONS that date).
 * A bare pane of the app's own ground sweeps across the screen, rim leading,
 * and never rests: it covers the screen, the navigation tree swaps under it,
 * and it keeps going off the far edge, revealing the new home. A capsule drops
 * from under the status bar as the pane passes, names where you landed —
 * "Worker" / "Customer" — holds, and retracts on its own. Direction means
 * something: → to Worker, ← back to Customer.
 *
 * WHAT IT REPLACES. The previous switch raised a 1.7 MB artwork sheet
 * (assets/brand/transition-*.png, now retired from the code and kept on disk),
 * held it, and lowered it: 1000 ms, and blind — the swap fired at 500 ms and
 * the sheet left at 700 ms whether or not the incoming tree had painted, which
 * is why it had to be slow to be safe.
 *
 * REVEAL WHEN PAINTED, NOT ON A TIMER. The pane covers, the tree swaps, and
 * the pane leaves only once the incoming tree has reported its first layout
 * (navigation/ModeShell.tsx mounts `ModeTreeLayoutSignal` beside the tree) plus
 * one frame — or REVEAL_FAILSAFE_MS after the swap, whichever comes first. No
 * blank frame can show, and on a warm device the reveal comes sooner than any
 * fixed hold could.
 *
 * ONLY TRANSFORM AND OPACITY MOVE, on one layer each: the pane's translateX
 * and the capsule's translateY — so both drivers run on the UI thread
 * (Reanimated worklets on a binary that has them, the native driver
 * otherwise). No blur, shadow, radius or layout animates. Reduced motion is a
 * crossfade through the ground with the same capsule fading in and out.
 */

export type ModeDestination = AppMode;

// --- Choreography, in milliseconds from the tap ------------------------------
/** The pane sweeps in and covers. */
export const PANE_IN_MS = 260;
/** The pane never leaves sooner than this after the swap, even if the tree is already there. */
export const PANE_HOLD_MIN_MS = 60;
/** The reveal waits for the incoming tree's first layout at most this long after the swap. */
export const REVEAL_FAILSAFE_MS = 400;
/** The pane sweeps off, revealing the new home. */
export const PANE_OUT_MS = 280;
/** The capsule starts dropping as the pane passes … */
export const CAPSULE_DELAY_MS = 180;
/** … lands after this … */
export const CAPSULE_IN_MS = 220;
/** … holds until this moment from the tap (1100 at first; +250 on the phone, 2026-09-21: "exits too fast, I can’t read it") … */
export const CAPSULE_HOLD_UNTIL_MS = 1350;
/** … and retracts over this. */
export const CAPSULE_OUT_MS = 200;
/** The capsule's parked position, above the screen's top edge. */
export const CAPSULE_HIDDEN_Y = -140;
/** Reduced motion: a crossfade through the ground, no travel. */
export const REDUCED_IN_MS = 110;
export const REDUCED_OUT_MS = 130;
/** A frame of slack past the capsule's exit before the layer unmounts. */
export const FINISH_SLACK_MS = 40;
/** The run's own fail-safe: nothing may leave the layer on screen past this. */
export const RUN_FAILSAFE_MS = CAPSULE_HOLD_UNTIL_MS + CAPSULE_OUT_MS + 500;

/** How far past each screen edge the pane extends, so its leading edge and its shadow are drawn before they enter. */
export const PANE_OVERHANG = 40;
/** The soft shadow the pane pushes ahead of its leading edge. */
export const PANE_SHADOW_WIDTH = 18;

/**
 * The pane's three positions for a direction, as translateX in points: parked
 * off the near edge, covering the screen, and gone off the far edge. The pane
 * itself is `width + 2 * PANE_OVERHANG` wide and laid out at `-PANE_OVERHANG`,
 * so "covering" is translateX 0 with the overhang past both edges.
 */
export function paneTravel(destination: ModeDestination, width: number): { from: number; cover: number; to: number } {
  const off = width + PANE_OVERHANG;
  // → Worker: in from the right, out to the left. ← Customer: the mirror.
  return destination === 'worker' ? { from: off, cover: 0, to: -off } : { from: -off, cover: 0, to: off };
}

/** The word the capsule says: where you landed. */
export function capsuleLabel(destination: ModeDestination): string {
  return destination === 'worker' ? 'Worker' : 'Customer';
}

/** The pane's leading edge for a direction: the edge that enters first. */
export function leadingEdge(destination: ModeDestination): 'left' | 'right' {
  return destination === 'worker' ? 'left' : 'right';
}

/**
 * What one run needs from its owner. The drivers (Reanimated, native
 * `Animated`, reduced motion) implement the same sequence over this contract.
 */
export type ModeTransitionRunProps = {
  destination: ModeDestination;
  /** The real navigation, run ONCE while the pane fully covers the screen. */
  onSwitch: () => void;
  /** Resolves when the incoming tree has laid out (navigation/ModeShell.tsx). */
  waitForTreeLaidOut: () => Promise<void>;
  /** The pane has left; the switch controls may re-enable. */
  onRevealed: () => void;
  /** The capsule has retracted; the layer may unmount. */
  onFinished: () => void;
  /** The window width the pane travels across. */
  width: number;
  /** The top safe-area inset the capsule hangs under. */
  topInset: number;
};

/**
 * A run's shared bookkeeping: the swap fires once, the reveal waits for the
 * paint signal or the fail-safe, and every timer is cleared on unmount. The
 * drivers hand it their two motions and it owns the sequence, so the three
 * cannot disagree about WHEN.
 */
export function runSequence(
  props: ModeTransitionRunProps,
  motions: {
    /** Start the cover; call `covered` when the pane fully covers the screen. */
    paneIn: (covered: () => void) => void;
    /** Start the reveal; call `revealed` when the pane is off the screen. */
    paneOut: (revealed: () => void) => void;
    /** Drop the capsule in. */
    capsuleIn: () => void;
    /** Retract the capsule; call `gone` when it is parked again. */
    capsuleOut: (gone: () => void) => void;
  },
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => void) => {
    timers.push(setTimeout(fn, ms));
  };
  let switched = false;
  let revealed = false;
  let finished = false;
  const runSwitch = () => {
    if (switched) return;
    switched = true;
    props.onSwitch();
  };
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    props.onRevealed();
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    props.onFinished();
  };

  motions.paneIn(() => {
    // Full cover: the one seam where the mode changes. The waiter is armed
    // BEFORE the swap so the incoming tree's layout event cannot precede it.
    const laidOut = props.waitForTreeLaidOut();
    runSwitch();
    const swappedAt = Date.now();
    const failsafe = new Promise<void>((resolve) => at(REVEAL_FAILSAFE_MS, resolve));
    void Promise.race([laidOut, failsafe]).then(() => {
      // One frame after layout, so the incoming tree's first paint has
      // actually happened before the pane starts to leave; and never sooner
      // than the minimum hold, so a very fast mount does not read as a flicker.
      const remaining = PANE_HOLD_MIN_MS - (Date.now() - swappedAt);
      at(Math.max(0, remaining), () => {
        requestAnimationFrame(() => motions.paneOut(reveal));
      });
    });
  });
  at(CAPSULE_DELAY_MS, motions.capsuleIn);
  at(CAPSULE_HOLD_UNTIL_MS, () => motions.capsuleOut(() => at(FINISH_SLACK_MS, finish)));
  // Nothing above may leave the layer on screen: even if a driver never calls
  // back (backgrounded mid-run, driver hiccup), this tears the layer down and
  // releases the switch controls.
  at(RUN_FAILSAFE_MS, () => {
    runSwitch();
    reveal();
    finish();
  });

  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}

/**
 * The pane's shadow, pushed ahead of its leading edge: a strip of gradient
 * from the palette's black at 0.45 to nothing — no shadow computation, and no
 * literal colour (the fence in tests/themeResolution reads this file).
 */
export function paneShadowImage(edge: 'left' | 'right', colors: ColorPalette): string {
  const deep = withAlpha(colors.black, 0.45);
  const none = withAlpha(colors.black, 0);
  return edge === 'left'
    ? `linear-gradient(90deg, ${none} 0%, ${deep} 100%)`
    : `linear-gradient(90deg, ${deep} 0%, ${none} 100%)`;
}

export const paneShadowStyle = (edge: 'left' | 'right', colors: ColorPalette) =>
  backgroundImageStyle(paneShadowImage(edge, colors));

export const transitionStylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
    },
    /** The pane: the app's ground, opaque, wider than the screen by the overhang on each side. */
    pane: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: -PANE_OVERHANG,
      backgroundColor: colors.background,
      // The shadow strip sits just OUTSIDE the leading edge.
      overflow: 'visible',
    },
    /** The leading edge's rim — the mint hairline the app's panes wear — and the specular line inside it. */
    rim: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: withAlpha(colors.emeraldBright, 0.55),
    },
    specular: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: withAlpha(colors.onForest, 0.14),
    },
    shadow: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: PANE_SHADOW_WIDTH,
    },
    /** The reduced-motion ground: the same colour, faded rather than moved. */
    ground: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
    },
    capsuleWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    capsule: {
      minHeight: 40,
      paddingLeft: spacing.md,
      paddingRight: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    capsuleDot: {
      width: 10,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.emeraldBright,
      shadowColor: colors.emeraldBright,
      shadowOpacity: 0.7,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    },
    capsuleText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
  }),
);
