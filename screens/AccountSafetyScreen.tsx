import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BrazosMonogram } from '../components/BrazosMonogram';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import type { ProfileStackNavigation } from '../lib/navigation';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Golden master 41 — the profile hub's account & safety page.
 *
 * Everything an account holder can do TO the account rather than with it:
 * payment, the two legal documents, appearance, log out, and the deletion
 * entry point. It performs no destructive action itself — deletion's warning
 * and confirmation live on DeleteAccount, where phase67's real blocker list
 * is, and log out keeps the confirmation it always had.
 */
export function AccountSafetyScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<ProfileStackNavigation>();
  const { logout } = useAuth();
  const { profile } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    // Same confirmation and same landing as the hub's control had; only its
    // address changed.
    const ok = await confirmAsync({
      title: 'Log out?',
      message: 'You can sign back in any time.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setLoggingOut(true);
    const { error } = await logout();
    setLoggingOut(false);
    if (error) await alertAsync('Logout failed', userMessage(error));
  }

  const rows: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    sub: string;
    onPress: () => void;
  }[] = [
    {
      icon: 'card-outline',
      label: 'Payment methods',
      sub: 'Sandbox only · no stored card.',
      onPress: () => navigation.navigate('PaymentMethods'),
    },
    {
      icon: 'contrast-outline',
      label: 'Appearance',
      sub: 'Light, dark, or follow the system.',
      onPress: () => navigation.navigate('Appearance'),
    },
    {
      icon: 'document-text-outline',
      label: 'Terms of Service',
      sub: 'Read the current agreement.',
      onPress: () => navigation.navigate('LegalDocument', { document: 'terms' }),
    },
    {
      icon: 'lock-closed-outline',
      label: 'Privacy Policy',
      sub: 'How BRAZOS protects your data.',
      onPress: () => navigation.navigate('LegalDocument', { document: 'privacy' }),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Profile" onBack={goBackOrHome} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={[styles.card, isDark && styles.cardDark]}>
          {isDark ? <BrazosMonogram size={140} style={styles.mark} /> : null}
          <Text style={styles.eyebrow}>ACCOUNT &amp; SAFETY</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Private by default.</Text>
            <Ionicons
              name="shield-checkmark-outline"
              size={40}
              color={isDark ? colors.gold : colors.primary}
            />
          </View>
          <Text style={styles.heroBody}>
            Control payment, legal and account actions from one protected place.
          </Text>
        </Card>

        <Card style={[styles.rowsCard, isDark && styles.cardDark]}>
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              onPress={row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={[styles.rowGlyph, isDark && styles.rowGlyphDark]}>
                <Ionicons
                  name={row.icon}
                  size={20}
                  color={isDark ? colors.gold : colors.primary}
                />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowSub}>{row.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>
          ))}
        </Card>

        {/* Master 41's safety principle. It restates the app's one-account
            invariant, so it is product truth rather than marketing. */}
        <Card style={[styles.card, isDark && styles.cardDark]}>
          <View style={[styles.rowGlyph, isDark && styles.rowGlyphDark]}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={isDark ? colors.gold : colors.primary}
            />
          </View>
          <Text style={styles.eyebrow}>SAFETY PRINCIPLE</Text>
          <Text style={styles.heroTitle}>One identity, two modes.</Text>
          <Text style={styles.heroBody}>
            Switching between customer and worker changes the dashboard — not your
            account, reviews or protected job history.
          </Text>
        </Card>

        {/* Kept off master 41 for everyone else: this row only exists for a
            moderator, and it acts on OTHER people's accounts. */}
        {profile?.is_admin ? (
          <Pressable
            style={({ pressed }) => [styles.adminCard, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate('AdminReports')}
            accessibilityRole="button"
            accessibilityLabel="Review reports"
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
            <Text style={styles.adminLabel}>Review reports</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        {__DEV__ ? (
          <Pressable
            style={({ pressed }) => [styles.devRow, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate('ComponentCatalog')}
            accessibilityRole="button"
            accessibilityLabel="Component catalog"
          >
            <Ionicons name="color-palette-outline" size={18} color={colors.textMuted} />
            <Text style={styles.devLabel}>Component catalog (dev)</Text>
          </Pressable>
        ) : null}

        <Button
          title="Log out"
          variant="secondary"
          icon="log-out-outline"
          iconPosition="leading"
          onPress={handleLogout}
          loading={loggingOut}
        />

        {/* App Store Guideline 5.1.1(v). Master 41 draws this as the set's
            strongest outlined control; the screen it opens is where the
            warning, the real blocker list and the confirmation live. */}
        <Pressable
          style={({ pressed }) => [styles.deleteRow, pressed && styles.rowPressed]}
          onPress={() => navigation.navigate('DeleteAccount')}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={styles.deleteLabel}>Delete account</Text>
        </Pressable>

        <View style={[styles.noteCard, isDark && styles.cardDark]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noteText}>
            Deletion is permanent. Active jobs and unsettled payments must be
            resolved first.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  card: { gap: spacing.sm, overflow: 'hidden' },
  cardDark: { borderColor: colors.border },
  mark: { position: 'absolute', right: -18, top: -22 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.gold,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroTitle: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
  },
  rowsCard: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: { opacity: 0.82 },
  rowGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  rowGlyphDark: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
  },
  rowSub: {
    fontSize: 13,
    color: colors.textMuted,
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  adminLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.warning,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  devLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // Master 41's strongest outlined control — the danger hue, as line-work.
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteLabel: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.danger,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  }),
);
