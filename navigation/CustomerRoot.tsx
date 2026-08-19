import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../lib/theme';
import type {
  CustomerHomeStackParamList,
  CustomerParamList,
  DiscoverStackParamList,
} from '../lib/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { WorkerSearchScreen } from '../screens/WorkerSearchScreen';
import { bottomNavScreenOptions, HIDDEN_TAB_ITEM_OPTIONS } from '../ui/primitives/BottomNav';
import {
  MapStackNavigator,
  MessagesStackNavigator,
  MyJobsStackNavigator,
  ProfileStackNavigator,
} from './sharedStacks';

/**
 * The customer tree (BRAZOS_MASTER_PLAN.md §F, `CustomerRoot`).
 *
 * Mounted only while mode === 'customer'; its worker counterpart is not mounted
 * at all at that moment. That mutual exclusion is §F's enforcement mechanism 2,
 * and it is also what gives switchMode() its stack reset for free — swapping
 * trees unmounts every stack in this one, so coming back always starts at the
 * tab roots rather than wherever the user had wandered.
 *
 * PRESTIGE BAR (pre-made decision 4, replacing the 4D-era four-plus-[+]):
 * `Home · Map · My Jobs · Messages · Profile` — the SAME five tabs as the
 * worker tree, in the same order; the golden masters draw this one bar on
 * every screen and none draws a center [ + ]. The creation sheet retired with
 * it: each of its three actions has a standing surface — PostJob from Home
 * and from the My Jobs hub, SavedWorkers on the Profile stack, and My Jobs
 * itself now a visible tab.
 *
 * WHY Discover IS STILL REGISTERED, JUST HIDDEN
 * SavedWorkersScreen dispatches `navigateAcrossTabs('Discover',
 * 'WorkerSearch', …)` — an untargeted NAVIGATE that React Navigation 7
 * resolves against this tab navigator and its ancestors ONLY (it no longer
 * searches child navigators; see @react-navigation/core's useOnAction, which
 * gates child propagation on `action.target`) — so the browse surface must
 * stay a route on this navigator even though decision 4's bar gives it no
 * item. The Home stack still mounts WorkerSearch for the pushed-from-Home
 * search path, exactly as before.
 */

const CustomerHomeStack = createNativeStackNavigator<CustomerHomeStackParamList>();
const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>();
const Tab = createBottomTabNavigator<CustomerParamList>();

/**
 * The Home tab in customer mode. Rooted at Customer Home (atlas 07, LOCKED).
 *
 * Worker Home, the worker job feed and the worker bid screen are absent by
 * design — not merely unlinked. `CustomerHomeStackParamList` does not name
 * them, so customer code cannot navigate to them and tsc says so.
 */
function CustomerHomeStackNavigator() {
  return (
    <CustomerHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <CustomerHomeStack.Screen name="HomeMain" component={HomeScreen} />
      <CustomerHomeStack.Screen name="PostJob" component={PostJobScreen} />
      <CustomerHomeStack.Screen name="WorkerSearch" component={WorkerSearchScreen} />
      <CustomerHomeStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <CustomerHomeStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </CustomerHomeStack.Navigator>
  );
}

/**
 * The Discover tab: the existing customer worker-browse surface
 * (WorkerSearchScreen — real worker profiles, categories, services) mounted as
 * a tab root. `autoFocus: false` keeps the keyboard down on a plain tab visit;
 * pushed-from-Home search keeps its open-focused behaviour.
 */
function DiscoverStackNavigator() {
  return (
    <DiscoverStack.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStack.Screen
        name="WorkerSearch"
        component={WorkerSearchScreen}
        initialParams={{ autoFocus: false }}
      />
      <DiscoverStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <DiscoverStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
      <DiscoverStack.Screen name="PostJob" component={PostJobScreen} />
    </DiscoverStack.Navigator>
  );
}

export function CustomerRoot() {
  const insets = useSafeAreaInsets();
  const { palette } = useThemeColors();

  return (
    <Tab.Navigator screenOptions={bottomNavScreenOptions(insets.bottom, palette)}>
      {/* No tabPress listener. Re-pressing the Home tab pops this stack to its
          root, which is Customer Home — the correct destination in this mode.
          The listener that used to intercept that existed only because both
          modes shared one stack and popping it could silently change mode. */}
      <Tab.Screen name="Home" component={CustomerHomeStackNavigator} />
      <Tab.Screen name="Map" component={MapStackNavigator} options={{ tabBarLabel: 'Map' }} />
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
      {/* Hidden route — dispatchable, absent from the bar. See the header
          comment for the contract that requires it. */}
      <Tab.Screen
        name="Discover"
        component={DiscoverStackNavigator}
        options={HIDDEN_TAB_ITEM_OPTIONS}
      />
    </Tab.Navigator>
  );
}
