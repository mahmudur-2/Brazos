import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from '../components/Button';
import { OfferComposer } from '../components/OfferComposer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useMode, useModeSwitch } from '../modes';
import { goBackOrHome } from '../lib/navigationRef';
import { maybePromptForPush } from '../lib/pushNotifications';
import type { SubmitBidRouteParamList } from '../lib/navigation';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<SubmitBidRouteParamList, 'SubmitBid'>>();
  const { mode } = useMode();
  const { switching, switchToOtherMode } = useModeSwitch();
  const job = params.job;

  // §10 (Phase 8): SubmitBid inherited JobDetail's customer-mode
  // reachability. JobDetail now delegates customers to MarketJobPreview (no
  // bid CTA exists there), and this guard closes the residual paths — a
  // retained route, a deep link — at the screen itself.
  if (mode === 'customer') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Submit a bid" onBack={goBackOrHome} />
        <View style={styles.guard}>
          <Text style={styles.guardTitle}>Bidding lives in Worker Mode</Text>
          <Text style={styles.guardText}>
            You’re in customer mode right now. Switch to Worker Mode to bid on
            jobs like “{job.title}”.
          </Text>
          <Button
            title="Switch to Worker Mode"
            variant="secondary"
            onPress={() => void switchToOtherMode()}
            loading={switching}
            disabled={switching}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Submit a bid" onBack={goBackOrHome} />
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
              (navigation as unknown as {
                replace: (
                  screen: 'BidSent',
                  params: { jobTitle: string; amountCents: number; offerId: string }
                ) => void;
              }).replace('BidSent', {
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
  guard: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
  },
  guardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  guardText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  }),
);
