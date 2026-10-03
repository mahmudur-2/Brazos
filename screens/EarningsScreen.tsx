import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { useMode } from '../modes/ModeProvider';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { payoutSetupNotice, payoutsCta, workerTakeCents, type PayoutsStatus } from '../lib/payments';
import { fetchMyPayoutsStatus } from '../lib/payments/stripe';
import { deriveEarnings, fetchMyEarnings, type EarningsSummary } from '../lib/earnings';
import { earningsRowMeta } from '../lib/earningsCopy';
import { releaseCountdownLabel, releaseDeadlineMs } from '../lib/jobLifecycle';
import { formatBudget } from '../lib/jobs';
import type { ProfileStackNavigation } from '../lib/navigation';
import { formatTimeAgo } from '../lib/time';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  litCardStyle,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screens 59 + 60 (Phase 11, consolidated) — the worker's wallet and the
 * per-job breakdown, every figure DERIVED from payments rows on each focus
 * (§G: no hand-kept balance anywhere). The three buckets are the §H.3
 * vocabulary: held = pending approval, released = available, paid_out =
 * transferred — by the SIMULATED cash-out in sandbox mode, by the provider's
 * own transfer on the card path — and the screen says "sandbox" wherever
 * money could be misread as real, and only there (D16).
 *
 * The fee figure is the ledger's sum of platform_fee_cents, nothing else
 * (D10): no rate lives on the client any more.
 */
