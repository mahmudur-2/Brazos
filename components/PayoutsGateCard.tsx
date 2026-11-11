import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { paymentsMode } from '../lib/adapters/payments';
import type { PayoutsStatus } from '../lib/payments';
import { fetchMyPayoutsStatus, refreshPayoutsStatus } from '../lib/payments/stripe';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { payoutsGateCard, payoutsGateRefreshes } from '../lib/offerCopy';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * B11 (docs/critical/job-lifecycle.md): the worker learns he cannot send, counter or accept an offer
 * before he tries. The server refuses either way (20261112040000_payouts_gate.sql).
 *
 * The stored payout state, read the way PayoutsScreen reads it: my_payouts_status() on every focus
 * (card path only). When an account exists but is not on (payoutsGateRefreshes), PayoutsScreen's
 * own refresh runs once per mount: connect-status, then the re-read, so a worker who has just
 * finished set-up is not held back by a stale row. A failed read or refresh is null: today's buttons.
 */
export function useMyPayoutsGate(active: boolean): PayoutsStatus | null {
  const [status, setStatus] = useState<PayoutsStatus | null>(null);
  const refreshedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!active || paymentsMode !== 'stripe') return;
      void (async () => {
        let next = (await fetchMyPayoutsStatus()).data;
        if (live && !refreshedRef.current && payoutsGateRefreshes(next)) {
          refreshedRef.current = true;
          const refreshed = await refreshPayoutsStatus();
          next = refreshed.error ? null : (await fetchMyPayoutsStatus()).data;
        }
        if (live) setStatus(next);
      })();
      return () => {
        live = false;
      };
    }, [active])
  );
  return status;
}

/** The card itself: nothing when payoutsGateCard() says the buttons stay. `framed` draws it as a
 *  Card of its own (a chat row); without it, it sits inside the surface that holds it (the bid bar,
 *  the respond card). */
export function PayoutsGateCard({ status, framed = false }: { status: PayoutsStatus | null; framed?: boolean }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const view = payoutsGateCard(status);
  if (!view) return null;
  const content = (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name={view.cta ? 'wallet-outline' : 'time-outline'} size={20} color={colors.emerald} />
        <View style={styles.copy}>
          {view.title ? <Text style={styles.title}>{view.title}</Text> : null}
          <Text style={styles.body}>{view.body}</Text>
        </View>
      </View>
      {view.cta ? (
        <Button title={view.cta} onPress={() => navigateAcrossTabs('Profile', 'Payouts', {})} />
      ) : null}
    </View>
  );
  return framed ? <Card>{content}</Card> : content;
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    copy: {
      flex: 1,
      gap: spacing.xs,
    },
    title: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.ink,
    },
    body: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
    },
  })
);
