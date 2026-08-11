import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CustomerHomeStackParamList, CustomerParamList } from '../lib/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { WorkerSearchScreen } from '../screens/WorkerSearchScreen';
import { bottomNavScreenOptions } from '../ui/primitives/BottomNav';
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
 */

const CustomerHomeStack = createNativeStackNavigator<CustomerHomeStackParamList>();
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

export function CustomerRoot() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator screenOptions={bottomNavScreenOptions(insets.bottom)}>
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
    </Tab.Navigator>
  );
}
