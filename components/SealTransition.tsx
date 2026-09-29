import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DrawnCheck } from './DrawnCheck';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/** The circle Publish becomes — the bar's own button height. */
const SEAL = 52;
/** The spinner ring around it (refs/publish-moment.html `.seal-ring`, 70). */
const RING = 66;

export type SealPhase = 'saving' | 'saved' | 'failed';
export type SealFrom = { x: number; y: number; width: number; height: number };

/**
 * 2026-09-28 (LUX-LIST-64 #42) — PUBLISH → JOB LIVE, transition C "Seal"
 * (refs/publish-moment.html): the Publish pill shrinks to a 52 circle and moves
 * to the middle; a ring turns around it WHILE the job saves — the real network
 * wait, as long as it takes; only when the server has confirmed does the circle
 * light and its tick draw; then the live page opens as a circle from the tick.
 * A failed save undoes the seal and hands back to the bar. Every move is a
 * transform or an opacity on the native driver. The caller skips this for
 * Reduce Motion (a short fade instead).
 *
 * The pill is drawn as two round caps and a middle that shrinks — the union of
 * which is always a stadium — so the shape stays round-ended at every frame
 * without animating a width.
 */
export function SealTransition({
  from,
  phase,
  onOpened,
  onUndone,
}: {
  from: SealFrom;
  phase: SealPhase;
  /** The reveal has covered the screen: show the live page. */
  onOpened: () => void;
  /** A failed save has undone the seal: give the bar back. */
  onUndone: () => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const shrink = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const lit = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const tick = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const gone = useRef(new Animated.Value(1)).current;
  const [revealing, setRevealing] = useState(false);

  // The pill's centre, and where the circle settles: the middle of the bar row.
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const travel = screenW / 2 - cx;
  const cap = (from.width - SEAL) / 2;
  // The reveal circle reaches the screen's farthest corner from the tick.
  const reach = 2 * Math.hypot(Math.max(screenW / 2, screenW / 2), Math.max(cy, screenH - cy));

  // Shrink, then turn the ring for as long as the save takes.
  useEffect(() => {
    Animated.timing(shrink, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }).start();
    Animated.sequence([
      Animated.delay(220),
      Animated.parallel([
        Animated.timing(ring, { toValue: 1, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(lit, { toValue: 0, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    ]).start();
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [lit, ring, shrink, spin]);

  useEffect(() => {
    if (phase === 'saved') {
      // Confirmed: the ring goes, the circle lights with a small pop, the tick
      // draws — and only then does the live page open from it.
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ring, { toValue: 0, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(lit, { toValue: 1, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.sequence([
            Animated.timing(pop, { toValue: 1.1, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(pop, { toValue: 1, duration: 160, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
        ]),
        Animated.timing(tick, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.delay(160),
      ]).start(({ finished }) => {
        if (!finished) return;
        setRevealing(true);
        Animated.timing(reveal, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }).start(
          ({ finished: done }) => {
            if (done) onOpened();
          }
        );
      });
    }
    if (phase === 'failed') {
      Animated.timing(gone, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }).start(() => onUndone());
    }
    // The callbacks are the screen's; the phase is what moves this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const toCentre = shrink.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View
        style={[
          styles.pill,
          { left: from.x, top: from.y + (from.height - SEAL) / 2, width: from.width, opacity: gone },
          { transform: [{ translateX: toCentre }, { scale: pop }] },
        ]}
      >
        {/* The middle, shrinking to nothing, and the two caps closing on the centre. */}
        <Animated.View
          style={[
            styles.middle,
            { left: SEAL / 2, right: SEAL / 2, transform: [{ scaleX: shrink.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }] },
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.deep]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.mint, { opacity: lit }]} />
        </Animated.View>
        {[0, 1].map((side) => (
          <Animated.View
            key={side}
            style={[
              styles.cap,
              side === 0 ? { left: 0 } : { right: 0 },
              {
                transform: [
                  { translateX: shrink.interpolate({ inputRange: [0, 1], outputRange: [0, side === 0 ? cap : -cap] }) },
                ],
              },
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, styles.capFill, styles.deep]} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.capFill, styles.mint, { opacity: lit }]} />
          </Animated.View>
        ))}
        <View style={styles.centre} pointerEvents="none">
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: ring,
                transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
              },
            ]}
          />
          <DrawnCheck size={26} color={colors.publishInk} progress={tick} />
        </View>
      </Animated.View>
      {revealing ? (
        <Animated.View
          style={[
            styles.reveal,
            {
              width: reach,
              height: reach,
              borderRadius: reach / 2,
              left: screenW / 2 - reach / 2,
              top: cy - reach / 2,
              transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [SEAL / reach, 1] }) }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    pill: {
      position: 'absolute',
      height: SEAL,
    },
    middle: {
      position: 'absolute',
      top: 0,
      bottom: 0,
    },
    cap: {
      position: 'absolute',
      top: 0,
      width: SEAL,
      height: SEAL,
    },
    capFill: {
      borderRadius: SEAL / 2,
    },
    mint: {
      backgroundColor: colors.primary,
    },
    // While the job saves, the circle sinks to the deep green the waiting
    // primary wears; it lights again only on the server's word.
    deep: {
      backgroundColor: colors.waitingFill,
    },
    centre: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      position: 'absolute',
      width: RING,
      height: RING,
      borderRadius: RING / 2,
      borderWidth: 3,
      borderColor: withAlpha(colors.emerald, 0.2),
      borderTopColor: colors.emerald,
    },
    reveal: {
      position: 'absolute',
      backgroundColor: colors.background,
    },
  })
);
