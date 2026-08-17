import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../components/ActionSheet';
import { navigateAcrossTabs } from '../lib/navigationRef';
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
import {
  bottomNavScreenOptions,
  CenterCreateButton,
  HIDDEN_TAB_ITEM_OPTIONS,
} from '../ui/primitives/BottomNav';
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
 * STAGE 4D BAR (operator decision, docs/audits/STAGE4D_PLAN.md):
 * `Home · Discover · [ + ] · Messages · Profile`. Discover replaces the Map
 * tab's slot and is the customer browse surface — workers and services, never
 * job postings. The [ + ] is an ACTION (a creation sheet), not a destination.
 *
 * WHY Map AND MyJobs ARE STILL REGISTERED, JUST HIDDEN
 * Two standing contracts dispatch to those TAB names on this navigator:
 *   - the LOCKED Customer Home's "View map" pill runs
 *     `navigation.getParent()?.navigate('Map')` — an untargeted NAVIGATE that
 *     React Navigation 7 resolves against this tab navigator and its
 *     ancestors ONLY (it no longer searches child navigators; see
 *     @react-navigation/core's useOnAction, which gates child propagation on
 *     `action.target`), so a "Map" route moved inside the Home stack would
 *     leave that locked pill dispatching into nothing;
 *   - notification routing and every cross-tab jump in the app target the
 *     shared MyJobs TAB in both modes (lib/navigationRef.ts,
 *     lib/notificationRoutes.ts), and the MyJobs stack hosts the whole hire
 *     loop (CompareBids, BidDetail, Counteroffer, Checkout, JobConfirmed) and
 *     active-work loop (RouteArrival, WorkChecklist, TrackWorker,
 *     ApproveOrDispute, ReviewAndTip).
 * Registering both with HIDDEN_TAB_ITEM_OPTIONS keeps every one of those
 * dispatches resolving while the bar shows only the four customer tabs plus
 * the center action. The Map route itself is scheduled to drop in the
 * operator's unlock session, after the locked "View map" chip is removed.
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

/**
 * The Create route's component. Never rendered in practice: the slot's
 * tabBarButton opens the creation sheet instead of navigating, so this route
 * is never focused and never draws an active state.
 */
function CreateActionScreen() {
  return null;
}

export function CustomerRoot() {
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);

  /** Close the sheet, then dispatch through the one guarded cross-tab path. */
  function runCreateAction(dispatch: () => void) {
    setCreateOpen(false);
    dispatch();
  }

  return (
    <>
      <Tab.Navigator screenOptions={bottomNavScreenOptions(insets.bottom)}>
        {/* No tabPress listener. Re-pressing the Home tab pops this stack to its
            root, which is Customer Home — the correct destination in this mode.
            The listener that used to intercept that existed only because both
            modes shared one stack and popping it could silently change mode. */}
        <Tab.Screen name="Home" component={CustomerHomeStackNavigator} />
        <Tab.Screen
          name="Discover"
          component={DiscoverStackNavigator}
          options={{ tabBarLabel: 'Discover' }}
        />
        <Tab.Screen
          name="Create"
          component={CreateActionScreen}
          options={{
            // Replaces the library's pressable outright: the [ + ] opens the
            // creation sheet and never dispatches navigation, so Create is not
            // a destination and never renders as focused.
            tabBarButton: () => <CenterCreateButton onPress={() => setCreateOpen(true)} />,
          }}
        />
        <Tab.Screen
          name="Messages"
          component={MessagesStackNavigator}
          options={{ tabBarLabel: 'Messages' }}
        />
        <Tab.Screen name="Profile" component={ProfileStackNavigator} />
        {/* Hidden routes — dispatchable, absent from the bar. See the header
            comment for the two contracts that require them. */}
        <Tab.Screen
          name="MyJobs"
          component={MyJobsStackNavigator}
          options={HIDDEN_TAB_ITEM_OPTIONS}
        />
        <Tab.Screen name="Map" component={MapStackNavigator} options={HIDDEN_TAB_ITEM_OPTIONS} />
      </Tab.Navigator>

      {/* The [ + ] creation sheet — exactly the three 4D-1a actions, reusing
          the existing ActionSheet rather than a new sheet component. Every
          destination goes through navigateAcrossTabs(), the one guarded
          cross-tab dispatch path. */}
      <ActionSheet
        visible={createOpen}
        title="What do you need?"
        items={[
          {
            key: 'post-job',
            label: 'Post a job',
            icon: 'add-circle-outline',
            onPress: () => runCreateAction(() => navigateAcrossTabs('Home', 'PostJob')),
          },
          {
            key: 'hire-again',
            label: 'Hire someone again',
            icon: 'people-outline',
            onPress: () => runCreateAction(() => navigateAcrossTabs('Profile', 'SavedWorkers')),
          },
          {
            key: 'my-jobs',
            label: 'My jobs',
            icon: 'briefcase-outline',
            onPress: () => runCreateAction(() => navigateAcrossTabs('MyJobs')),
          },
        ]}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
