import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './hooks/useAuth';
import { useThemeColors } from './hooks/useThemeColors';
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
// First pass scaled everything up (35%/35%/25%) and came back too big.
// These are the corrected values — roughly the midpoint between that pass
// and the untouched defaults above, given as exact pixel targets rather
// than a scale factor this time. Not to be changed again without a fresh
// measurement.
const BASE_TAB_ICON_SIZE = 25;
const BASE_TAB_LABEL_FONT_SIZE = 10;
const BASE_TAB_BAR_CONTENT_HEIGHT = 49;
const TAB_ICON_SIZE = 29;
const TAB_LABEL_FONT_SIZE = 12;
const TAB_BAR_CONTENT_HEIGHT = 55;

// BottomTabItem.js's tabVerticalUiKit style wraps whatever tabBarIcon
// renders in 5px of padding on every side — not overridable — so the
// content block below only ever has TAB_BAR_CONTENT_HEIGHT - 10 to fill.
// tabItemContent is given exactly that height and packs itself against the
// BOTTOM of it (justifyContent: 'flex-end') instead of the top, so the
// leftover slack collects above the icon instead of below the label —
// content sits low in the bar, with only TAB_BOTTOM_GAP of new space plus
// the library's fixed 5px padding left underneath it.
const TAB_ICON_WRAPPER_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 10;
const TAB_BOTTOM_GAP = 3;

// Reused, not reinvented — the same tokens Button.tsx's primary variant and
// the rating-star UI already use, so the tab bar can't drift from them.
const TAB_DOT_SIZE = 4;

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="PostJob" component={PostJobScreen} />
      <HomeStack.Screen name="BrowseJobs" component={BrowseJobsScreen} />
      <HomeStack.Screen name="JobDetail" component={JobDetailScreen} />
      <HomeStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
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
    </MapStack.Navigator>
  );
}

function MainTabs() {
  // getTabBarHeight() (bottom-tabs internals) uses a custom tabBarStyle.height
  // VERBATIM when one is set, rather than adding the safe-area inset on top of
  // it the way the default 49px computation does — so the inset has to be
  // folded in here by hand to land on a genuinely ~25%-taller CONTENT height
  // rather than a taller bar with a squeezed content area on notched devices.
  const insets = useSafeAreaInsets();
  const { palette } = useThemeColors();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Gold hairline minimal style: muted gray inactive, the app's own
        // forest green (same token Button.tsx's primary variant uses) when
        // active. Both come from useThemeColors() so they adapt with the
        // device's light/dark setting.
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
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
              <Text style={[styles.tabItemLabel, { color }]} numberOfLines={1}>
                {label}
              </Text>
              <View
                style={[
                  styles.tabItemDot,
                  { backgroundColor: palette.star, opacity: focused ? 1 : 0 },
                ]}
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
          // Transparent fill + a recolored hairline instead of a solid bar —
          // elevation:0 drops the library's default Android shadow, which
          // would otherwise show as a dark line under a see-through bar.
          backgroundColor: 'transparent',
          borderTopColor: palette.star,
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
          <StatusBar style="auto" />
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
    fontSize: TAB_LABEL_FONT_SIZE,
    lineHeight: TAB_LABEL_FONT_SIZE + 2,
    fontWeight: '500',
    marginTop: 2,
  },
  tabItemDot: {
    width: TAB_DOT_SIZE,
    height: TAB_DOT_SIZE,
    borderRadius: TAB_DOT_SIZE / 2,
    marginTop: 3,
  },
});
