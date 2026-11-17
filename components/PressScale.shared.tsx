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
 * THE WRAPPER CARRIES THE PRESSABLE'S hitSlop TOO (review fix; mechanism corrected 2026-10-03). It
 * was added on the belief that a view its children do not overflow is hit-tested as clipped
 * (RCTViewComponentView's `betterHitTest` treats an empty `overflowInset` as clipping) and that
 * the Pressable, filling the wrapper exactly, left the wrapper's inset empty. It does not: Yoga
 * folds every child's hitSlop into its parent's overflow inset (YogaLayoutableShadowNode.cpp,
 * `getContentBounds`), so a slopped Pressable gives its wrapper a non-empty inset and the touch
 * passes through to the Pressable's own slop on its own. What does cut a slop is an ancestor
 * whose inset is empty by construction — `overflow: scroll` (every ScrollView) or `overflow:
 * hidden`; a horizontal row of pills makes room for its slop with `slopRoom()` (lib/theme.ts).
 * The wrapper keeps the slop: it is harmless, and tests/smoothPass and tests/touchTargets pin the
 * shape so the two views never disagree.
 */
import { StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { PressHaptic } from '../hooks/usePressFeedback';

export type PressScaleProps = PressableProps & {
  /**
   * The light tap as the finger lands. Default true; rows inside a scroller pass false, so the
   * start of a scroll that happens to begin on a row does not buzz. A2-M2: 'select' gives the
   * selection tick instead, for a control that CHOOSES (a choice chip, a choice row).
   */
  haptic?: PressHaptic;
  /**
   * A2-M2 — the opacity the control dims to while the finger is down (Button: .85). On the 120 Hz
   * path it rides the press spring's own shared value on the UI thread, in the same frame as the
   * scale; under Reduce Motion and on the native-driver fallback it is the Pressable's pressed style.
   */
  dim?: number;
  /**
   * A2-M2 — for a control given a share of a ROW (`flex`), beside siblings that may be taller (a
   * pair of buttons whose labels wrap differently): the wrapper lays the Pressable out as a row, so
   * the row's stretch carries the Pressable's height with the wrapper's and the pair keeps one
   * height; the Pressable takes exactly the wrapper's width. Only with a `flex` share: a growing
   * child of an unsized box takes the box's whole available room on iOS (see FILL below).
   *
   * A2-M3 — `'height'`: the row wrapper alone, for a control that keeps its OWN width beside a
   * share in a ROW (ConfirmDialog's Cancel beside its action): nothing grows, and the row's stretch
   * gives it the row's height. Only inside a row: in a column the Pressable would shrink to its text.
   */
  fill?: boolean | 'height';
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

/**
 * The Pressable fills the wrapper's WIDTH through the column's own `alignItems: stretch`, and
 * NOTHING ELSE — no `flexGrow`. 2026-10-03, found on the operator's phone: `{ flexGrow: 1 }`
 * here blanked every screen with a header link. Yoga runs with React Native's legacy stretch
 * rule (`YGErrataAll`): a growing child inside an auto-height wrapper takes the wrapper's whole
 * AVAILABLE height, so the header's Back link grew to the screen's height, the header row with
 * it, and the `flex: 1` content below got 0 pt. react-native-web lays out with CSS flexbox,
 * where an auto-height box has no free space to hand out — which is why the screenshot
 * harness never saw it. A numeric `height` or `minHeight` stays on the Pressable (it is not a
 * placing key), so a sized control is still exactly its size.
 */
const FILL: ViewStyle = {};

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

/** `fill` (above): the wrapper lays the Pressable out as a row and the Pressable takes its width. */
const FILL_ROW: ViewStyle = { flexDirection: 'row' };
const FILL_SHARE: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0 };

/**
 * The wrapper's place and the Pressable's own style. A style that is a function of the press
 * state keeps being one for the Pressable; its place is read at rest (a box does not move
 * among its siblings because it is pressed).
 */
export function pressStyles(
  style: PressableProps['style'],
  fill: boolean | 'height' = false,
): {
  outer: ViewStyle;
  inner: PressableProps['style'];
} {
  const split = (resolved: StyleProp<ViewStyle>) => {
    const { outer, inner } = splitPressStyle(resolved);
    if (fill === 'height') return { outer: { ...outer, ...FILL_ROW }, inner };
    return fill ? { outer: { ...outer, ...FILL_ROW }, inner: { ...inner, ...FILL_SHARE } } : { outer, inner };
  };
  if (typeof style !== 'function') return split(style);
  return {
    outer: split(style({ pressed: false })).outer,
    inner: (state) => split(style(state)).inner,
  };
}

/** `dim` (above) as the Pressable's pressed style: the path where no UI-thread value carries it. */
export function withPressDim(style: PressableProps['style'], dim: number | undefined): PressableProps['style'] {
  if (dim == null) return style;
  return (state) => [typeof style === 'function' ? style(state) : style, state.pressed && { opacity: dim }];
}
