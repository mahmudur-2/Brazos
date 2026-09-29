import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { OfferComposer } from '../components/OfferComposer';
import { ScreenHeader } from '../components/ScreenHeader';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { goBackOrHome } from '../lib/navigationRef';
import { themedStyles, useThemeColors, type ColorPalette,
  screenGround,
} from '../lib/theme';

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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'Counteroffer'>>();

  return (
    // M-33 — the composer is the whole body: its fields scroll and Send is
    // pinned above the keyboard. The tab bar owns the bottom inset.
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader title="Counter-Offer" onBack={goBackOrHome} />
          <OfferComposer
            layout="screen"
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
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  }),
);
