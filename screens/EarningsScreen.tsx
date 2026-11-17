import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { useMode } from '../modes/ModeProvider';
import { paymentsMode } from '../lib/adapters/payments';
import { payoutSetupNotice, payoutsCta, workerTakeCents, type PayoutsStatus } from '../lib/payments';
import { fetchMyPayoutsStatus } from '../lib/payments/stripe';
import { fetchMyEarnings, type EarningsSummary } from '../lib/earnings';
import { workerReceivesCents } from '../lib/earningsMath';
import { earningsRowMeta } from '../lib/earningsCopy';
import { isPayoutOnItsWay } from '../lib/paymentRules';
import { isRefundFailureRecorded, releaseAtLabel, releaseDeadlineMs } from '../lib/jobLifecycle';
import { formatBudget } from '../lib/jobs';
import type { ProfileStackNavigation } from '../lib/navigation';
import { formatTimeAgo } from '../lib/time';
import { serverNowMs } from '../lib/serverClock';
import {
  EYEBROW_TYPE,
  fonts,
  radius,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { titleCase } from '../lib/titleCase';

/**
 * Screens 59 + 60 (Phase 11, consolidated) — the worker's wallet and the
 * per-job breakdown, every figure DERIVED from payments rows on each focus
 * (§G: no hand-kept balance anywhere). The three buckets are the §H.3
 * vocabulary: held = pending approval, released = available, paid_out =
 * transferred by the provider's own transfer on the card path.
 *
 * The fee figure is the ledger's sum of platform_fee_cents, nothing else
 * (D10): no rate lives on the client any more.
 */
export function EarningsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const navigation = useNavigation<ProfileStackNavigation>();
  // #63 (M-14): a ledger row opens its job — the worker's job screen, which
  // lives in worker mode, so the rows open there and stay plain otherwise.
  const { mode } = useMode();

  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : loadError
      ? { kind: 'error', message: loadError, onRetry: () => void load() }
      : !summary
        ? { kind: 'loading', variant: 'spinner' }
        : { kind: 'ready' };

  const s = summary;
  // R6c (D7), B23: every figure a worker reads as "yours" is what the ledger
  // sends them — the take, or on a job sent home only the cancellation fee —
  // through lib/earningsMath.ts workerReceivesCents, which the ledger read
  // already sums into the buckets; the fee card below still sums the fees themselves.
  // One clock reading per load, so every ledger line below is measured
  // against the same instant rather than each drifting on its own render.
  const nowMs = useMemo(() => serverNowMs(), [summary]);

  return (
    <>
      <DetailScreen
        title="Earnings & Payouts"
        subtitle={'What you’ve earned, what’s held, what’s been paid'}
        // M5: one line cut this sentence ("what's bee…"); it takes two.
        subtitleLines={2}
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
                        state="held"
                      />
                      <Bucket
                        label="AVAILABLE"
                        icon="wallet-outline"
                        cents={s.availableCents}
                        note="Released to you"
                        state="released"
                      />
                      <Bucket
                        label="TRANSFERRED"
                        icon="arrow-up-circle-outline"
                        cents={s.transferredCents}
                        note="Transferred to you"
                        state="paid_out"
                      />
                    </View>
                  ),
                },
                {
                  content: (
                    <Card style={styles.feeCard}>
                      <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
                      <Text style={styles.feeText}>
                        Protection fees on these jobs: {formatBudget(s.feeCents)}.
                      </Text>
                    </Card>
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
                      // G2: the ledger is one lit group, a hairline between rows.
                      <Card style={styles.ledger}>
                        {s.rows.map((row, index) => (
                          <Pressable
                            key={row.id}
                            onPress={
                              mode === 'worker' && row.job_id
                                ? () => navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: row.job_id })
                                : undefined
                            }
                            disabled={!(mode === 'worker' && row.job_id)}
                            style={({ pressed }) => [
                              styles.row,
                              index > 0 && styles.rowDivider,
                              pressed && styles.rowPressed,
                            ]}
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
                                    kind: row.kind,
                                    release_requested_at: row.release_requested_at,
                                    release_reason: row.release_reason,
                                    released_at: row.released_at,
                                    paid_out_at: row.paid_out_at,
                                    refund_cents: row.refund_cents,
                                    transfer_cents: row.transfer_cents,
                                    job_status: row.job_status,
                                    // Codex R11-A2: a refund of it failed: no release clock.
                                    releaseDeadlineMs: isRefundFailureRecorded(row)
                                      ? null
                                      : releaseDeadlineMs({ release_due_at: row.job_release_due_at ?? null }),
                                    waitingOnPayoutSetup: payoutSetupNotice(payouts, [row]) !== null,
                                    payoutOnItsWay: isPayoutOnItsWay(row),
                                  },
                                  nowMs,
                                  { countdown: releaseAtLabel, timeAgo: formatTimeAgo }
                                )}
                              </Text>
                            </View>
                            <MoneyText cents={workerReceivesCents(row, workerTakeCents)} state={row.status} captionHidden />
                            {mode === 'worker' && row.job_id ? (
                              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                            ) : null}
                          </Pressable>
                        ))}
                      </Card>
                    ),
                },
              ]
        }
        actionBar={
          // D19: there is no cash-out. Payouts arrive on the provider's own
          // schedule once payout setup is complete — there is nothing for the
          // worker to trigger.
          s && paymentsMode === 'stripe' ? (
            // R6c (D1): this slot leads to the payout state instead — titled
            // by the stored status when it was readable (the same status → CTA
            // mapping the screen uses).
            <Button
              title={payouts ? titleCase(payoutsCta(payouts).cta ?? payoutsCta(payouts).headline) : 'Payouts'}
              variant={payouts && payoutsCta(payouts).cta ? 'primary' : 'secondary'}
              // M5 (T8): a button carries no trailing arrow; the tap is the action.
              onPress={() => navigation.navigate('Payouts')}
            />
          ) : undefined
        }
      />
    </>
  );
}

