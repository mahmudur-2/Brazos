import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { useProfile } from '../hooks/useProfile';
import { goBackOrHome } from '../lib/navigationRef';
import type { ProfileStackNavigation } from '../lib/navigation';
import {
  litCardStyle, fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

/**
 * Golden master 41 — the profile hub's account & safety page.
 *
 * 2026-09-29 (LUX-LIST-2 #7): what is about the account itself — the privacy
 * promise, the one-account principle, and the deletion entry point. Payment
 * methods, Appearance, the two legal documents, the mode switch and Log out
 * each moved to the Profile hub, where every one of them still is (Sign out
 * at its foot, with the same confirmation). It performs no destructive action
 * itself — deletion's warning and confirmation live on DeleteAccount, where
 * phase67's real blocker list is.
 */
export function AccountSafetyScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint. See ProfileDetailsScreen —
  // same hub, same defect.
  const navClearance = useScrollClearance();
  const navigation = useNavigation<ProfileStackNavigation>();
  const { profile } = useProfile();

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* M-16 — the page wears its own name, the row that opens it. */}
      <ScreenHeader title="Account & Safety" onBack={goBackOrHome} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={[styles.card, litCardStyle(isDark)]}>
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
            Privacy, and deleting your account.
          </Text>
        </Card>

        {/* Master 41's safety principle. It restates the app's one-account
            invariant, so it is product truth rather than marketing. */}
        <Card style={[styles.card, litCardStyle(isDark)]}>
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
            Modes change the view, not your account.
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

        <View style={[styles.noteCard, litCardStyle(isDark)]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noteText}>
            Permanent; settle jobs and payments first.
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.eyebrow,
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
  rowPressed: { opacity: 0.82 },
  rowGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
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
