import { Animated, Platform, type ViewProps, type ViewStyle } from 'react-native';
import { withAlpha } from '../tokens';
import { useOverrideNumber } from '../../lib/designOverrides';

/**
 * lit(2) — A SURFACE THAT IS LIT INSTEAD OF FILLED.
 *
 * Master 44's promo card and its "Post a job" pill are not flat: each carries
 * a soft diagonal wash that is lighter at the top-left and settles into the
 * surface colour at the bottom-right, and the pill adds a faint lighter edge
 * along its top. The app draws both as one flat `backgroundColor`, and
 * scripts/master-diff.mjs measures the gap: on the control render both
 * controls report a diagonal luminance delta of exactly 0.00, against +2.29
 * and +6.72 on the master.
 *
 * WHY THE GRADIENT IS A STRING AND NOT A LIBRARY. `experimental_backgroundImage`
 * is a real, typed View style in React Native 0.81
 * (Libraries/StyleSheet/StyleSheetTypes.d.ts) that accepts CSS gradient syntax,
 * and react-native-web forwards `backgroundImage` straight to CSS — its own
 * CheckBox styles it that way. Two platform keys, one string, no dependency.
 * CLAUDE.md forbids adding an animation or gradient package and nothing here
 * needs one.
 *
 * WHY THE WEB BRANCH IS NOT OPTIONAL. `node scripts/shots.mjs` renders the web
 * export, and that render is the only instrument this repo has for looking at
 * a change. A native-only gradient would be invisible to it, so every claim
 * about this feature would be unmeasured — the shots harness would go blind to
 * the one thing the surface exists to do.
 *
 * WHY THE TOP EDGE IS A SECOND GRADIENT AND NOT A CHILD VIEW. An absolutely
 * positioned 1pt child would draw the same line, and would also be a DOM node
 * that exists in light mode as well as dark. The light render has to stay
 * BYTE-IDENTICAL through this change, so the edge is a second background layer
 * on the same string: it is first, which is the topmost layer in CSS and in
 * RN's own parser, and it is hard-stopped at 1pt and transparent below.
 * `flat` then costs exactly nothing — no style key, no node, no pixel.
 *
 * EVERY STOP IS A PALETTE COLOUR THROUGH `withAlpha`. No colour is written
 * here; callers pass tokens and this file only ever changes their opacity.
 */
export type LitFill = {
  /**
   * The flat fill this surface would otherwise have had. It is the gradient's
   * far stop, so a lit surface and a flat one agree at the bottom-right corner.
   */
  surface: string;
  /** The lighter stop's colour at the top-left. A palette token. */
  lift: string;
  /**
   * How much of `lift` reaches the top-left corner, 0..1. This is the one
   * number a calibration run moves: everything else about the wash is fixed.
   */
  liftAlpha: number;
  /** The 1pt lighter top edge, inside the radius. */
  highlight?: boolean;
  /** How much of `lift` that edge carries. Ignored unless `highlight`. */
  highlightAlpha?: number;
  /** Renders exactly today's flat fill: no gradient, no edge, no style key. */
  flat?: boolean;
};

/**
 * 135deg is top-left → bottom-right in CSS, which is the axis master 44's wash
 * runs along. It is not a prop: a surface lit from somewhere else is a
 * different design decision, not a configuration of this one.
 */
const DIAGONAL = '135deg';

/** The 1pt edge, in the CSS pixels a gradient stop is expressed in. */
const EDGE_PX = 1;

/**
 * The gradient string both platforms share. Exported so a fence can read it
 * without rendering, and so the calibration numbers in the handoff can be
 * reproduced from the source.
 */
export function litGradient({
  surface,
  lift,
  liftAlpha,
  highlight,
  highlightAlpha = 0,
}: LitFill): string {
  const diagonal =
    `linear-gradient(${DIAGONAL}, ` +
    `${withAlpha(lift, liftAlpha)} 0%, ${withAlpha(surface, 1)} 100%)`;
  if (!highlight) return diagonal;
  const edge =
    'linear-gradient(180deg, ' +
    `${withAlpha(lift, highlightAlpha)} 0px, ` +
    `${withAlpha(lift, highlightAlpha)} ${EDGE_PX}px, ` +
    `${withAlpha(lift, 0)} ${EDGE_PX}px)`;
  return `${edge}, ${diagonal}`;
}

/**
 * A gradient string as the style that draws it.
 *
 * THE ONE IMPLEMENTATION OF THE PLATFORM BRANCH. Both fills below go through
 * it, and so does `LitSurface` — a caller whose container cannot become a View
 * (the "Post a job" pill is a `Pressable` with an `onPress`) takes the
 * returned style into its own style array instead. react-native-web forwards
 * `backgroundImage` to CSS, but React Native's own ViewStyle has no such key —
 * hence the single cast, here and nowhere else (RN 0.81 View style docs).
 */
