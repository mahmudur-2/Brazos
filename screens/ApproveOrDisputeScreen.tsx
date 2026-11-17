import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SelectMark } from '../components/SelectMark';
import { RemoteImage } from '../components/RemoteImage';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlowTextInput } from '../components/GlowTextInput';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenStateView, type ScreenState } from '../ui/templates/ScreenStates';
import { FloatingAction, useScrollClearance } from '../ui/primitives';
import { Sheet } from '../ui/primitives/Sheet';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { invalidateJobs } from '../lib/queryClient';
import { isNetworkError, userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { paymentEyebrow } from '../lib/moneyCopy';
import {
  canOfferJobFunding,
  fetchJobPaymentState,
  isHeld,
  isReleased,
  isReleaseRequested,
  type Payment,
} from '../lib/payments';
import {
  customerChargeCents,
  isCancellationFeeKept,
  isPayoutOnItsWay,
  isRefundArranged,
  isRefundFailed,
  isRefundQueued,
} from '../lib/paymentRules';
import { serverNowMs } from '../lib/serverClock';
import {
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  fetchOpenJobDispute,
  openJobDispute,
  withdrawJobDispute,
  type DisputeReason,
  type JobDispute,
} from '../lib/disputes';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { completionPhotosOf, completionVideosOf, formatBudget, type Job } from '../lib/jobs';
import { isRefundFailureRecorded, releaseAtLabel, releaseDeadlineMs } from '../lib/jobLifecycle';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import {
  EYEBROW_TYPE,
  layout,
  radius,
  screenGround,
  selectedInDark,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  wellStyle,
  type ColorPalette,
} from '../lib/theme';
import { titleCase } from '../lib/titleCase';

/**
 * Screen 36 — Approve or report an issue (Phase 6, customer side).
 *
 * The decision point after the worker submits the finished work: approving
 * requests the release of the held funds (release_job_payment — ownership,
 * completed status, the dispute freeze and idempotency are all enforced in
 * the RPC, not by this screen's navigation), while reporting an issue opens
 * a dispute that freezes release — including the 72h auto-release clock —
 * until it is withdrawn or resolved.
 *
 * §9 ordering: review & tip (screen 37) comes AFTER release, never before.
 *
 * P12 (owner yes, RESTRUCTURE): the route renders the ONE body below as a screen; the job page
 * mounts the same body as a sheet. Never a second copy of the approve or report body.
 */
export function ApproveOrDisputeScreen() {
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ApproveOrDispute'>>();
  return <ApproveOrDispute job={params.job} presentation="screen" />;
}

/** The two moves off the page the body makes (the route's navigation is one). */
type ApproveMoves = {
  replace(screen: 'ReviewAndTip', params: MyJobsStackParamList['ReviewAndTip']): void;
  navigate(screen: 'Checkout', params: MyJobsStackParamList['Checkout']): void;
};

/**
 * P12: lives inside the sheet's Modal, so it mounts when the sheet is drawn and unmounts only when
 * the Modal stops drawing its content (on iOS after the native dismiss): the close has finished.
 */
function SheetPresence({ up, onGone }: { up: MutableRefObject<boolean>; onGone: () => void }) {
  const latest = useRef(onGone);
  latest.current = onGone;
  useEffect(() => {
    up.current = true;
    return () => {
      up.current = false;
      latest.current();
    };
  }, [up]);
  return null;
}

export function ApproveOrDispute({
  job: jobParam,
  presentation,
  visible = true,
  onClose,
}: {
  job: Job;
  /** 'screen' = the route; 'sheet' = the job page's sheet (it stays mounted, so a typed report outlives a close). */
  presentation: 'screen' | 'sheet';
  /** Sheet only: whether the sheet is up. */
  visible?: boolean;
  /** Sheet only: closes the sheet. The screen goes back instead. */
  onClose?: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  // With no floating action the bar shows, and the list ends above its pill.
  const navClearance = useScrollClearance();
  const styles = stylesFor(colors);
  const routeNavigation = useNavigation<MyJobsStackNavigation>();
  // P12: in the sheet, a move off the job page closes the sheet first and starts only when it is
  // gone (SheetPresence), so no navigation can run under a closing sheet. Review & Tip is pushed
  // over the job page, which stays under it as it stayed under the approve screen it replaced.
  const sheetUp = useRef(false);
  const pendingMove = useRef<(() => void) | null>(null);
  const afterSheet = (move: () => void) => {
    if (!sheetUp.current) return move();
    pendingMove.current = move;
    onClose?.();
  };
  const navigation: ApproveMoves =
    presentation === 'sheet'
      ? {
          replace: (screen, next) => afterSheet(() => routeNavigation.navigate(screen, next)),
          navigate: (screen, next) => afterSheet(() => routeNavigation.navigate(screen, next)),
        }
      : routeNavigation;
  const leave = onClose ?? goBackOrHome;
  const { job, missing } = useOwnedJobDetail(jobParam);
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
  // D15: the payments kill switch, read on focus; a failed read is true.
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);

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

  // P12: the sheet stays mounted with the job page, so it reads again each time it opens (as each
  // visit to the screen did) and never while it is down; the screen is always visible.
  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      void load();
    }, [load, visible])
  );

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      let active = true;
      fetchRemoteConfig().then((config) => {
        if (active) setPaymentsEnabled(config.paymentsEnabled);
      });
      return () => {
        active = false;
      };
    }, [visible])
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
        onAction: leave,
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
            onAction: leave,
          }
        : !loaded
          ? { kind: 'loading', variant: 'spinner' }
          : loadError
            ? { kind: 'error', message: loadError, onRetry: () => void load() }
            : { kind: 'ready' };

  const released = !!payment && isReleased(payment);
  // D23: a stripe row the customer approved keeps status held until the
  // provider's transfer lands, with release_requested_at set. It is decided —
  // no approve CTA, and review admits it, so nothing can loop back here.
  const releaseRequested = !!payment && isReleaseRequested(payment);
  const held = !!payment && isHeld(payment) && !releaseRequested;
  // A4 wiring (P1): the server's release time (release_due_at); none, or one already passed (the
  // timer runs every 10 minutes), promises no time.
  const releaseAt = isRefundFailureRecorded(payment) ? null : releaseDeadlineMs(job);
  const settled = released || releaseRequested;
  const stripe = paymentsMode === 'stripe';
  // D15 / D18: the release CTA answers to the kill switch and to the mode;
  // reporting, withdrawing and moving on to review do not.
  const releaseAllowed = paymentsMode !== 'disabled' && paymentsEnabled;
  // The one funding-CTA derivation (AUD-P1-02, lib/payments) — the same
  // predicate ClientJobDetail renders its checkout card from. True only for
  // the owner on a fundable job with no ledger or an authorized-only row.
  const canFundNow = canOfferJobFunding({
    viewerId: user?.id,
    job,
    payment,
    hasOpenDispute: !!dispute,
    nowMs: serverNowMs(),
  });

  async function approveAndRelease() {
    if (releasingRef.current) return;
    releasingRef.current = true;
    setReleasing(true);
    try {
      const result = await paymentProvider.releaseJobPayment(job.id);
      // F13: an own mutation — the cached hub and feed are out of date.
      invalidateJobs();
      if (result.error || !result.data) {
        // A11: no answer (offline, a timeout) says nothing about whether the release happened. Read the
        // payment again BEFORE saying anything about where the money is.
        if (isNetworkError(result.error)) {
          const fresh = await fetchJobPaymentState(job.id);
          if (!fresh.error && fresh.data) {
            setPayment(fresh.data);
            if (isReleased(fresh.data) || isReleaseRequested(fresh.data)) {
              navigation.replace('ReviewAndTip', { job });
              return;
            }
            await alertAsync('The payment was not released', 'We checked again: the funds are still held and nothing was released. Check your connection and try again.');
            return;
          }
          await alertAsync('We couldn’t confirm the release', 'We couldn’t reach Brazos to check whether the payment was released. Check your connection, then pull to refresh before you decide. Approving again is safe — a payment is released only once.');
          await load();
          return;
        }
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
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
    // Codex R8-A1: the report changes the payout fact; read the payment again.
    void load();
  }

  async function withdrawReport() {
    if (!dispute || withdrawing) return;
    setWithdrawing(true);
    const { data, error } = await withdrawJobDispute(dispute.id);
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
    setWithdrawing(false);
    setConfirmWithdraw(false);
    if (error) {
      await alertAsync('Could not withdraw the report', userMessage(error));
      return;
    }
    setDispute(data && data.status === 'open' ? data : null);
    // Codex R8-A1: so does withdrawing it.
    void load();
  }

  // 2026-09-26 (the refresh, audit M-6): the charge includes the protection fee,
  // which the worker never receives — so the approve button names the act, and
  // the dialog names the charge.
  // The pinned action follows the actual money state, in priority order:
  // an open report offers withdraw; a held payment offers approval (when the
  // mode and the kill switch allow it); a released — or approved, payout
  // pending — payment moves on to review; report mode submits the report.
  const submitLabel = reporting
    ? 'Send Report'
    : dispute
      ? 'Withdraw Report'
      : held
        ? releaseAllowed
          ? // Codex R12 (the owner's labels): a refund of it failed: approving releases nothing.
            isRefundFailureRecorded(payment) ? 'Approve the Work' : `Approve & Release Payment`
          : undefined
        : settled
          ? stripe
            ? 'Continue to Review'
            : 'Continue to Review & Tip'
          : undefined;

  const onSubmit = reporting
    ? submitReport
    : dispute
      ? () => setConfirmWithdraw(true)
      : held
        ? releaseAllowed
          ? () => setConfirmApprove(true)
          : undefined
        : settled
          ? () => navigation.replace('ReviewAndTip', { job })
          : undefined;

  // RESTRUCTURE (G1b): a task screen. The bar steps aside and the one main action floats, full
  // width, with no plate; the second action sits in the card it belongs to ("Report an Issue" in
  // the payment card, "Cancel" at the foot of the report form).
  const showAction = Boolean(submitLabel && onSubmit);

  // P12: the one body, framed below by the screen or by the job page's sheet.
  const body = (
      <>
        {dispute ? (
          <View style={styles.disputeCard}>
            <View style={styles.disputeHeader}>
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <Text style={styles.disputeTitle}>Issue Reported</Text>
            </View>
            <Text style={styles.disputeMeta}>
              {DISPUTE_REASON_LABELS[dispute.reason]}
            </Text>
            {dispute.details ? (
              <Text style={styles.disputeDetails}>{dispute.details}</Text>
            ) : null}
            {/* A12a (2026-10-03): who decides, and how fast. The resolution itself is
                resolve_job_dispute(), service_role only, run by the operator from
                docs/runbooks/dispute-resolution.md — never from the app. */}
            <Text style={styles.disputeNote}>
              The payment stays held while this report is open — including the
              automatic release timer. Brazos will look at it and reply
              within 2 business days. Withdraw it below if things get sorted
              out.
            </Text>
          </View>
        ) : null}

        {payment && !canFundNow ? (
          <Card style={styles.paymentCard}>
            {/* MoneyText keeps the row's real status — held is still
                literally true on an approved stripe row (D23); C4: the
                eyebrow is PAYMENT in every state and the caption carries the
                approval ("Approved — on its way to …"). */}
            <Text style={styles.eyebrow}>{paymentEyebrow()}</Text>
            {/* Tier A (C2, D-4): the customer's held figure is the row's own
                charge_amount_cents, in the card, the CTA and the dialog alike. */}
            <MoneyText
              cents={customerChargeCents(payment)}
              state={payment.status}
              size="lg"
              releaseRequested={releaseRequested}
              issueOpen={dispute?.status === 'open'}
              refundQueued={isRefundQueued(payment)}
              feeKept={isCancellationFeeKept(payment)}
              refundFailed={isRefundFailed(payment)}
              refundArranged={isRefundArranged(payment)}
              payoutOnItsWay={isPayoutOnItsWay(payment)}
            />
            {held && releaseAt != null && releaseAt > serverNowMs() ? (
              <Text style={styles.paymentNote}>
                Releases automatically {releaseAtLabel(releaseAt, serverNowMs())} if you do
                nothing.
              </Text>
            ) : null}
            {/* Codex R11-A2: before approval, a refund of it failed: approving sends nothing; no note. */}
            {!released && !releaseRequested && releaseAllowed && isRefundFailureRecorded(payment) ? null : (
              <Text style={styles.paymentNote}>
                {released
                  ? payment.release_reason === 'auto_approved'
                    ? 'Released automatically with no issue reported.'
                    : 'You approved the work and the payment was released to the worker.'
                  : releaseRequested && !isPayoutOnItsWay(payment)
                    ? // Codex R5-A5, R7-A3, R8-A1: approved, but the payout is not on its way (a refund, an issue
                      // reported after the timer, a reversed transfer, a card dispute): the approval alone.
                      payment.release_reason === 'auto_approved'
                      ? 'Approved automatically.'
                      : 'You approved the work.'
                  : releaseRequested
                    ? payment.release_reason === 'auto_approved'
                      ? // C4: requested is not released — the word waits for the transfer.
                        'Approved automatically with no issue reported. The payment is on its way to the worker and shows as released when the transfer lands.'
                      : 'You approved the work. The payment is on its way to the worker and shows as released when the transfer lands.'
                    : releaseAllowed
                      ? // Tier A (C3, D23): approving REQUESTS the release; the
                        // transfer lands later, so the payment is "on its way".
                        'Approving sends this payment on its way to the worker. If something isn’t right, report the issue instead — release waits while a report is open.'
                      : 'Payments are paused right now, so approval is unavailable for the moment. If something isn’t right, you can still report the issue.'}
              </Text>
            )}
            {!reporting && held && !dispute ? (
              <Button title="Report an Issue" variant="quiet" size="sm" onPress={() => setReporting(true)} />
            ) : null}
          </Card>
        ) : canFundNow ? (
          // AUD-P1-02: this used to be a dead end ("nothing to release") for
          // exactly the job that most needs a money action — completed with
          // an empty or authorized-only ledger. Funding is offered from the
          // same one derivation ClientJobDetail uses; there is nothing to
          // release until the funds are protected first.
          <Card style={styles.paymentCard}>
            <Text style={styles.eyebrow}>PAYMENT NOT PROTECTED YET</Text>
            <Text style={styles.paymentNote}>
              {payment?.status === 'authorized'
                ? 'The payment is authorized — not charged — but checkout never finished, so there is nothing to release yet. Finish checkout to protect the funds; approval releases them afterwards.'
                : 'This job finished without a protected payment, so there is nothing to release yet — the worker can’t be paid until the payment is protected and then released.'}
            </Text>
            <Button
              title="Protect Payment in Checkout"
              onPress={() => navigation.navigate('Checkout', { job })}
            />
          </Card>
        ) : (
          <Card style={styles.paymentCard}>
            <Text style={styles.eyebrow}>NO PAYMENT ON THIS JOB</Text>
            <Text style={styles.paymentNote}>
              This job finished without a protected payment, so there is
              nothing to release — you can still review the work from the job
              screen.
            </Text>
          </Card>
        )}

        {reporting ? (
          <Card style={styles.group}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>What went wrong?</Text>
            {DISPUTE_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.reasonRow,
                  // Each reason is a well inside the form's card.
                  wellStyle(colors, isDark),
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
                  {/* FIX-RUN F12: the dot arrives on a short spring (components/SelectMark). */}
                  <SelectMark
                    on={reason === r}
                    mark={<View style={[styles.radioDot, isDark && styles.radioDotDark]} />}
                  />
                </View>
                <Text style={styles.reasonLabel}>{titleCase(DISPUTE_REASON_LABELS[r])}</Text>
              </Pressable>
            ))}
            <GlowTextInput
              glowRadius={radius.md}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={[styles.detailsInput, wellStyle(colors, isDark)]}
              value={details}
              onChangeText={setDetails}
              placeholder="Add details (optional) — what you expected vs. what you got"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              accessibilityLabel="Issue details"
            />
            <Button title="Cancel" variant="quiet" size="sm" onPress={() => setReporting(false)} />
          </Card>
        ) : (
          <Card style={styles.group}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {hasEvidence ? 'What the Worker Submitted' : 'No Photos or Video Attached'}
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
                    <RemoteImage uri={url} style={styles.mediaPhoto} />
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
                  <JobVideo key={url} uri={url} label="Finished Work" />
                ))}
              </ScrollView>
            ) : null}
          </Card>
        )}
      </>
  );

  // The photo viewer and the two confirms: beside the screen, and inside the sheet's tree (its
  // overlay layer, in the sheet's Modal), so iOS presents them over the sheet.
  const dialogs = (
    <>
      <PhotoViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />

      <ConfirmDialog
        visible={confirmApprove}
        title={isRefundFailureRecorded(payment) ? 'Approve the finished work?' : 'Release the payment to the worker?'}
        message={
          `Your card was charged ${formatBudget(payment ? customerChargeCents(payment) : null)} at checkout, including the protection fee — nothing more is charged.` +
          // Codex R11-A2: a refund of it failed: the charge alone.
          (isRefundFailureRecorded(payment)
            ? ''
            : '\n\n' +
              'This approves the finished work and releases the payment to the worker. It can’t be undone — the payout is sent on the provider’s schedule and shows as released when the transfer lands.')
        }
        confirmText={isRefundFailureRecorded(payment) ? 'Approve' : 'Approve & Release'}
        loading={releasing}
        onConfirm={approveAndRelease}
        onCancel={() => setConfirmApprove(false)}
      />

      <ConfirmDialog
        visible={confirmWithdraw}
        title="Withdraw your issue report?"
        message={
          // Codex R11-A2: a refund of it failed: nothing is released either way; the second sentence alone.
          (isRefundFailureRecorded(payment)
            ? ''
            : 'Release is unfrozen once the report is withdrawn — including the automatic release timer. ') +
          'You can approve the work yourself right after.'
        }
        confirmText="Withdraw Report"
        // F12: withdrawing cancels the report, so the confirm is red.
        destructive
        loading={withdrawing}
        onConfirm={withdrawReport}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </>
  );

  if (presentation === 'sheet') {
    // The same title and the same main label as the screen; the main action sits in the sheet's
    // footer, above the keyboard (avoidKeyboard, the counter-offer sheet's way). "Done" closes it:
    // the photo viewer owns "Close" and the confirms own "Cancel" while they are up.
    return (
      <Sheet
        visible={visible}
        title="Review & Approve"
        dismissWord="Done"
        onClose={leave}
        avoidKeyboard
        footer={
          state.kind === 'ready' && showAction && submitLabel && onSubmit ? (
            <Button
              title={submitLabel}
              onPress={onSubmit}
              // F1: "Withdraw report" cancels the report, so it is red.
              variant={!reporting && dispute ? 'destructive' : 'primary'}
              disabled={reporting ? !reason : false}
              loading={reporting ? submittingReport : releasing || withdrawing}
            />
          ) : undefined
        }
        overlay={
          <>
            {dialogs}
            <SheetPresence
              up={sheetUp}
              onGone={() => {
                const move = pendingMove.current;
                pendingMove.current = null;
                move?.();
              }}
            />
          </>
        }
      >
        {state.kind !== 'ready' ? <ScreenStateView state={state} /> : <View style={styles.sheetBody}>{body}</View>}
      </Sheet>
    );
  }

  return (
    <>
      <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
        <ScreenHeader
          title="Review & Approve"
          subtitle={job.title}
          onBack={() => (reporting ? setReporting(false) : goBackOrHome())}
        />
        {state.kind !== 'ready' ? (
          <ScreenStateView state={state} />
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={[styles.content, { paddingBottom: showAction ? spacing.lg : navClearance }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {body}
            </ScrollView>
            {showAction && submitLabel && onSubmit ? (
              <FloatingAction
                title={submitLabel}
                onPress={onSubmit}
                // F1: "Withdraw report" cancels the report, so it is red.
                variant={!reporting && dispute ? 'destructive' : 'primary'}
                disabled={reporting ? !reason : false}
                loading={reporting ? submittingReport : releasing || withdrawing}
              />
            ) : null}
          </>
        )}
      </SafeAreaView>
      {dialogs}
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.lg,
  },
  // P12: the same rhythm between the cards inside the sheet's own scroller and padding.
  sheetBody: {
    gap: spacing.lg,
  },
  eyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  sectionTitle: {
    ...textScale.control,
    fontWeight: '800',
    color: colors.ink,
  },
  // The lit Card's own padding, fill and rim; only the rhythm inside is set here.
  paymentCard: {
    gap: spacing.sm,
  },
  group: {
    gap: spacing.md,
  },
  paymentNote: {
    ...textScale.label,
    fontWeight: '400',
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
    ...textScale.label,
    fontWeight: '400',
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
    ...textScale.control,
    fontWeight: '800',
    color: colors.danger,
  },
  disputeMeta: {
    ...textScale.body,
    fontWeight: '700',
    color: colors.ink,
  },
  disputeDetails: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.text,
    lineHeight: 19,
  },
  disputeNote: {
    ...textScale.footnote,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 17,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    // The well's corner; its fill and rim come from wellStyle.
    borderRadius: radius.md,
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
    borderRadius: radius.pill,
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
    borderRadius: radius.pill,
    backgroundColor: colors.emerald,
  },
  radioDotDark: {
    backgroundColor: selectedInDark(colors).line,
  },
  reasonLabel: {
    ...textScale.callout,
    flex: 1,
    fontWeight: '600',
    color: colors.ink,
  },
  detailsInput: {
    ...textScale.callout,
    fontWeight: '400',
    minHeight: 96,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.ink,
  },
  }),
);
