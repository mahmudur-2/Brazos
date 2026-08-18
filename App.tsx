import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './hooks/useAuth';
import { usePushNotifications } from './hooks/usePushNotifications';
import { configurePushHandling } from './lib/pushNotifications';
import { flushPendingNavigation, navigationRef } from './lib/navigationRef';
import { colors } from './lib/theme';
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
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          <LaunchScreen sessionReady={!loading} onFinish={() => setComplete(true)} />
        )}
      </View>
    </LaunchCompleteContext.Provider>
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
      {/* Theme resolution sits outermost of the app-state providers: it
          depends on neither auth nor mode, and 4D-4's Light/Dark/System
          resolver must already be above every surface that will re-render on
          a palette change. Pinned to light in this stage — lib/ThemeContext. */}
      <ThemeProvider>
        <AuthProvider>
          <LaunchGate>
            {/* Sits between the launch layer and the navigator so the mode-switch
                panel covers every screen — including the tab bar — while the
                destination tree is swapped in underneath it. ModeProvider is
                nested INSIDE it because switchMode() drives the panel: one
                transition, one owner. */}
            <ModeTransitionProvider>
              <ModeProvider>
                <NavigationContainer
                  ref={navigationRef}
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
                  {/* Hardcoded light, not "auto" — "auto" ties icon color (and, via
                      app.json's userInterfaceStyle, Android's default status bar
                      fill) to the system light/dark setting, which on a dark-mode
                      device rendered as a solid black strip above every screen's
                      light cream content. The app is light-only for now (see the
                      tab bar / Map hardcoding elsewhere), so the status bar
                      matches. LaunchScreen pushes its own light variant over this
                      while it is up, and unmounting pops back to this one. The
                      mode-switch panel does the same for its own duration. */}
                  <StatusBar style="dark" backgroundColor={colors.background} />
                </NavigationContainer>
              </ModeProvider>
            </ModeTransitionProvider>
          </LaunchGate>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Positioning context for the launch layer, which is an absolute-fill
  // sibling of the whole navigation container.
  root: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
