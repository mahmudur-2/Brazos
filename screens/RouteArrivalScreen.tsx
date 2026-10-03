import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import {
  arrivalWindowLabel,
  fetchJobLocation,
  markWorkerArrival,
  updateJobStatus,
  type JobPrivateLocation,
} from '../lib/jobs';
import { deriveJobLifecycle, paymentBlindStageLabel } from '../lib/jobLifecycle';
import type { MyJobsStackParamList } from '../lib/navigation';
import { EYEBROW_TYPE, litCardStyle, radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
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
            onAction: goBackOrHome,
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
      await alertAsync('Could not update your status', userMessage(markError));
      return;
    }
    await refresh();
  }

  const [starting, setStarting] = useState(false);
  async function start() {
    if (starting) return;
    setStarting(true);
    const { error: startError } = await updateJobStatus(params.jobId, 'in_progress');
    setStarting(false);
    if (startError) {
      await alertAsync('Could not start job', userMessage(startError));
      return;
    }
    goBackOrHome();
  }

  const enRouteDone = !!job?.en_route_at;
  const arrivedDone = !!job?.arrived_at;
  const beforeStart = job?.status === 'assigned';

  return (
    <DetailScreen
      title="Route & Arrival"
      subtitle={job?.title}
      onBack={goBackOrHome}
      state={state}
      sections={
        !job
          ? []
          : [
              {
                content: (
                  <View style={[styles.statusCard, litCardStyle(isDark)]}>
                    <Text style={styles.eyebrow}>WHERE THINGS STAND</Text>
                    <Text style={styles.statusLabel}>
                      {lifecycle ? paymentBlindStageLabel(lifecycle) : ''}
                    </Text>
                    <Text style={styles.statusNote}>
                      The customer sees these two taps and nothing else. Brazos
                      doesn’t track your location here.
                    </Text>
                  </View>
                ),
              },
              {
                title: 'Getting there',
                content: (
                  <View style={[styles.infoCard, litCardStyle(isDark)]}>
                    {location?.address_line ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <View style={styles.infoCopy}>
                          <Text style={styles.infoText} selectable>
                            {location.address_line}
                          </Text>
                          <Text style={styles.infoCaption}>
                            Shared because you were hired.
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
                titleTone: 'gold',
                content: (
                  <View style={styles.steps}>
                    <StepRow
                      done={enRouteDone}
                      label="On my way"
                      doneNote={job.en_route_at ? 'Declared — the customer can see it' : null}
                    />
                    <StepRow
                      done={arrivedDone}
                      label="I’m here"
                      doneNote={job.arrived_at ? 'Declared — the customer can see it' : null}
                    />
                    {!beforeStart ? (
                      <Text style={styles.infoCaption}>
                        {/* Derived, not raw (F-012): only raw in_progress
                            derives 'in_progress', so this is 1:1. */}
                        {lifecycle === 'in_progress'
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
              title="I’m here"
              onPress={() => mark('arrived')}
              loading={marking === 'arrived'}
              disabled={marking !== null}
            />
          ) : (
            // M-3 — arrived is one step from working, so the last button IS
            // that step (the same transition Your Job makes), not a detour
            // back to find it.
            <Button title="Start job" onPress={() => void start()} loading={starting} />
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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  statusCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  eyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
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
  }),
);