function Bucket({
  label,
  icon,
  cents,
  note,
  state,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  cents: number;
  note: string;
  /** G2: the bucket's payment state, for the figure's colour only (a waiting figure reads muted); no caption. */
  state: ComponentProps<typeof MoneyText>['state'];
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Card style={styles.bucket}>
      <View style={[styles.bucketGlyph, isDark && styles.bucketGlyphDark]}>
        <Ionicons name={icon} size={16} color={isDark ? colors.gold : colors.emerald} />
      </View>
      {/* Fix run D7 review: the one eyebrow measure (12 / 1.5) is wider than a third of the
          phone, so "TRANSFERRED" broke mid-word ("TRANSFERR / ED"). One line, shrunk to fit. */}
      <Text style={styles.bucketLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
      <MoneyText cents={cents} state={state} size="lg" captionHidden />
      <Text style={styles.bucketNote}>{note}</Text>
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  bucketRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // G2: master 25's three stat cards, each a lit card in both themes; light keeps the
  // approved Heritage sage on the glyph.
  bucket: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs / 2,
  },
  bucketGlyph: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  bucketGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  // Green eyebrows over serif figures — master 25's own pairing, and the
  // eyebrow law's live-state case (these ARE the money states).
  bucketLabel: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  bucketNote: {
    ...textScale.caption,
    fontWeight: '500',
    color: colors.textMuted,
  },
  feeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  feeText: {
    ...textScale.footnote,
    flex: 1,
    color: colors.textMuted,
  },
  ledger: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  rowTitle: {
    ...textScale.headline,
    fontFamily: fonts.display,
    color: colors.ink,
  },
  rowMeta: {
    ...textScale.footnote,
    color: colors.textMuted,
  },
  emptyText: {
    ...textScale.body,
    color: colors.textMuted,
  },
  }),
);
