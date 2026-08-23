import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './hooks/useAuth';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useThemeColors } from './hooks/useThemeColors';
import { configurePushHandling } from './lib/pushNotifications';
import { flushPendingNavigation, navigationRef } from './lib/navigationRef';
import { ThemeProvider } from './lib/ThemeContext';
import { LaunchCompleteContext } from './lib/launchContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ModeTransitionProvider } from './components/ModeTransitionOverlay';
import { ModeProvider } from './modes';
import { ModeShell } from './navigation/ModeShell';
import { AuthFlow } from './screens/AuthFlow';
import { OnboardingFlow } from './screens/OnboardingFlow';
import { LaunchScreen } from './screens/LaunchScreen';
import { LegalGateScreen } from './screens/LegalGateScreen';
import { ScreenStateView } from './ui/templates';
import { useLegalGate } from './hooks/useLegalGate';
import { useSetupStatus } from './hooks/useSetupStatus';
import { HomeDesignStudio } from './dev-tools/HomeDesignStudio';

const SHOW_HOME_DESIGN_STUDIO =
  __DEV__ &&
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('studio') === 'home';

/**
 * The authenticated app.
 *
 * Phase 2 emptied this of navigators: the two mode trees, their shared tabs and
 * the bottom bar's configuration now live in navigation/ (§O), and which of the
 * two is mounted is decided by ModeShell from ModeProvider's state. What used
 * to be one five-tab navigator with Worker Home pushed onto the customer Home
 * stack is now two trees that are never mounted at the same time.
 */
function MainTabs() {
  return <ModeShell />;
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const { palette } = useThemeColors();
  const legal = useLegalGate();
  const setup = useSetupStatus();

  // Lives inside NavigationContainer so a tapped notification always has a
  // mounted container to route through.
  usePushNotifications();

  // Both gates are resolved before anything authenticated renders. Letting
  // either answer arrive late is what would show Home for a frame and then
  // pull it away, so they are waited on together rather than in sequence.
  // Mode resolution is deliberately NOT part of this condition — it belongs
  // after setup, because Setup's own "Start in" choice feeds it. ModeShell
  // holds the identical loader for that last step.
  if (loading || (user && (legal.state === 'loading' || setup.state === 'loading'))) {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!user) return <AuthFlow />;

  // The one-time step. It fronts the legal gate rather than duplicating it —
  // the same acceptance state decides both, so finishing setup and satisfying
  // the gate below are the same event.
  if (setup.state === 'incomplete') {
    return (
      <OnboardingFlow
        legalComplete={legal.state === 'accepted'}
        onLegalAccepted={legal.markAccepted}
        onFinished={setup.markComplete}
      />
    );
  }

  // F-013: the gate FAILS CLOSED. An unanswered acceptance read blocks here
  // with the shared error state and a retry that re-runs the read — it never
  // admits by default and never fakes an accepted state.
  if (legal.state === 'unknown') {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }]}>
        <ScreenStateView
          state={{
            kind: 'error',
            message:
              'The Terms of Service check didn’t load. Check your connection and try again.',
            onRetry: legal.recheck,
          }}
        />
      </View>
    );
  }

  // Still reached on its own for the case setup does not cover: an existing,
  // long-since-set-up account whose accepted version no longer matches the
  // current one. That is a blocking re-prompt, not onboarding.
  if (legal.state === 'needs_acceptance') {
    return <LegalGateScreen onAccepted={legal.markAccepted} />;
  }

  if (SHOW_HOME_DESIGN_STUDIO) {
    return (
      <HomeDesignStudio>
        <MainTabs />
      </HomeDesignStudio>
    );
  }

  return <MainTabs />;
}

