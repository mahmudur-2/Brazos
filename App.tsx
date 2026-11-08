import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider } from './lib/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { cacheBelongsToSomeoneElse } from './lib/queryKeys';
import { useAuth } from './hooks/useAuth';
import { useNotificationModeBridge } from './hooks/useNotificationModeBridge';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useLiveJobCard } from './hooks/useLiveJobCard';
import { useThemeColors } from './hooks/useThemeColors';
import { configurePushHandling } from './lib/pushNotifications';
import { handleAppLink } from './lib/navigation';
import { handleStripeUrl, STRIPE_RETURN_URL } from './lib/payments/stripe';
import {
  beginRecovery,
  isRecoveryPending,
  parseRecoveryLink,
  setRecoveryPending,
  subscribeRecovery,
} from './lib/passwordReset';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { flushPendingNavigation, navigationRef } from './lib/navigationRef';
import { ThemeProvider } from './lib/ThemeContext';
import { LaunchCompleteContext, LaunchHoldContext, useReportLaunchReady } from './lib/launchContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ConfirmHost } from './components/ConfirmHost';
import { OfflineBanner } from './components/OfflineBanner';
import { useOnline } from './hooks/useOnline';
import { ModeTransitionProvider } from './components/ModeTransitionOverlay';
import { ModeProvider } from './modes';
import { MotionRoot } from './lib/motion120';
import { ModeShell } from './navigation/ModeShell';
import { AuthFlow } from './screens/AuthFlow';
import { OnboardingFlow } from './screens/OnboardingFlow';
import { LaunchScreen } from './screens/LaunchScreen';
import { LegalGateScreen } from './screens/LegalGateScreen';
import { ScreenStateView } from './ui/templates';
import { useLegalGate } from './hooks/useLegalGate';
import { useSetupStatus } from './hooks/useSetupStatus';
import { initSentry, wrapApp } from './lib/observability/sentry';

/**
 * ONCE, AT MODULE SCOPE, BEFORE ANY COMPONENT BELOW IS DEFINED — because a
 * crash reporter initialised inside a component cannot report the crashes that
 * happen on the way to rendering it, which are the ones that matter most.
 *
 * Inert by construction when the vendor module is absent or no DSN is
 * configured; see lib/observability/sentry.ts.
 */
