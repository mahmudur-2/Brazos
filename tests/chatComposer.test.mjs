import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ===========================================================================
// THE REBUILT CHAT COMPOSER — 2026-08-23.
//
// Four naked controls (camera, photo library, record-mic, filled send disc)
// plus a fixed-height quick-reply row above them became three zones: the
// [ + ] drop-up, the field, and the send arrow.
//
// The properties below are the ones a later run could plausibly undo while
// believing it was fixing something, so each is pinned with the reason:
//
//   1. NO MIC IN THE ROW (lean D3a). Dictation is the iOS keyboard's own key,
//      and voice messages are not in v1.
//   2. NEVER A DEAD CONTROL — the [ + ] renders only if its menu would have an
//      entry.
//   3. THE ATTACHMENT GATE SURVIVED THE REDESIGN. A direct thread has no job
//      id to key storage on, so its media entries stay hidden.
//   4. A FLAGGED ENTRY NEEDS ITS HANDLER TOO, so flipping a flag without
//      wiring the action still cannot produce a row that does nothing.
//   5. QUICK REPLIES ARE GONE, tree-wide, component and templates together.
// ===========================================================================

const COMPOSER = 'components/ChatComposer.tsx';
const DROPMENU = 'components/DropMenu.tsx';
const DROPMENU_SHARED = 'components/DropMenu.shared.tsx';
const DROPMENU_FAST = 'components/DropMenu.motion120.tsx';
const CHAT = 'screens/ChatScreen.tsx';

const inbox = await import('../lib/inboxFilters.ts');
const menus = await import('../lib/chatMenus.ts');

