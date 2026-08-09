import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type {
  MapStackParamList,
  MessagesStackParamList,
  MyJobsStackParamList,
  ProfileStackParamList,
} from '../lib/navigation';
import { AdminReportsScreen } from '../screens/AdminReportsScreen';
import { ApproveOrDisputeScreen } from '../screens/ApproveOrDisputeScreen';
import { BidDetailScreen } from '../screens/BidDetailScreen';
import { BidSentScreen } from '../screens/BidSentScreen';
import { CellJobsScreen } from '../screens/CellJobsScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { ClientJobDetailScreen } from '../screens/ClientJobDetailScreen';
import { CompareBidsScreen } from '../screens/CompareBidsScreen';
import { CounterofferScreen } from '../screens/CounterofferScreen';
import { JobConfirmedScreen } from '../screens/JobConfirmedScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { SubmitBidScreen } from '../screens/SubmitBidScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { MapScreen } from '../screens/MapScreen';
import { MessagesInboxScreen } from '../screens/MessagesInboxScreen';
import { MyJobsHubScreen } from '../screens/MyJobsHubScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReviewAndTipScreen } from '../screens/ReviewAndTipScreen';
import { RouteArrivalScreen } from '../screens/RouteArrivalScreen';
import { TrackWorkerScreen } from '../screens/TrackWorkerScreen';
import { WorkChecklistScreen } from '../screens/WorkChecklistScreen';
import { WorkerJobScreen } from '../screens/WorkerJobScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';
import { ComponentCatalog } from '../dev-tools/ComponentCatalog';

/**
 * The four tabs that are the SAME in both modes (BRAZOS_MASTER_PLAN.md §F,
 * "preserve shared routes"; §P.3, "do not create a second version of an
 * existing screen").
 *
 * A Brazos account is one identity that is simultaneously a customer on the
 * jobs it posted and a worker on the jobs it bid for — there is no role switch
 * and no role gate (CLAUDE.md). So its job hub, its inbox, its map and its
 * profile are genuinely the same four surfaces in both modes, and each is
 * declared exactly once here and mounted by both trees.
 *
 * What is NOT shared is the Home tab, which is the mode-defining one: see
 * CustomerRoot.tsx and WorkerRoot.tsx. That is where the two trees differ, and
 * it is the only place they differ.
 *
 * KNOWN, DOCUMENTED GAP (deferred to Phase 8, recorded in BRAZOS_BUILD_STATE.md):
 * `JobDetail` — the worker bid screen — is registered in the Map and MyJobs
 * stacks, so a customer drilling into a map cell can still reach a worker
 * surface. Closing that needs the customer-safe `MarketJobPreview` route, which
 * §E/§J assign to Phase 8's discovery work; building it here would be a new
 * feature screen, which Phase 2 explicitly excludes. Phase 2 closes the two
 * leaks it owns — Customer Home's "View all" and its job cards — and leaves
 * this one flagged rather than silently half-fixed.
 */

const MyJobsStack = createNativeStackNavigator<MyJobsStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export function MyJobsStackNavigator() {
  return (
    <MyJobsStack.Navigator screenOptions={{ headerShown: false }}>
      <MyJobsStack.Screen name="MyJobsHub" component={MyJobsHubScreen} />
      <MyJobsStack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
      <MyJobsStack.Screen name="WorkerJob" component={WorkerJobScreen} />
      <MyJobsStack.Screen name="JobDetail" component={JobDetailScreen} />
      {/* Phase 5 — worker bid entry rides along wherever JobDetail is mounted
          (the PostJob/WorkerHomeStack gap is the failure mode this avoids). */}
      <MyJobsStack.Screen name="SubmitBid" component={SubmitBidScreen} />
      <MyJobsStack.Screen name="BidSent" component={BidSentScreen} />
      {/* Phase 5 — the customer hire loop lives with ClientJobDetail. */}
      <MyJobsStack.Screen name="CompareBids" component={CompareBidsScreen} />
      <MyJobsStack.Screen name="BidDetail" component={BidDetailScreen} />
      <MyJobsStack.Screen name="Counteroffer" component={CounterofferScreen} />
      <MyJobsStack.Screen name="Checkout" component={CheckoutScreen} />
      <MyJobsStack.Screen name="JobConfirmed" component={JobConfirmedScreen} />
      {/* Phase 6 — the active-work lifecycle. Worker side: arrival + checklist;
          customer side: tracking, approval/release, and post-release review. */}
      <MyJobsStack.Screen name="RouteArrival" component={RouteArrivalScreen} />
      <MyJobsStack.Screen name="WorkChecklist" component={WorkChecklistScreen} />
      <MyJobsStack.Screen name="TrackWorker" component={TrackWorkerScreen} />
      <MyJobsStack.Screen name="ApproveOrDispute" component={ApproveOrDisputeScreen} />
      <MyJobsStack.Screen name="ReviewAndTip" component={ReviewAndTipScreen} />
      <MyJobsStack.Screen name="Chat" component={ChatScreen} />
      <MyJobsStack.Screen name="PostJob" component={PostJobScreen} />
      <MyJobsStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <MyJobsStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </MyJobsStack.Navigator>
  );
}

export function MessagesStackNavigator() {
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

export function MapStackNavigator() {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="MapMain" component={MapScreen} />
      <MapStack.Screen name="CellJobs" component={CellJobsScreen} />
      <MapStack.Screen name="JobDetail" component={JobDetailScreen} />
      <MapStack.Screen name="SubmitBid" component={SubmitBidScreen} />
      <MapStack.Screen name="BidSent" component={BidSentScreen} />
      <MapStack.Screen name="PostJob" component={PostJobScreen} />
      <MapStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <MapStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
    </MapStack.Navigator>
  );
}

export function ProfileStackNavigator() {
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
