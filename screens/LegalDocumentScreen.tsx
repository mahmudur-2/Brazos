import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { MarkdownText } from '../components/MarkdownText';
import { ScreenHeader } from '../components/ScreenHeader';
import { LEGAL_DOCUMENTS } from '../lib/legal';
import type { LegalDocumentRouteParamList } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

/**
 * Read-only view of one legal document, reachable from Profile at any time —
 * not just during the sign-up gate. Same source text as LegalGateScreen, so
 * the two can't drift.
 */
export function LegalDocumentScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<LegalDocumentRouteParamList, 'LegalDocument'>>();
  const doc = LEGAL_DOCUMENTS[route.params.document];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={doc.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <MarkdownText markdown={doc.body} />
        <Text style={styles.version}>Version {doc.version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  version: {
    marginTop: spacing.xl,
    fontSize: 11,
    color: colors.textSubtle,
  },
});
