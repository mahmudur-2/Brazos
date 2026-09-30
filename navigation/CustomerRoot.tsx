import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateSheet } from '../components/CreateSheet';
import { MeltTabBar } from '../components/MeltTabBar';
import { navigateAcrossTabs } from '../lib/navigationRef';
import type {
  CustomerHomeStackParamList,
  CustomerParamList,
  DiscoverStackParamList,
} from '../lib/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { useMode } from '../modes';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { WorkerSearchScreen } from '../screens/WorkerSearchScreen';
import {
  bottomNavScreenListeners,
  bottomNavScreenOptions,
  CUSTOMER_BAR_TABS,
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
 * THE CUSTOMER BAR (emerald D1) + THE CREATION SLOT (D3/D4):
 * `Home · Discover · [ + ] · Messages · Profile` — five slots, of which four
 * are destinations and one is an action.
 *
 * This REVERSES two earlier decisions, both on direct operator instruction:
 *
 *   1. **My Jobs is no longer a customer tab.** Decision 4 gave both trees the
 *      same five tabs; the operator does not want My Jobs among the
 *      customer's. Only the BAR ITEM went. The screen, the stack, the route
 *      and every navigation into it are untouched, and the customer's standing
 *      way in — the [ + ] sheet's "My jobs" action — is unchanged and pinned
 *      by a test. The WORKER tree keeps its My Jobs tab.
 *   2a. **home(9): the customer lost its last link to Map.** `HomeScreen`'s
 *      "View map" pill was the one live customer dispatch at the Map route,
 *      and it is gone — the map is a WORKER surface ("find work near you") and
 *      the customer's Live Nearby row offers "View all" alone now. The ROUTE
 *      stays registered and hidden below, deliberately: it is dispatchable,
 *      the worker tree's own Map tab is untouched, and un-registering it here
 *      is the mistake this file's header already warns about. A customer-side
 *      dispatch added tomorrow resolves without a navigator change.
 *   2. **Map became Discover** — label, glyph AND destination — reversing
 *      decision 4 / manifest Appendix B-2's "Map, never Discover". The
 *      destination is not new: `DiscoverStackNavigator` below has existed
 *      since 4D-1a as a registered-but-hidden route, rooted at the customer's
 *      own browse surface (WorkerSearchScreen — real worker profiles,
 *      categories and services, never job postings). D1 asked for "the old
 *      discover icon / name / function"; the function was recovered rather
 *      than invented, and the glyph is D1's magnifier.
 *
 * The centre [ + ] stays exactly as D3 built it and emerald D4 confirms it: an
 * ACTION, not a destination — its tabBarButton opens the creation sheet and
 * never dispatches navigation, so `Create` is never focused and never draws an
 * active state. The three sheet actions are the ones it carried before 0d, and
 * each still keeps a standing surface, so the sheet is a shortcut and never
 * the only way to anything.
 *
 * WHY Map AND MyJobs ARE STILL REGISTERED, JUST HIDDEN
 * Every remaining dispatch at them is an UNTARGETED NAVIGATE, which React
 * Navigation 7 resolves against this tab navigator and its ancestors ONLY (it
 * no longer searches child navigators; see @react-navigation/core's
 * useOnAction, which gates child propagation on `action.target`). So the route
 * has to exist on THIS navigator or the tap throws:
 *   - the [ + ] sheet's "My jobs" → `navigateAcrossTabs('MyJobs')`
 *   - notification routing → `TAB_FOR_SCREEN` sends ClientJobDetail, WorkerJob
 *     and JobDetail through the `MyJobs` tab in BOTH trees
 * Hiding the item (HIDDEN_TAB_ITEM_OPTIONS) removes the slot from the bar's
 * layout without removing the route, which is why no deep link needed
 * retargeting. The Home stack still mounts WorkerSearch for the
 * pushed-from-Home search path, exactly as before.
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
      <CustomerHomeStack.Screen name="Notifications" component={NotificationsScreen} />
      <CustomerHomeStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
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
  const [createOpen, setCreateOpen] = useState(false);
  // 2026-09-18: the customer's mode switch moved off Home and into the
  // sheet's bottom row — the same switchMode() the Home pill called, which
  // confirms before it swaps trees (modes/ModeProvider.tsx).
  const { switchMode, switching } = useMode();

  /** Close the sheet, then dispatch through the one guarded cross-tab path. */
  function runCreateAction(dispatch: () => void) {
    setCreateOpen(false);
    dispatch();
  }

  // 2026-09-26 (the refresh, audit M-38) — the switch row keeps the sheet up
  // while switchMode() asks. A yes swaps the trees (this one unmounts, sheet
  // and all); a no leaves the sheet exactly where it was, so the customer is
  // one tap from any other row instead of dropped back on the screen below.
  async function switchFromSheet() {
    const switched = await switchMode('worker');
    if (switched) setCreateOpen(false);
  }

  return (
    <>
      {/* 2026-09-30 — the Melt-through bar (components/MeltTabBar.tsx) draws this tree's four
          tabs and the [ + ], which opens the creation sheet below and never navigates. */}
      <Tab.Navigator
        screenOptions={bottomNavScreenOptions}
        screenListeners={bottomNavScreenListeners}
        tabBar={(props) => (
          <MeltTabBar {...props} tabs={CUSTOMER_BAR_TABS} onCreate={() => setCreateOpen(true)} />
        )}
      >
        {/* The ONLY tabPress listener is the shared haptics tap
            (bottomNavScreenListeners) — it navigates nothing and reads
            nothing. Re-pressing the Home tab still pops this stack to its
            root, which is Customer Home — the correct destination in this
            mode; the interception listener that once lived here (it existed
            only because both modes shared one stack, and popping it could
            silently change mode) stays gone. */}
        <Tab.Screen name="Home" component={CustomerHomeStackNavigator} />
        {/* D1's slot: the browse surface, in the position Map used to hold. */}
        <Tab.Screen
          name="Discover"
          component={DiscoverStackNavigator}
          options={{ tabBarLabel: 'Discover' }}
        />
        {/* The creation slot's route. The bar draws the [ + ] in its place and opens the
            creation sheet; nothing navigates here, so Create is never focused. */}
        <Tab.Screen name="Create" component={CreateActionScreen} options={HIDDEN_TAB_ITEM_OPTIONS} />
        <Tab.Screen
          name="Messages"
          component={MessagesStackNavigator}
          options={{ tabBarLabel: 'Messages' }}
        />
        <Tab.Screen name="Profile" component={ProfileStackNavigator} />
        {/* Hidden routes — dispatchable, absent from the bar. D1 took their bar
            items, not their reachability. See the header comment for the four
            live dispatches that require them to stay here. */}
        <Tab.Screen
          name="Map"
          component={MapStackNavigator}
          options={HIDDEN_TAB_ITEM_OPTIONS}
        />
        <Tab.Screen
          name="MyJobs"
          component={MyJobsStackNavigator}
          options={HIDDEN_TAB_ITEM_OPTIONS}
        />
      </Tab.Navigator>

      {/* The [ + ] creation sheet — the three actions it has carried since
          prestige(0d) restored it, now on the docked glass CreateSheet
          (2026-09-18, G1 "Clear") with two contextual rows of its own: the
          job that needs the customer's move, and the mode switch that left
          customer Home. Every destination still goes through
          navigateAcrossTabs(), the one guarded cross-tab dispatch path, and
          every dispatch stays in THIS file: the sheet draws, it never routes. */}
      <CreateSheet
        visible={createOpen}
        title="What do you need?"
        items={[
          {
            key: 'post-job',
            label: 'Post a job',
            primary: true,
            onPress: () => runCreateAction(() => navigateAcrossTabs('Home', 'PostJob')),
          },
          {
            key: 'hire-again',
            label: 'Hire again',
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
        // The attention card opens the job the way Home's own card does — on
        // the hub's full row, no re-fetch.
        onOpenJob={(job) =>
          runCreateAction(() => navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job }))
        }
        // switchMode() asks with the sheet still up; only a yes swaps the trees.
        onSwitchMode={() => void switchFromSheet()}
        switching={switching}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