function backgroundImageStyle(image: string): ViewStyle {
  return Platform.OS === 'web'
    ? ({ backgroundImage: image } as unknown as ViewStyle)
    : { experimental_backgroundImage: image };
}

/**
 * The lit fill as a style object, or `undefined` when flat. `undefined` in a
 * style array is ignored by React Native, which is why the flat path adds
 * nothing at all.
 */
export function litFill(fill: LitFill): ViewStyle | undefined {
  if (fill.flat) return undefined;
  return backgroundImageStyle(litGradient(fill));
}

/**
 * 2026-09-18 — A SURFACE LIT BETWEEN TWO EXPLICIT STOPS.
 *
 * `litFill` lights a surface by lifting its OWN colour toward a palette lift
 * and letting it settle back — one flat fill, one calibrated alpha. The
 * customer Home's task card is a different statement: the reference
 * (docs/mockups/html/home-redesign.html, `.theme-dark .card`) draws it as a
 * straight top-to-bottom gradient between two NAMED shades, and the palette
 * now carries both (`taskCardLitTop` settling into `taskCardLitBottom`). So
 * this takes the two stops as given and draws them through the same platform
 * branch above — no third mechanism, no library. Every stop is still a
 * palette token through `withAlpha`, at full opacity: this file writes no
 * colour of its own here either.
 */
export type LitBetween = {
  /** The top stop. A palette token. */
  top: string;
  /** The bottom stop — also the flat fill a caller declares under it. A palette token. */
  bottom: string;
  /** Renders nothing: no gradient, no style key. The light card is flat. */
  flat?: boolean;
};

/**
 * Straight down. The reference card is lighter at its top edge and darker at
 * its bottom one, not lit from a corner — a different axis from the wash's,
 * and like `DIAGONAL` it is not a prop.
 */
const VERTICAL = '180deg';

/** The gradient string, exported so a fence can read it without rendering. */
export function litBetweenGradient({ top, bottom }: LitBetween): string {
  return (
    `linear-gradient(${VERTICAL}, ` +
    `${withAlpha(top, 1)} 0%, ${withAlpha(bottom, 1)} 100%)`
  );
}

/** The explicit-stops fill as a style object, or `undefined` when flat. */
export function litBetween(fill: LitBetween): ViewStyle | undefined {
  if (fill.flat) return undefined;
  return backgroundImageStyle(litBetweenGradient(fill));
}

export type LitSurfaceProps = ViewProps &
  LitFill & {
    /** The gold hairline this surface already draws. */
    hairline?: string;
    /** The corner radius the fill and the top edge are clipped to. */
    radius?: number;
  };

/**
 * A View whose fill is lit rather than flat.
 *
 * `flat` renders one node with the caller's own styles and nothing else — the
 * same single node the caller had before this primitive existed. That is what
 * keeps a light-mode render byte-identical while dark gains the wash.
 *
 * RUN MOTION1 (C2): the node is an `Animated.View` rather than a `View`, so a
 * caller can hand it hooks/useEntrance.ts's style in the same array it already
 * hands the surface's own. react-native-web renders the two identically when
 * no animated value is present — same element, same class, same box — so this
 * is not a second node and not a second design; it is the one node, able to
 * take a transform.
 */
export function LitSurface({
  surface,
  lift,
  liftAlpha: liftAlphaProp,
  highlight,
  highlightAlpha,
  flat,
  hairline,
  radius,
  style,
  children,
  ...rest
}: LitSurfaceProps) {
  // RUN S2 (C8) — the studio's lift-wash dial SCALES every caller's own
  // calibration rather than replacing it (each surface ships its own alpha,
  // so a single replacement value would have no honest default). 1 = today.
  const liftScale = useOverrideNumber('card.liftScale');
  const liftAlpha =
    liftScale != null ? Math.min(1, Math.max(0, liftAlphaProp * liftScale)) : liftAlphaProp;
  const fill = litFill({ surface, lift, liftAlpha, highlight, highlightAlpha, flat });
  return (
    <Animated.View
      style={[
        style,
        // A lit surface still declares its flat colour: it is the gradient's
        // far stop, and it is what paints if a platform ever refuses the
        // gradient. Border and radius are only asserted when the caller names
        // them, so a caller whose stylesheet already carries them is untouched.
        !flat && { backgroundColor: surface },
        hairline != null && { borderWidth: 1, borderColor: hairline },
        radius != null && { borderRadius: radius, overflow: 'hidden' as const },
        fill,
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}
