import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { OfferComposer } from '../components/OfferComposer';
import { ScreenHeader } from '../components/ScreenHeader';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { goBackOrHome } from '../lib/navigationRef';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { useFloatingNavClearance } from '../ui/primitives';

/**
 * Screen 30 — Counteroffer, the OfferComposer's counter entry from the
 * customer bid surfaces (Bid Detail). The composer keeps the original terms
 * visible next to the proposed ones and states that nothing is agreed until a
 * side accepts; counter_offer() re-validates turn, status and expiry
 * server-side, so a stale seed fails loudly rather than silently forking the
 * negotiation.
 *
 * (The conversation thread's counter path — AmountPrompt inside Chat — is the
 * direct-offer negotiation UI that predates this screen and stays in place;
 * this route is the bid-side counter that never existed before Phase 5.)
 */
export function CounterofferScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useFloatingNavClearance();
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'Counteroffer'>>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Counter-offer" onBack={goBackOrHome} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <OfferComposer
            context={{
              kind: 'counter',
              offer: params.offer,
              counterpartyName: params.counterpartyName,
              jobTitle: params.job.title,
              countersRemaining: params.countersRemaining,
            }}
            onSubmitted={() => {
              // The chain moved: the countered bid is superseded and the turn
              // is theirs. Land back on the job, which re-reads canonically.
              navigation.popTo('ClientJobDetail', { job: params.job });
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  }),
);
