import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PostJobScreen } from './screens/PostJobScreen';
import { ClientJobDetailScreen } from './screens/ClientJobDetailScreen';
import { BrowseJobsScreen } from './screens/BrowseJobsScreen';
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
//   dot               7   (marginTop 3 + size 4)
//   paddingBottom     3   (TAB_BOTTOM_GAP)
//   ------------------------
//   total            58
//
// so the slot must be >= 58, i.e. the bar >= 68. 70 is that plus 2px of
// slack. The bar was 55 (a 45px slot) for several iterations, which is where
// the icons-crossing-the-hairline bug came from: 58 into 45 overflows by 13,
// and because tabItemContent packs to flex-end the overflow went out the TOP,
// through the hairline.
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

// Reused, not reinvented — the same tokens Button.tsx's primary variant and
// the rating-star UI already use, so the tab bar can't drift from them.
const TAB_DOT_SIZE = 4;

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
// literals) so this can't silently drift from Button.tsx's primary green or
// the rating-star gold. Proper light/dark tab bar theming comes later.
const TAB_BAR_BACKGROUND = colors.surface;
const TAB_HAIRLINE_COLOR = colors.star;
const TAB_ACTIVE_COLOR = colors.primary;
const TAB_INACTIVE_COLOR = colors.textMuted;
const TAB_DOT_COLOR = colors.star;

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="PostJob" component={PostJobScreen} />
      <HomeStack.Screen name="BrowseJobs" component={BrowseJobsScreen} />
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
              <View
                style={[styles.tabItemDot, { opacity: focused ? 1 : 0 }]}
              />
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
      <Tab.Screen name="Home" component={HomeStackNavigator} />
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

  // Lives inside NavigationContainer so a tapped notification always has a
  // mounted container to route through.
  usePushNotifications();

  if (loading || (user && legal.state === 'loading')) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <AuthScreen />;

  // Sits between authentication and the app itself, so it covers both cases
  // with one gate: a brand-new account meets it the moment sign-up completes
  // (nothing is usable before it), and an existing account meets it on the
  // next launch after the documents change.
  if (legal.state === 'needs_acceptance') {
    return <LegalGateScreen onAccepted={legal.markAccepted} />;
  }

  return <MainTabs />;
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
        <NavigationContainer
          ref={navigationRef}
          // A cold-start tap is delivered before this mounts, so the routing
          // it requested is parked and replayed here.
          onReady={flushPendingNavigation}
        >
          <RootNavigator />
          {/* Hardcoded light, not "auto" — "auto" ties icon color (and, via
              app.json's userInterfaceStyle, Android's default status bar
              fill) to the system light/dark setting, which on a dark-mode
              device rendered as a solid black strip above every screen's
              light cream content. The app is light-only for now (see the
              tab bar / Map hardcoding elsewhere), so the status bar matches. */}
          <StatusBar style="dark" backgroundColor={colors.background} />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
  tabItemDot: {
    width: TAB_DOT_SIZE,
    height: TAB_DOT_SIZE,
    borderRadius: TAB_DOT_SIZE / 2,
    marginTop: 3,
    backgroundColor: TAB_DOT_COLOR,
  },
});
