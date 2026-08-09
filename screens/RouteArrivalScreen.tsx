import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync } from '../lib/dialog';
import {
  arrivalWindowLabel,
  fetchJobLocation,
  markWorkerArrival,
  type JobPrivateLocation,
} from '../lib/jobs';
import {
  deriveJobLifecycle,
  JOB_LIFECYCLE_LABELS,
} from '../lib/jobLifecycle';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Screen 56 — Route & arrival (Phase 6, worker side).
 *
 * The §9 tracking scope, whole: two static, one-way declarations — "I'm on
 * my way" and "I've arrived" — written by mark_worker_arrival() and never
 * cleared. There is NO live location, no GPS streaming, no background
 * permission anywhere in this build, and the screen says so instead of
 * pretending a map dot exists. The customer sees the same two facts on
 * screen 33 (TrackWorker).
 */
export function RouteArrivalScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'RouteArrival'>>();
  const { user } = useAuth();
  const { job, loading, error, refresh } = useJob(params.jobId);

  const [location, setLocation] = useState<JobPrivateLocation | null>(null);
  const [marking, setMarking] = useState<'en_route' | 'arrived' | null>(null);

  // The exact address (job_private_details): RLS grants the hired worker this
  // read, and nobody else gets here — the screen is reached from the worker's
  // own job surface.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchJobLocation(params.jobId).then(({ data, error: locationError }) => {
        if (active && !locationError) setLocation(data);
      });
      return () => {
        active = false;
      };
    }, [params.jobId])
  );

  const isWorker = !!user && !!job && job.assigned_worker_id === user.id;
  // Arrival is presentation-only here — funding state belongs to the payment
  // surfaces, so the derivation gets no payment on purpose (states that need
  // it, confirmed/pending_payment, both render the same "hired" step below).
  const lifecycle = job
    ? deriveJobLifecycle({ job, payment: null })
    : null;

  const state: ScreenState = loading
    ? { kind: 'loading', variant: 'spinner' }
    : error
      ? { kind: 'error', message: error, onRetry: () => void refresh() }
      : !job
        ? {
            kind: 'empty',
            title: 'This job is no longer available',
            body: 'It may have been deleted or you may no longer have access to it.',
            actionLabel: 'Back',
            onAction: () => navigation.goBack(),
          }
        : !isWorker
          ? {
              kind: 'permissionDenied',
              title: 'Only the assigned worker can update arrival',
              body: 'This surface belongs to the worker hired for the job.',
            }
          : { kind: 'ready' };

  async function mark(step: 'en_route' | 'arrived') {
    if (marking) return;
    setMarking(step);
    const { error: markError } = await markWorkerArrival(params.jobId, step);
    setMarking(null);
    if (markError) {
      await alertAsync('Could not update your status', markError.message);
      return;
    }
    await refresh();
  }

  const enRouteDone = !!job?.en_route_at;
  const arrivedDone = !!job?.arrived_at;
  const beforeStart = job?.status === 'assigned';

  return (
    <DetailScreen
      title="Route & arrival"
      subtitle={job?.title}
      onBack={() => navigation.goBack()}
      state={state}
      sections={
        !job
          ? []
          : [
              {
                content: (
                  <View style={styles.statusCard}>
                    <Text style={styles.eyebrow}>WHERE THINGS STAND</Text>
                    <Text style={styles.statusLabel}>
                      {lifecycle ? JOB_LIFECYCLE_LABELS[lifecycle] : ''}
                    </Text>
                    <Text style={styles.statusNote}>
                      Your status updates are simple declarations — nothing tracks
                      your location. The customer sees exactly the two taps below,
                      nothing more.
                    </Text>
                  </View>
                ),
              },
              {
                title: 'Getting there',
                content: (
                  <View style={styles.infoCard}>
                    {location?.address_line ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <View style={styles.infoCopy}>
                          <Text style={styles.infoText} selectable>
                            {location.address_line}
                          </Text>
                          <Text style={styles.infoCaption}>
                            Exact address — shared with you because you were hired.
                          </Text>
                        </View>
                      </View>
                    ) : job.location ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <Text style={styles.infoText}>{job.location}</Text>
                      </View>
                    ) : null}
                    {arrivalWindowLabel(job) ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={18} color={colors.emerald} />
                        <View style={styles.infoCopy}>
                          <Text style={styles.infoText}>{arrivalWindowLabel(job)}</Text>
                          <Text style={styles.infoCaption}>
                            The arrival window the customer asked for.
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {!location?.address_line && !job.location && !arrivalWindowLabel(job) ? (
                      <Text style={styles.infoCaption}>
                        The posting didn’t include an address or arrival window —
                        coordinate the details in chat.
                      </Text>
                    ) : null}
                  </View>
                ),
              },
              {
                title: 'Your status',
                content: (
                  <View style={styles.steps}>
                    <StepRow
                      done={enRouteDone}
                      label="On my way"
                      doneNote={job.en_route_at ? 'Declared — the customer can see it' : null}
                    />
                    <StepRow
                      done={arrivedDone}
                      label="Arrived"
                      doneNote={job.arrived_at ? 'Declared — the customer can see it' : null}
                    />
                    {!beforeStart ? (
                      <Text style={styles.infoCaption}>
                        {job.status === 'in_progress'
                          ? 'The job is already in progress — arrival is behind you.'
                          : 'This job is no longer awaiting arrival.'}
                      </Text>
                    ) : null}
                  </View>
                ),
              },
            ]
      }
      actionBar={
        job && beforeStart && isWorker ? (
          !enRouteDone ? (
            <Button
              title="I’m on my way"
              onPress={() => mark('en_route')}
              loading={marking === 'en_route'}
              disabled={marking !== null}
            />
          ) : !arrivedDone ? (
            <Button
              title="I’ve arrived"
              onPress={() => mark('arrived')}
              loading={marking === 'arrived'}
              disabled={marking !== null}
            />
          ) : (
            <Button
              title="Back to the job — start work there"
              variant="secondary"
              onPress={() => navigation.goBack()}
            />
          )
        ) : undefined
      }
    />
  );
}

function StepRow({
  done,
  label,
  doneNote,
}: {
  done: boolean;
  label: string;
  doneNote: string | null;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, done && styles.stepDotDone]}>
        {done ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
        {doneNote ? <Text style={styles.infoCaption}>{doneNote}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emerald,
    letterSpacing: 0.8,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  statusNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  infoCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 20,
  },
  infoCaption: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  steps: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald,
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepLabelDone: {
    color: colors.ink,
  },
});
