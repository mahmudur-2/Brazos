import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { fetchJobPayment, type Payment } from '../lib/payments';
import { fetchProfileById } from '../lib/profiles';
import { arrivalWindowLabel, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Screen 31 — Protected Checkout, over the payment ADAPTER
 * (lib/adapters/payments.ts), never the RPCs directly.
 *
 * SANDBOX, and it says so on screen — the VerifyPhoneScreen "MOCK MODE"
 * banner precedent (06_DEFERRED_INTEGRATIONS: every dev surface visibly
 * labeled, not just documented). What is NOT fake: the ledger row is real
 * Supabase state, authorize -> held are real audited transitions, and the
 * money vocabulary is §H.3's — authorized means authorized, held means held,
 * and nothing on this screen (or anywhere) can say released or paid.
 *
 * One decision, stated before the tap; both provider calls are idempotent,
 * so a retry after a dropped response continues from wherever the ledger
 * truthfully is instead of double-charging (the DB's partial unique index is
 * the second lock on that door).
 */
export function CheckoutScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'Checkout'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [funding, setFunding] = useState(false);
  const fundingRef = useRef(false);

  const amountCents = job.final_amount_cents ?? job.budget_cents;
  const isOwner = !!user && user.id === job.client_id;

  const loadPayment = useCallback(async () => {
    setPaymentError(null);
    const { data, error } = await fetchJobPayment(job.id);
    if (error) setPaymentError(error.message);
    else setPayment(data);
    setPaymentLoaded(true);
  }, [job.id]);

  useFocusEffect(
    useCallback(() => {
      void loadPayment();
    }, [loadPayment])
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

  const state: ScreenState = missing
    ? {
        kind: 'empty',
        title: 'This job is no longer available',
        body: 'It may have been deleted or you may no longer have access to it.',
        actionLabel: 'Back',
        onAction: () => navigation.goBack(),
      }
    : paymentsMode !== 'sandbox'
      ? {
          kind: 'permissionDenied',
          title: 'Payments are off in this build',
          body: 'No payment mode is switched on, so nothing can be authorized or held. Your accepted offer is unaffected.',
        }
      : !isOwner
        ? {
            kind: 'permissionDenied',
            title: 'Only the job’s owner can check out',
            body: 'The person who posted this job funds its protected payment.',
          }
        : job.status !== 'assigned' && job.status !== 'in_progress' && job.status !== 'completed'
          ? {
              kind: 'empty',
              title: 'Nothing to check out yet',
              body: 'Accept an offer first — checkout protects the payment for an accepted offer.',
              actionLabel: 'Back to the job',
              onAction: () => navigation.goBack(),
            }
          : !paymentLoaded
            ? { kind: 'loading', variant: 'spinner' }
            : paymentError
              ? {
                  kind: 'error',
                  message: paymentError,
                  onRetry: () => void loadPayment(),
                }
              : { kind: 'ready' };

  const held = payment?.status === 'held';
  const authorizedOnly = payment?.status === 'authorized';

  /**
   * The one funding action. Runs whichever half is still missing — both
   * calls are idempotent, so a retry after a half-completed attempt picks up
   * from the ledger's real state.
   */
  async function fundProtection() {
    if (fundingRef.current) return;
    fundingRef.current = true;
    setFunding(true);
    try {
      const authorized = await paymentProvider.authorizeJobPayment(job.id);
      if (authorized.error || !authorized.data) {
        await alertAsync(
          'Could not authorize the payment',
          `${authorized.error?.message ?? 'Check your connection and try again.'}\n\nYour accepted offer is unchanged — nothing was authorized or held.`
        );
        await loadPayment();
        return;
      }
      setPayment(authorized.data);

      const heldResult = await paymentProvider.protectJobPayment(job.id);
      if (heldResult.error || !heldResult.data) {
        await alertAsync(
          'Authorized, but not yet protected',
          `${heldResult.error?.message ?? 'Check your connection and try again.'}\n\nThe payment is authorized — not charged — and your accepted offer is unchanged. Tap the button again to finish protecting the funds.`
        );
        await loadPayment();
        return;
      }
      setPayment(heldResult.data);
      navigation.replace('JobConfirmed', { job });
    } finally {
      fundingRef.current = false;
      setFunding(false);
      setConfirmVisible(false);
    }
  }

  return (
    <>
      <DetailScreen
        title="Protected checkout"
        subtitle={job.title}
        onBack={() => navigation.goBack()}
        state={state}
        sections={[
          {
            content: (
              <View style={styles.sandboxBanner} accessibilityRole="alert">
                <Ionicons name="flask-outline" size={18} color={colors.warning} />
                <Text style={styles.sandboxText}>
                  SANDBOX — development build. No real money is charged, held or
                  moved. The payment states below are real app records used to
                  test the flow.
                </Text>
              </View>
            ),
          },
          {
            title: 'What you’re protecting',
            content: (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Accepted offer</Text>
                  <Text style={styles.summaryValue}>
                    {workerName ?? 'Your hired worker'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Agreed amount</Text>
                  <Text style={styles.summaryValue}>{formatBudget(amountCents)}</Text>
                </View>
                {arrivalWindowLabel(job) ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Scheduled</Text>
                    <Text style={styles.summaryValue}>{arrivalWindowLabel(job)}</Text>
                  </View>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Platform fee</Text>
                  <Text style={styles.summaryValue}>None in sandbox</Text>
                </View>
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total (sandbox)</Text>
                  <Text style={styles.totalValue}>{formatBudget(amountCents)}</Text>
                </View>
              </View>
            ),
          },
          {
            title: 'How protection works',
            content: (
              <View style={styles.explainer}>
                <ExplainRow
                  icon="card-outline"
                  strong="Authorize"
                  text="confirms the amount against your sandbox payment method. Nothing is charged."
                />
                <ExplainRow
                  icon="lock-closed-outline"
                  strong="Hold in protection"
                  text={`keeps the funds set aside while ${
                    workerName ?? 'the worker'
                  } does the job. They can see the funds are protected, and can’t be paid early.`}
                />
                <ExplainRow
                  icon="checkmark-done-outline"
                  strong="Release"
                  text="happens only after you approve the completed work. That approval step arrives in a later milestone — in this build, funds can never leave protection."
                />
              </View>
            ),
          },
          ...(payment
            ? [
                {
                  title: 'Current payment state',
                  content: (
                    <View style={styles.paymentState}>
                      <MoneyText cents={payment.amount_cents} state={payment.status} size="lg" />
                    </View>
                  ),
                },
              ]
            : []),
        ]}
        actionBar={
          held ? (
            <Button
              title="Continue — job confirmed"
              onPress={() => navigation.replace('JobConfirmed', { job })}
            />
          ) : (
            <Button
              title={
                authorizedOnly
                  ? 'Finish protecting funds (sandbox)'
                  : `Authorize & protect ${formatBudget(amountCents)} (sandbox)`
              }
              onPress={() => setConfirmVisible(true)}
              loading={funding}
              disabled={funding || state.kind !== 'ready'}
            />
          )
        }
      />

      <ConfirmDialog
        visible={confirmVisible}
        title={`Protect ${formatBudget(amountCents)} for this job?`}
        message="This authorizes the sandbox amount and places it in protected/held state. No real money is being charged in this development build. Funds stay held until you approve the finished work in a later milestone — nothing is released today."
        confirmText="Authorize & protect"
        cancelText="Not now"
        loading={funding}
        onConfirm={fundProtection}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}

function ExplainRow({
  icon,
  strong,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  strong: string;
  text: string;
}) {
  return (
    <View style={styles.explainRow}>
      <Ionicons name={icon} size={18} color={colors.emerald} />
      <Text style={styles.explainText}>
        <Text style={styles.explainStrong}>{strong}</Text> {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sandboxBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  sandboxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    lineHeight: 18,
  },
  summaryCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
  },
  totalRow: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  explainer: {
    gap: spacing.md,
  },
  explainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  explainText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  explainStrong: {
    fontWeight: '800',
    color: colors.ink,
  },
  paymentState: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
});
