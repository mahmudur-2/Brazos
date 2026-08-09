import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Avatar } from '../components/Avatar';
import { SuccessScreen } from '../ui/templates/SuccessScreen';
import { MoneyText } from '../ui/primitives/MoneyText';
import { StatusPill } from '../ui/primitives/StatusPill';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { fetchJobPayment, isHeld, type Payment } from '../lib/payments';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { arrivalWindowLabel } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';
import { userMessage } from '../lib/errorMessage';

/**
 * Screen 32 — Job Confirmed. Renders its confirmation ONLY after the state it
 * claims actually exists: the ledger row must read `held`. Reached any other
 * way (deep link, stale stack), it shows the truthful current state and
 * points back at checkout instead of celebrating something that didn't
 * happen.
 *
 * The next milestone stays inside what is real: the schedule the customer
 * set, messaging the hired worker (Phase-7-independent — chat already
 * exists), and the promise that funds stay protected. No fabricated
 * "worker is on the way" progress — that's Phase 6's real machinery.
 */
export function JobConfirmedScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'JobConfirmed'>>();
  const job = params.job;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: paymentError } = await fetchJobPayment(job.id);
    if (paymentError) setError(userMessage(paymentError));
    else setPayment(data);
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
        if (active) setWorker(data);
      });
      return () => {
        active = false;
      };
    }, [job.assigned_worker_id])
  );

  const workerName = worker?.full_name ?? 'your worker';
  const confirmed = !!payment && isHeld(payment);

  // Anything short of held: report the truth, never the celebration.
  if (!loaded || error || !confirmed) {
    const state: ScreenState = !loaded
      ? { kind: 'loading', variant: 'spinner' }
      : error
        ? { kind: 'error', message: error, onRetry: () => void load() }
        : {
            kind: 'empty',
            title: 'Not confirmed yet',
            body: payment
              ? 'The payment is authorized but not yet protected. Finish checkout to confirm the job.'
              : 'This job’s payment hasn’t been set up yet. Protect it in checkout to confirm the job.',
            actionLabel: 'Go to checkout',
            onAction: () => navigation.replace('Checkout', { job }),
          };
    return (
      <DetailScreen
        title="Job confirmed"
        onBack={() => navigation.goBack()}
        state={state}
        sections={[]}
      />
    );
  }

  return (
    <SuccessScreen
      title="Job confirmed"
      icon="shield-checkmark"
      body={`${workerName} is hired and your payment is protected. Funds stay held until the work is done and approved — nothing has been released.`}
      details={
        <View style={styles.details}>
          <View style={styles.workerRow}>
            <Avatar name={worker?.full_name} uri={worker?.avatar_url} size={48} />
            <View style={styles.workerCopy}>
              <Text style={styles.workerName} numberOfLines={1}>
                {worker?.full_name ?? 'Hired worker'}
              </Text>
              <Text style={styles.workerMeta} numberOfLines={2}>
                {job.title}
              </Text>
            </View>
          </View>

          {arrivalWindowLabel(job) ? (
            <View style={styles.scheduleRow}>
              <Text style={styles.scheduleLabel}>Scheduled</Text>
              <Text style={styles.scheduleValue}>{arrivalWindowLabel(job)}</Text>
            </View>
          ) : null}

          <View style={styles.paymentBlock}>
            <MoneyText cents={payment.amount_cents} state={payment.status} size="lg" />
            <StatusPill kind="payment" status={payment.status} />
            <Text style={styles.sandboxNote}>
              Sandbox build — these funds are development records, not real money.
            </Text>
          </View>
        </View>
      }
      actions={[
        {
          label: 'View job',
          onPress: () => navigation.popTo('ClientJobDetail', { job }),
        },
        {
          label: `Message ${worker?.full_name ?? 'worker'}`,
          variant: 'secondary',
          onPress: () => navigation.navigate('Chat', { jobId: job.id }),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  details: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  workerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  workerName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  workerMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  scheduleLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  scheduleValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
  },
  paymentBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  sandboxNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
});
