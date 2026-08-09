import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenStateView } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import {
  fetchJobPaymentState,
  fetchJobTip,
  isReleased,
  type Payment,
} from '../lib/payments';
import { fetchProfileById } from '../lib/profiles';
import { dollarsToCents, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, emeraldColors, radius, spacing } from '../lib/theme';

/** Round tip suggestions, in cents. Presets, not a fee schedule — the
 *  customer types any amount they want below them. */
const TIP_PRESETS_CENTS = [500, 1000, 2000];

/**
 * Screen 37 — Review & tip (Phase 6, customer side).
 *
 * Sits BEHIND the approve gate by §9's ordering: the held payment releases
 * first (screen 36), then the review — so a review can never be the thing
 * standing between a worker and their money. Jobs with a still-held payment
 * are redirected to ApproveOrDispute; legacy jobs that completed without a
 * payment review from the job screen as before.
 *
 * The tip is a REAL sandbox ledger row (kind='tip', born released) written by
 * sandbox_tip_worker() — release-first and one-per-job are enforced there,
 * not here.
 */
export function ReviewAndTipScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ReviewAndTip'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [tip, setTip] = useState<Payment | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A failed payment read must BLOCK, not fall through: with payment=null the
  // approve gate below would wave a still-held job straight into the review
  // form (hardening run, A6/A8).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);

  const [tipChoice, setTipChoice] = useState<number | 'custom' | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [confirmTip, setConfirmTip] = useState(false);
  const [sendingTip, setSendingTip] = useState(false);
  const sendingTipRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [paymentRes, tipRes] = await Promise.all([
      fetchJobPaymentState(job.id),
      fetchJobTip(job.id),
    ]);
    if (paymentRes.error) setLoadError(paymentRes.error.message);
    else setPayment(paymentRes.data);
    if (tipRes.error) {
      const message = tipRes.error.message;
      setLoadError((prev) => prev ?? message);
    } else setTip(tipRes.data);
    setLoaded(true);
  }, [job.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!job.assigned_worker_id) return;
      fetchProfileById(job.assigned_worker_id).then(({ data }) => {
        if (active) setWorkerName(data?.full_name ?? null);
      });
      return () => {
        active = false;
      };
    }, [job.assigned_worker_id])
  );

  const isOwner = !!user && user.id === job.client_id;
  const released = !!payment && isReleased(payment);

  const tipCents =
    tipChoice === 'custom'
      ? dollarsToCents(customTip)
      : tipChoice ?? null;
  const tipValid = tipCents != null && !Number.isNaN(tipCents) && tipCents > 0 && tipCents <= 100000;

  async function sendTip() {
    if (!tipValid || tipCents == null || sendingTipRef.current) return;
    sendingTipRef.current = true;
    setSendingTip(true);
    try {
      const result = await paymentProvider.tipWorker(job.id, tipCents);
      if (result.error || !result.data) {
        await alertAsync(
          'Could not send the tip',
          `${result.error?.message ?? 'Check your connection and try again.'}\n\nNo tip was recorded.`
        );
        await load();
        return;
      }
      setTip(result.data);
      setTipChoice(null);
      setCustomTip('');
    } finally {
      sendingTipRef.current = false;
      setSendingTip(false);
      setConfirmTip(false);
    }
  }

  const gateState = missing
    ? {
        kind: 'empty' as const,
        title: 'This job is no longer available',
        body: 'It may have been deleted or you may no longer have access to it.',
        actionLabel: 'Back',
        onAction: () => navigation.goBack(),
      }
    : !isOwner
      ? {
          kind: 'permissionDenied' as const,
          title: 'Only the job’s owner reviews here',
          body: 'The person who posted this job reviews the finished work.',
        }
      : job.status !== 'completed'
        ? {
            kind: 'empty' as const,
            title: 'The job isn’t finished yet',
            body: 'Review and tip open once the work is completed and approved.',
            actionLabel: 'Back to the job',
            onAction: () => navigation.goBack(),
          }
        : !loaded
          ? { kind: 'loading' as const, variant: 'spinner' as const }
          : loadError
            ? {
                kind: 'error' as const,
                message: loadError,
                onRetry: () => void load(),
              }
            : payment && !released
            ? {
                kind: 'empty' as const,
                title: 'Approve the work first',
                body: 'Release the held payment (or report an issue) before leaving your review — a review should never stand between the worker and their money.',
                actionLabel: 'Go to approval',
                onAction: () => navigation.replace('ApproveOrDispute', { job }),
              }
            : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Review & tip"
        subtitle={job.title}
        onBack={() => navigation.goBack()}
        palette={emeraldColors}
      />
      {gateState ? (
        <ScreenStateView state={gateState} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {payment ? (
              <View style={styles.paymentCard}>
                <Text style={styles.eyebrow}>PAYMENT RELEASED · SANDBOX</Text>
                <MoneyText cents={payment.amount_cents} state={payment.status} />
                <Text style={styles.cardNote}>
                  {payment.release_reason === 'auto_approved'
                    ? 'Released automatically after 72 hours. Sandbox build — no real money moved.'
                    : 'Released on your approval. Sandbox build — no real money moved.'}
                </Text>
              </View>
            ) : null}

            {user && job.assigned_worker_id ? (
              <ReviewSection
                key={`${job.id}:${user.id}`}
                jobId={job.id}
                reviewerId={user.id}
                revieweeId={job.assigned_worker_id}
                revieweeName={workerName ?? 'the worker'}
                prompt={`How was ${workerName ?? 'the worker'}’s work?`}
                scrollRef={scrollRef}
                palette={emeraldColors}
              />
            ) : null}

            <View style={styles.tipCard}>
              <Text style={styles.sectionTitle}>Add a tip?</Text>
              {tip ? (
                <>
                  <MoneyText cents={tip.amount_cents} state={tip.status} />
                  <Text style={styles.cardNote}>
                    Your tip went to {workerName ?? 'the worker'} on top of the
                    job payment. Sandbox build — no real money moved.
                  </Text>
                </>
              ) : paymentsMode !== 'sandbox' ? (
                <Text style={styles.cardNote}>
                  Payments are off in this build, so tipping is unavailable.
                </Text>
              ) : !payment ? (
                <Text style={styles.cardNote}>
                  This job finished without a protected payment, so there is no
                  payment to add a tip onto.
                </Text>
              ) : (
                <>
                  <Text style={styles.cardNote}>
                    Entirely optional — every cent goes to{' '}
                    {workerName ?? 'the worker'}. Sandbox build, no real money.
                  </Text>
                  <View style={styles.presetRow}>
                    {TIP_PRESETS_CENTS.map((cents) => (
                      <Pressable
                        key={cents}
                        style={[styles.preset, tipChoice === cents && styles.presetActive]}
                        onPress={() => setTipChoice(tipChoice === cents ? null : cents)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: tipChoice === cents }}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            tipChoice === cents && styles.presetTextActive,
                          ]}
                        >
                          {formatBudget(cents)}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      style={[styles.preset, tipChoice === 'custom' && styles.presetActive]}
                      onPress={() => setTipChoice(tipChoice === 'custom' ? null : 'custom')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tipChoice === 'custom' }}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          tipChoice === 'custom' && styles.presetTextActive,
                        ]}
                      >
                        Other
                      </Text>
                    </Pressable>
                  </View>
                  {tipChoice === 'custom' ? (
                    <TextInput
                      style={styles.customInput}
                      value={customTip}
                      onChangeText={setCustomTip}
                      placeholder="Amount in dollars, up to $1,000"
                      placeholderTextColor={colors.textSubtle}
                      keyboardType="decimal-pad"
                      maxLength={8}
                      accessibilityLabel="Custom tip amount in dollars"
                    />
                  ) : null}
                  {tipChoice !== null ? (
                    <Button
                      title={
                        tipValid
                          ? `Send ${formatBudget(tipCents)} tip (sandbox)`
                          : 'Send tip (sandbox)'
                      }
                      palette={emeraldColors}
                      onPress={() => setConfirmTip(true)}
                      disabled={!tipValid || sendingTip}
                      loading={sendingTip}
                    />
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <ConfirmDialog
        visible={confirmTip}
        title={`Send a ${formatBudget(tipCents ?? null)} tip?`}
        message={`The tip goes straight to ${workerName ?? 'the worker'} as its own ledger entry, separate from the job payment. One tip per job. No real money moves in this sandbox build.`}
        confirmText="Send tip"
        cancelText="Not now"
        loading={sendingTip}
        palette={emeraldColors}
        onConfirm={sendTip}
        onCancel={() => setConfirmTip(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  paymentCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  cardNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  tipCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preset: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  presetText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTextActive: {
    color: colors.emerald,
  },
  customInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
