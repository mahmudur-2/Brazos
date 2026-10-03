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
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { CounterofferScreen } from '../screens/CounterofferScreen';
import { JobConfirmedScreen } from '../screens/JobConfirmedScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { SubmitBidScreen } from '../screens/SubmitBidScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { MapScreen } from '../screens/MapScreen';
import { HiddenChatsScreen } from '../screens/HiddenChatsScreen';
import { MessagesInboxScreen } from '../screens/MessagesInboxScreen';
import { MyJobsHubScreen } from '../screens/MyJobsHubScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PostJobScreen } from '../screens/PostJobScreen';
import { PaymentMethodsScreen } from '../screens/PaymentMethodsScreen';
import { PayoutsScreen } from '../screens/PayoutsScreen';
import { ProfileReviewsScreen } from '../screens/ProfileReviewsScreen';
import { AccountSafetyScreen } from '../screens/AccountSafetyScreen';
import { ProfileDetailsScreen } from '../screens/ProfileDetailsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReviewAndTipScreen } from '../screens/ReviewAndTipScreen';
import { SavedWorkersScreen } from '../screens/SavedWorkersScreen';
import { ServicesPricingScreen } from '../screens/ServicesPricingScreen';
import { RouteArrivalScreen } from '../screens/RouteArrivalScreen';
import { TrackWorkerScreen } from '../screens/TrackWorkerScreen';
import { WorkChecklistScreen } from '../screens/WorkChecklistScreen';
import { WorkerJobScreen } from '../screens/WorkerJobScreen';
import { WorkerProfileScreen } from '../screens/WorkerProfileScreen';

/**
 * LOADED LAZILY (F2): the catalog is a __DEV__-only route, so its module is
 * required on first render, never evaluated at boot.
 */
function ComponentCatalog() {
  const { ComponentCatalog: Catalog } =
    require('../dev-tools/ComponentCatalog') as typeof import('../dev-tools/ComponentCatalog');
  return <Catalog />;
}

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
 * The old known gap here — `JobDetail` (the worker bid screen) being
 * registered in the shared Map and MyJobs stacks, reachable by a customer
 * drilling into a map cell — is CLOSED, at the screen rather than at these
 * registrations: JobDetailScreen delegates customer mode on someone else's
 * job to the customer-safe `MarketJobPreview` (Phase 8, §10), so no route
 * through these stacks can render EST. PAY or a bid CTA to a customer.
 * tests/discovery.test.mjs pins the delegation.
 */

const MyJobsStack = createNativeStackNavigator<MyJobsStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export function MyJobsStackNavigator() {
  return (
    <MyJobsStack.Navigator screenOptions={{ headerShown: false }}>
      <MyJobsStack.Screen name="MyJobsHub" component={MyJobsHubScreen} />
      {/* One screen per job (the build run's group 3 review): a push for another job — a reminder's
          Route, a repeat visit's Confirm — opens that job's own screen instead of reusing this one's
          state (its address, its one-shot intent). */}
      <MyJobsStack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} getId={({ params }) => params?.job?.id} />
      <MyJobsStack.Screen name="WorkerJob" component={WorkerJobScreen} getId={({ params }) => params?.jobId} />
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
      {/* Reached only from the inbox's foot row, after the device
          authentication prompt succeeds (phase77 HIDDEN_CHATS). */}
      <MessagesStack.Screen name="HiddenChats" component={HiddenChatsScreen} />
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
      {/* Phase 7 — pre-hire chat from the own-bid card, same JobDetail rule. */}
      <MapStack.Screen name="Chat" component={ChatScreen} />
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
      {/* Decision 10 — the profile area is three pages, not one. Registered
          on the SHARED profile stack, so both trees mount them identically
          and cross-tree navigation stays a compile error. */}
      <ProfileStack.Screen name="ProfileDetails" component={ProfileDetailsScreen} />
      <ProfileStack.Screen name="AccountSafety" component={AccountSafetyScreen} />
      <ProfileStack.Screen name="AdminReports" component={AdminReportsScreen} />
      <ProfileStack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
      />
      <ProfileStack.Screen name="Appearance" component={AppearanceScreen} />
      <ProfileStack.Screen name="LegalDocument" component={LegalDocumentScreen} />
      <ProfileStack.Screen name="ProfileReviews" component={ProfileReviewsScreen} />
      {/* Phase 9 — worker self-service + the customer people surface. */}
      <ProfileStack.Screen name="ServicesPricing" component={ServicesPricingScreen} />
      <ProfileStack.Screen name="SavedWorkers" component={SavedWorkersScreen} />
      <ProfileStack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <ProfileStack.Screen name="Earnings" component={EarningsScreen} />
      {/* R6c — the worker's payout state. On the shared profile stack, like
          Earnings, so the brazos://payouts bounce resolves in either tree;
          the deep link's cross-mode gate is what makes it worker-owned. */}
      <ProfileStack.Screen name="Payouts" component={PayoutsScreen} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
      <ProfileStack.Screen name="WorkerProfile" component={WorkerProfileScreen} />
      <ProfileStack.Screen name="PostJob" component={PostJobScreen} />
      {/* Phase 67 — App Store Guideline 5.1.1(v). Registered here because
          Profile is the shared account surface: deletion has to be reachable
          in BOTH modes, and this stack is mounted by both trees. */}
      <ProfileStack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
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
