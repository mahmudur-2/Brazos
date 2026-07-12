import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { isVerified } from '../lib/profiles';

/**
 * Shows a "Verified" pill for verified workers. For everyone else shows a muted
 * "ID-checked" label — per the spec, unverified is ID-checked, never unscreened.
 */
export function VerificationBadge({ status }: { status?: string | null }) {
  if (isVerified(status)) {
    return (
      <View style={[styles.pill, styles.verified]}>
        <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
        <Text style={[styles.text, styles.verifiedText]}>Verified</Text>
      </View>
    );
  }

  return (
    <View style={[styles.pill, styles.idChecked]}>
      <Ionicons name="checkmark-circle-outline" size={12} color={colors.textMuted} />
      <Text style={[styles.text, styles.idCheckedText]}>ID-checked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  verified: {
    backgroundColor: colors.primarySoft,
  },
  idChecked: {
    backgroundColor: colors.neutralBg,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  verifiedText: {
    color: colors.primary,
  },
  idCheckedText: {
    color: colors.textMuted,
  },
});
