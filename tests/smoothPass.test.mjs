import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run, the smooth pass (F9, F10, F11, F12, F16, F17 and the operator's "smoothness everywhere"):
 * the source fences. Each test names the item it holds. 120 Hz feel is the operator's device check;
 * these hold the shapes that make it possible.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const APP_DIRS = ['screens', 'components', 'ui', 'hooks', 'lib', 'navigation', 'modes'];
function appSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(name) && !/\.web\.tsx?$/.test(name)) out.push(rel);
    }
  };
  APP_DIRS.forEach(walk);
  out.push('App.tsx');
  return out.sort();
}

test('[static] F16: every endless loop stops when its screen is covered or the app is in the background', () => {
  // Bound to something else, each with its reason.
  const BOUND_ELSEWHERE = {
    // Runs only while dictating; dictation already stops on blur (useIsFocused) and on AppState.
    'components/DictationMic.tsx': /useIsFocused[\s\S]*AppState\.addEventListener/,
    // One module loop for every placeholder in the app: it pauses on the app's state, not a screen's.
    'components/Skeleton.tsx': /AppState\.addEventListener\('change', onAppState\)/,
  };
  const loops = appSources().filter((path) => /Animated\.loop\(|withRepeat\(/.test(strip(read(path))));
  assert.ok(loops.length >= 9, `the census must be seeing the loops (saw ${loops.length})`);
  for (const path of loops) {
    const source = strip(read(path));
    if (BOUND_ELSEWHERE[path]) {
      assert.match(source, BOUND_ELSEWHERE[path], `${path} is allowlisted for a reason it must still show`);
      continue;
    }
    assert.match(source, /import \{ useLoopActive \} from '\.\.\/hooks\/useLoopActive';/, `${path} loops without useLoopActive`);
    assert.match(source, /const loopActive = useLoopActive\(\);/, `${path} must read the gate`);
    assert.match(source, /!loopActive\) return;|!running\) return;/, `${path} must not start its loop while inactive`);
  }
  // The hook reads focus from the context (never useIsFocused, which throws outside a navigator)
  // and the app's state.
  const hook = strip(read('hooks/useLoopActive.ts'));
  assert.match(hook, /useContext\(NavigationContext\)/);
  assert.doesNotMatch(hook, /useIsFocused/);
  assert.match(hook, /addListener\('focus'[\s\S]*addListener\('blur'/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /return focused && foreground;/);
});

test('[static] F11: the add-media menu is the anchored glass dropdown, and no frosted pop-up fades as a Modal', () => {
  for (const path of ['components/JobSummaryCard.tsx', 'components/ReportDialog.tsx']) {
    assert.doesNotMatch(strip(read(path)), /animationType="fade"/, `${path} must not fade a Modal (the blur stutters)`);
  }
  const card = strip(read('components/JobSummaryCard.tsx'));
  assert.doesNotMatch(card, /<Modal\b/, 'the card renders no Modal of its own');
  assert.match(card, /<GlassDropdown\s+request=\{menu\}\s+groups=\{\[\[menuRow\('photo'\)\], \[menuRow\('video'\)\]\]\}/);
  // Centred under the + at #39's width; the Video limit stays honest; the library waits for the menu.
  assert.match(card, /width: MENU_WIDTH,/);
  assert.match(card, /disabled: kind === 'photo' \? !canAddPhoto : !canAddVideo,/);
  assert.match(card, /onClosed=\{onMenuClosed\}/);
  assert.match(card, /if \(kind\) setTimeout\(\(\) => void add\(kind\), modalSettleDelay\(\)\);/);

  const menu = strip(read('components/GlassDropdown.tsx'));
  assert.match(menu, /disabled=\{item\.disabled\}/);
  assert.match(menu, /item\.disabled && styles\.rowOff/);
  assert.match(menu, /rowOff: \{\s*opacity: 0\.5,/);
  // A centred panel keeps the page gutter; the default keeps its 8pt right edge.
  assert.match(menu, /fixedWidth != null[\s\S]*?left: Math\.max\(\s*CENTRED_GUTTER,/);
  assert.match(menu, /: \{ top, right: SCREEN_EDGE \+ insets\.right \};/);
  // onClosed runs after the panel and its presence report are gone.
  assert.match(menu, /useModalPresence\(mounted && !!anchor, false\);[\s\S]*?useEffect\(\(\) => \{\s*if \(mounted\) \{[\s\S]*?onClosedRef\.current\?\.\(\);/);
});

test('[static] F10: photo zoom is one component, on the UI thread where the binary can, and MediaViewer zooms too', () => {
  const fallback = strip(read('components/ZoomableImage.tsx'));
  const fast = strip(read('components/ZoomableImage.motion120.tsx'));
  const shared = strip(read('components/ZoomableImage.shared.tsx'));
  // The fast path: recognisers together, settled by springs, the JS thread told only the outcome.
  assert.match(fast, /Gesture\.Simultaneous\(pinch, pan, Gesture\.Exclusive\(doubleTap, longPress\)\)/);
  assert.match(fast, /\.enabled\(zoomed \|\| dismissable\)/, 'the pan leaves a pager its swipe at 1x');
  assert.match(fast, /runOnJS\(letGo\)\(\)/);
  // A gesture that was ever two fingers is a pinch's: it never lets the photo go.
  assert.match(fast, /\.onBegin\(\(\) => \{\s*twoFingers\.value = false;/);
  assert.match(fast, /if \(dismissable && !twoFingers\.value && /);
  assert.doesNotMatch(fast, /PanResponder/);
  // The fallback is the PanResponder, and both read one set of numbers.
  assert.match(fallback, /PanResponder\.create\(/);
  for (const source of [fallback, fast]) {
    assert.match(source, /from '\.\/ZoomableImage\.shared'/);
    assert.match(source, /ZOOM_SPRING/);
    assert.match(source, /dragFade\(/);
    assert.match(source, /panBound\(/);
  }
  for (const name of ['clampTo', 'panBound', 'dragFade']) {
    assert.match(shared, new RegExp(String.raw`export function ${name}\([^)]*\): number \{\s*'worklet';`), `${name} is a worklet`);
  }
  // PhotoViewer no longer carries a gesture body of its own; MediaViewer's photos zoom and lock the pager.
  const viewer = strip(read('components/PhotoViewer.tsx'));
  assert.doesNotMatch(viewer, /PanResponder|Animated\./);
  assert.match(viewer, /<ZoomableImage[\s\S]*?onDismiss=\{onClose\}[\s\S]*?<\/ZoomableImage>/);
  const media = strip(read('components/MediaViewer.tsx'));
  assert.match(media, /scrollEnabled=\{!zoomed\}/);
  assert.match(media, /<ZoomableImage[\s\S]*?onZoomedChange=\{setZoomed\}[\s\S]*?<RemoteImage/);
});

test('[static] F9: one keyboard-avoiding view, frame-synced where the binary can', () => {
  // React Native's view is imported in exactly one place: the fallback of the chooser.
  const importers = appSources().filter((path) =>
    /import\s*\{[^}]*\bKeyboardAvoidingView\b[^}]*\}\s*from 'react-native'/.test(strip(read(path)))
  );
  assert.deepEqual(importers, ['components/KeyboardAvoid.tsx']);
  // Every screen that had one wears the chooser, still padding on iOS only.
  const SITES = [
    'screens/ClientJobDetailScreen.tsx',
    'screens/HomeScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'screens/PostJobScreen.tsx',
    'screens/ReviewAndTipScreen.tsx',
    'screens/WorkerHomeScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/WorkerSearchScreen.tsx',
    'components/OfferComposer.tsx',
    'components/ReportDialog.tsx',
    'components/AuthScaffold.tsx',
    'ui/templates/FormScreen.tsx',
  ];
  for (const path of SITES) {
    const source = strip(read(path));
    assert.match(source, /<KeyboardAvoid\b[\s\S]*?behavior=\{Platform\.OS === 'ios'[^}]*\? 'padding' : undefined\}/, `${path} avoids the keyboard`);
    assert.match(source, /<\/KeyboardAvoid>/);
  }
  // The fast path pads from the keyboard's own height, on the UI thread, by the shared arithmetic.
  const fast = strip(read('components/KeyboardAvoid.motion120.tsx'));
  assert.match(fast, /useReanimatedKeyboardAnimation\(\)/);
  assert.match(fast, /paddingBottom: keyboardPadding\(frameBottom\.value, screenHeight, -keyboard\.height\.value, keyboardVerticalOffset\)/);
  assert.match(fast, /avoiding \? padding : undefined/, 'no padding style at all unless behavior is padding');
});

test('[executed] F9: keyboardPadding is React Native\'s padding arithmetic', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  const source = read('components/KeyboardAvoid.shared.tsx');
  const at = source.indexOf('export function keyboardPadding');
  const end = source.indexOf('\n}', at);
  const js = stripTypeScriptTypes(source.slice(at, end + 2), { mode: 'strip' });
  const { keyboardPadding } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  // A full-height view under a 336pt keyboard on an 852pt screen pads by the keyboard.
  assert.equal(keyboardPadding(852, 852, 336, 0), 336);
  // A negative offset (a reserve already held below, FormScreen's pill) pads that much less.
  assert.equal(keyboardPadding(852, 852, 336, -96), 240);
  // A view that ends above the keyboard pads nothing; no keyboard, no padding.
  assert.equal(keyboardPadding(400, 852, 336, 0), 0);
  assert.equal(keyboardPadding(852, 852, 0, 40), 0);
});

test('[static] F12: the most-pressed controls sink on the one press spring, the 120 Hz path where it can', () => {
  const fallback = strip(read('components/PressScale.tsx'));
  const fast = strip(read('components/PressScale.motion120.tsx'));
  const shared = strip(read('components/PressScale.shared.tsx'));
  // One spring, both paths: the hook's own numbers.
  assert.match(fallback, /usePressFeedback\(\{ haptic \}\)/);
  assert.match(fast, /withSpring\(PRESS_SCALE, PRESS_SPRING\)/);
  assert.match(fast, /withSpring\(1, PRESS_SPRING\)/);
  assert.match(strip(read('hooks/usePressFeedback.ts')), /export const PRESS_SPRING = \{/);
  // Reduce Motion (or not yet known): no transform at all, the harness's byte-stable contract.
  assert.match(fast, /const animated = useReducedMotion\(\) === false;/);
  assert.match(fast, /animated \? motion : undefined/);
  // The wrapper takes the caller's place and its layout callback; the Pressable keeps what draws it.
  for (const source of [fallback, fast]) {
    assert.match(source, /pressStyles\(style\)/);
    // The wrapper also carries the slop: on the New Architecture a view its children do not
    // overflow hit-tests as clipped, so a slop on the Pressable alone dies at the wrapper's edge.
    assert.match(source, /onLayout=\{onLayout\} hitSlop=\{hitSlop\}>/);
    assert.match(source, /<Pressable\s+\{\.\.\.rest\}\s+hitSlop=\{hitSlop\}/);
  }
  // 2026-10-03 (the operator's phone): the Pressable fills the wrapper's width by stretch and
  // takes NO flexGrow — under Yoga's legacy stretch rule a growing child inside an auto-height
  // wrapper takes the wrapper's whole available height (the header's Back link grew to the
  // screen, and every screen with a header link went blank). Web flexbox never shows it.
  assert.match(shared, /const FILL: ViewStyle = \{\};/);
  assert.doesNotMatch(shared, /flexGrow: 1/);
  // A sized or flexed wrapper wears the Pressable's border and padding, and the Pressable steps
  // back over them, so the share each sibling gets is the share it always got.
  assert.match(shared, /if \(SIZING_KEYS\.some\(\(key\) => key in outer\)\) mirrorBox\(flat, outer, inner\);/);
  assert.match(shared, /inner\[`margin\$\{side\}`\] = -\(border \+ pad\);/);
  assert.match(shared, /if \(any\) outer\.borderColor = 'transparent';/);
  // The haptic is the hook's option: rows inside a scroller pass false.
  assert.match(strip(read('hooks/usePressFeedback.ts')), /if \(haptic\) tap\(\);/);

  const WEARERS = {
    'components/Button.tsx': /<PressScale\s+onPress=\{onPress\}/,
    'components/Chip.tsx': /<PressScale\s+onPress=\{onPress\}\s+onLayout=\{onLayout\}/,
    'components/ScreenHeader.tsx': /const backControl = onBack \? \(\s*<PressScale/,
    'components/PostJobBar.tsx': /<PressScale\s+onPress=\{primary\.onPress\}/,
    'ui/templates/FormScreen.tsx': /<PressScale\s+onPress=\{onSubmit\}/,
    'components/JobFilterSheet.tsx': /<PressScale\s+onPress=\{onPress\}\s+hitSlop=\{touchSlop\(PILL_HEIGHT\)\}/,
    'screens/MessagesInboxScreen.tsx': /<PressScale\s+key=\{pill\.key\}\s+haptic=\{false\}/,
    'components/ConversationRow.tsx': /<PressScale\s+haptic=\{false\}\s+onPress=\{onPress\}/,
    'components/CategoryTileRow.tsx': /<PressScale\s+haptic=\{false\}/,
    'components/CategoryAccordion.tsx': /<PressScale\s+style=\{styles\.summaryRow\}/,
    'components/SetupChoiceCard.tsx': /<PressScale\s+onPress=\{onSelect\}/,
    'components/OfferCard.tsx': /<PressScale\s+haptic=\{false\}/,
    'screens/ProfileScreen.tsx': /<PressScale\s+haptic=\{false\}/,
    'screens/WorkerJobScreen.tsx': /<PressScale\s+haptic=\{false\}/,
    'screens/WorkerHomeScreen.tsx': /<PressScale\s+haptic=\{false\}/,
    'components/JobSummaryCard.tsx': /<PressScale\s+haptic=\{false\}/,
    'screens/ServicesPricingScreen.tsx': /<PressScale\s+style=\{\[styles\.addButton/,
    'screens/MapScreen.tsx': /<PressScale\s+onPress=\{toggleToday\}/,
    'screens/ClientJobDetailScreen.tsx': /<PressScale\s+style=\{\(\{ pressed \}\) => \[\s*styles\.workerRow/,
  };
  for (const [path, wear] of Object.entries(WEARERS)) assert.match(strip(read(path)), wear, `${path} wears the shared press`);
  // The static snaps the spring replaced are gone.
  assert.doesNotMatch(strip(read('components/ScreenHeader.tsx')), /pressed: \{ transform: \[\{ scale: 0\.96 \}\] \}/);
  assert.doesNotMatch(strip(read('components/PostJobBar.tsx')), /transform: \[\{ scale: 0\.98 \}\]/);
});

test('[static] F12: a choice fades to its colours, and a segment slides, instead of jumping', () => {
  const fast = strip(read('components/Selection.motion120.tsx'));
  const fallback = strip(read('components/Selection.tsx'));
  // The fast path drives the colours on the UI thread; the fallback by opacity only (no JS colour).
  assert.match(fast, /backgroundColor: interpolateColor\(progress\.value, \[0, 1\], \[fillFrom, fillTo\]\)/);
  assert.match(fast, /color: interpolateColor\(progress\.value, \[0, 1\], \[from, to\]\)/);
  assert.match(fast, /x\.value = withSpring\(to, THUMB_SPRING\);/);
  assert.doesNotMatch(fallback, /JS_DRIVER|useNativeDriver: false/);
  assert.match(fallback, /Animated\.spring\(x, \{ toValue: to, \.\.\.THUMB_SPRING, useNativeDriver: USE_NATIVE_DRIVER \}\)/);
  // A host mounts the pieces only with motion on, and then draws its own paint clear (its border
  // WIDTH kept), so Reduce Motion — and the harness — render exactly what they always did.
  const HOSTS = {
    'components/Chip.tsx': [/const fades = useReducedMotion\(\) === false && !!onPress;/, /fades && CLEAR_PAINT/, /\{tint\}\s*\{content\}/],
    'components/JobFilterSheet.tsx': [/const fades = useReducedMotion\(\) === false;/, /fades && styles\.pillClear/, /<SelectionTint\s+on=\{on\}/],
    'screens/MessagesInboxScreen.tsx': [/const pillsFade = reduceMotion === false;/, /pillsFade && styles\.pillClear/, /<SelectionTint\s+on=\{active\}/],
    'components/SegmentedControl.tsx': [/const animated = useReducedMotion\(\) === false;/, /selected && !thumbed && \{ backgroundColor: palette\.primary \}/, /<SelectionThumb/],
  };
  for (const [path, marks] of Object.entries(HOSTS)) {
    const source = strip(read(path));
    for (const mark of marks) assert.match(source, mark, `${path}: ${mark}`);
    assert.match(source, /<SelectionText/, `${path} fades its label`);
  }
});

test('[static] F12: a mark arrives on a spring, and a tapped star swells', () => {
  const chooser = strip(read('components/SelectMark.tsx'));
  // Under Reduce Motion (and until it is known) the chooser renders exactly the site's own glyph.
  assert.match(chooser, /if \(!animated\) return <>\{props\.on \? props\.mark : \(props\.off \?\? null\)\}<\/>;/);
  assert.match(chooser, /if \(!animated\) return <>\{props\.children\}<\/>;/);
  const fast = strip(read('components/SelectMark.motion120.tsx'));
  assert.match(fast, /progress\.value = withSpring\(on \? 1 : 0, MARK_SPRING\);/);
  assert.match(fast, /withSequence\(withSpring\(POP_PEAK, POP_UP_SPRING\), withSpring\(1, POP_DOWN_SPRING\)\)/);
  const SITES = {
    'screens/LegalGateScreen.tsx': /<SelectMark\s+on=\{agreed\}[\s\S]*?off=\{<Ionicons name="square-outline"/,
    'components/CategoryAccordion.tsx': /<SelectMark\s+on=\{isSelected\}[\s\S]*?off=\{<Ionicons name="square-outline"/,
    'screens/ApproveOrDisputeScreen.tsx': /<SelectMark\s+on=\{reason === r\}/,
    'components/StarRating.tsx': /<MarkPop popKey=\{popped\?\.star === star \? popped\.key : 0\}>\{icon\}<\/MarkPop>/,
  };
  for (const [path, wear] of Object.entries(SITES)) assert.match(strip(read(path)), wear, `${path} wears the arriving mark`);
  // The rows keep their roles and states (E4); the Maestro walk still finds the stars by testID.
  assert.match(strip(read('screens/LegalGateScreen.tsx')), /accessibilityRole="checkbox"/);
  assert.match(strip(read('components/StarRating.tsx')), /testID=\{`review-star-\$\{star\}`\}/);
});

test('[static] F12: a list\'s first rows cascade in once, and never replay', () => {
  const hook = strip(read('hooks/useEntrance.ts'));
  assert.match(hook, /export function useEntered\(hasRows: boolean\): boolean \{/);
  assert.match(hook, /const skipped = useRef\(skip\)\.current;/, 'skip is read at mount');
  assert.match(hook, /return Math\.min\(index, 6\);/);
  const fast = strip(read('components/EntranceView.motion120.tsx'));
  assert.match(fast, /const skipped = useRef\(skip\)\.current;/);
  assert.match(fast, /useSharedValue\(animated \? 0 : 1\)/, 'hidden from its first frame when it will enter');
  assert.match(fast, /animated \? motion : undefined/, 'no identity transform on a still section');
  const LISTS = {
    'ui/templates/DetailScreen.tsx': /<EntranceView\s+key=\{section\.title \?\? `section-\$\{index\}`\}\s+index=\{entranceSlot\(index\)\}\s+skip=\{sectionsEntered\}/,
    'screens/MessagesInboxScreen.tsx': /<EntranceView index=\{entranceSlot\(index\)\} skip=\{rowsEntered\}>\s*<ConversationRow/,
    'screens/WorkerResultsScreen.tsx': /<EntranceView index=\{entranceSlot\(index\)\} skip=\{resultsEntered\}>\s*<WorkerJobCard/,
    'screens/ProfileReviewsScreen.tsx': /<EntranceView index=\{entranceSlot\(index\)\} skip=\{reviewsEntered\}>\s*<Card/,
    'screens/CellJobsScreen.tsx': /<EntranceView index=\{entranceSlot\(index\)\} skip=\{jobsEntered\}>\s*<BrowseJobCard/,
    'screens/WorkerHomeScreen.tsx': /<EntranceView key=\{job\.id\} index=\{entranceSlot\(index\)\} skip=\{jobsEntered\}>\s*<WorkerJobCard/,
    'screens/MyJobsHubScreen.tsx': /<EntranceView index=\{3\} skip=\{hubEntered\}>/,
  };
  for (const [path, wear] of Object.entries(LISTS)) {
    const source = strip(read(path));
    assert.match(source, wear, `${path} cascades its first rows`);
    assert.match(source, /= useEntered\(/, `${path} reads the first-batch flag`);
  }
  // Never in Chat: a conversation's messages are not an entrance.
  assert.doesNotMatch(strip(read('screens/ChatScreen.tsx')), /<EntranceView/);
});

test('[executed] F12: a fade to or from nothing keeps its hue (clearAlpha)', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  const js = stripTypeScriptTypes(read('ui/colorAlpha.ts'), { mode: 'strip' });
  const { clearAlpha } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  assert.equal(clearAlpha('#4FC58C'), 'rgba(79,197,140,0)');
  assert.equal(clearAlpha('rgba(79, 197, 140, 0.16)'), 'rgba(79,197,140,0)');
  assert.equal(clearAlpha('rgb(1,2,3)'), 'rgba(1,2,3,0)');
  assert.equal(clearAlpha('transparent'), 'transparent');
  // fadeEnds swaps a transparent end for the other end at alpha 0.
  const shared = strip(read('components/Selection.shared.tsx'));
  assert.match(shared, /from === 'transparent' \? clearAlpha\(to\) : from, to === 'transparent' \? clearAlpha\(from\) : to/);
});
