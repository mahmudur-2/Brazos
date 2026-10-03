/**
 * FIX-RUN F12 — A PRESSABLE THAT SINKS UNDER THE FINGER: what both paths share.
 *
 * The app's one press (hooks/usePressFeedback.ts: a spring down to 0.97 and back, a light
 * haptic as the finger lands) as a component, so a control that only dimmed or snapped takes
 * it by changing one tag. The 120 Hz path (`PressScale.motion120.tsx`) springs the scale on the
 * UI thread with Reanimated; the fallback (`PressScale.tsx`) is the native-driver hook itself.
 * Both run the same spring, and under Reduce Motion neither writes a transform at all (the
 * hook's contract, which keeps the screenshot harness byte-stable).
 *
 * THE WRAPPER CARRIES THE CALLER'S PLACE. The scale has to sit on a view around the Pressable
 * (a Pressable's own style is re-resolved on every press), and a wrapper would steal a caller's
 * `flex: 1` or `marginTop` from the Pressable it was meant for. `splitPressStyle` moves exactly
 * the keys that place a box among its siblings to the wrapper, leaves everything that draws it
 * on the Pressable, and lets the Pressable fill the wrapper, so the resting layout is the same
 * box it always was.
 *
 * THE WRAPPER CARRIES THE PRESSABLE'S hitSlop TOO (review fix). On the New Architecture a view
 * whose children do not overflow it is hit-tested as if it clipped (RCTViewComponentView's
 * `betterHitTest`: `overflowInset == {}` counts as clipping), and the Pressable fills the wrapper
 * exactly, so a touch in the Pressable's slop but outside the wrapper never reached it — every
 * 44pt target E3 built from a smaller control and a slop shrank back to the control. The same
 * slop on the wrapper lets the touch in, and the Pressable's own slop then claims it: the target
 * is the one it was before the wrapper existed.
 */
import { StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export type PressScaleProps = PressableProps & {
  /**
   * The light tap as the finger lands. Default true; rows inside a scroller pass false, so the
   * start of a scroll that happens to begin on a row does not buzz.
   */
  haptic?: boolean;
};

/** The keys that place a box among its siblings — the wrapper's, never the Pressable's. */
const PLACE_KEYS = new Set<string>([
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'start',
  'end',
  'inset',
  'insetBlock',
  'insetBlockStart',
  'insetBlockEnd',
  'insetInline',
  'insetInlineStart',
  'insetInlineEnd',
  'zIndex',
  'display',
  'width',
  'minWidth',
  'maxWidth',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginEnd',
  'marginHorizontal',
  'marginVertical',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
]);

/** The Pressable fills the wrapper, whatever the wrapper was given. */
const FILL: ViewStyle = { flexGrow: 1 };

/** The keys that size a box among its siblings — where a box's own border and padding count. */
const SIZING_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth'];
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
const AXIS = { Top: 'Vertical', Bottom: 'Vertical', Left: 'Horizontal', Right: 'Horizontal' } as const;

/**
 * THE WRAPPER WEARS THE PRESSABLE'S BOX when it takes a size. A flexed box (`flex: 3` beside a
 * `flex: 4`) or a sized one never resolves smaller than its own border and padding, and that
 * floor changes the share each sibling gets. So the wrapper takes the same border widths (drawn
 * transparent) and padding, and the Pressable steps back over them with the same amount of
 * negative margin: the wrapper's box resolves exactly as the Pressable's did, and the Pressable
 * still draws over all of it. Returns false (and changes nothing) for a box it cannot mirror
 * exactly: a percentage padding or border.
 */
function mirrorBox(flat: Record<string, unknown>, outer: Record<string, unknown>, inner: Record<string, unknown>): boolean {
  const edges = SIDES.map((side) => {
    const border = flat[`border${side}Width`] ?? flat.borderWidth ?? 0;
    const pad = flat[`padding${side}`] ?? flat[`padding${AXIS[side]}`] ?? flat.padding ?? 0;
    return { side, border, pad };
  });
  if (edges.some(({ border, pad }) => typeof border !== 'number' || typeof pad !== 'number')) return false;
  if (flat.borderStartWidth != null || flat.borderEndWidth != null || flat.paddingStart != null || flat.paddingEnd != null) {
    return false;
  }
  let any = false;
  for (const { side, border, pad } of edges as { side: (typeof SIDES)[number]; border: number; pad: number }[]) {
    if (border === 0 && pad === 0) continue;
    any = true;
    outer[`border${side}Width`] = border;
    outer[`padding${side}`] = pad;
    inner[`margin${side}`] = -(border + pad);
  }
  if (any) outer.borderColor = 'transparent';
  // A numeric minHeight is a floor of the same kind: the wrapper's box is the Pressable's box.
  if (typeof flat.minHeight === 'number') outer.minHeight = flat.minHeight;
  return true;
}

export function splitPressStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = { ...FILL };
  for (const key of Object.keys(flat)) {
    const value = flat[key];
    if (value === undefined) continue;
    // A height given as a share of the parent is the parent's to resolve, so it places the box.
    const placing = PLACE_KEYS.has(key) || ((key === 'height' || key === 'maxHeight') && typeof value === 'string');
    (placing ? outer : inner)[key] = value;
  }
  if (SIZING_KEYS.some((key) => key in outer)) mirrorBox(flat, outer, inner);
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

/**
 * The wrapper's place and the Pressable's own style. A style that is a function of the press
 * state keeps being one for the Pressable; its place is read at rest (a box does not move
 * among its siblings because it is pressed).
 */
export function pressStyles(style: PressableProps['style']): {
  outer: ViewStyle;
  inner: PressableProps['style'];
} {
  if (typeof style !== 'function') return splitPressStyle(style);
  return {
    outer: splitPressStyle(style({ pressed: false })).outer,
    inner: (state) => splitPressStyle(style(state)).inner,
  };
}
