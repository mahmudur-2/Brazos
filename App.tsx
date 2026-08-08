import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync } from 'expo-audio';
import type { ComponentProps } from 'react';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './hooks/useAuth';
import { usePushNotifications } from './hooks/usePushNotifications';
import { configurePushHandling } from './lib/pushNotifications';
import { flushPendingNavigation, navigationRef } from './lib/navigationRef';
import type {
  HomeStackParamList,
  MapStackParamList,
  MessagesStackParamList,
  MyJobsStackParamList,
  ProfileStackParamList,
} from './lib/navigation';
import { colors } from './lib/theme';
import { LaunchCompleteContext } from './lib/launchContext';
import { ModeTransitionProvider } from './components/ModeTransitionOverlay';
import { AuthFlow } from './screens/AuthFlow';
import { OnboardingFlow } from './screens/OnboardingFlow';
import { LaunchScreen } from './screens/LaunchScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PostJobScreen } from './screens/PostJobScreen';
import { ClientJobDetailScreen } from './screens/ClientJobDetailScreen';
import { BrowseJobsScreen } from './screens/BrowseJobsScreen';
import { WorkerResultsScreen } from './screens/WorkerResultsScreen';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { WorkerJobScreen } from './screens/WorkerJobScreen';
import { MyJobsHubScreen } from './screens/MyJobsHubScreen';
import { ChatScreen } from './screens/ChatScreen';
import { MessagesInboxScreen } from './screens/MessagesInboxScreen';
import { MapScreen } from './screens/MapScreen';
import { CellJobsScreen } from './screens/CellJobsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { WorkerProfileScreen } from './screens/WorkerProfileScreen';
import { ProfileReviewsScreen } from './screens/ProfileReviewsScreen';
import { WorkerSearchScreen } from './screens/WorkerSearchScreen';
import { AdminReportsScreen } from './screens/AdminReportsScreen';
import { NotificationSettingsScreen } from './screens/NotificationSettingsScreen';
import { LegalDocumentScreen } from './screens/LegalDocumentScreen';
import { LegalGateScreen } from './screens/LegalGateScreen';
import { useLegalGate } from './hooks/useLegalGate';
import { useSetupStatus } from './hooks/useSetupStatus';
import { consumePendingLanding } from './lib/setupLanding';
import { HomeDesignStudio } from './dev-tools/HomeDesignStudio';
import { ComponentCatalog } from './dev-tools/ComponentCatalog';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const MyJobsStack = createNativeStackNavigator<MyJobsStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// [active, inactive] icon per tab.
const TAB_ICONS: Record<string, [IoniconName, IoniconName]> = {
  Home: ['home', 'home-outline'],
  // A teardrop location-pin marker, not the map-square glyph — this tab is
  // "find work near you", and a pin reads as that more directly than a map.
  Map: ['location', 'location-outline'],
  MyJobs: ['briefcase', 'briefcase-outline'],
  Messages: ['chatbubbles', 'chatbubbles-outline'],
  Profile: ['person', 'person-outline'],
};

// tabBarIcon renders the label itself now (see MainTabs), so this is the
// visual label text — kept separate from each Tab.Screen's tabBarLabel
// option below, which is left in place purely for the accessibility string
// React Navigation builds from it ("Map, tab, 2 of 5" etc).
const TAB_LABELS: Record<string, string> = {
  Home: 'Home',
  Map: 'Map',
  MyJobs: 'My Jobs',
  Messages: 'Messages',
  Profile: 'Profile',
};

