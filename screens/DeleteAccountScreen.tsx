import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '../components/TextField';
import { FormScreen } from '../ui/templates/FormScreen';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { fetchJobById } from '../lib/jobs';
import { useAuth } from '../hooks/useAuth';
import { signOutLocally, SIGN_OUT_UNFINISHED_MESSAGE } from '../lib/signOut';
import { deleteMyAccount, fetchAccountDeletionBlockers } from '../lib/accountDeletion';
import { paymentsMode } from '../lib/adapters/payments';
import { cardSweepMessage, removeEverySavedCard } from '../lib/paymentMethods';
import { CONTACT_SUPPORT_LINE, formatBlockerList, type BlockerRow } from '../lib/accountDeletionBlockers';
import { openSupportMail, SUPPORT_EMAIL } from '../lib/appLinks';
import { Button } from '../ui/primitives';
import type { ProfileStackNavigation } from '../lib/navigation';
import {
  EYEBROW_TYPE,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { Card } from '../components/Card';

/**
 * Delete account — App Store Guideline 5.1.1(v).
 *
 * Three things this screen is careful about:
 *
 * 1. It tells the truth about what survives. Reviews written and received stay
 *    (attributed to "Deleted user"), and payment records are kept for tax and
 *    legal reasons but severed from identity. Saying "everything is erased"
 *    would be a lie the database would then contradict.
 * 2. The blocker list is a courtesy, not the gate. delete_my_account() applies
 *    the same rule again server-side and refuses with ACCOUNT_DELETION_BLOCKED
 *    — so a stale list on this screen cannot delete anything it shouldn't.
 * 3. After a successful delete the auth row is gone but this device's JWT is
 *    still valid until it expires, so a server-side sign-out would answer
 *    401/403. Only the LOCAL session is cleared, any failure from that is
 *    swallowed, and the user never sees an error after their account is
 *    already deleted.
 */

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user, suspended } = useAuth();
  // B1: opened from the suspended screen (App.tsx AccountGate). The same blockers, the same card
  // step and the same delete; no row opens another screen (none is open to a suspended account),
  // and each row names support instead.
  const inGate = suspended === true;
  const openingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);
  const [headline, setHeadline] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadBlockers = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchAccountDeletionBlockers();
    if (error) {
      setLoadError(userMessage(error));
      setLoading(false);
      return false;
    }
    const list = formatBlockerList(data, { routable: !inGate });
    setBlockers(list.rows);
    setHeadline(list.headline);
    setLoading(false);
    return true;
  }, [inGate]);

  useEffect(() => {
    void loadBlockers();
  }, [loadBlockers]);

  function openBlocker(row: BlockerRow) {
    // Only kinds ROUTABLE_KINDS knows about get here; everything else renders
    // as plain text, because this stack has no route for it and phase67's
    // scope forbids inventing one.
    if (row.route === 'Earnings') navigation.navigate('Earnings');
    if (row.route === 'Job' && row.refId) void openBlockingJob(row.refId);
  }

  // A job (or the dispute on it) that blocks deletion: open the job's own page, where Cancel is.
  // The customer's page and the worker's are different screens, so the job says which this user is.
  async function openBlockingJob(jobId: string) {
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      const { data: job, error } = await fetchJobById(jobId);
      if (error || !job) {
        await alertAsync('Couldn’t open this job', userMessage(error, 'Check your connection and try again.'));
        return;
      }
      if (user && job.client_id === user.id) {
        navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job }, { fallbackToTabRoot: true });
      } else {
        navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: job.id }, { fallbackToTabRoot: true });
      }
    } finally {
      openingRef.current = false;
    }
  }

  async function handleDelete() {
    if (deletingRef.current) return;
    const ok = await confirmAsync({
      title: 'Delete this account?',
      message:
        'This cannot be undone. You will be signed out immediately and will not be able to sign back in with this account.',
      confirmText: 'Delete Account',
      destructive: true,
    });
    if (!ok) return;
    // A4 wiring (P2): one run at a time, so a double tap starts one card step, not two. "Try Again"
    // runs again from the gate, with no second confirm.
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      while (await deleteOnce()) {
        // Try Again.
      }
    } finally {
      deletingRef.current = false;
    }
  }

  /** One run, from the gate. True only when the card step kept the account and the person chose Try Again. */
  async function deleteOnce(): Promise<boolean> {
    setDeleting(true);
    // A18a review (2026-10-03): the server's gate — account_deletion_blockers(), the same function
    // delete_my_account() applies — is read again HERE, before any card is touched. The list on
    // screen is a courtesy that may have aged, and a refusal AFTER the cards were detached would
    // leave a live account with no saved card. A read that fails keeps the user here, cards intact.
    const gate = await fetchAccountDeletionBlockers();
    if (gate.error) {
      setDeleting(false);
      await alertAsync('Could not delete this account', userMessage(gate.error));
      return false;
    }
    // A18a (2026-10-03): the saved cards go with the account — detached at the provider through
    // payment-methods, the one path that removes a card, before the row is deleted. A4 wiring (P2):
    // no longer best effort. The account goes only after an empty list proves every card is gone;
    // any failure keeps the account and asks to try again. The step runs on the card path
    // (paymentsMode 'stripe', the build's own setting in lib/adapters/payments.ts), even while the
    // owner's remote pause is on: cards can exist then. With payments off ('disabled') there is no
    // card path, the step is skipped, and the account can still be deleted. The payout account is
    // NOT closed: money still owed to a worker reaches it after deletion (process-settlements pays
    // payment_accounts, not profiles).
    let cardsNote = '';
    if (gate.data.length === 0 && paymentsMode === 'stripe') {
      const cards = await removeEverySavedCard();
      if (cards.error) {
        setDeleting(false);
        return confirmAsync({
          title: 'Could not delete this account',
          // UA-02: cards removed before the step failed are gone; the message says so.
          message: `${cardSweepMessage(cards.error)}${cards.removed > 0 ? ' Some of your saved cards were removed.' : ''}`,
          confirmText: 'Try Again',
        });
      }
      // A4-03: when the deletion then fails, the two messages below say the cards are already gone.
      if (cards.removed > 0) cardsNote = ' Your saved cards were removed.';
    }
    const { blocked, error } =
      gate.data.length > 0 ? { blocked: true, error: null } : await deleteMyAccount();

    if (blocked) {
      // Something changed between the list loading and the tap. Show what
      // actually blocks now instead of a raw database error.
      setDeleting(false);
      setConfirmText('');
      const listFresh = await loadBlockers();
      await alertAsync(
        'Not ready yet',
        `Something on this account still has to be settled first.${listFresh ? ' The list below is up to date.' : ''}${cardsNote}`
      );
      return false;
    }

    if (error) {
      // Deletion did NOT happen. Keep the user here, keep their typed
      // confirmation, and say so plainly.
      setDeleting(false);
      await alertAsync('Could not delete this account', `${userMessage(error)}${cardsNote}`);
      return false;
    }

    // Deleted. From here nothing may say the deletion failed: the account is
    // already gone, and telling the user otherwise would be false.
    // A4 wiring (A2): the session leaves this phone through lib/signOut, which
    // never throws and reads every removal back (the row that session
    // authenticates no longer exists, so no server call is needed). When the
    // removal is not proven, the one sign-out sentence follows the confirmation.
    const signedOut = await signOutLocally();

    // The root navigator gates on the session (App.tsx renders <AuthFlow />
    // whenever there is no user), so clearing it IS the stack reset — the
    // whole authenticated tree unmounts. popToTop is the belt-and-braces
    // half, so this screen is not left in a stack even if the SIGNED_OUT
    // event never lands.
    navigation.popToTop();
    const deletedBody =
      'Your account has been deleted. Reviews you wrote or received stay on the marketplace, attributed to “Deleted user”.';
    void alertAsync('Account deleted', signedOut ? deletedBody : `${deletedBody} ${SIGN_OUT_UNFINISHED_MESSAGE}`);
    return false;
  }

  const blocked = blockers.length > 0;
  const canDelete = !blocked && confirmText.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <FormScreen
      title="Delete Account"
      subtitle="Permanent. Please read this first."
      onBack={goBackOrHome}
      // M-33 — the commit is pinned above the keyboard, red, and stays
      // disabled until DELETE is typed (or while anything blocks deletion).
      submitLabel="Delete My Account"
      onSubmit={handleDelete}
      submitDisabled={!canDelete}
      submitLoading={deleting}
      submitVariant="destructive"
      insideTabs={!inGate}
      state={
        loading
          ? { kind: 'loading', variant: 'spinner' }
          : loadError
          ? { kind: 'error', message: loadError, onRetry: () => void loadBlockers() }
          : { kind: 'ready' }
      }
    >
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>What Is Removed</Text>
        <Line text="Your name, phone number, photo, bio and categories." />
        <Line text="Your services, availability and portfolio." />
        <Line text="Your saved workers, notification settings and this device’s push registration." />
        <Line text="Any card you saved for one-tap hiring. It is removed from the payment provider before the account goes." />
        <Line text="Your open job postings. Any job still taking offers is cancelled when the account is deleted — it does not stay on the marketplace without you." />
        <Line text="Your sign-in. You will not be able to sign back in with this account." />
      </Card>

      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>What Is Kept, and Why</Text>
        <Line
          text="Reviews you wrote and reviews you received stay on the marketplace. They are attributed to “Deleted user” — removing them would rewrite other people’s reputation."
        />
        <Line
          text="Payment records are kept for tax and legal reasons, but they no longer identify you."
        />
        <Line text="Your payout account stays open until every payment still owed to you has reached it — nothing you earned is lost with the account." />
        <Line text="Messages and jobs stay in the other person’s history, under “Deleted user”." />
      </Card>

      {blocked ? (
        // The gate: one lit card under an amber heading, each blocker a well inside it.
        <Card style={styles.blockedCard}>
          <View style={styles.blockedHeader}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
            <Text accessibilityRole="header" style={styles.blockedTitle}>{headline}</Text>
          </View>
          {blockers.map((row) => (
            <BlockerRowView key={row.key} row={row} onOpen={() => openBlocker(row)} />
          ))}
          {inGate ? null : (
            <Text style={styles.blockedNote}>
              Finish or cancel each of these, then come back. Deleting now would
              leave someone else without the job, the payment or the answer they
              are waiting on.
            </Text>
          )}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Confirm</Text>
          <Text style={styles.body}>
            Type {CONFIRM_WORD} to enable the button below.
          </Text>
          <TextField
            label={`Type ${CONFIRM_WORD}`}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_WORD}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm account deletion`}
          />
        </Card>
      )}

    </FormScreen>
  );
}

function BlockerRowView({ row, onOpen }: { row: BlockerRow; onOpen: () => void }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const body = (
    <>
      <Text style={styles.blockerGroup}>{row.group}</Text>
      <View style={styles.blockerTitleRow}>
        <Text style={styles.blockerLabel} numberOfLines={2}>
          {row.label}
        </Text>
        {row.route ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        ) : null}
      </View>
      <Text style={styles.blockerDetail}>{row.detail}</Text>
      {row.support ? (
        <>
          <Text style={styles.blockerDetail}>{CONTACT_SUPPORT_LINE}</Text>
          <Button
            title={SUPPORT_EMAIL}
            variant="ghost"
            size="sm"
            icon="mail-outline"
            iconPosition="leading"
            onPress={() => void openSupportMail()}
            accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
            style={styles.supportLink}
          />
        </>
      ) : null}
    </>
  );

  // No route for this kind: a row that looks tappable but does nothing is
  // worse than a row that plainly is not.
  if (!row.route) return <Card level="well" style={styles.blockerRow}>{body}</Card>;

  return (
    <Pressable
      style={({ pressed }) => pressed && styles.pressed}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${row.group}: ${row.label}`}
    >
      <Card level="well" style={styles.blockerRow}>{body}</Card>
    </Pressable>
  );
}

function Line({ text }: { text: string }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.line}>
      {/* Masters 31/32 set each removal bullet in gold. */}
      <Ionicons name="ellipse" size={6} color={colors.mark} style={styles.bullet} />
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  cardTitle: {
    ...textScale.title,
    color: colors.text,
  },
  body: {
    flex: 1,
    ...textScale.body,
    color: colors.textMuted,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    marginTop: 7,
  },
  blockedCard: {
    gap: spacing.md,
  },
  blockedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  // Master 32's gate heading is the hottest amber in the set — warn, never
  // danger red. The palette's `warning` IS that amber under v2.
  blockedTitle: {
    flex: 1,
    ...textScale.title,
    color: colors.warning,
  },
  blockedNote: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
  },
  blockerRow: {
    gap: 2,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  blockerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Master 32 sets each blocker's JOB / PAYMENT eyebrow green — a live-state
  // label for something that is currently unsettled.
  blockerGroup: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  blockerLabel: {
    flex: 1,
    ...textScale.headline,
    color: colors.text,
  },
  blockerDetail: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
  },
  supportLink: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.85,
  },
  }),
);
