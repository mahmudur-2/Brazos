import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { cardLabel, listSavedCards, removeSavedCard, startCardSetup, type SavedCard } from '../lib/paymentMethods';
import { presentCardSetupSheet } from '../lib/payments/stripe';
import { DetailScreen } from '../ui/templates/DetailScreen';
import { paymentsMode } from '../lib/adapters/payments';
import { goBackOrHome } from '../lib/navigationRef';
import {
  EYEBROW_TYPE,
  litCardStyle, fonts,
  radius,
  spacing,
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
      cancelText: 'Keep it',
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
          // Master 40's protection card: the ghost B, a green eyebrow (this
          // whole card is a live-state claim about the build's payment mode),
          // and a display headline.
          content: (
            <View style={[styles.heroCard, litCardStyle(isDark)]}>
              <Text style={styles.eyebrow}>PAYMENT PROTECTION</Text>
              <Text style={styles.heroTitle}>Honest by design.</Text>
              <Text style={styles.bodyText}>
                {stripe
                  ? 'Your card is charged only when you protect a payment, and the funds stay held until you approve the finished work.'
                  : 'Payments aren’t available right now, so nothing here can move money.'}
              </Text>
            </View>
          ),
        },
        {
          content: (
            <View style={[styles.modeCard, litCardStyle(isDark)]}>
              <View style={[styles.modeGlyph, isDark && styles.modeGlyphDark]}>
                <Ionicons
                  name="card-outline"
                  size={22}
                  color={isDark ? colors.gold : colors.textMuted}
                />
              </View>
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
            </View>
          ),
        },
        {
          // Master 40 CARDS every section on this screen. These last two were
          // still riding the DetailScreen `title` + bare content shape, which
          // draws a heading straight onto the page ground — on a dark device
          // the screen visibly stopped being a stack of cards halfway down.
          // They take the same card the two above already use, with the
          // master's own eyebrows and its serif headings.
          content: (
            <View style={[styles.sectionCard, litCardStyle(isDark)]}>
              <Text style={styles.eyebrow}>FUNDING SOURCE</Text>
              {stripe ? (
                // Idea 20: the card saved for one-tap hiring — kept by the provider, never by Brazos.
                cards === null ? (
                  <ActivityIndicator color={colors.emerald} />
                ) : cards.length > 0 ? (
                  <>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>Saved for one-tap hiring</Text>
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
                  <>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>Couldn’t read your cards</Text>
                    <Text style={styles.bodyText}>{cardsError}</Text>
                    <Button
                      title="Try again"
                      variant="secondary"
                      onPress={() => {
                        setCards(null);
                        void loadCards();
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>No card saved</Text>
                    <Text style={styles.bodyText}>Save a card for one-tap hiring: accept and pay from a bid’s notification.</Text>
                    <Button title="Add a card" variant="secondary" onPress={() => void addCard()} loading={busy} disabled={busy} />
                  </>
                )
              ) : (
                <>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>No stored payment methods</Text>
                  <Text style={styles.bodyText}>
                    Payments aren’t available right now, so there’s no card to store. When they are, the cards you save will appear here.
                  </Text>
                </>
              )}
            </View>
          ),
        },
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  heroCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardDark: { borderColor: colors.border },
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  removeText: {
    fontSize: 13,
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
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
  },
  modeGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  // Same card as the hero and the mode card above it — master 40 draws every
  // section on this screen inside one.
  sectionCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  modeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  modeTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  modeNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  bodyText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  }),
);