// Bottom tab bar sizing. @react-navigation/bottom-tabs 7.18.3 (the version
// installed here) bakes in — with nothing in this file overriding them —
// a 25px icon (ICON_SIZE_ROUND in its TabBarIcon.js), a 10px label
// (labelBeneath in BottomTabItem.js), and a 49px bar content height
// (TABBAR_HEIGHT_UIKIT in BottomTabBar.js, before the device's safe-area
// bottom inset is added on top). None of those are exposed as constants to
// import, so they're reproduced here from the installed source rather than
// guessed.
//
// Icon and label are deliberate design sizes, landed on after two rounds of
// feedback (a 35%/35% scale-up read too big; these are the midpoint). The bar
// height is NOT a taste value the same way — it's derived from what the
// content actually measures, see the arithmetic below.
const TAB_ICON_SIZE = 29;
const TAB_LABEL_FONT_SIZE = 12;

// BottomTabItem.js's tabVerticalUiKit style wraps whatever tabBarIcon renders
// in 5px of padding on every side — not overridable — so the usable slot is
// always TAB_BAR_CONTENT_HEIGHT - 10. The stacked content below needs:
//
//   icon glyph box   32   (Ionicons renders in a Text box ~size + 3, NOT 29)
//   label            16   (marginTop 2 + lineHeight 14)
//   paddingBottom     3   (TAB_BOTTOM_GAP)
//   ------------------------
//   total            51
//
// so the slot must be >= 51, i.e. the bar >= 61. 70 leaves deliberate slack:
// the bar was 55 (a 45px slot) for several iterations, which is where the
// icons-crossing-the-hairline bug came from, and because tabItemContent packs
// to flex-end any overflow goes out the TOP, through the hairline. The
// Emerald reskin removed a 7px active dot from this stack, which only widened
// the margin — the height is left where it is rather than re-tightened around
// the exact content, since nothing is gained by sitting close to that edge.
//
// Careful with the icon line: react-native-web collapses the label's <Text>
// layout box to ~1px instead of 14, which made the old 55/45 combination
// measure as fitting exactly on web while overflowing on device. Any harness
// measurement of this stack taken on web reads ~13px shorter than native —
// don't size this from a web number without adding that back.
const TAB_BAR_CONTENT_HEIGHT = 70;
const TAB_ICON_WRAPPER_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 10;
const TAB_BOTTOM_GAP = 3;

// How much room to leave below the labels for the home indicator. iOS reports
// insets.bottom = 34 on notched devices, and reserving all of it was what left
// the visible band of empty white under the labels: the content area stops at
// 70px and the remaining 34 is pure padding. The indicator itself only
// occupies roughly the bottom 13px, so 16 clears it with margin while cutting
// that dead space by more than half. Devices reporting a smaller inset keep
// their own (the Math.min below), since they need less, not more.
const TAB_BAR_SAFE_BOTTOM = 16;

// Deliberately hardcoded, NOT sourced from useThemeColors() — that hook's
// useColorScheme() dependency was forcing MainTabs' screenOptions (and this
// style object) to recompute on every system light/dark flip. Android has a
// well-known rendering bug where a `transparent` background combined with a
// nonzero `elevation` renders as a solid black rectangle instead of a proper
// shadow — see the elevation:0 override below, which only reliably wins
// over the library's own default elevation:8 (BottomTabBar.js's `bottom`
// style) once it's actually applied; a recompute is exactly the kind of
// moment where a transient style could briefly fall back to that default.
// An opaque background makes that whole bug class structurally impossible
// regardless of timing, on top of removing the theme dependency itself.
// Values below reuse the app's existing light-palette tokens (not new hex
// literals) so this can't silently drift. Proper light/dark tab bar theming
// comes later.
//
// Emerald reskin: the active tint is now `forest` (the atlas's deep green,
// which is also what the Home screen's own chrome uses) rather than `primary`,
// and the hairline is the ordinary border rather than gold — the reference
// separates the bar with a plain hairline and carries the accent colour on the
// active item itself, not on the edge.
const TAB_BAR_BACKGROUND = colors.surface;
const TAB_HAIRLINE_COLOR = colors.border;
const TAB_ACTIVE_COLOR = colors.forest;
const TAB_INACTIVE_COLOR = colors.textMuted;