test('[static] the composer is three zones, and every glyph is bare', () => {
  const flat = flatten(read(COMPOSER));

  // ZONE 1 — the [ + ]. `colors.ink` is the palette's strongest content
  // colour: the cream that reads as WHITE in dark, its opposite number in
  // light. One token, both themes, no isDark fork on this glyph.
  assert.match(flat, /<Ionicons name="add" size=\{ICON_GLYPH_SIZE \+ 4\} color=\{colors\.ink\} \/>/);
  // ZONE 2 — the field, and it FLEXES: the row's whole point is that the
  // input gets the width the four old controls were taking.
  // 2026-09-28 (LUX-LIST-64 #8): the input glows while typing, so it sits in a
  // wrapper that takes its place in the row — the WRAPPER flexes now.
  assert.match(flat, /inputWrap: \{ flex: 1,/);
  assert.match(flat, /wrapStyle=\{styles\.inputWrap\}/);
  // ZONE 3 — one fixed box holding the send layer, so the row's width cannot
  // change as the text does.
  assert.match(flat, /morphSlot: \{ width: COMPOSER_CONTROL_SIZE, height: COMPOSER_CONTROL_SIZE,? \}/);
  assert.match(flat, /morphLayer: \{ \.\.\.StyleSheet\.absoluteFillObject,/);

  // NO DISC BEHIND THE GLYPHS. The old send button was a filled primary
  // circle (and a gold-ringed one in dark); that ring is what made the row
  // read as a toolbar rather than as a text field.
  assert.doesNotMatch(flat, /sendBtn|sendBtnDark/, 'the filled send disc is retired');
  const iconBtn = /iconBtn: \{([^}]*)\}/.exec(flat);
  assert.ok(iconBtn, 'the shared control box must stay a plain style');
  assert.doesNotMatch(
    iconBtn[1],
    /backgroundColor|borderWidth/,
    'the control box is a touch target, not a chrome — no fill, no ring'
  );

  // THE MORPH runs on transform + opacity, which is what keeps it on the
  // native driver while someone is typing into the field beside it.
  assert.match(flat, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(flat, /opacity: morph,/);
  // The arrow takes touches only while it is visible.
  assert.match(flat, /pointerEvents=\{showSend \? 'auto' : 'none'\}/);
});

test('[static] no mic in the composer row: dictation is the keyboard key, voice messages are gone', () => {
  const source = stripComments(read(COMPOSER));

  // Lean D3a (ruling 2): the iOS keyboard has its own dictation key, and v1
  // messaging is text and photo. The two Post-a-job mics are not this file.
  assert.doesNotMatch(source, /voiceSearch|joinDictation|mic-outline|onMicTap|key: 'voice'/);
  // F3: the composer owns the draft; the field types into its own setter.
  assert.match(source, /const \[text, setText\] = useState\(\(\) => draft\?\.current \?\? ''\);/);
  assert.match(source, /onChangeText=\{setText\}/);
});

test('[static] no dead control: the send waits on text, the [ + ] on having an entry', () => {
  const source = stripComments(read(COMPOSER));

  // The send arrow appears with text, and only then.
  assert.match(source, /const showSend = text\.trim\(\)\.length > 0;/);
  assert.match(source, /const sendDisabled = !text\.trim\(\) \|\| sending;/);

  // The [ + ] is absent, not empty, when the thread can take no attachment.
  assert.match(source, /\{menuItems\.length > 0 && \(/);
});

test('[static] the attachment gate survived the redesign', () => {
  const source = stripComments(read(COMPOSER));

  // A direct thread (no job) has no path to key an upload on, so its media
  // entries are hidden rather than offered and then failing. Camera is
  // additionally behind its own prop.
  assert.match(source, /if \(allowAttachments && showCameraAndMic\) \{\s*menuItems\.push\(\{ key: 'camera'/);
  assert.match(source, /if \(allowAttachments\) \{\s*menuItems\.push\(\{ key: 'photos'/);
});

test('[static] the attachment gate covers exactly the camera and photos rows', () => {
  const source = stripComments(read(COMPOSER));

  // chat-photos authorise on a JOB, so camera and photos are hidden on a pair
  // thread (lean D3b removed the live-location row that sat outside the gate).
  const gated = [...source.matchAll(/if \(allowAttachments[^)]*\) \{/g)];
  assert.equal(gated.length, 2, 'exactly two menu rows are gated on allowAttachments');

  // Named, so the count above cannot be satisfied by the wrong two.
  for (const key of ['camera', 'photos']) {
    const at = source.indexOf(`key: '${key}'`);
    assert.ok(at > -1, `the ${key} row must exist`);
    const preceding = source.slice(0, at);
    assert.match(
      preceding.slice(preceding.lastIndexOf('if (')),
      /^if \(allowAttachments/,
      `${key} must be gated on allowAttachments`,
    );
  }

  // And the prop's own contract says so, so the next reader is not left to
  // infer it from the call sites. Read UNSTRIPPED: the contract is the
  // docblock, which is exactly what stripComments() removes.
  assert.match(
    read(COMPOSER),
    /Whether CAMERA and PHOTOS are possible/,
    'the prop must document what it gates',
  );
});

test('[static] the drop-up is the shared DropMenu, on the boundary timings', () => {
  const composer = stripComments(read(COMPOSER));
  const menu = stripComments(read(DROPMENU));

  assert.match(composer, /<DropMenu\s+visible=\{menuOpen\}/);
  assert.match(composer, /direction="up"/, 'the composer sits at the bottom of the screen');
  // Anchored, not measured: a measured menu flickers on its first frame.
  assert.match(composer, /anchor: \{\s*position: 'relative',/);

  // ONE menu for the app — the composer's drop-up, the chat header's dropdown
  // and the inbox row's actions. Three of these written three times would be
  // three tempos.
  //
  // 2026-08-23 — THE MENU SPLIT INTO TWO DRIVERS AND ONE BODY. DropMenu.tsx
  // still holds the core-Animated fallback, DropMenu.motion120.tsx holds the
  // worklet-spring fast path, and everything a user can NAME — items,
  // backdrop, geometry, colours, dismissal — moved to DropMenu.shared.tsx so
  // the two binaries cannot drift into two menus. These assertions moved with
  // the code they describe; none of them was dropped.
  const shared = stripComments(read(DROPMENU_SHARED));

  assert.match(menu, /MENU_MOTION_MS,\s*MENU_MOTION_OUT_MS,/);
  assert.match(menu, /from '\.\.\/lib\/motion120'/);
  assert.match(menu, /duration: reducedMotion \? 0 : visible \? MENU_MOTION_MS : MENU_MOTION_OUT_MS/);
  assert.match(menu, /useNativeDriver: USE_NATIVE_DRIVER/);
  // It grows FROM the anchor in both directions, so the origin of the motion
  // is the button either way — and the travel is stated ONCE, in the shared
  // module, so both drivers move the same distance.
  assert.match(shared, /export const PANEL_TRAVEL = 8;/);
  assert.match(
    shared,
    /return direction === 'up' \? PANEL_TRAVEL : -PANEL_TRAVEL;/,
    'the direction rule belongs to both paths',
  );
  assert.match(menu, /const travel = panelTravelFor\(direction\);/);
  // Kept mounted through the exit, or every dismissal is a hard cut.
  assert.match(menu, /if \(finished && !visible\) setMounted\(false\);/);
  // Outside-tap dismissal exists and is announced.
  assert.match(shared, /accessibilityLabel=\{closeLabel\}/);
  // Rows meet the touch floor by their DRAWN height — adjacent rows with
  // overlapping hitSlop would steal each other's taps.
  assert.match(shared, /minHeight: 46,/);
});

// ---------------------------------------------------------------------------
// THE CHAT HEADER — 2026-08-23. Avatar, serif name, three gold dots.
// ---------------------------------------------------------------------------

test('[static] the header carries the face on the left and one affordance on the right', () => {
  const chat = stripComments(read(CHAT));
  const header = stripComments(read('components/ScreenHeader.tsx'));

  // The shared header gained a LEADING slot rather than chat growing a
  // bespoke header of its own and losing the serif-title convention with it.
  assert.match(header, /leading\?: ReactNode;/);
  assert.match(header, /\{leading\}\s*\{onPressTitle \?/, 'leading sits between the back control and the title');

  // The avatar opens the SAME view-only viewer the message avatars open.
  assert.match(chat, /<Avatar uri=\{counterparty\.avatar_url\} name=\{counterparty\.full_name\} size=\{34\} \/>/);
  assert.match(chat, /allowShare=\{false\}/, 'a profile photo is view-only — forwarding it is not an affordance');
  // No photo is a real state and it must not be a dead button.
  assert.match(chat, /disabled=\{!counterparty\.avatar_url\}/);

  // The chip is gone; the dots are gold LINE-WORK, not a filled pill.
  assert.doesNotMatch(chat, /hireAgainButton|hireAgainLabel/, 'the Hire Again chip is retired from the header');
  // 2026-09-28 (LUX-LIST-64 #47): the ⋯ is a MARK — gold in dark, the forest in light.
  assert.match(chat, /<Ionicons name="ellipsis-horizontal" size=\{22\} color=\{colors\.mark\} \/>/);
  const dots = /headerDots: \{([^}]*)\}/.exec(chat.replace(/\s+/g, ' '));
  assert.ok(dots, 'the dots must stay a plain style');
  assert.doesNotMatch(dots[1], /backgroundColor|borderWidth/, 'gold is line-work here too');

  // zIndex is load-bearing: the menu drops DOWN out of the header and the
  // message column is a LATER sibling, so without it the dropdown would
  // render beneath the messages it covers.
  assert.match(chat, /headerLayer: \{\s*zIndex: 20,\s*\}/);
  assert.match(chat, /<View style=\{styles\.headerLayer\}>/);
  assert.match(chat, /headerMenuAnchor: \{\s*position: 'relative',\s*\}/);
  assert.match(chat, /direction="down"/);
  assert.match(chat, /align="right"/);
});

test('[static] the overflow menu is MODE-shaped, and perspective comes from ModeContext', () => {
  const chat = stripComments(read(CHAT));

  // Repo rule: perspective is never a hand-passed prop.
  assert.match(chat, /import \{ useMode \} from '\.\.\/modes';/);
  assert.match(chat, /const \{ mode \} = useMode\(\);/);
  assert.match(chat, /if \(mode === 'customer'\) \{/);

  // The customer's set. Hire Again is gated on the relationship, and Save is
  // gated on the read having landed — a row that cannot say which way it
  // would toggle is not offered yet.
  const customer = chat.slice(chat.indexOf("if (mode === 'customer') {"), chat.indexOf('} else {'));
  for (const key of ['hire-again', 'reviews', 'save-worker', 'share-profile']) {
    assert.match(customer, new RegExp(`key: '${key}'`), `the customer menu must offer ${key}`);
  }
  assert.match(customer, /if \(savedWorker !== null\) \{/);
  assert.match(customer, /label: savedWorker \? 'Saved — tap to remove' : 'Save Worker'/);

  // The worker's set. There is deliberately no "save a customer": no such
  // list exists in this product, and inventing one to balance the two menus
  // would be inventing a feature.
  const worker = chat.slice(chat.indexOf('} else {', chat.indexOf("if (mode === 'customer') {")));
  for (const key of ['view-profile', 'reviews']) {
    assert.match(worker, new RegExp(`key: '${key}'`), `the worker menu must offer ${key}`);
  }
  assert.doesNotMatch(worker, /key: 'save-worker'|key: 'hire-again'|key: 'share-profile'/);

  // MUTE IS LIVE IN BOTH MENUS, not flagged. The dispatch expected a flag; the
  // repo already had `mutes` (phase13) and lib/moderation's muteUser/unmuteUser
  // wired into the inbox, and a conversation in BRAZOS IS a person — the inbox
  // is keyed by counterparty — so per-user and per-conversation mute are the
  // same feature. Flagging it would have hidden working behaviour.
  assert.equal((chat.match(/headerMenuItems\.push\(muteMenuItem\);/g) ?? []).length, 2);
  // F20: the row's words come from the one person-menu builder, fed this relation.
  assert.match(chat, /const personRows = personSafetyItems\(\{\s*muted: relation\.muted,\s*blocking: relation\.blocking,/);
  assert.match(chat, /const muteMenuItem: DropMenuItem = personRows\.mute;/);
  assert.match(stripComments(read('lib/chatMenus.ts')), /label: muted \? 'Unmute' : 'Mute'/);
  assert.match(chat, /await unmuteUser\(user\.id, counterpartyId\)/);
  assert.match(chat, /await muteUser\(user\.id, counterpartyId\)/);
  // ...and it re-reads rather than flipping a local copy: the same relation
  // carries the block state the composer gate reads.
  assert.match(chat, /setRelation\(await fetchRelation\(user\.id, counterpartyId\)\)/);

  // Nothing was extracted or duplicated for Save: lib/savedWorkers was
  // already shared, and this calls it directly — with a rollback.
  assert.match(chat, /import \{ fetchSavedWorkerIds, saveWorker, unsaveWorker \} from '\.\.\/lib\/savedWorkers';/);
  assert.match(chat, /setSavedWorker\(!next\);/, 'an optimistic toggle owes a rollback');
});

test('[static] Share Profile builds its URL from ONE constant and shares a name with it', () => {
  const chat = stripComments(read(CHAT));
  // RAW, not comment-stripped: the naive stripper every fence in this repo
  // uses eats `//` wherever it appears, and a URL literal contains one.
  const links = read('lib/appLinks.ts');
  const sharing = stripComments(read('lib/sharing.ts'));

  // One constant, one path shape, one place to change when the domain exists.
  assert.match(links, /export const PROFILE_WEB_BASE_URL = '[^']+';/);
  assert.match(links, /return `\$\{PROFILE_WEB_BASE_URL\}\/profile\/\$\{encodeURIComponent\(userId\)\}`;/);
  // The id is the ONLY user datum in the URL, and it is encoded.
  assert.doesNotMatch(links, /full_name|email|phone/);

  // React Native's own Share for a LINK — the download-then-share dance
  // sharePhoto needs would buy no extra target here.
  assert.match(sharing, /export async function shareProfileLink\(/);
  assert.match(sharing, /const url = profileUrl\(userId\);/);
  assert.match(sharing, /await Share\.share\(\{ url, message \}\)/);
  // A bare URL is a grey rectangle in Messages, and the name is also the part
  // that still works before the domain resolves.
  assert.match(sharing, /const message = name \? `\$\{name\} on BRAZOS: \$\{url\}` : url;/);

  assert.match(chat, /await shareProfileLink\(counterpartyId, counterparty\?\.full_name\)/);
  assert.match(chat, /if \(!result\.ok\) await alertAsync\('Could not share', result\.message\);/);
});

test('[static] the report sheet can block in the same breath, and says so when it is done', () => {
  const dialog = stripComments(read('components/ReportDialog.tsx'));

  // The EXISTING permanent block, opt-in. No new store, and no timed variant
  // implied — that one waits on TIMED_BLOCK.
  assert.match(dialog, /import \{ blockUser, createReport, REPORT_REASONS, type ReportReason \}/);
  assert.match(dialog, /const \[alsoBlock, setAlsoBlock\] = useState\(false\);/);
  assert.match(dialog, /if \(alsoBlock\) \{\s*const \{ error: blockError \} = await blockUser\(reporterId, reportedId\);/);
  // THE REPORT IS THE PRIMARY ACTION: a failed block is named on its own, or
  // someone files the same report twice believing the first did not land.
  assert.match(dialog, /alertAsync\('Reported, but not blocked', userMessage\(blockError\)\)/);
  assert.match(dialog, /Also block this person/);

  // THE SENT STATE replaces the sheet's body rather than firing an alert
  // after the sheet has already closed — a confirmation that appears
  // somewhere else once the thing you were looking at is gone reads as an
  // interruption rather than as an answer.
  assert.match(dialog, /const \[sent, setSent\] = useState\(false\);/);
  assert.match(dialog, /\{sent \? \(/);
  assert.match(dialog, /<Ionicons name="checkmark" size=\{26\}/);
  assert.match(dialog, /Sent to the Brazos team/);
  assert.match(dialog, /const SENT_DISMISS_MS = 1600;/);
  assert.match(dialog, /dismissTimer\.current = setTimeout\(/);
  // A sheet unmounted mid-confirmation must not close something else later.
  assert.match(dialog, /if \(dismissTimer\.current\) clearTimeout\(dismissTimer\.current\);/);
  // The old fire-and-forget alert is gone.
  assert.doesNotMatch(dialog, /alertAsync\(\s*'Report sent'/);
});

test('[static] a quoted bubble widens to fit its quote; an unquoted bubble is untouched', () => {
  const bubble = stripComments(read('components/ChatBubble.tsx'));

  // THE QUOTE STRIP MUST CONTRIBUTE INTRINSIC WIDTH. Written as `flex: 1` the
  // body resolved to flexBasis 0, and Yoga measures a fit-content row from the
  // sum of its children's flex BASES — so the strip measured to its rail, its
  // gaps and the thumbnail, the bubble sized to the MESSAGE text instead, and
  // the quote was truncated into the remainder: "HE…" over a "Hello sir" that
  // wrapped onto two lines.
  const quoteBody = bubble.match(/quoteBody: \{([^}]*)\}/);
  assert.ok(quoteBody, 'ChatBubble must still have a quoteBody style');
  assert.match(
    quoteBody[1],
    /flexBasis: 'auto'/,
    'the quote body needs a content-sized basis or the bubble cannot widen to fit it'
  );
  assert.doesNotMatch(
    quoteBody[1],
    /flex: 1/,
    'shorthand `flex: 1` is flexBasis 0 — the zero contribution this fixed'
  );
  // Grow and shrink are both load-bearing and both stay: grow holds the
  // thumbnail on the row's right edge when the quote is shorter than the
  // message, shrink is what lets numberOfLines={1} ellipsize past the cap.
  assert.match(quoteBody[1], /flexGrow: 1/, 'the thumbnail must stay right-aligned');
  assert.match(quoteBody[1], /flexShrink: 1/, 'an over-long quote must shrink, not overflow');

  // THE UNQUOTED PATH IS UNCHANGED. The strip is the only thing that widens a
  // bubble, and it renders only when there IS a quote — so a bubble without
  // one measures exactly as it did before.
  assert.match(bubble, /\{replyTo && \(/, 'the quote strip is conditional on replyTo');
  const bubbleStyle = bubble.match(/\n {2}bubble: \{([^}]*)\}/);
  assert.ok(bubbleStyle, 'ChatBubble must still have a bubble style');
  assert.doesNotMatch(
    bubbleStyle[1],
    /minWidth|replyTo/,
    'the bubble box itself must not grow a quote-conditional width'
  );

  // The visual design the widening serves is NOT what changed: one accent
  // rail, one line of name, one line of preview, still through the shared
  // preview helper.
  assert.match(bubble, /styles\.quoteBar, isOwn \? styles\.quoteBarOwn : styles\.quoteBarOther/);
  assert.equal(
    (bubble.match(/numberOfLines=\{1\}/g) ?? []).length,
    2,
    'the quote keeps exactly two one-line texts: the name and the preview'
  );
  assert.match(bubble, /\{messagePreviewText\(replyTo\)\}/);
});

test('[static+executed] the bubble cap resolves against the row, not against the bubble itself', () => {
  const bubble = stripComments(read('components/ChatBubble.tsx'));

  // THE CAP SITS ON THE WRAPPER. A percentage max resolves against the
  // PARENT's inner width. `bubbleWrap` is a child of `row`, whose width is the
  // list cell's — a real number. The BUBBLE's parent is bubbleWrap, which has
  // no width of its own and shrink-wraps the bubble, so a cap there was 82% of
  // the bubble's own measured width and every bubble painted at 82% of what it
  // had just asked for.
  const wrap = bubble.match(/bubbleWrap: \{([^}]*)\}/);
  assert.ok(wrap, 'ChatBubble must still have a bubbleWrap style');
  assert.match(wrap[1], /maxWidth: '82%'/, 'the cap belongs on the wrapper');
  const box = bubble.match(/\n {2}bubble: \{([^}]*)\}/);
  assert.ok(box, 'ChatBubble must still have a bubble style');
  assert.doesNotMatch(
    box[1],
    /maxWidth/,
    'a percentage cap under a shrink-wrapping parent is measured against itself'
  );
  // ...and the wrapper still has no width of its own, which is exactly WHY
  // nothing below it may carry a percentage. If it ever gains one, this
  // reasoning has to be redone rather than assumed.
  assert.doesNotMatch(
    wrap[1],
    /(^|\s)(width|flex|flexBasis):/,
    'bubbleWrap must stay width-less — it is the long-press target and nothing more'
  );

  // WHY THE PHOTO WAS THE VISIBLE CASUALTY, in numbers taken from the source
  // rather than restated. Text merely re-wrapped when the bubble was painted
  // narrower than it measured; styles.image is a FIXED box and RN's default
  // flexShrink is 0, so it could not follow the bubble in and spilled out past
  // the fill instead.
  const imageWidth = Number(bubble.match(/image: \{\s*width: (\d+),/)[1]);
  assert.match(bubble, /paddingHorizontal: spacing\.md/, 'the bubble pads the photo with spacing.md');
  // RUN T1 (C2): `spacing` is a live getter group now; the shipped numbers
  // moved one line up into the table it resolves through. Same values.
  const spacingBlock = read('ui/tokens.ts').match(/export const THEME_SPACING_DEFAULTS = \{([^}]*)\}/)[1];
  const md = Number(spacingBlock.match(/md: (\d+),/)[1]);
  const measured = imageWidth + 2 * md;
  const paintedByASelfReferentialCap = 0.82 * measured;
  assert.ok(
    measured - paintedByASelfReferentialCap > 30,
    `a self-referential 82% cap clipped the photo bubble by ${(measured - paintedByASelfReferentialCap).toFixed(1)}pt — the overflow that read as two misaligned layers`
  );
});

test('[static] the mark-unread verdict is recorded where the next run will look', () => {
  // The flag must carry the EVIDENCE, not a shrug: the schema run read it to
  // know what to build, and W1 flipped it once phase77 built it. The verdict
  // stays — a flag that HAS been flipped is still where a later reader looks
  // to find out why it could be. (READ_TICKS went with the ticks, lean D3a.)
  const flags = read('lib/featureFlags.ts');
  assert.match(flags, /export const MARK_UNREAD = true as boolean;/);
  // Mark-as-unread: was rewindable on job threads, not on direct threads.
  assert.match(flags, /message_reads_update_own/);
  assert.match(flags, /mark_direct_thread_read\(\), hard-codes `now\(\)`/);
  // And it names what CLOSED it, not just what blocked it.
  assert.match(flags, /set_direct_thread_read_at\(\)/);
});

// ---------------------------------------------------------------------------
// THE INBOX — five pills, one action model, two entry mechanics.
// ---------------------------------------------------------------------------

test('[executed] two pills filter live state and three are honestly empty', () => {
  const rows = [
    { key: 'a', unread: true, awaitingRequest: false },
    { key: 'b', unread: false, awaitingRequest: true },
    { key: 'c', unread: false, awaitingRequest: false },
    { key: 'd', unread: true, awaitingRequest: true },
  ];

  assert.deepEqual(inbox.filterRows(rows, 'all').map((r) => r.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(inbox.filterRows(rows, 'unread').map((r) => r.key), ['a', 'd']);
  assert.deepEqual(inbox.filterRows(rows, 'requests').map((r) => r.key), ['b', 'd']);
  // Nothing can be archived and there is no support conversation, so these
  // return NOTHING rather than quietly falling through to everything — which
  // is the failure mode a default case invites.
  assert.deepEqual(inbox.filterRows(rows, 'archived'), []);
  assert.deepEqual(inbox.filterRows(rows, 'support'), []);
  // 'all' preserves the order the inbox already built; the pills are a VIEW,
  // never a re-sort and never a second fetch.
  assert.deepEqual(inbox.filterRows(rows, 'all'), rows);

  // Five pills, in order, with the labels the dispatch named.
  assert.deepEqual(
    inbox.INBOX_FILTERS.map((p) => p.key),
    ['all', 'unread', 'archived', 'requests', 'support']
  );
  assert.deepEqual(
    inbox.INBOX_FILTERS.map((p) => p.label),
    ['All', 'Unread', 'Archived', 'Requests', 'Support']
  );
});

test('[executed] every pill has its OWN empty state, and each one is true', () => {
  // "No messages yet" under the Archived pill would be a different and untrue
  // statement, which is why this is per-filter rather than one shared line.
  const seen = new Set();
  for (const { key } of inbox.INBOX_FILTERS) {
    const state = inbox.emptyStateFor(key);
    assert.ok(state.title && state.body, `${key} needs a title and a body`);
    assert.ok(!seen.has(state.title), `${key} must not reuse another pill's empty title`);
    seen.add(state.title);
  }
  assert.equal(inbox.emptyStateFor('archived').title, 'Nothing archived yet');
  assert.equal(inbox.emptyStateFor('requests').title, 'No requests yet');
  // FIX-RUN B3: Support offers a real contact, not a promise.
  assert.equal(inbox.emptyStateFor('support').title, 'Talk to the Brazos team');
  assert.equal(inbox.emptyStateFor('support').action, 'Contact support');
});

test('[executed] a refresh between opening the sheet and tapping it moves the action', () => {
  // AUDIT F2, played out. The sheet used to copy { muted, blocking } out of
  // the long-pressed row. Those two values decide what the row SAYS and which
  // call the tap MAKES, so a realtime refresh landing in between left the
  // sheet offering "Mute" for somebody already muted — and the tap then
  // unmuted them. The user read one thing and got its opposite.
  const { resolveSheetTarget, muteActionFor, blockActionFor } = inbox;

  const row = (over = {}) => ({
    otherId: 'u1',
    rawName: 'Sam',
    jobId: 'job-1',
    blocking: false,
    muted: false,
    ...over,
  });

  // OPEN. The user long-presses an unmuted row; the sheet offers to mute.
  let rows = [row(), row({ otherId: 'u2', rawName: 'Alex', muted: true })];
  const opened = resolveSheetTarget(rows, 'u1');
  assert.equal(opened.muted, false);
  assert.equal(muteActionFor(opened), 'mute');

  // REFRESH. Another device mutes Sam and blocks them while the sheet is up.
  // This is the whole point: `rows` is a NEW array, exactly as a realtime
  // refresh produces, and the sheet is still open on the same id.
  rows = [row({ muted: true, blocking: true }), row({ otherId: 'u2', rawName: 'Alex', muted: true })];

  // TAP. The action follows the LIVE row, not the one that was on screen when
  // the sheet opened. Under the old snapshot this said 'mute' and would have
  // unmuted somebody who was already muted.
  const tapped = resolveSheetTarget(rows, 'u1');
  assert.equal(tapped.muted, true);
  assert.equal(muteActionFor(tapped), 'unmute', 'the tap must not invert the intent');
  assert.equal(blockActionFor(tapped), 'unblock');
  // Identity is stable across the refresh — it is only the mutable facts that
  // moved.
  assert.equal(tapped.userId, 'u1');
  assert.equal(tapped.name, 'Sam');
  assert.equal(tapped.jobId, 'job-1');

  // The label and the call read the SAME value, which is the property that
  // makes the inversion impossible rather than merely unlikely.
  for (const muted of [true, false]) {
    const target = resolveSheetTarget([row({ muted })], 'u1');
    const label = target.muted ? 'Unmute' : 'Mute';
    assert.equal(muteActionFor(target), label.toLowerCase());
  }

  // A row that has GONE closes the sheet rather than acting on a conversation
  // that is no longer there.
  assert.equal(resolveSheetTarget(rows, 'nobody'), null);
  assert.equal(resolveSheetTarget([], 'u1'), null);
  assert.equal(resolveSheetTarget(rows, null), null);
});

test('[static] the inbox sheet holds an id, and re-reads the row it acts on', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));

  // The state is the identity only. The snapshot that carried the two mutable
  // facts must not come back. 2026-09-28 (LUX-LIST-64 #53): the sheet is now
  // the glass dropdown under the row's ••• — the same rule under the menu's
  // names: it holds the person's id and reads the row again every render.
  assert.match(screen, /const \[menuUserId, setMenuUserId\] = useState<string \| null>\(null\)/);
  assert.doesNotMatch(screen, /const \[(sheet|menu)Target, set(Sheet|Menu)Target\]/, 'the snapshot must not return');
  assert.doesNotMatch(
    screen,
    /set(Sheet|Menu)UserId\(\{|set(Sheet|Menu)Target\(\{/,
    'opening the menu must pass an id, never a copy of the row',
  );
  assert.match(screen, /openMenu\(item\.otherId\)/, 'the long press stores the id');
  assert.match(
    screen,
    /function openMenu\(userId: string, delayMs = 0\) \{\s*setMenuDelay\(delayMs\);\s*setMenuUserId\(userId\);\s*\}/,
    'the one way the menu opens stores the id and nothing else',
  );

  // And the row is resolved live, from the rows the inbox just built.
  assert.match(
    screen,
    /const menuTarget = useMemo\(\(\) => resolveSheetTarget\(rows, menuUserId\), \[rows, menuUserId\]\)/,
    'the menu must re-read its row rather than remember it',
  );
});

test('[static] the composer row sits on the thread, not on a band of its own', () => {
  // The device walk: the voice-recording bar in light sat on a full-width
  // WHITE band; dark appeared to have none. One token, `colors.surface`, doing
  // two different things — #FFFFFF against a #F4F1E8 thread reads as a bar,
  // #0A1813 against #02110D is a step too small to see. Light must be dark's
  // palette, not dark's design plus a bar.
  const composer = stripComments(read(COMPOSER));
  const row = /\n  row: \{([^}]*)\}/.exec(composer);
  assert.ok(row, 'the composer row style must exist');
  assert.match(
    row[1],
    /backgroundColor: 'transparent'/,
    'the row must show the thread ground in both themes',
  );
  assert.doesNotMatch(
    row[1],
    /backgroundColor: colors\.surface/,
    'the band is what made light a different design',
  );

  // Removing the band is only safe because everything IN the row draws its own
  // edge. If the input loses its outline the field stops being findable on a
  // groundless row, so it is pinned here with the removal.
  assert.match(
    /\n  input: \{([^}]*)\}/.exec(composer)[1],
    /borderWidth: 1,[^]*borderColor: colors\.border/,
    'the input must stay an outlined pill',
  );
});

test('[executed] one slot, so opening either menu closes the other', () => {
  // The defect this encodes: the header dropdown and the composer drop-up each
  // had their own boolean, and a device walk photographed both panels open at
  // once. Two booleans have four states and one of them is illegal; one value
  // naming the open menu has three states and all of them are legal.
  const { nextMenu, isMenuOpen } = menus;

  // Opening from rest.
  assert.equal(nextMenu(null, 'header'), 'header');
  assert.equal(nextMenu(null, 'composer'), 'composer');

  // THE INVARIANT: B opening IS A closing, in one assignment.
  assert.equal(nextMenu('header', 'composer'), 'composer');
  assert.equal(nextMenu('composer', 'header'), 'header');

  // The control that opens a menu dismisses it.
  assert.equal(nextMenu('header', 'header'), null);
  assert.equal(nextMenu('composer', 'composer'), null);

  // `null` is every dismissal that is not a tap on a trigger: the outside tap,
  // the keyboard appearing, navigating away, and choosing an item.
  assert.equal(nextMenu('header', null), null);
  assert.equal(nextMenu('composer', null), null);
  assert.equal(nextMenu(null, null), null);

  // There is no reachable value in which two menus are open, because the
  // carrier cannot express one. Exhaustive over the whole transition table.
  for (const current of [null, 'header', 'composer']) {
    for (const requested of [null, 'header', 'composer']) {
      const result = nextMenu(current, requested);
      assert.ok(
        result === null || result === 'header' || result === 'composer',
        `nextMenu(${current}, ${requested}) left the slot holding ${result}`,
      );
      const openCount = ['header', 'composer'].filter((m) => isMenuOpen(result, m)).length;
      assert.ok(openCount <= 1, `nextMenu(${current}, ${requested}) reports ${openCount} menus open`);
    }
  }
});

test('[static] both chat menus read the one owner, and nothing keeps a private copy', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));
  const composer = stripComments(read(COMPOSER));

  // The owner lives on the screen, and it is the shared transition rather than
  // a second copy of the rule.
  assert.match(chat, /import \{ nextMenu, personSafetyItems, type ChatMenu \} from '\.\.\/lib\/chatMenus';/);
  assert.match(chat, /const \[openMenu, setOpenMenu\] = useState<ChatMenu \| null>\(null\)/);
  assert.match(chat, /setOpenMenu\(\(current\) => nextMenu\(current, menu\)\)/);

  // The two booleans are GONE, not merely unused.
  assert.doesNotMatch(chat, /headerMenuOpen/, 'the header kept its own boolean');
  assert.doesNotMatch(composer, /const \[menuOpen/, 'the composer kept its own boolean');
  assert.doesNotMatch(composer, /setMenuOpen/, 'the composer kept its own setter');
  assert.match(composer, /menuOpen: boolean;/, 'the composer takes the open state as a prop');
  assert.match(composer, /onToggleMenu: \(\) => void;/);
  assert.match(composer, /onCloseMenu: \(\) => void;/);

  // Both DropMenu instances read the same value and close through the same
  // function — the two halves of "one owner".
  assert.match(chat, /visible=\{openMenu === 'header'\}/);
  assert.match(chat, /menuOpen=\{openMenu === 'composer'\}/);
  assert.match(chat, /onClose=\{closeMenus\}/);
  assert.match(chat, /onCloseMenu=\{closeMenus\}/);
  assert.match(composer, /onClose=\{onCloseMenu\}/, 'the drop-up closes through the owner');
  assert.match(composer, /onPress=\{onToggleMenu\}/, 'the \\[ + \\] asks the owner');

  // THE OUTSIDE TAP. It is DropMenu's own backdrop, and it dismisses — this is
  // where "tap outside closes" actually lives, for both menus at once.
  // It lives in DropMenu.shared.tsx since the driver split, which is the point
  // of that file: BOTH paths dismiss through the same backdrop rather than
  // each growing one.
  assert.match(
    stripComments(read(DROPMENU_SHARED)),
    /<Pressable\s+style=\{\[styles\.backdrop[^]*?onPress=\{onClose\}/,
    'the backdrop must dismiss the menu',
  );
  for (const path of [DROPMENU, DROPMENU_FAST]) {
    assert.match(
      stripComments(read(path)),
      /<DropMenuBackdrop direction=\{direction\} onClose=\{onClose\} closeLabel=\{closeLabel\} \/>/,
      `${path} must mount the shared backdrop, not one of its own`,
    );
  }

  // THE DISMISSALS THAT ARE NOT TAPS, and the teardown that clears on unmount.
  assert.match(chat, /Keyboard\.addListener\('keyboardDidShow', closeMenus\)/);
  assert.match(chat, /navigation\.addListener\('blur', closeMenus\)/);
  assert.match(
    chat,
    /return \(\) => \{\s*onKeyboard\.remove\(\);\s*onBlur\(\);\s*\}/,
    'both subscriptions must be removed on unmount',
  );

  // WHY NEITHER BACKDROP SWALLOWS THE OTHER TRIGGER'S TAP, which is a layout
  // fact rather than a handler: the composer's backdrop opens UPWARD 900pt,
  // but it lives inside `keyboardClip`, which clips, so it cannot reach the
  // header's dots. The header's opens DOWNWARD over the composer, but the clip
  // is a LATER sibling and paints above it, so the [ + ] stays hit-testable.
  // Remove either property and one menu starts eating the other's opening tap.
  assert.match(
    chat,
    /keyboardClip: \{\s*flex: 1,\s*overflow: 'hidden',\s*\}/,
    "the clip is what keeps the composer's backdrop off the header",
  );
  assert.ok(
    chat.indexOf('styles.headerMenuAnchor') < chat.indexOf('styles.keyboardClip'),
    'the header must render BEFORE the clip, or its backdrop would cover the [ + ]',
  );
});

test('[static] the filter pills measure themselves, not their scroller', () => {
  // WHAT WENT WRONG, so it cannot go wrong the same way twice. The pills live
  // in a horizontal ScrollView. React Native styles that view with
  // `baseHorizontal = { flexGrow: 1, flexShrink: 1 }`, so it grew into all the
  // free vertical space between the header and the list; the content
  // container's cross-axis default of `stretch` then gave that entire height
  // to every pill. The style block read `minHeight: 32` throughout and was
  // never wrong — a floor cannot cap a stretch — and both themes rendered
  // half-screen ovals.
  //
  // So this fence pins the two properties that CAUSE the stretch, not the
  // height that suffers it. Capping the height alone would go green while the
  // scroller still ate the column.
  const source = read('screens/MessagesInboxScreen.tsx');
  const screen = stripComments(source);
  const flat = flatten(source);

  const filterScroll = /filterScroll: \{([^}]*)\}/.exec(screen);
  assert.ok(filterScroll, 'the filter scroller needs its own style to refuse RN flexGrow of 1');
  assert.match(
    filterScroll[1],
    /flexGrow: 0/,
    "the scroller must not grow — RN's baseHorizontal gives it flexGrow: 1 otherwise",
  );
  // E3 review (2026-10-03): the scroller also wears the pills' slop room beside its own style.
  assert.match(flat, /<ScrollView horizontal[^>]*style=\{\[styles\.filterScroll, pillRoom\.scroller\]\}/, 'and it must be mounted');

  const filterRow = /filterRow: \{([^}]*)\}/.exec(screen);
  assert.ok(filterRow, 'the filter row style must exist');
  assert.match(
    filterRow[1],
    /alignItems: 'center'/,
    "a row's cross-axis default is stretch, which is what made the pills full-height",
  );

  // ONE named constant owns the height, and it sits in the WhatsApp-subtle
  // band the row was measured against rather than being a free number.
  const declared = /const FILTER_PILL_HEIGHT = (\d+);/.exec(screen);
  assert.ok(declared, 'the pill height belongs to a single named constant');
  const height = Number(declared[1]);
  assert.ok(
    height >= 32 && height <= 36,
    `a filter pill above a list reads at 32-36pt; this one is ${height}pt`,
  );

  const pill = /\n  pill: \{([^}]*)\}/.exec(screen);
  assert.ok(pill, 'the pill style must exist');
  // The constant is the single owner of the number; the wearer reads it.
  assert.match(
    screen,
    /const filterPillHeight = FILTER_PILL_HEIGHT;/,
    'the pill takes the named height',
  );
  assert.doesNotMatch(
    pill[1],
    /minHeight/,
    'a minHeight is the floor that failed to cap the stretch; it must not come back',
  );
  assert.match(pill[1], /borderRadius: radius\.pill/, 'radius.pill is 999, so the corner is half the height');
  assert.match(pill[1], /borderWidth: 1/);
  assert.match(pill[1], /backgroundColor: 'transparent'/, 'the resting pill is a hairline on the page ground');

  // Label metrics, and the selected treatment as a RECOLOUR: the active pill
  // changes two colours and nothing structural, so light is dark's palette
  // rather than a second design. `primarySoft` is the pale emerald in light
  // and the deep one in dark, which is the per-theme fill the row wants.
  //
  // 2026-09-28 (LUX-LIST-64 #55) — the approved clean list's chips: 14/600,
  // the chosen words the bright mint (the pale in light), and the chosen fill
  // the mint at .08 in dark and the pale sage in light — a colour per theme,
  // set beside the style, still nothing structural.
  const label = /pillLabel: \{([^}]*)\}/.exec(screen)[1];
  assert.match(label, /fontSize: 14/);
  assert.match(label, /fontWeight: '600'/);
  assert.match(/pillLabelActive: \{([^}]*)\}/.exec(screen)[1], /color: colors\.emeraldBright/);

  const active = /pillActive: \{([^}]*)\}/.exec(screen)[1];
  assert.match(active, /borderColor: colors\.emerald/);
  assert.match(screen, /const pillOnFill = isDark \? withAlpha\(colors\.emerald, 0\.08\) : colors\.primarySoft;/);
  assert.match(screen, /active && \[styles\.pillActive, \{ backgroundColor: pillOnFill \}\]/);
  assert.doesNotMatch(
    active,
    /height|padding|margin|borderWidth|borderRadius|shadow|elevation/,
    'selecting a pill recolours it; it must not resize or re-elevate it',
  );
});

test('[static] one action model, two entry mechanics, and no empty second sheet', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));

  // The pills are a VIEW over the rows already built.
  assert.match(screen, /const visibleRows = useMemo\(\(\) => filterRows\(rows, filter\), \[rows, filter\]\);/);
  assert.match(screen, /data=\{visibleRows\}/);
  assert.match(screen, /emptyStateFor\(filter\)\.title/);

  // MUTE IS LIVE and always was — `mutes` has shipped since phase13. It is not
  // flagged, and flagging it would have hidden working behaviour.
  // The labels now read a `target` because the action model became a function
  // both mechanics call — see the swipe fence below. Same rule, one caller.
  // F20: the words are the one person-menu builder's (lib/chatMenus.ts), fed this target.
  const personMenus = stripComments(read('lib/chatMenus.ts'));
  assert.match(screen, /const person = personSafetyItems\(\{\s*muted: target\.muted,\s*blocking: target\.blocking,\s*onMute: \(\) => toggleMute\(target\),/);
  assert.match(personMenus, /label: muted \? 'Unmute' : 'Mute'/);
  assert.doesNotMatch(screen, /\bMUTE\b/, 'the retired MUTE flag must not come back');

  // 2026-09-26 (the refresh, audit M-11): ONE Block. The sheet's row is
  // "Block…" (or "Unblock" when it applies) and opens one chooser whose FIRST
  // row is the permanent block — the existing blockUser path, unchanged —
  // and whose others are the timed durations, still behind TIMED_BLOCK so
  // shipping them cannot quietly change what the permanent one does.
  assert.match(personMenus, /key: 'block', label: 'Unblock',/);
  // 2026-09-28 (LUX-LIST-64 #53): the glass menu's words carry no "…".
  assert.match(personMenus, /key: 'block', label: 'Block',/);
  // The row opens the one chooser; unblocking is the screen's own toggle.
  assert.match(screen, /onBlock: \(\) => \{\s*setMenuUserId\(null\);\s*setBlockDurationUserId\(target\.userId\);\s*\},\s*onUnblock: \(\) => toggleBlock\(target\),/);
  assert.match(screen, /key: 'block-permanent',\s*label: 'Permanently',/);
  assert.match(screen, /\.\.\.\(TIMED_BLOCK\s*\?\s*BLOCK_DURATIONS\.map/);
  assert.ok(
    screen.indexOf("key: 'block-permanent'") < screen.indexOf('...(TIMED_BLOCK'),
    'the permanent block is the chooser’s first row'
  );

  // No second sheet behind a visible button can be empty. 2026-09-28
  // (LUX-LIST-64 #53): there is no clean-up sheet at all now — Clear chat and
  // Delete chat are rows of the one menu, each under its own flag.
  assert.doesNotMatch(screen, /clearOrDeleteItemsFor|Clear or delete chat/, 'the clean-up chooser is gone');
  assert.match(screen, /key: 'clear-chat',\s*label: 'Clear chat',/);
  assert.match(screen, /key: 'delete-chat',\s*label: 'Delete chat',/);
  assert.doesNotMatch(screen, /key: 'more',\s*label: 'More',\s*icon: 'ellipsis-horizontal' as const/, 'no More row in the sheet');
  for (const flag of ['MARK_UNREAD', 'CLEAR_CHAT', 'ARCHIVE', 'DELETE_CHAT']) {
    assert.ok(screen.includes(`if (${flag}) {`), `the sheet must carry a ${flag} row`);
  }
  // HIDDEN_CHATS carries a SECOND condition, and that is the point (W1 D3):
  // with no biometric or passcode enrolled the authentication prompt could
  // never be shown, so the row is absent rather than offered and then failing.
  assert.ok(screen.includes('if (HIDDEN_CHATS && deviceAuthReady) {'));
  assert.match(screen, /LocalAuthentication\.hasHardwareAsync\(\)/);
  assert.match(screen, /LocalAuthentication\.isEnrolledAsync\(\)/);

  // The MECHANIC is capability-chosen; the ACTIONS are not. An action
  // reachable by one mechanic and not the other would be two apps.
  assert.match(screen, /import \{ canSwipe \} from '\.\.\/lib\/motion120';/);
  assert.match(screen, /const rowActionHint = canSwipe\(\)/);
  assert.match(screen, /'Press and hold for mute, block, report and more'/);
  assert.match(screen, /accessibilityHint=\{item\.isSelf \? undefined : rowActionHint\}/);
});

test('[static] the quick-reply row and its templates are gone from the whole tree', () => {
  assert.ok(
    !existsSync(join(root, 'components/QuickReplies.tsx')),
    'components/QuickReplies.tsx must be deleted, not merely unreferenced'
  );

  const dirs = ['lib', 'screens', 'components', 'hooks', 'ui', 'navigation', 'modes', 'dev-tools'];
  const files = ['App.tsx', 'index.ts'];
  for (const dir of dirs) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  assert.ok(files.length > 100, `the sweep must enumerate the app source (saw ${files.length})`);

  const offenders = [];
  for (const path of files) {
    // Comment-stripped: the retirement notes in lib/messages.ts and
    // screens/ChatScreen.tsx NAME what was removed, on purpose.
    const source = stripComments(read(path));
    if (/QuickReplies|chatTemplatesForMode|WORKER_CHAT_TEMPLATES|CUSTOMER_CHAT_TEMPLATES/.test(source)) {
      offenders.push(path);
    }
  }
  assert.deepEqual(offenders, [], 'the component and both template sets are retired together');
});

test('[static] the tombstone has one spelling', () => {
  // AUDIT F4 — one spelling of the tombstone, in one place. A second literal
  // is a second thing to get wrong the day the wording changes, and
  // isDeletedUser() compares against the constant.
  assert.match(read('lib/rebook.ts'), /export const DELETED_USER_LABEL = 'Deleted user';/);
});

test('[static] lean D3a: v1 chat is text and photo — the media extras stay deleted', () => {
  for (const path of [
    'components/AudioMeterBars.tsx', 'components/VoiceNote.tsx', 'components/MessageTicks.tsx',
    'components/TranslationSheet.tsx', 'components/ReactionPicker.tsx',
    'hooks/useVoiceRecorder.ts', 'hooks/useReactions.ts',
    'lib/audioMeter.ts', 'lib/messageTicks.ts', 'lib/translate.ts', 'lib/translateRules.ts',
    'lib/reactions.ts', 'lib/clipboard.ts', 'supabase/functions/translate',
  ]) {
    assert.ok(!existsSync(join(root, path)), `${path} must stay deleted`);
  }
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['expo-audio', 'expo-clipboard', 'expo-document-picker']) {
    assert.equal(pkg.dependencies[dep], undefined, `${dep} must not come back`);
  }
  // The message menu offers Reply and Unsend; no React, Copy or Translate.
  const chat = stripComments(read(CHAT));
  const menu = chat.match(/const messageMenuItems: ActionSheetItem\[\] = menuTarget([\s\S]*?)\n {4}: \[\];/);
  assert.ok(menu, 'the message menu must still be one derived list');
  assert.ok(menu[1].includes("key: 'reply'") && menu[1].includes("key: 'unsend'"), 'the extraction holds the real menu');
  assert.doesNotMatch(menu[1], /key: '(react|copy|translate-message|translate-conversation)'/);
});

