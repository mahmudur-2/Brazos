import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { authColors } from '../lib/authTheme';
import type { OnboardingStackNavigation, OnboardingStackParamList } from '../lib/navigation';
import type { LandingPreference } from '../lib/setupState';
import { LegalGateScreen } from './LegalGateScreen';
import { SetupScreen } from './SetupScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

type OnboardingFlowProps = {
  legalComplete: boolean;
  /** Hoists acceptance to the same useLegalGate() the whole app reads. */
  onLegalAccepted: () => void;
  onFinished: (landing: LandingPreference) => void;
};

/**
 * The signed-in-but-not-set-up stack.
 *
 * Two screens, and the second is the existing legal gate — not a copy of it.
 * Pushing it rather than swapping it in is what lets Setup stay mounted
 * underneath: the return trip is a pop, so the setup entrance does not replay
 * and the row that just completed can animate on a screen that never went away.
 *
 * Acceptance is reported upward instead of being tracked here, so there is
 * exactly one answer to "has this user accepted?" in the process — the
 * useLegalGate() instance in App.tsx.
 */
export function OnboardingFlow({
  legalComplete,
  onLegalAccepted,
  onFinished,
}: OnboardingFlowProps) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Only stops a flash of the navigator's default white behind the
        // ivory background mid-transition; each screen owns its safe area.
        contentStyle: { backgroundColor: authColors.bg },
      }}
    >
      <Stack.Screen name="Setup">
        {() => <SetupScreen legalComplete={legalComplete} onFinished={onFinished} />}
      </Stack.Screen>

      <Stack.Screen
        name="LegalGate"
        options={{
          // Fade with a short rise, rather than the platform push: this is a
          // detour into a document, not the next step of a sequence. Native
          // -stack runs it off the main thread, so it stays smooth while the
          // document below is still laying out.
          animation: 'fade_from_bottom',
          animationDuration: 260,
        }}
      >
        {() => <LegalGateRoute onLegalAccepted={onLegalAccepted} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

/**
 * Adapts the legal gate — which predates this flow and takes a callback rather
 * than knowing about navigation — to being a route.
 */
function LegalGateRoute({ onLegalAccepted }: { onLegalAccepted: () => void }) {
  const navigation = useNavigation<OnboardingStackNavigation>();

  return (
    <LegalGateScreen
      onAccepted={() => {
        // Record first, then leave: Setup re-renders with the accepted state
        // already true, so the row is complete the moment it is visible again.
        onLegalAccepted();
        if (navigation.canGoBack()) navigation.goBack();
      }}
    />
  );
}
