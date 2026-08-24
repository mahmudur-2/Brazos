import { useCallback, useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { PLATFORM_FEE_RATE } from '../lib/payments';
import { fetchMyEarnings, type EarningsSummary } from '../lib/earnings';
import { formatBudget } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screens 59 + 60 (Phase 11, consolidated) — the worker's wallet and the
 * per-job breakdown, every figure DERIVED from payments rows on each focus
 * (§G: no hand-kept balance anywhere). The three buckets are the §H.3
 * vocabulary: held = pending approval, released = available, paid_out =
 * transferred by the SIMULATED cash-out — and the screen says "sandbox"
 * wherever money could be misread as real.
 */
export function EarningsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmCashOut, setConfirmCashOut] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const { data, error } = await fetchMyEarnings(user.id);
    if (error) setLoadError(userMessage(error));
    else setSummary(data);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function cashOut() {
    if (cashingOut) return;
    setCashingOut(true);
    try {
      const { data, error } = await paymentProvider.cashOut();
      if (error) {
        await alertAsync('Could not cash out', `${userMessage(error)}\n\nNothing moved.`);
        return;
      }
      await load();
      await alertAsync(
        'Simulated cash-out complete',
        data.length === 0
          ? 'Nothing was available to cash out.'
          : `${data.length} ${data.length === 1 ? 'payment' : 'payments'} moved to Transferred. Sandbox build — no real transfer exists.`
      );
    } finally {
      setCashingOut(false);
      setConfirmCashOut(false);
    }
  }

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : loadError
      ? { kind: 'error', message: loadError, onRetry: () => void load() }
      : !summary
        ? { kind: 'loading', variant: 'spinner' }
        : { kind: 'ready' };

  const s = summary;

  return (
    <>
      <DetailScreen
        title="Earnings"
        subtitle="Sandbox — no real money"
        onBack={goBackOrHome}
        state={state}
        sections={
          !s
            ? []
            : [
                {
                  content: (
                    <View style={styles.bucketRow}>
                      {/* Master 25's three stat cards, each led by its own
                          ringed glyph. */}
                      <Bucket
                        label="PENDING"
                        icon="shield-outline"
                        cents={s.pendingCents}
                        note="Held in protection"
                      />
                      <Bucket
                        label="AVAILABLE"
                        icon="wallet-outline"
                        cents={s.availableCents}
                        note="Released to you"
                      />
                      <Bucket
                        label="TRANSFERRED"
                        icon="arrow-up-circle-outline"
                        cents={s.transferredCents}
                        note="Simulated cash-outs"
                      />
                    </View>
                  ),
                },
                {
                  content: (
                    <View style={styles.feeCard}>
                      <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
                      <Text style={styles.feeText}>
                        Platform fees on these rows: {formatBudget(s.feeCents)} — the
                        same {Math.round(PLATFORM_FEE_RATE * 100)}% rate checkout
                        charges and Job details quotes. Every figure here is a sum
                        over the ledger rows below, nothing else.
                      </Text>
                    </View>
                  ),
                },
                {
                  title: 'Ledger',
                  content:
                    s.rows.length === 0 ? (
                      <Text style={styles.emptyText}>
                        Nothing yet — finish a job and get approved, and the
                        payment appears here.
                      </Text>
                    ) : (
                      <View style={styles.list}>
                        {s.rows.map((row) => (
                          <View key={row.id} style={styles.row}>
                            <View style={styles.rowCopy}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {row.kind === 'tip' ? 'Tip — ' : ''}
                                {row.job_title ?? 'Job'}
                              </Text>
                              <Text style={styles.rowMeta}>
                                {row.status === 'held'
                                  ? 'Held in protection'
                                  : row.status === 'released'
                                    ? row.release_reason === 'auto_approved'
                                      ? `Released (auto) ${row.released_at ? formatTimeAgo(row.released_at) : ''}`
                                      : `Released ${row.released_at ? formatTimeAgo(row.released_at) : ''}`
                                    : `Transferred ${row.paid_out_at ? formatTimeAgo(row.paid_out_at) : ''}`}
                              </Text>
                            </View>
                            <MoneyText cents={row.amount_cents} state={row.status} captionHidden />
                          </View>
                        ))}
                      </View>
                    ),
                },
              ]
        }
        actionBar={
          s && paymentsMode === 'sandbox' ? (
            <Button
              title={
                s.availableCents > 0
                  ? `Cash out ${formatBudget(s.availableCents)} (simulated)`
                  : 'Nothing available to cash out'
              }
              onPress={() => setConfirmCashOut(true)}
              disabled={s.availableCents === 0 || cashingOut}
              loading={cashingOut}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        visible={confirmCashOut}
        title={`Cash out ${formatBudget(s?.availableCents ?? 0)}?`}
        message="This SIMULATES a transfer: your released payments move to Transferred in the sandbox ledger. No bank is connected and no real money moves in this build."
        confirmText="Cash out (simulated)"
        cancelText="Not now"
        loading={cashingOut}
        onConfirm={cashOut}
        onCancel={() => setConfirmCashOut(false)}
      />
    </>
  );
}

function Bucket({
  label,
  icon,
  cents,
  note,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  cents: number;
  note: string;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={[styles.bucket, isDark && styles.bucketDark]}>
      <View style={[styles.bucketGlyph, isDark && styles.bucketGlyphDark]}>
        <Ionicons name={icon} size={16} color={isDark ? colors.gold : colors.emerald} />
      </View>
      <Text style={styles.bucketLabel}>{label}</Text>
      <Text style={styles.bucketAmount}>{formatBudget(cents)}</Text>
      <Text style={styles.bucketNote}>{note}</Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  bucketRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bucket: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  // Master 25 draws these as hairlined cards, not a sage wash; light keeps
  // the approved Heritage sage.
  bucketDark: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bucketGlyph: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bucketGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  // Green eyebrows over serif figures — master 25's own pairing, and the
  // eyebrow law's live-state case (these ARE the money states).
  bucketLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.emerald,
    letterSpacing: 1.1,
  },
  bucketAmount: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  bucketNote: {
    fontSize: 10,
    color: colors.textMuted,
  },
  feeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  feeText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  }),
);
