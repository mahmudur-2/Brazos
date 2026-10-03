import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('Customer Core keeps the existing route and service boundaries', async () => {
  // Phase 2 moved route registration out of App.tsx into the two mode trees
  // plus the stacks they share. The boundary being asserted is unchanged —
  // these routes must still exist and still be declared in lib/navigation.ts —
  // only the file that registers them moved.
  const [customerRoot, workerRoot, shared, navigation, postJob, search, hub, detail] =
    await Promise.all([
      read('navigation/CustomerRoot.tsx'),
      read('navigation/WorkerRoot.tsx'),
      read('navigation/sharedStacks.tsx'),
      read('lib/navigation.ts'),
      read('screens/PostJobScreen.tsx'),
      read('screens/WorkerSearchScreen.tsx'),
      read('screens/MyJobsHubScreen.tsx'),
      read('screens/ClientJobDetailScreen.tsx'),
    ]);

  const registrations = customerRoot + workerRoot + shared;
  for (const route of ['PostJob', 'WorkerSearch', 'MyJobsHub', 'ClientJobDetail']) {
    assert.match(registrations, new RegExp(`name=["']${route}["']`));
    assert.match(navigation, new RegExp(`\\b${route}\\b`));
  }

  assert.match(postJob, /await createJob\(/);
  assert.match(postJob, /await updateJob\(/);
  assert.match(postJob, /await createDirectOffer\(/);
  assert.match(postJob, /uploadJobAttachment/);
  assert.match(postJob, /uploadJobVideo/);
  assert.match(search, /await findWorkers\(/);
  assert.match(search, /runId !== runRef\.current/);
  assert.match(hub, /useMyJobsHub\(\)/);
  assert.match(detail, /await acceptOffer\(/);
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
  // 2026-09-28 (LUX-LIST-64 #41): "Save draft" leaves on purpose, so the guard
  // steps aside for exactly that (`leaving`) and holds everywhere else.
  assert.match(postJob, /usePreventRemove\(!leaving && \(submitting \|\| \(step > 0 && !showSuccess\)\)/);
  assert.match(postJob, /StackActions\.popToTop\(\)/);
  assert.match(postJob, /pop: true/);
  assert.match(postJob, /data: loc, error: locationError/);
  // Screen 16 (Phase 4): the publish success offers "View job and bids"
  // straight to the published job's own detail, and the secondary action home.
  // RUN P1 relabelled the second one "Back to Home" — where it lands.
  // 2026-09-28 (LUX-LIST-64 #42): the surface is the live page the Seal opens
  // (components/JobLivePage.tsx), no longer the SuccessScreen template; its two
  // actions are the same two handlers, in the posting bar's two places.
  const live = codeOnly(await read('components/JobLivePage.tsx'));
  assert.match(live, /label: 'View job and bids'/);
  assert.match(live, /label: 'Back to Home'/);
  assert.match(postJob, /<JobLivePage/);
  assert.match(postJob, /onBackHome=\{\(\) => leaveAfterSuccess\(false\)\}/);
  assert.match(postJob, /onViewJob=\{leaveToPublishedJob\}/);
  assert.doesNotMatch(postJob, /successTimeoutRef|setTimeout\(/);
});

test('Customer text inputs are protected by keyboard-avoiding layouts', async () => {
  const screens = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/WorkerSearchScreen.tsx'),
    read('screens/PostJobScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
  ]);

  // F9: the keyboard-avoiding view is components/KeyboardAvoid (React Native's, or the 120 Hz path).
  for (const screen of screens) {
    assert.match(screen, /<KeyboardAvoid\b/);
    assert.match(screen, /Platform\.OS === 'ios' \? 'padding' : undefined/);
  }

  // F8: the keyboard is still listened for — on the iOS WILL events, so the page moves with it.
  assert.match(screens[1], /Keyboard\.addListener\(Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
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
  // Fix run E7: the retry reads the one shared word.
  assert.match(hub, /STATE_COPY\.retry/);
  assert.match(hub, /RefreshControl/);
  // F13: the hub is one cached query per account. No late answer wins — React
  // Query runs one read per key at a time (a forced refresh cancels the one in
  // flight; a focus refresh joins it) — and one failed source keeps its old
  // rows: each failure is named, and the merge keeps that field's last good
  // value (lib/queryKeys.ts mergeKeepOnError, executed in tests/fixRunF.test.mjs).
  assert.match(hubHook, /useQuery\(\{\s*queryKey: queryKeys\.myJobsHub\(userId \?\? 'signed-out'\),/);
  assert.match(hubHook, /if \(postedRes\.error\) failed\.add\('posted'\);/);
  assert.match(hubHook, /if \(workingRes\.error\) failed\.add\('working'\);/);
  assert.match(hubHook, /if \(bidsRes\.error\) failed\.add\('pendingBids'\);/);
  assert.match(hubHook, /return mergeKeepOnError\(\s*previous,/);
});

test('Customer job detail keeps evidence and honest lifecycle recovery states', async () => {
  const [detailSource, bidCardSource, detailHook, bidHook, reviewSection, chat] = await Promise.all([
    read('screens/ClientJobDetailScreen.tsx'),
    read('components/OfferCard.tsx'),
    read('hooks/useJobDetail.ts'),
    read('hooks/useJobOffers.ts'),
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
  assert.match(bidHook, /setOffers\(\[\]\)/);
  assert.match(bidCard, /review['"]? : ['"]reviews|review' : 'reviews/);
  assert.match(bidCard, /offer\.status === 'pending'/);
  // The accept affordance must NOT be gated on the app's current mode.
  // ClientJobDetail is mounted in BOTH navigator trees (sharedStacks), so an
  // owner viewing their own job while in worker mode would lose the button.
  // Ownership is what decides this, and the screen already passes it in.
  assert.doesNotMatch(bidCard, /useModePerspective/);
  assert.match(bidCard, /const canAcceptThisOffer = canAccept &&/);
  assert.doesNotMatch(bidCard, /ratingCount === 1 \? 'job' : 'jobs'/);
  assert.match(reviewSection, /Couldn’t load your review/);
  assert.match(reviewSection, /cleanupDraftPhotos/);
  assert.match(reviewSection, /uploadsCommittedRef/);
  assert.match(reviewSection, /if \(submittingRef\.current \|\| uploadingPhotoRef\.current\) return/);
  assert.match(reviewSection, /if \(submittingRef\.current\) return/);
  assert.match(reviewSection, /editable={!submitting}/);
  assert.match(reviewSection, /disabled={uploadingPhoto \|\| submitting}/);
  // Hire Again follows the RELATIONSHIP, not which route opened the chat. It
  // used to also require a route jobId; with one conversation per pair the
  // inbox opens chats by counterparty, so that gate hid the CTA on exactly the
  // completed-job conversations it exists for. Where the offer is posted is
  // pinned here instead, which is the part that was actually load-bearing.
  //
  // 2026-08-23: the CTA moved OUT of the header and INTO the overflow menu —
  // the chip became three dots. Both halves above survive that move verbatim
  // (the relationship gate and the thread the offer is posted into); only the
  // expression carrying the gate changed shape.
  assert.match(chat, /if \(canRehire\) \{/);
  assert.match(chat, /key: 'hire-again',\s*label: 'Hire Again',/);
  assert.match(chat, /threadJobId: activeJob\?\.id/);
});

test('Worker job detail uses the real photo gallery and no verification pill', async () => {
  const detail = codeOnly(await read('screens/JobDetailScreen.tsx'));

  // Stage 4D-B: the unconditional "Unverified" pill is gone — it stamped a
  // distrust signal on every poster while carrying zero information. The
  // absence is the contract now (tests/verificationBadgeRemoved.test.mjs
  // asserts it tree-wide; this pins the screen that owned the inline copy).
  assert.doesNotMatch(detail, /VERIFICATION_LABEL|Unverified/);
  assert.match(detail, /const galleryPhotos = job\.photos \?\? \[\]/);
  assert.match(detail, /pagingEnabled/);
  assert.match(detail, /onMomentumScrollEnd/);
  assert.match(detail, /setActivePhotoIndex/);
  assert.match(detail, /<PhotoViewer/);
  assert.match(detail, /<JobVideo/);
  assert.match(detail, /handleTakeListedPrice/);
  // Phase 5: the custom-terms bid form moved to the SubmitBid route (screen
  // 52, OfferComposer). This screen must still offer that path — as a
  // navigation, not a second inline form — plus the §H.2 withdraw exit.
  assert.match(detail, /navigate\('SubmitBid', \{ job \}\)/);
  assert.doesNotMatch(detail, /createMarketplaceOffer\(\{[^}]*message:\s*message/s);
  assert.match(detail, /withdrawOffer\(/);
  assert.match(detail, /confirmWithdrawVisible/);
  assert.doesNotMatch(detail, /\bVerified\b/);
});

test('Customer Home retains approved Emerald reference copy without adding paid-service claims', async () => {
  const sources = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/PostJobScreen.tsx'),
    read('screens/WorkerSearchScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/ClientJobDetailScreen.tsx'),
    read('components/OfferCard.tsx'),
  ]);
  const customerCode = codeOnly(sources.join('\n'));

  // 2026-09-17 — THE REFERENCE COPY THIS PINNED IS THE NEARBY LIST'S, and
  // Nearby left the customer Home on operator instruction. Every pin below
  // that named a surviving surface is untouched; the four that named the
  // removed one are replaced by the copy that took its place, so this test
  // still asserts that Home carries the approved reference language rather
  // than quietly asserting less.
  //
  //   "Live Nearby" / "N pros interested"  -> the section is gone, and with it
  //                                          the card that counted bidders for
  //                                          a browsing worker.
  //   PREVIEW_COUNT = 4                    -> YOUR_JOBS_COUNT = 3, the customer's
  //                                          three most recent postings.
  //   previewNeighborhood()                -> gone with the card that showed a
  //                                          stranger's job's neighbourhood.
  //   useReducedMotion / Animated.loop     -> the live dot's pulse, which was
  //                                          the one looping animation here.
  //                                          The entrance animations stay and
  //                                          are their own fence's.
  assert.match(customerCode, /Your jobs|No jobs have been posted yet/i);
  assert.doesNotMatch(customerCode, /Open near you|Live activity in your area/i);
  // 2026-09-18: "Switch to Worker" left customer Home for the [+] sheet
  // (navigation/CustomerRoot.tsx, not one of the files above) and "BRAZOS
  // handles the rest" left with the promo card; the approved copy this pin
  // holds is the task card's title and the tile row's heading.
  assert.match(customerCode, /What do you need done\?|Popular services/i);
  assert.doesNotMatch(customerCode, /Switch to Worker/, 'the customer screens draw no mode pill');
  assert.match(customerCode, /const YOUR_JOBS_COUNT = 3/);
  assert.match(customerCode, /function counterpartyLine/);
  // "Arrival window" left this list in Phase 4: phase49 gave it a real
  // schema (jobs.arrival_start_hour/arrival_end_hour) and a real wizard
  // field, so it is no longer an unbacked reference-mock claim.
  // "Protected payment/funds" left it in Phase 5 for the same reason:
  // phase50's ledger, the sandbox checkout RPCs and MoneyText's fixed §H.3
  // captions made protection a real, persisted state — and the sandbox
  // honesty of that surface is guarded by tests/sandboxCheckout.test.mjs.
  // The rest remain claims the product cannot substantiate.
  assert.doesNotMatch(customerCode, /fit percentage|available today/i);
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
