import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import { paymentsMode } from '../lib/adapters/payments';
import { goBackOrHome } from '../lib/navigationRef';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * Screen 45 (Phase 9) — Payment methods, told honestly. There is no card
 * vault, no provider, and no stored payment method at any layer of this
 * build — so the screen SAYS that instead of rendering a fake card list.
 * What it can truthfully show: which payment mode the build runs (sandbox /
 * disabled) and what the sandbox actually does with money states.
 */
export function PaymentMethodsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const sandbox = paymentsMode === 'sandbox';

  return (
    <DetailScreen
      title="Payment methods"
      onBack={goBackOrHome}
      state={{ kind: 'ready' }}
      sections={[
        {
          content: (
            <View style={styles.modeCard}>
              <Ionicons
                name={sandbox ? 'flask-outline' : 'card-outline'}
                size={22}
                color={sandbox ? colors.warning : colors.textMuted}
              />
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>
                  {sandbox ? 'Sandbox payments' : 'Payments are off'}
                </Text>
                <Text style={styles.modeNote}>
                  {sandbox
                    ? 'This build runs a development sandbox: checkout, protection, release and tips write real app records, but no card exists and no real money ever moves.'
                    : 'No payment mode is switched on in this build. Nothing can be authorized, held or moved.'}
                </Text>
              </View>
            </View>
          ),
        },
        {
          title: 'No stored payment methods',
          content: (
            <Text style={styles.bodyText}>
              BRAZOS doesn’t store any card, bank account or wallet in this
              build — there is no payment provider connected yet. When a real
              provider arrives, the methods you add will appear here.
            </Text>
          ),
        },
        ...(sandbox
          ? [
              {
                title: 'What the sandbox does',
                content: (
                  <View style={styles.list}>
                    <Row text="Authorize — records the agreed amount. Nothing is charged." />
                    <Row text="Hold in protection — sets the funds aside in the ledger while the work happens." />
                    <Row text="Release — moves the record to released after you approve the finished work (or 72 hours pass with no issue reported)." />
                    <Row text="Every state is a real database row you can audit — none of it is real money." />
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
  modeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  modeTitle: {
    fontSize: 16,
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
