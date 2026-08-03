import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authSpacing, authType } from '../lib/authTheme';

type AuthNoticeProps = {
  tone: 'info' | 'danger';
  children: string;
};

/**
 * The auth flow's inline message strip — a suspended-account warning, or a
 * statement about what a control can and can't do yet.
 *
 * Shared because both sign-in screens show one and they must not drift apart
 * visually. Announced politely rather than assertively: it appears in response
 * to something the user just did, so it doesn't need to interrupt them.
 */
export function AuthNotice({ tone, children }: AuthNoticeProps) {
  const danger = tone === 'danger';

  return (
    <View
      style={[styles.strip, danger ? styles.danger : styles.info]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={danger ? 'alert-circle-outline' : 'information-circle-outline'}
        size={18}
        color={danger ? authColors.danger : authColors.emerald}
      />
      <Text style={[styles.text, { color: danger ? authColors.danger : '#3E4F47' }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: authSpacing.sm,
    padding: authSpacing.md,
    borderRadius: authRadius.field,
  },
  info: {
    backgroundColor: authColors.mint,
  },
  danger: {
    backgroundColor: '#F5E7E4',
  },
  text: {
    ...authType.note,
    flex: 1,
  },
});
