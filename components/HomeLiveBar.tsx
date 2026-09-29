import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LiveJobStatus, LiveTone } from '../lib/liveJobStatus';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { Surface } from '../ui/primitives/Surface';
import { LiveDot } from './LiveDot';

/** The bar's own geometry, from refs/home-tucked-in.html `.livebar`. */
const BAR_HEIGHT = 54;

export function toneColor(colors: ColorPalette, tone: LiveTone): string {
  return tone === 'progress' ? colors.stageProgress : tone === 'review' ? colors.stageReview : colors.stageAssigned;
}

/**
 * 2026-09-28 (LUX-LIST-64 #62, option B "Tucked in") — THE CUSTOMER HOME'S LIVE
 * BAR, above the task card and ONLY while a job is underway: a Sonar dot in the
 * stage's colour (gold while assigned, orange while in progress, lavender when
 * the work waits for review), the status ("On the way · 6–8 PM" — the booked
 * window until a live location gives "about 12 min" —, "Arrived · 9:02 AM",
 * "Working · on the job", "Done · check the work": lib/liveJobStatus.ts, which
 * never invents an ETA or a task count), and "Message Sam ›",
 * which opens the chat. A slim glass pill: 54 tall, fully round, the card's own
 * material so it lifts like every card. The rest of the bar opens the job.
 */
export function HomeLiveBar({
  status,
  workerFirstName,
  onOpen,
  onMessage,
}: {
  status: LiveJobStatus;
  workerFirstName: string | null;
  onOpen: () => void;
  onMessage: () => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // The page's link green: the mint in dark, the light token in light.
  const link = colors.emerald;
  return (
    <Surface
      material="card"
      radius={BAR_HEIGHT / 2}
      corners="all"
      style={styles.bar}
    >
      <Pressable
        onPress={onOpen}
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={`${status.head}, ${status.detail}. Open the job`}
      >
        <LiveDot color={toneColor(colors, status.tone)} size={9} motion="sonar" />
        <Text style={styles.line} numberOfLines={1}>
          <Text style={styles.head}>{status.head}</Text> · {status.detail}
        </Text>
      </Pressable>
      <Pressable
        onPress={onMessage}
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
        accessibilityRole="button"
        accessibilityLabel={workerFirstName ? `Message ${workerFirstName}` : 'Message your worker'}
      >
        <Text style={[styles.linkText, { color: link }]} numberOfLines={1}>
          {workerFirstName ? `Message ${workerFirstName}` : 'Message'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={link} />
      </Pressable>
    </Surface>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    bar: {
      height: BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 20,
      paddingRight: spacing.lg,
      gap: spacing.md,
    },
    body: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    line: {
      flex: 1,
      fontSize: 14,
      lineHeight: 18,
      color: colors.textMuted,
    },
    head: {
      color: colors.text,
      fontWeight: '700',
    },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      minHeight: 44,
    },
    linkPressed: {
      opacity: 0.75,
    },
    linkText: {
      fontSize: 14,
      fontWeight: '700',
    },
  })
);
