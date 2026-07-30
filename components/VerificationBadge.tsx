import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { isVerified } from '../lib/profiles';

/**
 * Only claims verification when the persisted status is exactly `verified`.
 * The repository has no identity-check provider or workflow, so every other
 * state must be described neutrally rather than claiming an ID check occurred.
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
    <View style={[styles.pill, styles.notVerified]}>
      <Ionicons name="ellipse-outline" size={12} color={colors.textMuted} />
      <Text style={[styles.text, styles.notVerifiedText]}>Not verified</Text>
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
  notVerified: {
    backgroundColor: colors.neutralBg,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  verifiedText: {
    color: colors.primary,
  },
  notVerifiedText: {
    color: colors.textMuted,
  },
});