const SHOW_HOME_DESIGN_STUDIO =
  __DEV__ &&
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('studio') === 'home';

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="PostJob" component={PostJobScreen} />
      <HomeStack.Screen name="BrowseJobs" component={BrowseJobsScreen} />
      <HomeStack.Screen name="WorkerResults" component={WorkerResultsScreen} />
      <HomeStack.Screen name="JobDetail" component={JobDetailScreen} />
      <HomeStack.Screen name="WorkerSearch" component={WorkerSearchScreen} />
      <HomeStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <HomeStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </HomeStack.Navigator>
  );
}

function MyJobsStackNavigator() {
  return (
    <MyJobsStack.Navigator screenOptions={{ headerShown: false }}>
      <MyJobsStack.Screen name="MyJobsHub" component={MyJobsHubScreen} />
      <MyJobsStack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
      <MyJobsStack.Screen name="WorkerJob" component={WorkerJobScreen} />
      <MyJobsStack.Screen name="JobDetail" component={JobDetailScreen} />
      <MyJobsStack.Screen name="Chat" component={ChatScreen} />
      <MyJobsStack.Screen name="PostJob" component={PostJobScreen} />
      <MyJobsStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <MyJobsStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </MyJobsStack.Navigator>
  );
}

function MessagesStackNavigator() {
  return (
    <MessagesStack.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStack.Screen name="MessagesInbox" component={MessagesInboxScreen} />
      <MessagesStack.Screen name="Chat" component={ChatScreen} />
      <MessagesStack.Screen name="PostJob" component={PostJobScreen} />
      <MessagesStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <MessagesStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </MessagesStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="AdminReports" component={AdminReportsScreen} />
      <ProfileStack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
      />
      <ProfileStack.Screen name="LegalDocument" component={LegalDocumentScreen} />
      <ProfileStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
      {/* The design-system catalog (BRAZOS_MASTER_PLAN.md §I). Registered only
          under __DEV__, so a production bundle has no route to it at all —
          hidden by absence rather than by a hidden entry point. Its row in
          ProfileScreen is gated on the same flag. */}
      {__DEV__ ? (
        <ProfileStack.Screen name="ComponentCatalog" component={ComponentCatalog} />
      ) : null}
    </ProfileStack.Navigator>
  );
}

function MapStackNavigator() {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="MapMain" component={MapScreen} />
      <MapStack.Screen name="CellJobs" component={CellJobsScreen} />
      <MapStack.Screen name="JobDetail" component={JobDetailScreen} />
      <MapStack.Screen name="PostJob" component={PostJobScreen} />
      <MapStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <MapStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </MapStack.Navigator>
  );
}

