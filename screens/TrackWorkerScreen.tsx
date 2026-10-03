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
import { goBackOrHome } from '../lib/navigationRef';
import { paymentsMode } from '../lib/adapters/payments';
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
import {
  litCardStyle, fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
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
  const { palette: colors, isDark } = useThemeColors();
  // Master 14 draws this screen entirely in gold line-work.
  const accent = isDark ? colors.gold : colors.emerald;
  const styles = stylesFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'TrackWorker'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  // 'unknown' is a FAILED dispute read, which is a different fact from "no
  // dispute" — deriveJobLifecycle refuses to place the job on the track from
  // it, and this screen shows its error state instead (F-026).
  const [hasOpenDispute, setHasOpenDispute] = useState<boolean | 'unknown'>(false);
  const [workerName, setWorkerName] = useState<string | null>(null);
  // The payment + dispute reads feeding the lifecycle, settled together:
  // either both landed clean, or one failed, or they are still in flight.
  const [statusReads, setStatusReads] = useState<'loading' | 'error' | 'ready'>('loading');
  const [readAttempt, setReadAttempt] = useState(0);
  // The worker-name read's settling, tracked so the screen never renders
  // ready and then reflows as the name lands (F-027).
  const [workerRead, setWorkerRead] = useState<'pending' | 'settled'>('pending');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setStatusReads('loading');
      Promise.all([fetchJobPaymentState(job.id), fetchOpenJobDispute(job.id)]).then(
        ([paymentResult, disputeResult]) => {
          if (!active) return;
          if (!paymentResult.error) setPayment(paymentResult.data);
          setHasOpenDispute(disputeResult.error ? 'unknown' : !!disputeResult.data);
          setStatusReads(paymentResult.error || disputeResult.error ? 'error' : 'ready');
        }
      );
      return () => {
        active = false;
      };
    }, [job.id, readAttempt])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!job.assigned_worker_id) {
        setWorkerRead('settled');
        return;
      }
      setWorkerRead('pending');
      // The name is cosmetic — a failed read settles to the "your worker"
      // fallback rather than blocking the screen, so only its SETTLING is
      // tracked, not its success.
      fetchProfileById(job.assigned_worker_id).then(({ data }) => {
        if (!active) return;
        setWorkerName(data?.full_name ?? null);
        setWorkerRead('settled');
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
        onAction: goBackOrHome,
      }
    : !isOwner
      ? {
          kind: 'permissionDenied',
          title: 'Only the job’s owner can track it here',
          body: 'This surface belongs to the person who posted the job.',
        }
      : statusReads === 'error'
        ? {
            kind: 'error',
            message:
              'Where this job stands didn’t load. Check your connection and try again.',
            onRetry: () => setReadAttempt((attempt) => attempt + 1),
          }
        : statusReads === 'loading' || workerRead === 'pending'
          ? // Ready is earned, not assumed: the timeline renders only after
            // the reads settle, never wrong-then-right (F-027).
            { kind: 'loading' }
          : currentIndex < 0
          ? {
              kind: 'empty',
              title: 'No worker to track yet',
              body: 'Once you hire a worker, their progress appears here.',
              actionLabel: 'Back to the job',
              onAction: goBackOrHome,
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
      title="Track Worker"
      subtitle={job.title}
      onBack={goBackOrHome}
      state={state}
      sections={[
        {
          content: (
            <View style={[styles.noticeCard, litCardStyle(isDark)]}>
              <View style={[styles.noticeGlyph, isDark && styles.noticeGlyphDark]}>
                <Ionicons name="navigate-outline" size={18} color={accent} />
              </View>
              <Text style={styles.noticeText}>
                Status comes from {workerName ?? 'your worker'}’s own taps. If
                they share their live location in chat, you’ll see it there.
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
                          isDark && styles.timelineDotPendingDark,
                          done && styles.timelineDotDone,
                          done && isDark && styles.timelineDotDoneDark,
                          isCurrent && !isDark && styles.timelineDotCurrent,
                        ]}
                      >
                        {done ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={isDark ? colors.gold : colors.onPrimary}
                          />
                        ) : null}
                      </View>
                      {index < TIMELINE.length - 1 ? (
                        <View
                          style={[
                            styles.timelineLine,
                            index < currentIndex && styles.timelineLineDone,
                            index < currentIndex && isDark && styles.timelineLineDoneDark,
                          ]}
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
                  <View style={[styles.infoCard, litCardStyle(isDark)]}>
                    <View style={[styles.noticeGlyph, isDark && styles.noticeGlyphDark]}>
                      <Ionicons name="time-outline" size={18} color={accent} />
                    </View>
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
                  <View style={[styles.paymentCard, litCardStyle(isDark)]}>
                    {/* D16 (R6a): the sandbox label renders in sandbox mode
                        only; the card path names the money state. */}
                    <Text style={[styles.eyebrow, isDark && styles.eyebrowDark, paymentsMode === 'stripe' && payment.status === 'held' && styles.eyebrowGold]}>
                      {paymentsMode === 'sandbox'
                        ? 'TEST MODE — NO REAL MONEY'
                        : payment.status === 'held'
                          ? 'PROTECTED PAYMENT'
                          : 'PAYMENT'}
                    </Text>
                    <MoneyText cents={payment.amount_cents} state={payment.status} />
                    {hasOpenDispute === true ? (
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // Master 14 draws every surface here as a hairlined card, and rings the
  // notice's own send-glyph. Light keeps the Heritage sage wash.
  cardDark: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeGlyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeGlyphDark: {
    borderColor: colors.gold,
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
  // Master 14's vertical timeline is line-work, exactly like master 17's
  // horizontal stepper: a done node is the deep-green disc inside a GOLD ring
  // with a gold check, the connector behind it gold. Light keeps the Heritage
  // filled emerald node.
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    // 1pt in both themes. Dark overrode this to 1 while light kept 2, so the
    // same dot was a different weight depending on the palette — and on a
    // fixed-width disc that also moved the numeral inside it. Dark is correct.
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald,
  },
  timelineDotDoneDark: {
    borderColor: colors.gold,
    backgroundColor: colors.forest,
  },
  timelineDotCurrent: {
    borderColor: colors.forest,
  },
  timelineDotPendingDark: {
    borderColor: colors.gold,
    backgroundColor: colors.background,
  },
  // Expressed as a BORDER rather than a filled 2pt view: master 14's gold
  // connector is line-work, and saying so in the style is what keeps the
  // "gold never fills a control" scan honest instead of allow-listed.
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 26,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  timelineLineDone: {
    borderLeftColor: colors.emerald,
  },
  timelineLineDoneDark: {
    borderLeftColor: colors.gold,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: spacing.lg,
    gap: 2,
  },
  timelineLabel: {
    fontFamily: fonts.display,
    fontSize: 18,
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
    color: colors.eyebrow,
    letterSpacing: 1.4,
  },
  eyebrowDark: { color: colors.eyebrow },
  eyebrowGold: { color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): PROTECTED PAYMENT while held stays antique gold in light.
  paymentNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  }),
);
