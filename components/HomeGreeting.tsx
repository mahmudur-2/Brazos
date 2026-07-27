import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../lib/theme';

type HomeGreetingProps = {
  firstName?: string;
};

/** The Home screen's own header — just the greeting line, nothing else. */
export function HomeGreeting({ firstName }: HomeGreetingProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{firstName ? `Hi, ${firstName}` : 'Home'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs + 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
});
