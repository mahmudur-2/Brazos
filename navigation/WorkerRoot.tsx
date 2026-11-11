import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MeltTabBar } from '../components/MeltTabBar';
import type { WorkerHomeStackParamList, WorkerParamList } from '../lib/navigation';
import { BidSentScreen } from '../screens/BidSentScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { SubmitBidScreen } from '../screens/SubmitBidScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';
import { WorkerJobScreen } from '../screens/WorkerJobScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { WorkerResultsScreen } from '../screens/WorkerResultsScreen';
import {
  bottomNavScreenListeners,
  bottomNavScreenOptions,
  WORKER_BAR_TABS,
} from '../ui/primitives/BottomNav';
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
 * The Home tab in worker mode. Rooted since Stage 4D at WorkerHome
 * (screens/WorkerHomeScreen.tsx) — greeting, the phase53 taking-new-work
 * toggle, potential earnings and the match counts — with every job-list
 * intent landing on WorkerResults.
 *
 * initialRouteName is EXPLICIT (4D-1b): the landing route is a stated
 * contract, not a side effect of declaration order, so switching to worker
 * mode lands here every time and a test can assert it.
 *
 * Popping this stack to its root still lands on the worker's own home, so the
 * Home tab's default re-press behaviour stays correct — the property the
 * Phase 2 restructure bought is preserved, only the root screen is newer.
 */
function WorkerHomeStackNavigator() {
  return (
    <WorkerHomeStack.Navigator
      initialRouteName="WorkerHome"
      screenOptions={{ headerShown: false }}
    >
      <WorkerHomeStack.Screen name="WorkerHome" component={WorkerHomeScreen} />
      <WorkerHomeStack.Screen name="Notifications" component={NotificationsScreen} />
      <WorkerHomeStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <WorkerHomeStack.Screen name="WorkerResults" component={WorkerResultsScreen} />
      <WorkerHomeStack.Screen name="JobDetail" component={JobDetailScreen} />
      {/* Phase 5 — registered wherever JobDetail is, so the bid entry can
          never hit the not-handled-by-any-navigator failure Known Issues
          records for PostJob. */}
      <WorkerHomeStack.Screen name="SubmitBid" component={SubmitBidScreen} />
      <WorkerHomeStack.Screen name="BidSent" component={BidSentScreen} />
      {/* Phase 7 — pre-hire chat from the own-bid card, same JobDetail rule. */}
      <WorkerHomeStack.Screen name="Chat" component={ChatScreen} />
      {/* 2026-08-10 — WorkerProfile ("Send an offer"), Chat (re-hire) and
          JobDetail (own-job Edit) all dispatch PostJob; this was the one stack
          of six not registering it, and it crashed on device. See
          WorkerHomeStackParamList for the full decision record. */}
      <WorkerHomeStack.Screen name="PostJob" component={PostJobScreen} />
      <WorkerHomeStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <WorkerHomeStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
      {/* E5: a notification's job opens here when the person is on Home (the feed), so Back returns to it. */}
      <WorkerHomeStack.Screen name="WorkerJob" component={WorkerJobScreen} getId={({ params }) => params?.jobId} />
    </WorkerHomeStack.Navigator>
  );
}

export function WorkerRoot() {
  return (
    <Tab.Navigator
      screenOptions={bottomNavScreenOptions}
      screenListeners={bottomNavScreenListeners}
      tabBar={(props) => <MeltTabBar {...props} tabs={WORKER_BAR_TABS} />}
    >
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
