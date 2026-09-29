import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import { paymentsMode } from '../lib/adapters/payments';
import { goBackOrHome } from '../lib/navigationRef';
import {
  litCardStyle, fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screen 45 (Phase 9) — Payment methods, told honestly. There is no card
 * vault and no stored payment method at any layer of this app — so the
 * screen SAYS that instead of rendering a fake card list. What it can
 * truthfully show: which payment mode the build runs (sandbox / stripe /
 * disabled — D16, D18) and what that mode actually does with money states.
 * On the card path, cards are entered in the provider's payment sheet at
 * checkout and never stored here.
 */
export function PaymentMethodsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const sandbox = paymentsMode === 'sandbox';
  const stripe = paymentsMode === 'stripe';

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
                {sandbox
                  ? 'Nothing on this build is a real charge. Every payment state is a database row you can audit.'
                  : stripe
                    ? 'Your card is charged only when you protect a payment, and the funds stay held until you approve the finished work.'
                    : 'Payments are switched off on this build, so nothing here can move money.'}
              </Text>
            </View>
          ),
        },
        {
          content: (
            <View style={[styles.modeCard, litCardStyle(isDark)]}>
              <View style={[styles.modeGlyph, isDark && styles.modeGlyphDark]}>
                <Ionicons
                  name={sandbox ? 'flask-outline' : 'card-outline'}
                  size={22}
                  color={isDark ? colors.gold : sandbox ? colors.warning : colors.textMuted}
                />
              </View>
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>
                  {sandbox ? 'Sandbox payments' : stripe ? 'Card payments' : 'Payments are off'}
                </Text>
                <Text style={styles.modeNote}>
                  {sandbox
                    ? 'This build runs a development sandbox: checkout, protection, release and tips write real app records, but no card exists and no real money ever moves.'
                    : stripe
                      ? 'Cards are taken through the provider’s secure payment sheet at checkout. Brazos never sees your card number.'
                      : 'No payment mode is switched on in this build. Nothing can be authorized, held or moved.'}
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
              <Text style={styles.sectionTitle}>No stored payment methods</Text>
              <Text style={styles.bodyText}>
                {stripe
                  ? 'Brazos doesn’t store your card. You enter it in the provider’s secure payment sheet at checkout, and any saved card lives with the provider, not in this app.'
                  : 'Brazos doesn’t store any card, bank account or wallet in this build — there is no payment provider connected yet. When a real provider arrives, the methods you add will appear here.'}
              </Text>
            </View>
          ),
        },
        ...(sandbox
          ? [
              {
                content: (
                  <View style={[styles.sectionCard, litCardStyle(isDark)]}>
                    <Text style={styles.eyebrow}>SANDBOX LEDGER</Text>
                    <Text style={styles.sectionTitle}>What the sandbox does</Text>
                    <View style={styles.list}>
                      <Row text="Authorize — records the agreed amount. Nothing is charged." />
                      <Row text="Hold in protection — sets the funds aside in the ledger while the work happens." />
                      <Row text="Release — moves the record to released after you approve the finished work (or 72 hours pass with no issue reported)." />
                      <Row text="Every state is a real database row you can audit — none of it is real money." />
                    </View>
                  </View>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

function Row({ text }: { text: string }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.row}>
      <Ionicons name="checkmark-circle-outline" size={18} color={colors.emerald} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
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
  // Master 40 sets its card eyebrows GREEN, not gold (B-11): every one of
  // them states what the build's payment mode currently IS.
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
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
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  }),
);
