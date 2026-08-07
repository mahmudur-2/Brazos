import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('Customer Core keeps the existing route and service boundaries', async () => {
  const [app, navigation, postJob, search, hub, detail] = await Promise.all([
    read('App.tsx'),
    read('lib/navigation.ts'),
    read('screens/PostJobScreen.tsx'),
    read('screens/WorkerSearchScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
  ]);

  for (const route of ['PostJob', 'WorkerSearch', 'MyJobsHub', 'ClientJobDetail']) {
    assert.match(app, new RegExp(`name=["']${route}["']`));
    assert.match(navigation, new RegExp(`\\b${route}\\b`));
  }

  assert.match(postJob, /await createJob\(/);
  assert.match(postJob, /await updateJob\(/);
  assert.match(postJob, /await createJobRequest\(/);
  assert.match(postJob, /uploadJobAttachment/);
  assert.match(postJob, /uploadJobVideo/);
  assert.match(search, /await findWorkers\(/);
  assert.match(search, /runId !== runRef\.current/);
  assert.match(hub, /useMyJobsHub\(\)/);
  assert.match(detail, /await acceptBid\(/);
});

test('Post Job is a guarded four-step presentation over the existing form state', async () => {
  const postJobSource = await read('screens/PostJobScreen.tsx');
  const postJob = codeOnly(postJobSource);

  for (const label of ['Describe', 'Media', 'Location', 'Review']) {
    assert.match(postJob, new RegExp(`label: '${label}'`));
  }
  assert.match(postJob, /const submittingRef = useRef\(false\)/);
  assert.match(postJob, /if \(!user \|\| submittingRef\.current\) return/);
  assert.match(postJob, /sessionUploadsRef/);
  assert.match(postJob, /uploadsCommittedRef/);
  assert.match(postJob, /usePreventRemove\(submitting \|\| \(step > 0 && !showSuccess\)/);
  assert.match(postJob, /StackActions\.popToTop\(\)/);
  assert.match(postJob, /pop: true/);
  assert.match(postJob, /data: loc, error: locationError/);
  assert.match(postJob, /'View my jobs'/i);
  assert.match(postJob, /title="Back to home"/i);
  assert.doesNotMatch(postJob, /successTimeoutRef|setTimeout\(/);
});

test('Customer text inputs are protected by keyboard-avoiding layouts', async () => {
  const screens = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/WorkerSearchScreen.tsx'),
    read('screens/PostJobScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
  ]);

  for (const screen of screens) {
    assert.match(screen, /<KeyboardAvoidingView/);
    assert.match(screen, /Platform\.OS === 'ios' \? 'padding' : undefined/);
  }

  assert.match(screens[1], /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(screens[1], /useWindowDimensions\(\)/);
});

test('My Jobs exposes recovery and a real Post Job route without dropping worker items', async () => {
  const [hub, hubHook] = await Promise.all([
    read('screens/MyJobsHubScreen.tsx'),
    read('hooks/useMyJobsHub.ts'),
  ]);

  assert.match(hub, /workingItems\.map/);
  assert.match(hub, /postedItems\.map/);
  assert.match(hub, /bidItems\.map/);
  assert.match(hub, /navigation\.navigate\('PostJob'\)/);
  assert.match(hub, /Post another job/);
  assert.match(hub, /'Retry'/);
  assert.match(hub, /RefreshControl/);
  assert.match(hubHook, /runId !== runRef\.current/);
  assert.match(hubHook, /if \(!postedRes\.error\) setPosted/);
  assert.match(hubHook, /if \(!workingRes\.error\) setWorking/);
  assert.match(hubHook, /if \(!bidsRes\.error\) setPendingBids/);
});

test('Customer job detail keeps evidence and honest lifecycle recovery states', async () => {
  const [detailSource, bidCardSource, detailHook, bidHook, reviewSection, chat] = await Promise.all([
    read('screens/ClientJobDetailScreen.tsx'),
    read('components/BidWorkerCard.tsx'),
    read('hooks/useJobDetail.ts'),
    read('hooks/useJobBids.ts'),
    read('components/ReviewSection.tsx'),
    read('screens/ChatScreen.tsx'),
  ]);
  const detail = codeOnly(detailSource);
  const bidCard = codeOnly(bidCardSource);

  assert.match(detail, /missing/);
  assert.match(detail, /refresh/);
  assert.match(detail, /job\.description/);
  assert.match(detail, /job\.photos/);
  assert.match(detail, /<JobProgress/);
  assert.match(detail, /navigation\.navigate\('Chat'/);
  assert.match(detail, /<ReviewSection/);
  assert.match(detail, /const acceptingRef = useRef\(false\)/);
  assert.match(detail, /acceptingRef\.current/);
  assert.match(detail, /bids\.filter\(\(bid\) => bid\.status === 'pending'\)/);
  assert.match(detail, /refreshJob\(\)/);
  assert.match(detail, /navigation\.popTo\('MyJobsHub'\)/);
  assert.match(detail, /key={`\$\{job\.id}:\$\{user\.id}`}/);
  assert.match(detailHook, /setJob\(snapshot\)/);
  assert.match(detailHook, /setMissing\(false\)/);
  assert.match(detailHook, /runId !== runRef\.current/);
  assert.match(bidHook, /useFocusEffect/);
  assert.match(bidHook, /setBids\(\[\]\)/);
  assert.match(bidCard, /review['"]? : ['"]reviews|review' : 'reviews/);
  assert.match(bidCard, /bid\.status === 'pending'/);
  assert.doesNotMatch(bidCard, /ratingCount === 1 \? 'job' : 'jobs'/);
  assert.match(reviewSection, /Couldn’t load your review/);
  assert.match(reviewSection, /cleanupDraftPhotos/);
  assert.match(reviewSection, /uploadsCommittedRef/);
  assert.match(reviewSection, /if \(submittingRef\.current \|\| uploadingPhotoRef\.current\) return/);
  assert.match(reviewSection, /if \(submittingRef\.current\) return/);
  assert.match(reviewSection, /editable={!submitting}/);
  assert.match(reviewSection, /disabled={uploadingPhoto \|\| submitting}/);
  assert.match(chat, /canRehire && counterparty && jobId/);
});

test('Customer Home retains approved Emerald reference copy without adding paid-service claims', async () => {
  const sources = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/PostJobScreen.tsx'),
    read('screens/WorkerSearchScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
    read('components/BidWorkerCard.tsx'),
  ]);
  const customerCode = codeOnly(sources.join('\n'));

  assert.match(customerCode, /Live Nearby|pros? interested/i);
  assert.doesNotMatch(customerCode, /Open near you|Live activity in your area/i);
  assert.match(customerCode, /Switch to Worker|EST\. PRICE|BRAZOS handles the rest/i);
  assert.match(customerCode, /const PREVIEW_COUNT = 4/);
  assert.match(customerCode, /function previewNeighborhood/);
  assert.match(customerCode, /useReducedMotion\(\)/);
  assert.match(customerCode, /Animated\.loop/);
  assert.doesNotMatch(
    customerCode,
    /protected (?:payment|funds)|arrival window|fit percentage|available today/i
  );
});

test('Emerald shared controls are customer-opt-in and keep 44pt touch semantics', async () => {
  const [theme, postJob, detail, segments, chips, review] = await Promise.all([
    read('lib/theme.ts'),
    read('screens/PostJobScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
    read('components/SegmentedControl.tsx'),
    read('components/Chip.tsx'),
    read('components/ReviewSection.tsx'),
  ]);

  assert.match(theme, /export const emeraldColors/);
  assert.match(postJob, /palette={emeraldColors}/);
  assert.match(detail, /palette={emeraldColors}/);
  assert.match(segments, /minHeight: 44/);
  assert.match(segments, /accessibilityRole="tab"/);
  assert.match(segments, /accessibilityState={{ selected }}/);
  assert.match(chips, /onPress && styles\.chipInteractive/);
  assert.match(chips, /chipInteractive:\s*{\s*minHeight: 44/);
  assert.match(review, /hitSlop=\{7\}/);
  assert.match(review, /width: 30/);
});
