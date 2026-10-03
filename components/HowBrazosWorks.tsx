import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EYEBROW_TYPE, spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/** Per account: one person closing the card never hides it from another. */
export function howItWorksDismissedKey(userId: string): string {
  return `brazos:homeTeach:dismissed:v1:${userId}`;
}

/**
 * 2026-09-28 (LUX-LIST-64 #16) — HOW BRAZOS WORKS, for a new customer only.
 *
 * sim.html's teaching card (l.1527–1530: padding 16/18, the title 16 bold, the
 * body 14/19, a 32 round close) with the operator's own words, under POPULAR
 * SERVICES and above NEEDS YOUR ATTENTION, the gold eyebrow kept. It shows from
 * the moment setup is done until the customer closes it OR posts a first job
 * (sim's own rule: the caller passes `hasPosted`); the close is remembered per
 * account on the device. It says only what the product does: posting is free,
 * the payment is held until the customer approves, the fee is shown first.
 */
export function HowBrazosWorks({ userId, hasPosted }: { userId: string | undefined; hasPosted: boolean }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // Unknown until the device answers, and unknown draws nothing — the card
  // must never flash up for someone who closed it.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setDismissed(null);
      return;
    }
    AsyncStorage.getItem(howItWorksDismissedKey(userId))
      .then((value) => {
        if (active) setDismissed(value === '1');
      })
      .catch(() => {
        if (active) setDismissed(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!userId || hasPosted || dismissed !== false) return null;

  function close() {
    setDismissed(true);
    if (userId) void AsyncStorage.setItem(howItWorksDismissedKey(userId), '1').catch(() => {});
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>How Brazos works</Text>
      <Card style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>Post free. Get bids. Pay only when you hire.</Text>
          <Text style={styles.body}>
            When you hire, we hold your payment safely. The worker gets it only after you approve the job.
            You’ll see the protection fee before you pay.
          </Text>
        </View>
        <Pressable
          onPress={close}
          hitSlop={6}
          style={({ pressed }) => [
            styles.close,
            {
              backgroundColor: isDark ? withAlpha(colors.background, 0.6) : colors.background,
              borderColor: isDark ? withAlpha(colors.emerald, 0.18) : colors.border,
            },
            pressed && styles.closePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Dismiss how Brazos works"
        >
          <Ionicons name="close" size={16} color={colors.text} />
        </Pressable>
      </Card>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    section: {
      gap: spacing.md,
    },
    eyebrow: {
      ...EYEBROW_TYPE,
      color: colors.eyebrowGold, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      paddingVertical: spacing.lg,
      paddingHorizontal: 18,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: spacing.sm,
    },
    title: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color: colors.ink,
    },
    body: {
      fontSize: 14,
      lineHeight: 19,
      color: colors.textMuted,
    },
    close: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closePressed: {
      transform: [{ scale: 0.94 }],
    },
  })
);
