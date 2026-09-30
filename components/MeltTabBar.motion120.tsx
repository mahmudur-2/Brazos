/**
 * 2026-09-30 (the build run, `docs/dispatch/MELT-TAB-BAR.md`) — THE MELT-THROUGH TAB BAR, 120 Hz.
 *
 * The moving bubble is three circles (54 / 45 / 36) chasing one x on three springs, joined by
 * fillet necks so they read as one liquid shape; the lead stretches with its speed and swells under
 * a finger; on the customer's bar the + melts into whichever end of the bubble faces it, joins at
 * contact and pinches off as they part. ONE frame loop steps every spring on the UI thread with the
 * handoff page's integrator (semi-implicit Euler in 4 ms slices, `lib/meltBarGeometry.ts` springStep),
 * computes the stretch, the necks and the join state, and writes shared values; every piece's
 * animated style only reads them. Nothing crosses to JS while a finger moves: the tab is chosen on
 * release, and the loop sleeps once everything has settled.
 *
 * Only this file imports the vendor packages (the motion boundary, tests/motion120.test.mjs); the
 * body — rows, glyphs, colours, the tab-press path — is `MeltTabBar.shared.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { meltBar, metricStyles } from '../lib/theme';
import {
  facingCircle,
  leadCap,
  neckShape,
  plusFillet,
  plusGap,
  springStep,
  stepPlusJoin,
  stretchOf,
  type Neck,
} from '../lib/meltBarGeometry';
import {
  focusedSlotIndex,
  meltSlots,
  meltStyles,
  MeltRow,
  MeltTouchLayer,
  pillGround,
  pillStyle,
  PlusGlyph,
  pressCreate,
  pressTab,
  useMeltMetrics,
  type MeltSlot,
  type MeltTabBarProps,
} from './MeltTabBar.shared';

const [LEAD, MIDDLE, TAIL] = meltBar.bubble;
const R1 = MIDDLE / 2;
const R2 = TAIL / 2;
const MID = meltBar.height / 2;
const PLUS_R = meltBar.plus / 2;
const SUB = meltBar.substep;
const SPRINGS = meltBar.springs;
const FILLET = meltBar.fillet;
const KICKS = { join: meltBar.plusJoinKick, snap: meltBar.plusSnapKick };
const REACH = meltBar.plusReach;
const OVERLAP = meltBar.plusOverlap;
const PULL = meltBar.plusPull;
const PRESSED = meltBar.plusPressed;
const SWELL = meltBar.swell;
const STRETCH_V = meltBar.stretchVelocity;
const STRETCH_MAX = meltBar.stretchMax;
const SQUASH = meltBar.stretchSquash;
const SLOP = meltBar.dragSlop;
const ICON_DROP = meltBar.iconDrop;
const LABEL_RISE = meltBar.labelRise;
const LABEL_FADE = meltBar.labelFade;
/** The + takes a touch within its own circle plus a fingertip. */
const PLUS_TOUCH = PLUS_R + 8;
/** Frames of stillness before the loop sleeps. */
const QUIET_FRAMES = 12;
const MAX_SLOTS = 5;

/*
 * THE STYLE UPDATERS READ THEIR SHARED VALUES THEMSELVES. Reanimated subscribes a style to the
 * shared values in its updater's own closure; a helper worklet that reads one hides it, and the
 * style is computed once and never again (the self-look caught it: after a tab change the names
 * kept their first state). So the helpers below are pure — they take plain numbers — and every
 * updater reads the shared value and hands it over.
 */

/** A chosen value's icon motion: the icon drops toward the pill's centre line. */
function chosenIcon(c: number) {
  'worklet';
  return { transform: [{ translateY: c * ICON_DROP }] };
}

/** A chosen value's name motion: it rises and fades out. */
function chosenLabel(c: number) {
  'worklet';
  return { opacity: Math.max(0, 1 - LABEL_FADE * c), transform: [{ translateY: -LABEL_RISE * c }] };
}

