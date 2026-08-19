import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { FormScreen } from '../ui/templates/FormScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import {
  canOfferJobFunding,
  fetchJobPaymentState,
  isHeld,
  isReleased,
  type Payment,
} from '../lib/payments';
import {
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  fetchOpenJobDispute,
  openJobDispute,
  withdrawJobDispute,
  type DisputeReason,
  type JobDispute,
} from '../lib/disputes';
import { completionPhotosOf, completionVideosOf, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import {
  radius,
  selectedInDark,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screen 36 — Approve or report an issue (Phase 6, customer side).
 *
 * The decision point after the worker submits the finished work: approving
 * releases the held sandbox funds (sandbox_release_job_payment — ownership,
 * completed status, the dispute freeze and idempotency are all enforced in
 * the RPC, not by this screen's navigation), while reporting an issue opens
 * a dispute that freezes release — including the 72h auto-release clock —
 * until it is withdrawn or resolved.
 *
 * §9 ordering: review & tip (screen 37) comes AFTER release, never before.
 */
export function ApproveOrDisputeScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ApproveOrDispute'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [dispute, setDispute] = useState<JobDispute | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [details, setDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const releasingRef = useRef(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [paymentRes, disputeRes] = await Promise.all([
      fetchJobPaymentState(job.id),
      fetchOpenJobDispute(job.id),
    ]);
    if (paymentRes.error) setLoadError(userMessage(paymentRes.error));
    else setPayment(paymentRes.data);
    if (!disputeRes.error) setDispute(disputeRes.data);
    setLoaded(true);
  }, [job.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const isOwner = !!user && user.id === job.client_id;
  const completionPhotos = completionPhotosOf(job);
  const completionVideos = completionVideosOf(job);
  const hasEvidence = completionPhotos.length > 0 || completionVideos.length > 0;

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
          title: 'Only the job’s owner can approve the work',
          body: 'The person who posted this job decides on the finished work.',
        }
      : job.status !== 'completed'
        ? {
            kind: 'empty',
            title: 'Nothing to approve yet',
            body: 'Once the worker marks the job complete, review their finished work here.',
            actionLabel: 'Back to the job',
            onAction: goBackOrHome,
          }
        : !loaded
          ? { kind: 'loading', variant: 'spinner' }
          : loadError
            ? { kind: 'error', message: loadError, onRetry: () => void load() }
            : { kind: 'ready' };

  const released = !!payment && isReleased(payment);
  const held = !!payment && isHeld(payment);
  // The one funding-CTA derivation (AUD-P1-02, lib/payments) — the same
  // predicate ClientJobDetail renders its checkout card from. True only for
  // the owner on a fundable job with no ledger or an authorized-only row.
  const canFundNow = canOfferJobFunding({
    viewerId: user?.id,
    job,
    payment,
    hasOpenDispute: !!dispute,
  });

  async function approveAndRelease() {
    if (releasingRef.current) return;
    releasingRef.current = true;
    setReleasing(true);
    try {
      const result = await paymentProvider.releaseJobPayment(job.id);
      if (result.error || !result.data) {
        await alertAsync(
          'Could not release the payment',
          `${userMessage(result.error, 'Check your connection and try again.')}\n\nThe funds are exactly where they were — nothing was released.`
        );
        await load();
        return;
      }
      setPayment(result.data);
      navigation.replace('ReviewAndTip', { job });
    } finally {
      releasingRef.current = false;
      setReleasing(false);
      setConfirmApprove(false);
    }
  }

  async function submitReport() {
    if (!reason || submittingReport) return;
    setSubmittingReport(true);
    const { data, error } = await openJobDispute(job.id, reason, details.trim() || null);
    setSubmittingReport(false);
    if (error || !data) {
      // The typed report is preserved — a failed send never costs the text.
      await alertAsync(
        'Could not send the report',
        userMessage(error, 'Check your connection and try again.')
      );
      return;
    }
    setDispute(data);
    setReporting(false);
    setReason(null);
    setDetails('');
  }

  async function withdrawReport() {
    if (!dispute || withdrawing) return;
    setWithdrawing(true);
    const { data, error } = await withdrawJobDispute(dispute.id);
    setWithdrawing(false);
    setConfirmWithdraw(false);
    if (error) {
      await alertAsync('Could not withdraw the report', userMessage(error));
      return;
    }
    setDispute(data && data.status === 'open' ? data : null);
  }

  // The pinned action follows the actual money state, in priority order:
  // an open report offers withdraw; a held payment offers approval; a
  // released payment moves on to review; report mode submits the report.
  const submitLabel = reporting
    ? 'Send report'
    : dispute
      ? 'Withdraw report'
      : held
        ? `Approve & release ${formatBudget(payment?.amount_cents ?? null)}`
        : released
          ? 'Continue to review & tip'
          : undefined;

  const onSubmit = reporting
    ? submitReport
    : dispute
      ? () => setConfirmWithdraw(true)
      : held
        ? () => setConfirmApprove(true)
        : released
          ? () => navigation.replace('ReviewAndTip', { job })
          : undefined;

  return (
    <>
      <FormScreen
        title="Finished work"
        subtitle={job.title}
        onBack={() => (reporting ? setReporting(false) : goBackOrHome())}
        state={state}
        submitLabel={paymentsMode === 'sandbox' || released ? submitLabel : undefined}
        onSubmit={paymentsMode === 'sandbox' || released ? onSubmit : undefined}
        submitDisabled={reporting ? !reason : false}
        submitLoading={reporting ? submittingReport : releasing || withdrawing}
        secondaryLabel={
          reporting
            ? 'Cancel'
            : held && !dispute
              ? 'Report an issue'
              : undefined
        }
        onSecondary={
          reporting
            ? () => setReporting(false)
            : held && !dispute
              ? () => setReporting(true)
              : undefined
        }
      >
        {dispute ? (
          <View style={styles.disputeCard}>
            <View style={styles.disputeHeader}>
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <Text style={styles.disputeTitle}>Issue reported</Text>
            </View>
            <Text style={styles.disputeMeta}>
              {DISPUTE_REASON_LABELS[dispute.reason]}
            </Text>
            {dispute.details ? (
              <Text style={styles.disputeDetails}>{dispute.details}</Text>
            ) : null}
            <Text style={styles.disputeNote}>
              The payment stays held while this report is open — including the
              automatic release timer. Withdraw it below if things get sorted
              out.
            </Text>
          </View>
        ) : null}

        {payment && !canFundNow ? (
          <View style={styles.paymentCard}>
            <Text style={styles.eyebrow}>
              {released ? 'PAYMENT RELEASED · SANDBOX' : 'HELD PAYMENT · SANDBOX'}
            </Text>
            <MoneyText cents={payment.amount_cents} state={payment.status} size="lg" />
            <Text style={styles.paymentNote}>
              {released
                ? payment.release_reason === 'auto_approved'
                  ? 'Released automatically after 72 hours with no issue reported. Sandbox build — no real money moved.'
                  : 'You approved the work and the funds were released. Sandbox build — no real money moved.'
                : 'Approving releases these funds to the worker. If something isn’t right, report the issue instead — release waits while a report is open. Sandbox build, no real money.'}
            </Text>
          </View>
        ) : canFundNow ? (
          // AUD-P1-02: this used to be a dead end ("nothing to release") for
          // exactly the job that most needs a money action — completed with
          // an empty or authorized-only ledger. Funding is offered from the
          // same one derivation ClientJobDetail uses; there is nothing to
          // release until the funds are protected first.
          <View style={styles.paymentCard}>
            <Text style={styles.eyebrow}>PAYMENT NOT PROTECTED YET</Text>
            <Text style={styles.paymentNote}>
              {payment?.status === 'authorized'
                ? 'The payment is authorized — not charged — but checkout never finished, so there is nothing to release yet. Finish checkout to protect the funds; approval releases them afterwards.'
                : 'This job finished without a protected payment, so there is nothing to release yet — the worker can’t be paid until the payment is protected and then released.'}
            </Text>
            <Button
              title="Protect payment in checkout"
              onPress={() => navigation.navigate('Checkout', { job })}
            />
          </View>
        ) : (
          <View style={styles.paymentCard}>
            <Text style={styles.eyebrow}>NO PAYMENT ON THIS JOB</Text>
            <Text style={styles.paymentNote}>
              This job finished without a protected payment, so there is
              nothing to release — you can still review the work from the job
              screen.
            </Text>
          </View>
        )}

        {reporting ? (
          <View style={styles.reportForm}>
            <Text style={styles.sectionTitle}>What went wrong?</Text>
            {DISPUTE_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.reasonRow,
                  reason === r && (isDark ? styles.reasonRowActiveDark : styles.reasonRowActive),
                ]}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === r }}
              >
                <View
                  style={[
                    styles.radio,
                    reason === r && (isDark ? styles.radioActiveDark : styles.radioActive),
                  ]}
                >
                  {reason === r ? (
                    <View style={[styles.radioDot, isDark && styles.radioDotDark]} />
                  ) : null}
                </View>
                <Text style={styles.reasonLabel}>{DISPUTE_REASON_LABELS[r]}</Text>
              </Pressable>
            ))}
            <TextInput
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={styles.detailsInput}
              value={details}
              onChangeText={setDetails}
              placeholder="Add details (optional) — what you expected vs. what you got"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              accessibilityLabel="Issue details"
            />
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {hasEvidence ? 'What the worker submitted' : 'No photos or video attached'}
            </Text>
            {!hasEvidence ? (
              <Text style={styles.noEvidenceText}>
                The worker finished without attaching photos or a video. If you
                need proof of the work, ask in chat before approving.
              </Text>
            ) : null}
            {completionPhotos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaRow}
              >
                {completionPhotos.map((url) => (
                  <Pressable
                    key={url}
                    onPress={() => setViewerUri(url)}
                    accessibilityRole="button"
                    accessibilityLabel="Open finished work photo"
                  >
                    <Image source={{ uri: url }} style={styles.mediaPhoto} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {completionVideos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaRow}
              >
                {completionVideos.map((url) => (
                  <JobVideo key={url} uri={url} label="Finished work" />
                ))}
              </ScrollView>
            ) : null}
          </>
        )}
      </FormScreen>

      <PhotoViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />

      <ConfirmDialog
        visible={confirmApprove}
        title={`Release ${formatBudget(payment?.amount_cents ?? null)} to the worker?`}
        message="This approves the finished work and releases the held sandbox funds to the worker. It can’t be undone. No real money moves in this build."
        confirmText="Approve & release"
        cancelText="Not yet"
        loading={releasing}
        onConfirm={approveAndRelease}
        onCancel={() => setConfirmApprove(false)}
      />

      <ConfirmDialog
        visible={confirmWithdraw}
        title="Withdraw your issue report?"
        message="Release is unfrozen once the report is withdrawn — including the automatic release timer. You can approve the work yourself right after."
        confirmText="Withdraw report"
        cancelText="Keep it open"
        loading={withdrawing}
        onConfirm={withdrawReport}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  paymentNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  mediaRow: {
    gap: spacing.sm,
  },
  mediaPhoto: {
    width: 240,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  noEvidenceText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  disputeCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  disputeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  disputeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.danger,
  },
  disputeMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  disputeDetails: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  disputeNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  reportForm: {
    gap: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  reasonRowActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  // emerald D6: one selection treatment — gold line, gold dot, no fill.
  reasonRowActiveDark: {
    borderColor: selectedInDark(colors).line,
    backgroundColor: selectedInDark(colors).fill,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.emerald,
  },
  radioActiveDark: {
    borderColor: selectedInDark(colors).line,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.emerald,
  },
  radioDotDark: {
    backgroundColor: selectedInDark(colors).line,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  detailsInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  }),
);
