import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { FormScreen } from '../ui/templates/FormScreen';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { supabase } from '../lib/supabase';
import { deleteMyAccount, fetchAccountDeletionBlockers } from '../lib/accountDeletion';
import { formatBlockerList, type BlockerRow } from '../lib/accountDeletionBlockers';
import type { ProfileStackNavigation } from '../lib/navigation';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

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

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);
  const [headline, setHeadline] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadBlockers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchAccountDeletionBlockers();
    if (error) {
      setLoadError(userMessage(error));
      setLoading(false);
      return;
    }
    const list = formatBlockerList(data);
    setBlockers(list.rows);
    setHeadline(list.headline);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBlockers();
  }, [loadBlockers]);

  function openBlocker(row: BlockerRow) {
    // Only kinds ROUTABLE_KINDS knows about get here; everything else renders
    // as plain text, because this stack has no route for it and phase67's
    // scope forbids inventing one.
    if (row.route === 'Earnings') navigation.navigate('Earnings');
  }

  async function handleDelete() {
    const ok = await confirmAsync({
      title: 'Delete this account?',
      message:
        'This cannot be undone. You will be signed out immediately and will not be able to sign back in with this account.',
      confirmText: 'Delete account',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setDeleting(true);
    const { blocked, error } = await deleteMyAccount();

    if (blocked) {
      // Something changed between the list loading and the tap. Show what
      // actually blocks now instead of a raw database error.
      setDeleting(false);
      setConfirmText('');
      await loadBlockers();
      await alertAsync(
        'Not ready yet',
        'Something on this account still has to be settled first. The list below is up to date.'
      );
      return;
    }

    if (error) {
      // Deletion did NOT happen. Keep the user here, keep their typed
      // confirmation, and say so plainly.
      setDeleting(false);
      await alertAsync('Could not delete this account', userMessage(error));
      return;
    }

    // Deleted. From here nothing may surface an error: the account is already
    // gone, and telling the user otherwise would be false.
    try {
      // scope:'local' clears the stored session without contacting the auth
      // server — which is the point, since the row that session authenticates
      // no longer exists.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Non-fatal by construction. Swallowed deliberately.
    }

    // The root navigator gates on the session (App.tsx renders <AuthFlow />
    // whenever there is no user), so clearing it IS the stack reset — the
    // whole authenticated tree unmounts. popToTop is the belt-and-braces
    // half, so this screen is not left in a stack even if the SIGNED_OUT
    // event never lands.
    navigation.popToTop();
    void alertAsync(
      'Account deleted',
      'Your BRAZOS account has been deleted. Reviews you wrote or received stay on the marketplace, attributed to “Deleted user”.'
    );
  }

  const blocked = blockers.length > 0;
  const canDelete = !blocked && confirmText.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <FormScreen
      title="Delete account"
      subtitle="Permanent. Please read this first."
      onBack={goBackOrHome}
      state={
        loading
          ? { kind: 'loading', variant: 'spinner' }
          : loadError
          ? { kind: 'error', message: loadError, onRetry: () => void loadBlockers() }
          : { kind: 'ready' }
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>What is removed</Text>
        <Line text="Your name, phone number, photo, bio and categories." />
        <Line text="Your services, availability and portfolio." />
        <Line text="Your saved workers, notification settings and this device’s push registration." />
        <Line text="Your open job postings. Any job still taking offers is cancelled when the account is deleted — it does not stay on the marketplace without you." />
        <Line text="Your sign-in. You will not be able to sign back in with this account." />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What is kept, and why</Text>
        <Line
          text="Reviews you wrote and reviews you received stay on the marketplace. They are attributed to “Deleted user” — removing them would rewrite other people’s reputation."
        />
        <Line
          text="Payment records are kept for tax and legal reasons, but they no longer identify you."
        />
        <Line text="Messages and jobs stay in the other person’s history, under “Deleted user”." />
      </View>

      {blocked ? (
        <View style={styles.blockedBox}>
          <View style={styles.blockedHeader}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
            <Text style={styles.blockedTitle}>{headline}</Text>
          </View>
          {blockers.map((row) => (
            <BlockerRowView key={row.key} row={row} onOpen={() => openBlocker(row)} />
          ))}
          <Text style={styles.blockedNote}>
            Finish or cancel each of these, then come back. Deleting now would
            leave someone else without the job, the payment or the answer they
            are waiting on.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Confirm</Text>
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
        </View>
      )}

      <Button
        title="Delete my account"
        variant="destructive"
        icon="trash-outline"
        iconPosition="leading"
        onPress={handleDelete}
        disabled={!canDelete}
        loading={deleting}
      />
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
    </>
  );

  // No route for this kind: a row that looks tappable but does nothing is
  // worse than a row that plainly is not.
  if (!row.route) return <View style={styles.blockerRow}>{body}</View>;

  return (
    <Pressable
      style={({ pressed }) => [styles.blockerRow, pressed && styles.pressed]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${row.group}: ${row.label}`}
    >
      {body}
    </Pressable>
  );
}

function Line({ text }: { text: string }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.line}>
      <Ionicons name="ellipse" size={6} color={colors.textSubtle} style={styles.bullet} />
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    marginTop: 7,
  },
  blockedBox: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  blockedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  blockedTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 21,
  },
  blockedNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  blockerRow: {
    gap: 2,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  blockerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockerGroup: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSubtle,
  },
  blockerLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  blockerDetail: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.85,
  },
  }),
);