/** The five "chosen" values' icon and label motions — five fixed hooks each, never a loop. */
function useChosenStyles(chosen: SharedValue<number[]>) {
  const i0 = useAnimatedStyle(() => chosenIcon(chosen.value[0] ?? 0));
  const i1 = useAnimatedStyle(() => chosenIcon(chosen.value[1] ?? 0));
  const i2 = useAnimatedStyle(() => chosenIcon(chosen.value[2] ?? 0));
  const i3 = useAnimatedStyle(() => chosenIcon(chosen.value[3] ?? 0));
  const i4 = useAnimatedStyle(() => chosenIcon(chosen.value[4] ?? 0));
  const l0 = useAnimatedStyle(() => chosenLabel(chosen.value[0] ?? 0));
  const l1 = useAnimatedStyle(() => chosenLabel(chosen.value[1] ?? 0));
  const l2 = useAnimatedStyle(() => chosenLabel(chosen.value[2] ?? 0));
  const l3 = useAnimatedStyle(() => chosenLabel(chosen.value[3] ?? 0));
  const l4 = useAnimatedStyle(() => chosenLabel(chosen.value[4] ?? 0));
  return { iconStyles: [i0, i1, i2, i3, i4], labelStyles: [l0, l1, l2, l3, l4] };
}

/** A cut-out's circle, inside its connector. */
function cutStyle(n: Neck | null, sign: 1 | -1) {
  'worklet';
  if (!n) return { width: 0, height: 0 };
  return {
    width: 2 * n.rc,
    height: 2 * n.rc,
    borderRadius: n.rc,
    transform: [{ translateX: n.xc - n.rc - n.x0 }, { translateY: n.top + sign * n.yo - n.rc }],
  };
}

/** The pill's ground and grey row inside a cut-out, laid back onto the pill. */
function cutInnerStyle(n: Neck | null, sign: 1 | -1) {
  'worklet';
  return n ? { transform: [{ translateX: -(n.xc - n.rc) }, { translateY: -(MID + sign * n.yo - n.rc) }] } : {};
}

/** A neck's six motions: its connector, the row copy inside it, and its two cut-outs with theirs. */
function useNeckStyles(neck: SharedValue<Neck | null>, shown: SharedValue<number>) {
  const holder = useAnimatedStyle(() => {
    const n = neck.value;
    if (!n) return { opacity: 0, width: 0, height: 0 };
    return {
      opacity: shown.value,
      width: n.x1 - n.x0,
      height: 2 * n.top,
      transform: [{ translateX: n.x0 }, { translateY: MID - n.top }],
    };
  });
  const inner = useAnimatedStyle(() => {
    const n = neck.value;
    return n ? { transform: [{ translateX: -n.x0 }, { translateY: -(MID - n.top) }] } : {};
  });
  const top = useAnimatedStyle(() => cutStyle(neck.value, -1));
  const topInner = useAnimatedStyle(() => cutInnerStyle(neck.value, -1));
  const bottom = useAnimatedStyle(() => cutStyle(neck.value, 1));
  const bottomInner = useAnimatedStyle(() => cutInnerStyle(neck.value, 1));
  return { holder, inner, top, topInner, bottom, bottomInner };
}

