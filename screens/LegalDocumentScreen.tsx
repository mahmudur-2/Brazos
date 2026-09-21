import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { MarkdownText } from '../components/MarkdownText';
import { ScreenHeader } from '../components/ScreenHeader';
import { LEGAL_DOCUMENTS } from '../lib/legal';
import { goBackOrHome } from '../lib/navigationRef';
import type { LegalDocumentRouteParamList } from '../lib/navigation';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

/**
 * Read-only view of one legal document, reachable from Profile at any time —
 * not just during the sign-up gate. Same source text as LegalGateScreen, so
 * the two can't drift.
 */
export function LegalDocumentScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  const route = useRoute<RouteProp<LegalDocumentRouteParamList, 'LegalDocument'>>();
  // route.params.document is typed as 'terms' | 'privacy', but the value
  // still comes from outside this screen's control (a deep link, or a stale
  // route restored from a previous app version) — LEGAL_DOCUMENTS[...] can
  // genuinely be undefined at runtime even though TS doesn't see that here.
  const doc = LEGAL_DOCUMENTS[route.params.document];

  if (!doc) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Document" onBack={goBackOrHome} />
        <View style={styles.center}>
          <Text style={styles.muted}>
            This document isn't available. It may have moved, or this link is
            out of date.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={doc.title} onBack={goBackOrHome} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}>
        <MarkdownText markdown={doc.body} />
        <Text style={styles.version}>Version {doc.version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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
  }),
);