/**
 * Holds the branded launch layer over the whole app while the Supabase session
 * is restored.
 *
 * The layer is deliberately NOT a route: children mount and hydrate underneath
 * it from the first frame, so hydration overlaps the animation instead of
 * following it, and whatever the session resolves to is already on screen when
 * the layer crossfades away. That is what keeps an authenticated user from
 * catching a frame of the Welcome screen, and what means there is no blank
 * frame in the handover.
 *
 * 2026-08-23: THE GATE IS BACK TO ONE CONDITION — the session. It carried a
 * second for one day (expo-font resolving the bundled Playfair static the
 * customer Home hero title was set in) so no frame could paint that title in
 * a fallback face. The hero now sets in the PLATFORM's Georgia, which ships
 * with iOS and cannot arrive late, so there is nothing left to hold the layer
 * for and no load failure to release it on.
 *
 * It renders once per process. Signing out later returns to Welcome without
 * replaying it; a cold reload in Expo Go is a new process, so it plays again.
 */
function LaunchGate({ children }: PropsWithChildren) {
  const { loading } = useAuth();
  const [complete, setComplete] = useState(false);

  return (
    <LaunchCompleteContext.Provider value={complete}>
      <View style={styles.root}>
        {children}
        {complete ? null : (
          <LaunchScreen
            sessionReady={!loading}
            onFinish={() => setComplete(true)}
          />
        )}
      </View>
    </LaunchCompleteContext.Provider>
  );
}

/**
 * Everything that must re-render on a theme change, under one hook read.
 *
 * NavigationContainer gets a navigation theme derived from the resolved
 * palette — background and card above all — so screen transitions and modal
 * backdrops never flash white in dark mode; the status bar style derives from
 * the same resolution. LaunchScreen (locked, light by design) pushes its own
 * status-bar variant over this while it is up, and the mode-switch panel does
 * the same for its own duration; unmounting pops back to this one.
 */
function ThemedNavigation() {
  const { palette, isDark } = useThemeColors();

  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.primary,
        background: palette.background,
        card: palette.surface,
        text: palette.text,
        border: palette.border,
        notification: palette.danger,
      },
    };
  }, [palette, isDark]);

  return (
    /* Sits between the launch layer and the navigator so the mode-switch
       panel covers every screen — including the tab bar — while the
       destination tree is swapped in underneath it. ModeProvider is
       nested INSIDE it because switchMode() drives the panel: one
       transition, one owner. */
    <ModeTransitionProvider>
      <ModeProvider>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          // A cold-start tap is delivered before this mounts, so the
          // routing it requested is parked and replayed here.
          onReady={flushPendingNavigation}
        >
          {/* The one application-level boundary. Inside the container so
              navigationRef and the parked cold-start replay survive a
              crash-and-reset; outside RootNavigator so the reset key
              remounts every navigator — recovery is a fresh mount, not a
              re-render of the crashed state. The launch overlay sits
              entirely outside it. */}
          <AppErrorBoundary>
            <RootNavigator />
          </AppErrorBoundary>
          <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={palette.background} />
        </NavigationContainer>
      </ModeProvider>
    </ModeTransitionProvider>
  );
}

export default function App() {
  // Foreground presentation + the Android channel. Set before anything can
  // arrive, and independent of auth — a notification can land while the app is
  // on the sign-in screen.
  useEffect(() => {
    configurePushHandling();
  }, []);

  // Without this, a user who has never recorded a voice message (only
  // received/played one) never triggers any setAudioModeAsync call at all,
  // and the audio session's playsInSilentMode sits at expo-audio's own
  // native default — false — for their whole session. Set once, up front,
  // so voice-note playback works regardless of whether this device has ever
  // recorded anything. See useVoiceRecorder.ts's setAudioMode() for why
  // every subsequent call also has to keep repeating this explicitly.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch((err) => {
      console.error('[App] setAudioModeAsync failed', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LaunchGate>
          {/* Theme resolution sits INSIDE the launch gate deliberately (4D-4):
              the provider reads the stored preference before the themed tree
              first paints, holding a neutral loader for that beat — and the
              locked launch layer, which renders from the first frame, covers
              that gate, so a cold start in dark mode never flashes light.
              Everything that repaints on a palette change lives below this
              line; the launch layer itself is locked and light by design. */}
          <ThemeProvider>
            <ThemedNavigation />
          </ThemeProvider>
        </LaunchGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Positioning context for the launch layer, which is an absolute-fill
  // sibling of the whole navigation container.
  root: {
    flex: 1,
  },
  // Colorless: the background comes from the resolved palette at render time.
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
