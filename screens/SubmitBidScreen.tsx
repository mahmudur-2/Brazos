import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { OfferComposer } from '../components/OfferComposer';
import { ScreenHeader } from '../components/ScreenHeader';
import { maybePromptForPush } from '../lib/pushNotifications';
import type { SubmitBidRouteParamList } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

/**
 * Screen 52 — Submit Bid (worker). The OfferComposer's marketplace-bid entry,
 * reached from Worker Job Detail (51). Like JobDetail/Chat it is registered in
 * every stack that can reach 51 (worker Home, My Jobs, Map), so the route
 * exists wherever its entry point does — the PostJob/WorkerHomeStack gap in
 * Known Issues is the failure mode this avoids.
 *
 * On success it REPLACES itself with Bid Sent (53): Back from the confirmation
 * must not land on a form inviting a second submission of the same bid.
 */
export function SubmitBidScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<SubmitBidRouteParamList, 'SubmitBid'>>();
  const job = params.job;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Submit a bid" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <OfferComposer
            context={{ kind: 'bid', job }}
            onSubmitted={(offerId, amountCents) => {
              // Fire-and-forget: the push prompt is a nice-to-have and must
              // not hold the confirmation hostage to a permission dialog.
              void maybePromptForPush(
                'Get told the moment this customer accepts your bid — and when new jobs like this are posted.'
              );
              (navigation as any).replace('BidSent', {
                jobTitle: job.title,
                amountCents,
                offerId,
              });
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
