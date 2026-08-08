import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WorkerHomeStackParamList, WorkerParamList } from '../lib/navigation';
import { BrowseJobsScreen } from '../screens/BrowseJobsScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { WorkerResultsScreen } from '../screens/WorkerResultsScreen';
import { bottomNavScreenOptions } from '../ui/primitives/BottomNav';
import {
  MapStackNavigator,
  MessagesStackNavigator,
  MyJobsStackNavigator,
  ProfileStackNavigator,
} from './sharedStacks';

/**
 * The worker tree (BRAZOS_MASTER_PLAN.md §F, `WorkerRoot`).
 *
 * Same five tabs, in the same order, with the same bar — only the Home tab
 * differs, and that difference is what "mode" means here. See CustomerRoot.tsx.
 */

const WorkerHomeStack = createNativeStackNavigator<WorkerHomeStackParamList>();
const Tab = createBottomTabNavigator<WorkerParamList>();

/**
 * The Home tab in worker mode. Rooted at Worker Home (atlas 48, LOCKED) — not
 * pushed on top of Customer Home, which is what it used to be.
 *
 * That single change is the fix for "the Home tab sends worker users back to
 * Customer Home": popping this stack to its root now lands on Worker Home,
 * because Worker Home *is* the root. The listener in App.tsx that used to
 * detect "is BrowseJobs on the stack?" and intercept the pop is deleted.
 */
function WorkerHomeStackNavigator() {
  return (
    <WorkerHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkerHomeStack.Screen name="BrowseJobs" component={BrowseJobsScreen} />
      <WorkerHomeStack.Screen name="WorkerResults" component={WorkerResultsScreen} />
      <WorkerHomeStack.Screen name="JobDetail" component={JobDetailScreen} />
      <WorkerHomeStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <WorkerHomeStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </WorkerHomeStack.Navigator>
  );
}

export function WorkerRoot() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator screenOptions={bottomNavScreenOptions(insets.bottom)}>
      <Tab.Screen name="Home" component={WorkerHomeStackNavigator} />
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