initSentry();

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
  // FIX-RUN B6: the offline pill rides over every signed-in screen, once.
  return (
    <>
      <ModeShell />
      <OfflineBanner />
    </>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const { palette } = useThemeColors();
  const legal = useLegalGate();
  const setup = useSetupStatus();
  const online = useOnline();

  // Lives inside NavigationContainer so a tapped notification always has a
  // mounted container to route through.
  usePushNotifications();
  // Idea 9: the customer's lock-screen card follows their live jobs — whichever mode is on screen, and
  // nothing at all on a binary without the Live Activities add-on.
  useLiveJobCard(user?.id);

  // R6c (D2): the app-scheme deep link — brazos://payouts?from=return|refresh,
  // the bounce connect-return serves after the provider's hosted onboarding.
  // Same seat as the push listener, same dispatch machinery, same cross-mode
  // gate (lib/navigation.ts handleAppLink): the cold-start URL is read once
  // and parked through navigateWhenReady; a warm arrival comes through the
  // 'url' event. Unknown brazos:// paths are ignored silently.
  const linkBridge = useNotificationModeBridge();
  const [recoveryPending, setRecoveryPendingState] = useState(isRecoveryPending());
  useEffect(() => subscribeRecovery(setRecoveryPendingState), []);
  const handledInitialUrl = useRef(false);
  useEffect(() => {
    let active = true;
    const dispatch = (url: string | null) => {
      if (!active || !url) return;
      // FIX-RUN B16: a bank's 3-D Secure page returning to the payment sheet.
      if (url.startsWith(STRIPE_RETURN_URL)) {
        void handleStripeUrl(url);
        return;
      }
      // 2026-09-26 (the refresh, audit M-21): the reset email's link signs in
      // with its own recovery session, then the new-password screen opens.
      const recovery = parseRecoveryLink(url);
      if (recovery) {
        void beginRecovery(recovery).then(({ error }) => {
          if (error) console.error('[link] password recovery failed', error.message);
          else setRecoveryPending(true);
        });
        return;
      }
      void handleAppLink(url, linkBridge);
    };
    if (!handledInitialUrl.current) {
      handledInitialUrl.current = true;
      Linking.getInitialURL()
        .then(dispatch)
        .catch((err) => console.error('[link] getInitialURL failed', err));
    }
    const subscription = Linking.addEventListener('url', ({ url }) => dispatch(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [linkBridge]);

  // Both gates are resolved before anything authenticated renders. Letting
  // either answer arrive late is what would show Home for a frame and then
  // pull it away, so they are waited on together rather than in sequence.
  // Mode resolution is deliberately NOT part of this condition — it belongs
  // after setup, because Setup's own "Start in" choice feeds it. ModeShell
  // holds the identical loader for that last step.
  // F1: every branch below but the tabs is real content the launch layer can
  // lift onto; the tabs report from ModeShell once the mode's tree has laid out.
  const reportLaunchReady = useReportLaunchReady();
  const holdsLoader = loading || (!!user && (legal.state === 'loading' || setup.state === 'loading'));
  const reachesTabs = !!user && !recoveryPending && setup.state === 'complete' && legal.state === 'accepted';
  // Reset-password, sign-in, Setup, the legal error and the legal re-prompt.
  const drawsContent = !holdsLoader && !reachesTabs;
  useEffect(() => {
    if (drawsContent) reportLaunchReady();
  }, [drawsContent, reportLaunchReady]);

  if (loading || (user && (legal.state === 'loading' || setup.state === 'loading'))) {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (user && recoveryPending) return <ResetPasswordScreen />;

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
  // admits by default and never fakes an accepted state. B6: an account whose
  // acceptance of the current versions the server already confirmed on this
  // device never reaches this (useLegalGate admits it from lib/legalCache);
  // offline, the shared template's offline state says so plainly.
  if (legal.state === 'unknown') {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }]}>
        <ScreenStateView
          state={
            online
              ? {
                  kind: 'error',
                  message:
                    'The Terms of Service check didn’t load. Check your connection and try again.',
                  onRetry: legal.recheck,
                }
              : { kind: 'offline', onRetry: legal.recheck }
          }
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
/**
 * F1 — how long the launch layer waits, once the session is back, for the
 * first real screen. On a normal network the legal, setup and mode reads land
 * well inside it and no loader is ever seen; on a slow one the layer lifts at
 * the cap onto the loader or the error that is honestly there.
 */
const LAUNCH_HOLD_CAP_MS = 2500;

/**
 * F13 — ONE ACCOUNT'S CACHE. When the signed-in account changes or signs out,
 * the query cache is emptied before the next paint, so nobody ever sees
 * another account's rows. (Every per-account key also carries the user id.)
 */
function QueryAuthBridge() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const previous = useRef(userId);
  useLayoutEffect(() => {
    if (cacheBelongsToSomeoneElse(previous.current, userId)) queryClient.clear();
    previous.current = userId;
  }, [userId]);
  return null;
}

function LaunchGate({ children }: PropsWithChildren) {
  const { loading } = useAuth();
  const [complete, setComplete] = useState(false);
  // F1: the layer lifts when the first real screen says it has drawn
  // (lib/launchContext.ts), or at the cap once the session is back.
  const [contentReady, setContentReady] = useState(false);
  const [holdCapped, setHoldCapped] = useState(false);
  const reportLaunchReady = useCallback(() => setContentReady(true), []);
  useEffect(() => {
    if (loading || contentReady) return;
    const cap = setTimeout(() => setHoldCapped(true), LAUNCH_HOLD_CAP_MS);
    return () => clearTimeout(cap);
  }, [loading, contentReady]);

  return (
    <LaunchCompleteContext.Provider value={complete}>
      <LaunchHoldContext.Provider value={reportLaunchReady}>
      <View style={styles.root}>
        {children}
        {complete ? null : (
          <LaunchScreen
            sessionReady={!loading && (contentReady || holdCapped)}
            onFinish={() => setComplete(true)}
          />
        )}
      </View>
      </LaunchHoldContext.Provider>
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
        {/* 2026-09-28 (LUX-LIST-64 #64, audit M-31) — THE ONE CONFIRM ENGINE:
            every confirmAsync(), the mode switch's included, draws the app's
            own ConfirmDialog through this host (lib/dialog.ts). Inside the
            theme and the mode provider, beside the navigator. */}
        <ConfirmHost />
      </ModeProvider>
    </ModeTransitionProvider>
  );
}

function App() {
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
    // The motion boundary's root. On a binary that has react-native-gesture-
    // handler this is its GestureHandlerRootView, which the package requires
    // above EVERYTHING before any recogniser works; on a binary without it —
    // which is every build today — it is a Fragment, so the tree below is
    // byte-for-byte the same shape either way. See lib/motion120/vendor.ts for
    // why the load is lazy and caught rather than a static import.
    <MotionRoot>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
          <QueryAuthBridge />
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
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </MotionRoot>
  );
}

/**
 * The registered root, wrapped for crash reporting.
 *
 * `wrapApp` is the null-safe seam, NOT `Sentry.wrap`: the vendor is a caught
 * require and is null wherever it cannot load — a web export among them — and
 * this returns `App` untouched in that case. So the component tree below is
 * the same shape on every runtime, which is the property the whole boundary
 * exists to buy.
 *
 * index.ts imports this default and hands it to registerRootComponent; that
 * is unchanged and does not care which of the two it received.
 */
export default wrapApp(App);

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
