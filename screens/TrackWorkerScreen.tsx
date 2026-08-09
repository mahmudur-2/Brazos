import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { fetchJobPaymentState, type Payment } from '../lib/payments';
import { fetchOpenJobDispute } from '../lib/disputes';
import { fetchProfileById } from '../lib/profiles';
import { arrivalWindowLabel } from '../lib/jobs';
import {
  deriveJobLifecycle,
  trackStepIndex,
  type JobLifecycleState,
} from '../lib/jobLifecycle';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

/**
 * Screen 33 — Track worker (Phase 6, customer side).
 *
 * A static "where things stand" timeline over the derived lifecycle
 * (lib/jobLifecycle — the one derivation point). The two arrival steps are
 * the worker's own declarations, timestamped; there is NO live location in
 * this build and the screen says so rather than faking a moving dot.
 */

const TIMELINE: { state: JobLifecycleState; label: string; caption: string }[] = [
  { state: 'confirmed', label: 'Hired', caption: 'You accepted their offer' },
  { state: 'en_route', label: 'On the way', caption: 'Declared by the worker' },
  { state: 'arrived', label: 'Arrived', caption: 'Declared by the worker' },
  { state: 'in_progress', label: 'Working', caption: 'The job is in progress' },
  { state: 'completed', label: 'Done', caption: 'Finished work submitted' },
];

export function TrackWorkerScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'TrackWorker'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [hasOpenDispute, setHasOpenDispute] = useState(false);
  const [workerName, setWorkerName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchJobPaymentState(job.id).then(({ data, error }) => {
        if (active && !error) setPayment(data);
      });
      fetchOpenJobDispute(job.id).then(({ data, error }) => {
        if (active && !error) setHasOpenDispute(!!data);
      });
      return () => {
        active = false;
      };
    }, [job.id])
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
  const lifecycle = deriveJobLifecycle({ job, payment, hasOpenDispute });
  const currentIndex = trackStepIndex(lifecycle);

  const state: ScreenState = missing
    ? {
        kind: 'empty',
        title: 'This job is no longer available',
        body: 'It may have been deleted or you may no longer have access to it.',
        actionLabel: 'Back',
        onAction: () => navigation.goBack(),
      }
    : !isOwner
      ? {
          kind: 'permissionDenied',
          title: 'Only the job’s owner can track it here',
          body: 'This surface belongs to the person who posted the job.',
        }
      : currentIndex < 0
        ? {
            kind: 'empty',
            title: 'No worker to track yet',
            body: 'Once you hire a worker, their progress appears here.',
            actionLabel: 'Back to the job',
            onAction: () => navigation.goBack(),
          }
        : { kind: 'ready' };

  const stepTime = (stepState: JobLifecycleState): string | null => {
    if (stepState === 'en_route' && job.en_route_at) return formatTimeAgo(job.en_route_at);
    if (stepState === 'arrived' && job.arrived_at) return formatTimeAgo(job.arrived_at);
    if (stepState === 'completed' && job.completed_at) return formatTimeAgo(job.completed_at);
    return null;
  };

  return (
    <DetailScreen
      title="Track worker"
      subtitle={job.title}
      onBack={() => navigation.goBack()}
      state={state}
      sections={[
        {
          content: (
            <View style={styles.noticeCard}>
              <Ionicons name="navigate-outline" size={18} color={colors.emerald} />
              <Text style={styles.noticeText}>
                Status comes from {workerName ?? 'your worker'}’s own updates —
                this build has no live location tracking, so what you see here
                is exactly what they declared.
              </Text>
            </View>
          ),
        },
        {
          title: 'Where things stand',
          content: (
            <View style={styles.timeline}>
              {TIMELINE.map((step, index) => {
                const done = index <= currentIndex;
                const isCurrent = index === currentIndex;
                const time = stepTime(step.state);
                return (
                  <View key={step.state} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View
                        style={[
                          styles.timelineDot,
                          done && styles.timelineDotDone,
                          isCurrent && styles.timelineDotCurrent,
                        ]}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                        ) : null}
                      </View>
                      {index < TIMELINE.length - 1 ? (
                        <View
                          style={[styles.timelineLine, index < currentIndex && styles.timelineLineDone]}
                        />
                      ) : null}
                    </View>
                    <View style={styles.timelineCopy}>
                      <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>
                        {step.label}
                        {time ? `  ·  ${time}` : ''}
                      </Text>
                      <Text style={styles.timelineCaption}>
                        {done ? step.caption : 'Not yet'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ),
        },
        ...(arrivalWindowLabel(job)
          ? [
              {
                title: 'Scheduled window',
                content: (
                  <View style={styles.infoCard}>
                    <Ionicons name="time-outline" size={18} color={colors.emerald} />
                    <Text style={styles.infoText}>{arrivalWindowLabel(job)}</Text>
                  </View>
                ),
              },
            ]
          : []),
        ...(payment
          ? [
              {
                title: 'Payment',
                content: (
                  <View style={styles.paymentCard}>
                    <Text style={styles.eyebrow}>SANDBOX — NO REAL MONEY</Text>
                    <MoneyText cents={payment.amount_cents} state={payment.status} />
                    {hasOpenDispute ? (
                      <Text style={styles.paymentNote}>
                        Your issue report is holding this payment.
                      </Text>
                    ) : null}
                  </View>
                ),
              },
            ]
          : []),
      ]}
      actionBar={
        <Button
          title={`Message ${workerName ?? 'your worker'}`}
          variant="secondary"
          onPress={() => navigation.navigate('Chat', { jobId: job.id })}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  timeline: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald,
  },
  timelineDotCurrent: {
    borderColor: colors.forest,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 26,
    backgroundColor: colors.border,
  },
  timelineLineDone: {
    backgroundColor: colors.emerald,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: spacing.lg,
    gap: 2,
  },
  timelineLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  timelineLabelDone: {
    color: colors.ink,
  },
  timelineCaption: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  paymentNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