export function EarningsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const navigation = useNavigation<ProfileStackNavigation>();
  // #63 (M-14): a ledger row opens its job — the worker's job screen, which
  // lives in worker mode, so the rows open there and stay plain otherwise.
  const { mode } = useMode();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmCashOut, setConfirmCashOut] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  // R6c (D1): the stored payout state, read on the card path only, so the
  // entry below can say where setup stands. A failed read is null — the
  // entry then just says "Payouts"; it never guesses a state.
  const [payouts, setPayouts] = useState<PayoutsStatus | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const { data, error } = await fetchMyEarnings(user.id);
    if (error) setLoadError(userMessage(error));
    else setSummary(data);
    if (paymentsMode === 'stripe') {
      const payoutsRes = await fetchMyPayoutsStatus();
      setPayouts(payoutsRes.data);
    }
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
        paymentsMode === 'sandbox' ? 'Test cash-out complete' : 'Cash-out complete',
        data.length === 0
          ? 'Nothing was available to cash out.'
          : paymentsMode === 'sandbox'
            ? `${data.length} ${data.length === 1 ? 'payment' : 'payments'} moved to Transferred. Test mode — no real transfer exists.`
            : `${data.length} ${data.length === 1 ? 'payment' : 'payments'} moved to Transferred.`
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
  // R6c (D7): every figure a worker reads as "yours" is the take —
  // amount_cents − platform_fee_cents through the one helper — bucketed by
  // the same deriveEarnings the ledger read uses, so there is still one
  // bucketing rule. Sandbox rows carry a zero fee, so no sandbox figure
  // changes; the fee card below still sums the fees themselves.
  const take = s
    ? deriveEarnings(s.rows.map((row) => ({ ...row, amount_cents: workerTakeCents(row) })))
    : null;
  // One clock reading per load, so every ledger line below is measured
  // against the same instant rather than each drifting on its own render.
  const nowMs = useMemo(() => Date.now(), [summary]);

  return (
    <>
      <DetailScreen
        title="Earnings & Payouts"
        subtitle={
          paymentsMode === 'sandbox'
            ? 'Test mode — no real money'
            : 'What you’ve earned, what’s held, what’s been paid'
        }
        onBack={goBackOrHome}
        state={state}
        sections={
          !s || !take
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
                        cents={take.pendingCents}
                        note="Held in protection"
                      />
                      <Bucket
                        label="AVAILABLE"
                        icon="wallet-outline"
                        cents={take.availableCents}
                        note="Released to you"
                      />
                      <Bucket
                        label="TRANSFERRED"
                        icon="arrow-up-circle-outline"
                        cents={take.transferredCents}
                        note={paymentsMode === 'sandbox' ? 'Test cash-outs' : 'Transferred to you'}
                      />
                    </View>
                  ),
                },
                {
                  content: (
                    <View style={[styles.feeCard, litCardStyle(isDark)]}>
                      <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
                      <Text style={styles.feeText}>
                        Protection fees on these jobs: {formatBudget(s.feeCents)}.
                      </Text>
                    </View>
                  ),
                },
                {
                  title: 'Ledger',
                  titleTone: 'gold',
                  content:
                    s.rows.length === 0 ? (
                      <Text style={styles.emptyText}>
                        Nothing yet — finish a job and get approved, and the
                        payment appears here.
                      </Text>
                    ) : (
                      <View style={styles.list}>
                        {s.rows.map((row) => (
                          <Pressable
                            key={row.id}
                            onPress={
                              mode === 'worker' && row.job_id
                                ? () => navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: row.job_id })
                                : undefined
                            }
                            disabled={!(mode === 'worker' && row.job_id)}
                            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                            accessibilityRole={mode === 'worker' && row.job_id ? 'button' : undefined}
                          >
                            <View style={styles.rowCopy}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {row.kind === 'tip' ? 'Tip — ' : ''}
                                {row.job_title ?? 'Job'}
                              </Text>
                              <Text style={styles.rowMeta}>
                                {/* a6: one sentence per payment state, from
                                    lib/earningsCopy.ts — the release clock and
                                    the relative times are the app's own single
                                    implementations, injected. */}
                                {earningsRowMeta(
                                  {
                                    status: row.status,
                                    provider: row.provider,
                                    release_requested_at: row.release_requested_at,
                                    release_reason: row.release_reason,
                                    released_at: row.released_at,
                                    paid_out_at: row.paid_out_at,
                                    releaseDeadlineMs: releaseDeadlineMs({
                                      completed_at: row.job_completed_at ?? null,
                                    }),
                                    waitingOnPayoutSetup: payoutSetupNotice(payouts, [row]) !== null,
                                  },
                                  nowMs,
                                  { countdown: releaseCountdownLabel, timeAgo: formatTimeAgo }
                                )}
                              </Text>
                            </View>
                            <MoneyText cents={workerTakeCents(row)} state={row.status} captionHidden />
                            {mode === 'worker' && row.job_id ? (
                              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    ),
                },
              ]
        }
        actionBar={
          // D19: the cash-out control exists in sandbox mode only. On the card
          // path payouts arrive on the provider's own schedule once payout
          // setup is complete — there is nothing for the worker to trigger.
          s && paymentsMode === 'sandbox' ? (
            <Button
              title={
                s.availableCents > 0
                  ? `Cash out ${formatBudget(s.availableCents)} (test)`
                  : 'Nothing available to cash out'
              }
              onPress={() => setConfirmCashOut(true)}
              disabled={s.availableCents === 0 || cashingOut}
              loading={cashingOut}
            />
          ) : s && paymentsMode === 'stripe' ? (
            // R6c (D1): the card path has no cash-out, so this slot leads to
            // the payout state instead — titled by the stored status when it
            // was readable (the same status → CTA mapping the screen uses).
            <Button
              title={payouts ? payoutsCta(payouts).cta ?? payoutsCta(payouts).headline : 'Payouts'}
              variant={payouts && payoutsCta(payouts).cta ? 'primary' : 'secondary'}
              icon="chevron-forward"
              onPress={() => navigation.navigate('Payouts')}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        visible={confirmCashOut}
        title={`Cash out ${formatBudget(s?.availableCents ?? 0)}?`}
        message={
          paymentsMode === 'sandbox'
            ? 'This is a test cash-out: your released payments move to Transferred. Test mode — no bank is connected and no real money moves.'
            : 'Payouts arrive on the provider’s own schedule once payout setup is complete — there is nothing to trigger here.'
        }
        confirmText={paymentsMode === 'sandbox' ? 'Cash out (test)' : 'Cash out'}
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
    color: colors.eyebrow,
    letterSpacing: 1.1,
  },
  bucketAmount: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '800',
    color: colors.money,
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
  rowPressed: {
    opacity: 0.7,
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
