import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { seriesLine, type JobSeries } from '../lib/repeatJobs';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * 2026-09-30 (the build run, idea 14) — A VISIT OF A REPEATING JOB says so, on both people's job
 * screens: the repeat glyph in the logistics ring, the one line (lib/repeatJobs.ts seriesLine) and the
 * one thing each of them can do — the customer "Stop repeating", the series' worker "Drop future
 * visits". The screen owns the confirm and the call; this row only asks. A stopped series is said
 * once, with nothing to press.
 */
export function RepeatNote({
  series,
  perspective,
  busy = false,
  onEnd,
}: {
  series: JobSeries;
  perspective: 'customer' | 'worker';
  busy?: boolean;
  onEnd?: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const active = series.status === 'active';
  const action = perspective === 'customer' ? 'Stop repeating' : 'Drop future visits';
  const line = seriesLine(series, perspective);
  return (
    <View style={styles.row}>
      <View style={[styles.glyph, isDark && styles.glyphDark]}>
        <Ionicons name="repeat-outline" size={17} color={isDark ? colors.gold : colors.emerald} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.text, !active && styles.textStopped]}>{line.title}</Text>
        {line.caption ? <Text style={styles.caption}>{line.caption}</Text> : null}
        {active && onEnd ? (
          <Pressable
            onPress={onEnd}
            disabled={busy}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={action}
            accessibilityState={{ disabled: busy, busy }}
          >
            {busy ? <ActivityIndicator size="small" color={colors.emerald} /> : <Text style={styles.actionText}>{action}</Text>}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // The logistics row's own shape (ClientJobDetail's TIMING & ADDRESS), so the note sits among them.
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    glyph: {
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    glyphDark: {
      borderColor: colors.gold,
    },
    copy: {
      flex: 1,
      gap: 2,
    },
    text: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.ink,
      lineHeight: 21,
    },
    textStopped: {
      color: colors.textMuted,
    },
    // The address row's own caption (ClientJobDetail's TIMING & ADDRESS).
    caption: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    action: {
      alignSelf: 'flex-start',
      minHeight: 20,
      justifyContent: 'center',
      marginTop: 2,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.emerald,
    },
    pressed: {
      opacity: 0.6,
    },
  })
);
