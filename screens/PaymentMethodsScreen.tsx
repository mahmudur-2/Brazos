import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { cardLabel, listSavedCards, removeSavedCard, startCardSetup, type SavedCard } from '../lib/paymentMethods';
import { presentCardSetupSheet } from '../lib/payments/stripe';
import { DetailScreen } from '../ui/templates/DetailScreen';
import { EmptyState } from '../ui/primitives';
import { paymentsMode } from '../lib/adapters/payments';
import { goBackOrHome } from '../lib/navigationRef';
import {
  EYEBROW_TYPE,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screen 45 (Phase 9) — Payment methods, told honestly. There is no card
 * vault in this app — so the screen SAYS what it can truthfully show: which
 * payment mode the build runs (stripe / disabled — D16, D18) and what
 * that mode actually does with money states.
 *
 * 2026-09-30 (idea 20): on the card path a customer may SAVE a card for
 * one-tap hiring — kept by the payment provider on their customer, never by
 * Brazos — and this screen lists it (brand and last four, from the provider),
 * removes it, or adds one in the provider's own sheet. Nothing here charges.
 */
export function PaymentMethodsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const stripe = paymentsMode === 'stripe';

  // Idea 20: the saved card, read at the provider on every visit (stripe only).
  const [cards, setCards] = useState<SavedCard[] | null>(stripe ? null : []);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadCards = useCallback(async () => {
    if (!stripe) return;
    setCardsError(null);
    const { data, error } = await listSavedCards();
    if (error) {
      setCardsError(userMessage(error, 'Could not reach your cards right now.'));
      setCards([]);
      return;
    }
    setCards(data);
  }, [stripe]);
  useFocusEffect(
    useCallback(() => {
      void loadCards();
    }, [loadCards])
  );

  async function remove(card: SavedCard) {
    const ok = await confirmAsync({
      title: `Remove ${cardLabel(card)}?`,
      message: 'One-tap hiring stops until you save a card again. Payments you’ve already protected aren’t affected.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await removeSavedCard(card.id);
    setBusy(false);
    if (error) {
      await alertAsync('Could not remove the card', userMessage(error, 'Try again in a moment.'));
      return;
    }
    setCards((current) => (current ? current.filter((saved) => saved.id !== card.id) : current));
    await loadCards();
  }

  async function addCard() {
    setBusy(true);
    const session = await startCardSetup();
    if (session.error || !session.data) {
      setBusy(false);
      await alertAsync('Could not add a card', userMessage(session.error, 'Try again in a moment.'));
      return;
    }
    const sheet = await presentCardSetupSheet(session.data);
    setBusy(false);
    if (sheet.outcome === 'failed') {
      await alertAsync('The card was not saved', userMessage(sheet.error, 'Try again in a moment.'));
      return;
    }
    if (sheet.outcome === 'saved') {
      setCards(null);
      await loadCards();
    }
  }

  return (
    <DetailScreen
      title="Payment Methods"
      onBack={goBackOrHome}
      state={{ kind: 'ready' }}
      sections={[
        {
          // Master 40's protection card: a green eyebrow (this whole card is a
          // live-state claim about the build's payment mode) and a display headline.
          content: (
            <Card style={styles.stack}>
              <Text style={styles.eyebrow}>PAYMENT PROTECTION</Text>
              <Text style={styles.heroTitle}>Honest by design.</Text>
              <Text style={styles.bodyText}>
                {stripe
                  ? 'Your card is charged only when you protect a payment, and the funds stay held until you approve the finished work.'
                  : 'Payments aren’t available right now, so nothing here can move money.'}
              </Text>
            </Card>
          ),
        },
        {
          content: (
            <Card style={styles.modeCard}>
              <Ionicons name="card-outline" size={24} color={isDark ? colors.emerald : colors.mark} />
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>
                  {stripe ? 'Card payments' : 'Payments are off'}
                </Text>
                <Text style={styles.modeNote}>
                  {stripe
                    ? 'Cards are taken through the provider’s secure payment sheet at checkout. Brazos never sees your card number.'
                    : 'Payments aren’t available right now. Nothing can be authorized, held or moved.'}
                </Text>
              </View>
            </Card>
          ),
        },
        {
          // The section label sits on the ground over its one lit card; an empty or
          // failed read is the shared empty state inside it.
          title: 'Funding Source',
          content: (
            <Card style={styles.stack}>
              {stripe ? (
                // Idea 20: the card saved for one-tap hiring — kept by the provider, never by Brazos.
                cards === null ? (
                  <ActivityIndicator color={colors.emerald} />
                ) : cards.length > 0 ? (
                  <>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>Saved for One-Tap Hiring</Text>
                    {cards.map((card) => (
                      <View key={card.id} style={styles.cardRow}>
                        <Ionicons name="card-outline" size={20} color={colors.emerald} />
                        <View style={styles.cardCopy}>
                          <Text style={styles.cardText}>{cardLabel(card)}</Text>
                          {card.expMonth && card.expYear ? (
                            <Text style={styles.bodyText}>
                              {`Expires ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => void remove(card)}
                          disabled={busy}
                          // A 44-point target around the short word.
                          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${cardLabel(card)}`}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Text style={styles.bodyText}>Accept and pay from a bid’s notification with this card.</Text>
                  </>
                ) : cardsError ? (
                  // A failed read is not "no card": it says so, and tries again.
                  <EmptyState
                    icon="cloud-offline-outline"
                    tone="attention"
                    title="Couldn’t read your cards"
                    body={cardsError}
                    actionLabel="Try Again"
                    onAction={() => {
                      setCards(null);
                      void loadCards();
                    }}
                  />
                ) : (
                  <>
                    <EmptyState
                      icon="card-outline"
                      title="No Card Saved"
                      body="Save a card for one-tap hiring: accept and pay from a bid’s notification."
                    />
                    <Button title="Add a Card" variant="secondary" onPress={() => void addCard()} loading={busy} disabled={busy} />
                  </>
                )
              ) : (
                <EmptyState
                  icon="card-outline"
                  title="No Stored Payment Methods"
                  body="Payments aren’t available right now, so there’s no card to store. When they are, the cards you save will appear here."
                />
              )}
            </Card>
          ),
        },
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  stack: {
    gap: spacing.sm,
  },
  // Idea 20: one saved card's row.
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardText: {
    ...textScale.callout,
    fontWeight: '700',
    color: colors.ink,
  },
  removeText: {
    ...textScale.label,
    fontWeight: '700',
    color: colors.danger,
  },
  // Master 40 sets its card eyebrows GREEN, not gold (B-11): every one of
  // them states what the build's payment mode currently IS.
  eyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  heroTitle: {
    ...textScale.display,
    color: colors.ink,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  sectionTitle: {
    ...textScale.title,
    color: colors.ink,
  },
  modeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  modeTitle: {
    ...textScale.title,
    color: colors.ink,
  },
  modeNote: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
  },
  bodyText: {
    ...textScale.body,
    color: colors.textMuted,
  },
  }),
);