export function MeltTabBar(props: MeltTabBarProps) {
  const { tabs, onCreate, state } = props;
  const slots = useMemo(() => meltSlots(tabs, onCreate != null), [tabs, onCreate]);
  const m = useMeltMetrics(slots.length);
  const focused = focusedSlotIndex(state, slots);
  const centres = m.centres;
  const createIndex = slots.findIndex((s) => s.kind === 'create');
  const plusX = createIndex >= 0 ? centres[createIndex] : -1;
  // The tab slots alone, for "the nearest tab" — the + is an action, never a destination.
  const tabSlots = useMemo(() => slots.map((s, i) => (s.kind === 'tab' ? i : -1)).filter((i) => i >= 0), [slots]);
  const tabCentres = useMemo(() => tabSlots.map((i) => centres[i]), [tabSlots, centres]);
  const home = focused >= 0 ? centres[focused] : tabCentres[0];

  // THE STATE THE LOOP STEPS.
  const x0 = useSharedValue(home);
  const x1 = useSharedValue(home);
  const x2 = useSharedValue(home);
  const v0 = useSharedValue(0);
  const v1 = useSharedValue(0);
  const v2 = useSharedValue(0);
  const target = useSharedValue(home);
  const follow = useSharedValue(0);
  const swell = useSharedValue(0);
  const swellV = useSharedValue(0);
  const swellTarget = useSharedValue(0);
  const pull = useSharedValue(0);
  const pullV = useSharedValue(0);
  const pscale = useSharedValue(1);
  const pscaleV = useSharedValue(0);
  const pscaleTarget = useSharedValue(1);
  const joined = useSharedValue(0);
  const shown = useSharedValue(focused >= 0 ? 1 : 0);
  const shownV = useSharedValue(0);
  const shownTarget = useSharedValue(focused >= 0 ? 1 : 0);
  const chosenIdx = useSharedValue(focused);
  const chosen = useSharedValue<number[]>(Array.from({ length: MAX_SLOTS }, (_, i) => (i === focused ? 1 : 0)));
  const chosenV = useSharedValue<number[]>(Array.from({ length: MAX_SLOTS }, () => 0));
  // What the loop derives.
  const leadW = useSharedValue<number>(LEAD);
  const leadH = useSharedValue<number>(LEAD);
  const neck01 = useSharedValue<Neck | null>(null);
  const neck12 = useSharedValue<Neck | null>(null);
  const neckP = useSharedValue<Neck | null>(null);
  // The gesture's own.
  const mode = useSharedValue(0); // 0 idle · 1 a tab touch · 2 the +
  const startX = useSharedValue(0);
  const quiet = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    const dt = Math.min((info.timeSincePreviousFrame ?? 16.7) / 1000, 1 / 30);
    const t = target.value;
    const lead = follow.value === 1 ? SPRINGS.follow : SPRINGS.circles[0];
    let r = springStep(x0.value, v0.value, t, lead[0], lead[1], dt, SUB);
    x0.value = r[0];
    v0.value = r[1];
    r = springStep(x1.value, v1.value, t, SPRINGS.circles[1][0], SPRINGS.circles[1][1], dt, SUB);
    x1.value = r[0];
    v1.value = r[1];
    r = springStep(x2.value, v2.value, t, SPRINGS.circles[2][0], SPRINGS.circles[2][1], dt, SUB);
    x2.value = r[0];
    v2.value = r[1];

    const sw = swellTarget.value === 1 ? SPRINGS.swellIn : SPRINGS.swellOut;
    r = springStep(swell.value, swellV.value, swellTarget.value, sw[0], sw[1], dt, SUB);
    swell.value = r[0];
    swellV.value = r[1];

    r = springStep(shown.value, shownV.value, shownTarget.value, SPRINGS.chosen[0], SPRINGS.chosen[1], dt, SUB);
    shown.value = r[0];
    shownV.value = r[1];

    const cs = chosen.value.slice();
    const cv = chosenV.value.slice();
    let chosenMoving = false;
    for (let i = 0; i < cs.length; i++) {
      const to = i === chosenIdx.value ? 1 : 0;
      const c = springStep(cs[i], cv[i], to, SPRINGS.chosen[0], SPRINGS.chosen[1], dt, SUB);
      cs[i] = c[0];
      cv[i] = c[1];
      if (Math.abs(c[0] - to) > 0.001 || Math.abs(c[1]) > 0.01) chosenMoving = true;
    }
    chosen.value = cs;
    chosenV.value = cv;

    // The lead's shape: stretched by its speed, swollen under a finger.
    const s = stretchOf(v0.value, STRETCH_V, STRETCH_MAX);
    const grow = 1 + SWELL * swell.value;
    const w = LEAD * (1 + s) * grow;
    const h = LEAD * (1 - SQUASH * s) * grow;
    leadW.value = w;
    leadH.value = h;

    // The necks inside the moving bubble — always joined.
    const cap = leadCap(x0.value, w, h, x1.value);
    neck01.value = neckShape(cap.x, cap.r, x1.value, R1, FILLET.chain);
    neck12.value = neckShape(x1.value, R1, x2.value, R2, FILLET.chain);

    // The + joint.
    let pullTo = 0;
    if (plusX >= 0) {
      const px = plusX + pull.value;
      const pr = PLUS_R * pscale.value;
      const face = facingCircle([leadCap(x0.value, w, h, px), { x: x1.value, r: R1 }, { x: x2.value, r: R2 }], px);
      if (face === null) {
        // The + sits inside the bubble's span: its own shape carries it.
        neckP.value = null;
        pullTo = joined.value === 1 ? pull.value : 0;
      } else {
        const gap = plusGap(px, pr, face);
        const rc = plusFillet(gap, joined.value === 1, FILLET, REACH, OVERLAP);
        const neck = neckShape(face.x, face.r, px, pr, rc);
        const step = stepPlusJoin(joined.value === 1, gap, neck, KICKS);
        joined.value = step.joined ? 1 : 0;
        if (step.kick !== 0) pscaleV.value += step.kick;
        neckP.value = step.joined || neck !== null ? neck : null;
        pullTo = step.joined ? PULL * Math.sign(face.x - px) : 0;
      }
      r = springStep(pull.value, pullV.value, pullTo, SPRINGS.plusPull[0], SPRINGS.plusPull[1], dt, SUB);
      pull.value = r[0];
      pullV.value = r[1];
      const ps = pscaleTarget.value < 1 ? SPRINGS.plusPress : SPRINGS.plusScale;
      r = springStep(pscale.value, pscaleV.value, pscaleTarget.value, ps[0], ps[1], dt, SUB);
      pscale.value = r[0];
      pscaleV.value = r[1];
    }

    // Sleep once everything has settled, so an idle bar costs no frames.
    const still =
      mode.value === 0 &&
      !chosenMoving &&
      Math.abs(v0.value) + Math.abs(v1.value) + Math.abs(v2.value) < 0.3 &&
      Math.abs(x0.value - t) + Math.abs(x1.value - t) + Math.abs(x2.value - t) < 0.15 &&
      Math.abs(swell.value - swellTarget.value) < 0.001 &&
      Math.abs(shown.value - shownTarget.value) < 0.001 &&
      Math.abs(pull.value - pullTo) < 0.01 &&
      Math.abs(pullV.value) < 0.05 &&
      Math.abs(pscale.value - pscaleTarget.value) < 0.001 &&
      Math.abs(pscaleV.value) < 0.01;
    quiet.value = still ? quiet.value + 1 : 0;
    if (quiet.value === QUIET_FRAMES) runOnJS(sleep)();
  }, false);

  function sleep() {
    frame.setActive(false);
  }
  const wake = useCallback(() => {
    quiet.value = 0;
    if (!frame.isActive) frame.setActive(true);
  }, [frame, quiet]);

  // THE TAB FOLLOWS NAVIGATION: a route change (a tap, a notification, the + sheet's My jobs) moves
  // the bubble to its tab, or hides it while a route the bar does not draw is focused.
  const placed = useRef(false);
  useEffect(() => {
    if (mode.value === 1) return;
    if (!placed.current) {
      placed.current = true;
      x0.value = x1.value = x2.value = target.value = home;
      shown.value = shownTarget.value = focused >= 0 ? 1 : 0;
      chosenIdx.value = focused;
      chosen.value = Array.from({ length: MAX_SLOTS }, (_, i) => (i === focused ? 1 : 0));
      return;
    }
    target.value = home;
    chosenIdx.value = focused;
    shownTarget.value = focused >= 0 ? 1 : 0;
    wake();
  }, [home, focused, wake, mode, x0, x1, x2, target, shown, shownTarget, chosenIdx, chosen]);

  // JS entry points, reached only on release.
  const live = useRef({ props, slots });
  live.current = { props, slots };
  const select = useCallback((slot: number) => {
    const s: MeltSlot | undefined = live.current.slots[slot];
    if (s && s.kind === 'tab') pressTab(live.current.props, s.key);
  }, []);
  const create = useCallback(() => pressCreate(live.current.props.onCreate), []);

  const pan = useMemo(() => {
    const first = tabCentres[0];
    const last = tabCentres[tabCentres.length - 1];
    const nearestTab = (x: number) => {
      'worklet';
      let best = 0;
      for (let i = 1; i < tabCentres.length; i++) {
        if (Math.abs(tabCentres[i] - x) < Math.abs(tabCentres[best] - x)) best = i;
      }
      return best;
    };
    const clampX = (x: number) => {
      'worklet';
      return Math.min(last, Math.max(first, x));
    };
    return Gesture.Pan()
      .minDistance(0)
      .onBegin((e) => {
        if (plusX >= 0 && Math.abs(e.x - plusX) <= PLUS_TOUCH && Math.abs(e.y - MID) <= PLUS_TOUCH) {
          mode.value = 2;
          pscaleTarget.value = PRESSED;
          runOnJS(wake)();
          return;
        }
        mode.value = 1;
        startX.value = e.x;
        swellTarget.value = 1;
        target.value = clampX(e.x);
        chosenIdx.value = tabSlots[nearestTab(target.value)];
        shownTarget.value = 1;
        runOnJS(wake)();
      })
      .onUpdate((e) => {
        if (mode.value !== 1) return;
        if (follow.value === 0 && Math.abs(e.x - startX.value) > SLOP) follow.value = 1;
        target.value = clampX(e.x);
        chosenIdx.value = tabSlots[nearestTab(target.value)];
      })
      .onFinalize((e, success) => {
        if (mode.value === 2) {
          pscaleTarget.value = 1;
          if (success && Math.abs(e.x - plusX) <= PLUS_TOUCH) runOnJS(create)();
        } else if (mode.value === 1) {
          follow.value = 0;
          swellTarget.value = 0;
          const n = nearestTab(target.value);
          target.value = tabCentres[n];
          chosenIdx.value = tabSlots[n];
          if (success) runOnJS(select)(tabSlots[n]);
        }
        mode.value = 0;
      });
  }, [tabCentres, tabSlots, plusX, mode, pscaleTarget, startX, swellTarget, target, chosenIdx, shownTarget, follow, wake, create, select]);

  // THE PIECES' MOTIONS — each only reads what the loop wrote.
  const { iconStyles, labelStyles } = useChosenStyles(chosen);
  const leadStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    width: leadW.value,
    height: leadH.value,
    borderRadius: leadH.value / 2,
    transform: [{ translateX: x0.value - leadW.value / 2 }, { translateY: MID - leadH.value / 2 }],
  }));
  const leadInner = useAnimatedStyle(() => ({
    transform: [{ translateX: -(x0.value - leadW.value / 2) }, { translateY: -(MID - leadH.value / 2) }],
  }));
  const midStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: x1.value - R1 }, { translateY: MID - R1 }] }));
  const midInner = useAnimatedStyle(() => ({ transform: [{ translateX: -(x1.value - R1) }, { translateY: -(MID - R1) }] }));
  const tailStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: x2.value - R2 }, { translateY: MID - R2 }] }));
  const tailInner = useAnimatedStyle(() => ({ transform: [{ translateX: -(x2.value - R2) }, { translateY: -(MID - R2) }] }));
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pull.value }, { scale: pscale.value }] }));
  const necks = [useNeckStyles(neck01, shown), useNeckStyles(neck12, shown), useNeckStyles(neckP, shown)];

  const ground = pillGround(m.isDark);
  const styles = stylesFor();
  const shared = meltStyles();
  const row = (variant: 'rest' | 'ink') => (
    <MeltRow
      slots={slots}
      centres={centres}
      width={m.pillWidth}
      variant={variant}
      color={variant === 'ink' ? m.ink : m.rest}
      AView={Animated.View}
      AText={Animated.Text}
      iconStyles={iconStyles}
      labelStyles={labelStyles}
    />
  );
  const inkCopy = (style: object) => (
    <Animated.View style={[shared.layer, { width: m.pillWidth }, style]}>{row('ink')}</Animated.View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: m.bottom + meltBar.height }]}>
      <GestureDetector gesture={pan}>
        <View style={pillStyle(m.isDark, m.pillWidth, m.bottom)}>
          {row('rest')}
          {necks.map((n, i) => (
                <Animated.View key={i} pointerEvents="none" style={[shared.clip, { backgroundColor: m.bubble }, n.holder]}>
                  {inkCopy(n.inner)}
                  {[
                    [n.top, n.topInner],
                    [n.bottom, n.bottomInner],
                  ].map(([cut, cutInner], k) => (
                    <Animated.View key={k} style={[shared.clip, cut]}>
                      <Animated.View style={[shared.layer, { width: m.pillWidth }, ground, cutInner]}>{row('rest')}</Animated.View>
                    </Animated.View>
                  ))}
                </Animated.View>
              ))}
          <Animated.View pointerEvents="none" style={[shared.clip, styles.tail, { backgroundColor: m.bubble }, tailStyle]}>
            {inkCopy(tailInner)}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[shared.clip, styles.middle, { backgroundColor: m.bubble }, midStyle]}>
            {inkCopy(midInner)}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[shared.clip, { backgroundColor: m.bubble }, leadStyle]}>
            {inkCopy(leadInner)}
          </Animated.View>
          {plusX >= 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.plus, { left: plusX - PLUS_R, backgroundColor: m.bubble }, plusStyle]}
            >
              <PlusGlyph color={m.ink} />
            </Animated.View>
          ) : null}
          <MeltTouchLayer
            slots={slots}
            centres={centres}
            focused={focused}
            pressable={false}
            onTab={(name) => pressTab(props, name)}
            onCreate={onCreate}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  middle: { width: MIDDLE, height: MIDDLE, borderRadius: R1 },
  tail: { width: TAIL, height: TAIL, borderRadius: R2 },
  plus: {
    position: 'absolute',
    top: MID - PLUS_R,
    width: meltBar.plus,
    height: meltBar.plus,
    borderRadius: PLUS_R,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