function MainTabs() {
  // getTabBarHeight() (bottom-tabs internals) uses a custom tabBarStyle.height
  // VERBATIM when one is set, rather than adding the safe-area inset on top of
  // it the way the default 49px computation does — so the inset has to be
  // folded in here by hand. Without this, TAB_BAR_CONTENT_HEIGHT would be the
  // whole bar on a notched device and the home indicator would eat into the
  // content slot, re-creating the overflow that height is sized to avoid.
  const insets = useSafeAreaInsets();
  const bottomInset = Math.min(insets.bottom, TAB_BAR_SAFE_BOTTOM);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  // "Start in: Find work" lands on the existing BrowseJobs screen inside the
  // Home tab. It is applied here rather than by Setup because finishing setup
  // does not navigate — it swaps this whole tree in, and there is no navigator
  // alive at that moment to point anywhere. Consumed once, so a later remount
  // cannot yank the user off whatever they had since opened.
  useEffect(() => {
    if (consumePendingLanding() !== 'work') return;
    // One frame, so the tab navigator has finished mounting and the jump lands
    // on a real stack rather than being dropped.
    const frame = requestAnimationFrame(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Home', { screen: 'BrowseJobs' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Gold hairline minimal style — hardcoded, not theme-adaptive, see
        // TAB_BAR_BACKGROUND etc above for why.
        tabBarActiveTintColor: TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? [
            'ellipse',
            'ellipse-outline',
          ];
          const label = TAB_LABELS[route.name] ?? route.name;
          return (
            <View style={styles.tabItemContent}>
              <Ionicons
                name={focused ? active : inactive}
                size={TAB_ICON_SIZE}
                color={color}
              />
              <Text
                style={[
                  styles.tabItemLabel,
                  { color, fontWeight: focused ? '700' : '500' },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        },
        // Now wraps the whole icon+label+dot block (see tabItemContent),
        // not just the icon — width:'100%' so longer labels like "Messages"
        // have the full tab column to lay out in, instead of the library's
        // default 31px-wide icon-only box.
        tabBarIconStyle: { width: '100%', height: TAB_ICON_WRAPPER_HEIGHT },
        tabBarStyle: {
          height: tabBarHeight,
          // MUST accompany the height above. BottomTabBar.js applies
          // `paddingBottom: insets.bottom` (the full 34 on a notched device)
          // to the bar; tabBarStyle is merged last so this overrides it.
          // Without it the bar would be 86 tall with 34 of padding, leaving
          // the content only 52 of the 70 it needs — re-creating the overflow
          // the height was sized to avoid.
          paddingBottom: bottomInset,
          backgroundColor: TAB_BAR_BACKGROUND,
          borderTopColor: TAB_HAIRLINE_COLOR,
          elevation: 0,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        listeners={({ navigation, route }) => ({
          // Tapping the already-active tab's own icon defaults to popping its
          // stack all the way to the first screen (Customer Home) — which
          // would silently switch mode out of Worker Home. "BrowseJobs"
          // anywhere in this stack means mode is "worker" (pushed there by
          // the mode-switch transition, see ModeTransitionOverlay); re-press
          // the Home tab in that case pops back to Worker Home specifically,
          // not past it. "Switch to Customer" remains the only intentional
          // mode change. Switching TO the Home tab from elsewhere is left
          // untouched — that already preserves whichever screen was on top.
          tabPress: (e) => {
            if (!navigation.isFocused()) return;
            const nestedState = (route as { state?: { routes?: { name: string }[] } }).state;
            const stackRoutes = nestedState?.routes ?? [];
            const inWorkerMode = stackRoutes.some((r) => r.name === 'BrowseJobs');
            if (inWorkerMode) {
              e.preventDefault();
              navigation.navigate('Home', { screen: 'BrowseJobs' });
            }
          },
        })}
      />
      <Tab.Screen
        name="Map"
        component={MapStackNavigator}
        options={{ tabBarLabel: 'Map' }}
      />
      <Tab.Screen
        name="MyJobs"
        component={MyJobsStackNavigator}
        options={{ tabBarLabel: 'My Jobs' }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStackNavigator}
        options={{ tabBarLabel: 'Messages' }}
      />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
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
      <AuthProvider>
        <LaunchGate>
          {/* Sits between the launch layer and the navigator so the mode-switch
              panel covers every screen — including the tab bar — while the
              destination Home is swapped in underneath it. */}
          <ModeTransitionProvider>
            <NavigationContainer
              ref={navigationRef}
              // A cold-start tap is delivered before this mounts, so the
              // routing it requested is parked and replayed here.
              onReady={flushPendingNavigation}
            >
              <RootNavigator />
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
          </ModeTransitionProvider>
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  // Fills TAB_ICON_WRAPPER_HEIGHT and packs against the bottom instead of
  // the top — see the comment on TAB_ICON_WRAPPER_HEIGHT/TAB_BOTTOM_GAP.
  tabItemContent: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: TAB_BOTTOM_GAP,
  },
  tabItemLabel: {
    // fontWeight is set per-render (bold when focused) — see tabBarIcon.
    fontSize: TAB_LABEL_FONT_SIZE,
    lineHeight: TAB_LABEL_FONT_SIZE + 2,
    marginTop: 2,
  },
});
