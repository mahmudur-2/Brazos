import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { LIVE_RAIL_STEPS, type LiveJobStatus } from '../lib/liveJobStatus';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { LiveDot } from './LiveDot';

/** The shimmer's lap across the current step (refs/live-job-cards.html `shim`). */
const SHIMMER_MS = 1600;
const SHIMMER_WIDTH = 28;

/**
 * 2026-09-28 (LUX-LIST-64 #45, option A "Stage rail", refs/live-job-cards.html) —
 * where an assigned job stands, on its card, without opening it: four bars
 * (Hired · On the way · Working · Done) whose current step fills with a moving
 * sheen, the four words under them, and ONE status line — a live dot while
 * someone is on the way or working, the stage in bold, then what the job itself
 * says ("booked 6–8 PM", "Arrived · 9:02 AM") — and the chat button, since
 * messaging opens the moment someone is hired. The words come from
 * lib/liveJobStatus.ts, never from here. The sheen is a transform on the native
 * driver; Reduce Motion: the bar holds still.
 */
export function StageRail({ status, onChat, chatLabel }: { status: LiveJobStatus; onChat?: () => void; chatLabel?: string }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.block}>
      <View style={styles.rail}>
        {status.fills.map((fill, index) => (
          <RailBar key={LIVE_RAIL_STEPS[index]} fill={fill} current={index === status.step} />
        ))}
      </View>
      <View style={styles.rail}>
        {LIVE_RAIL_STEPS.map((label, index) => (
          <Text
            key={label}
            numberOfLines={1}
            style={[
              styles.label,
              index < status.step && styles.labelDone,
              index === status.step && styles.labelCurrent,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.statusRow}>
        {status.live ? <LiveDot color={colors.emerald} size={8} motion="pulse" /> : null}
        <Text style={styles.line} numberOfLines={1}>
          <Text style={styles.lineHead}>{status.head}</Text> · {status.detail}
        </Text>
        {onChat ? (
          <Pressable
            onPress={onChat}
            hitSlop={5}
            style={({ pressed }) => [styles.chat, pressed && styles.chatPressed]}
            accessibilityRole="button"
            accessibilityLabel={chatLabel ?? 'Message'}
          >
            <Ionicons name="chatbubble-outline" size={17} color={colors.emerald} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function RailBar({ fill, current }: { fill: number; current: boolean }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const lap = useRef(new Animated.Value(0)).current;
  const shimmering = current && fill > 0 && reducedMotion === false && width > 0;

  useEffect(() => {
    lap.setValue(0);
    if (!shimmering) return;
    const loop = Animated.loop(
      Animated.timing(lap, { toValue: 1, duration: SHIMMER_MS, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [lap, shimmering]);

  const filled = Math.max(0, Math.min(1, fill)) * width;
  const sheen = `linear-gradient(90deg, ${withAlpha(colors.white, 0)} 0%, ${withAlpha(colors.white, 0.55)} 50%, ${withAlpha(colors.white, 0)} 100%)`;
  const sheenStyle: ViewStyle =
    Platform.OS === 'web'
      ? ({ backgroundImage: sheen } as unknown as ViewStyle)
      : ({ experimental_backgroundImage: sheen } as ViewStyle);

  return (
    <View style={styles.bar} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.fill, { width: filled }]}>
        {shimmering ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sheen,
              sheenStyle,
              {
                transform: [
                  { translateX: lap.interpolate({ inputRange: [0, 1], outputRange: [-SHIMMER_WIDTH, Math.max(filled, 1)] }) },
                ],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    block: {
      gap: 6,
    },
    rail: {
      flexDirection: 'row',
      gap: 5,
    },
    bar: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.mint,
    },
    fill: {
      height: '100%',
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.emerald,
    },
    sheen: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: SHIMMER_WIDTH,
    },
    label: {
      flex: 1,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSubtle,
    },
    labelDone: {
      color: colors.textMuted,
    },
    labelCurrent: {
      color: colors.text,
      fontWeight: '700',
    },
    statusRow: {
      marginTop: spacing.xs,
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    line: {
      flex: 1,
      fontSize: 14,
      lineHeight: 18,
      color: colors.textMuted,
    },
    lineHead: {
      color: colors.text,
      fontWeight: '700',
    },
    // The reference's 34pt message disc, inside a 44pt target (hitSlop 5).
    chat: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.emerald, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.emerald, 0.3),
    },
    chatPressed: {
      transform: [{ scale: 0.94 }],
    },
  })
);
