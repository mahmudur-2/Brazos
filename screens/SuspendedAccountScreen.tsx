import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../ui/templates';
import { Button, Card } from '../ui/primitives';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { openSupportMail, SUPPORT_EMAIL } from '../lib/appLinks';
import { paymentsMode } from '../lib/adapters/payments';
import { cardRemovalMessage, removeEverySavedCard } from '../lib/paymentMethods';
import { SUSPENDED_SENTENCE } from '../lib/suspension';
import { useAnnounce } from '../hooks/useAnnounce';
import { useAuth } from '../hooks/useAuth';
import { spacing, textScale, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { DeleteAccountScreen } from './DeleteAccountScreen';

/**
 * B1 (production-36h) — THE SUSPENDED ACCOUNT. App.tsx (AccountGate) renders this stack in place
 * of the whole app while the server says the signed-in account is suspended
 * (lib/AuthContext.tsx `suspended`): no main tree, no legal or setup gate, no mode tree is mounted.
 *
 * Every server call reachable from here is one the access lane allows a suspended account:
 * current_user_is_banned (AuthContext), account_deletion_blockers, delete_my_account, the
 * payment-methods list and remove (B7 R5: "Remove Saved Cards" here, and the delete screen's card
 * step), and the sign-out.
 * "Contact Support" opens the mail app through lib/appLinks.ts openSupportMail (no canOpenURL).
 */
type SuspendedStackParamList = {
  SuspendedAccount: undefined;
  DeleteAccount: undefined;
};

const Stack = createNativeStackNavigator<SuspendedStackParamList>();

export function SuspendedAccountFlow() {
  const { palette: colors } = useThemeColors();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="SuspendedAccount" component={SuspendedAccountScreen} />
      {/* The existing screen, unchanged in what it checks: the same blockers, the same card step. */}
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </Stack.Navigator>
  );
}

export function SuspendedAccountScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<NativeStackNavigationProp<SuspendedStackParamList>>();
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // B7 (R5): a suspended account whose deletion is blocked can still take its cards off Brazos.
  const [removingCards, setRemovingCards] = useState(false);
  const [cardResult, setCardResult] = useState<string | null>(null);
  const removingCardsRef = useRef(false);
  // The line is spoken on iOS once it appears (accessibilityLiveRegion is Android-only).
  useAnnounce(cardResult);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await logout();
    setSigningOut(false);
    if (error) await alertAsync('Sign out failed', userMessage(error));
  }

  async function handleRemoveCards() {
    if (removingCardsRef.current) return;
    removingCardsRef.current = true;
    try {
      const ok = await confirmAsync({
        title: 'Remove your saved cards?',
        message: 'This removes every saved card from your account.',
        confirmText: 'Remove',
      });
      if (!ok) return;
      setCardResult(null);
      setRemovingCards(true);
      const { error } = await removeEverySavedCard();
      setCardResult(cardRemovalMessage(error));
    } finally {
      setRemovingCards(false);
      removingCardsRef.current = false;
    }
  }

  return (
    <FormScreen
      title="Account Suspended"
      insideTabs={false}
      submitLabel="Contact Support"
      onSubmit={() => void openSupportMail()}
    >
      <Card style={styles.card}>
        {/* The server's own sentence, word for word. */}
        <Text style={styles.body}>{SUSPENDED_SENTENCE}</Text>
        <Text selectable style={styles.email} accessibilityLabel={`Support email ${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </Text>
      </Card>
      <View style={styles.actions}>
        {/* No card path with payments off ('disabled'): no row. */}
        {paymentsMode === 'stripe' ? (
          <Button title="Remove Saved Cards" variant="quiet" onPress={() => void handleRemoveCards()} loading={removingCards} />
        ) : null}
        {paymentsMode === 'stripe' && cardResult ? (
          <Text style={styles.result} accessibilityLiveRegion="polite">
            {cardResult}
          </Text>
        ) : null}
        <Button
          title="Delete Account"
          variant="quiet"
          onPress={() => navigation.navigate('DeleteAccount')}
          disabled={signingOut || removingCards}
        />
        <Button title="Sign Out" variant="quiet" onPress={() => void handleSignOut()} loading={signingOut} />
      </View>
    </FormScreen>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
    },
    body: {
      ...textScale.body,
      color: colors.text,
    },
    email: {
      ...textScale.headline,
      color: colors.text,
    },
    actions: {
      gap: spacing.sm,
    },
    result: {
      ...textScale.footnote,
      color: colors.textMuted,
      textAlign: 'center',
    },
  })
);
