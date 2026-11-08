import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run, group D (one look) — the source fences for D3, D11 and D13.
 * Each test names the item it holds; the measure fences live beside their
 * tokens (D7 in tests/sectionLabels.test.mjs, D8 in tests/themeTokens.test.mjs).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

test('[static] D3: a visible tab root draws no back button; a pushed screen keeps its way back', () => {
  // Discover: the customer tab root is the one mount with autoFocus: false.
  const search = strip(read('screens/WorkerSearchScreen.tsx'));
  assert.match(search, /const isTabRoot = params\?\.autoFocus === false && !params\?\.query && !params\?\.category;/);
  assert.match(search, /title=\{isTabRoot \? 'Discover' : 'Find Help'\}\s*onBack=\{isTabRoot \? undefined : goBackOrHome\}/);
  // My Jobs: the worker's is a visible tab (no back); the customer's is a
  // hidden tab reached from Home and the [+] sheet, so it keeps its way back.
  const myJobs = strip(read('screens/MyJobsHubScreen.tsx'));
  assert.match(
    myJobs,
    /\{isCustomer \? \(\s*<ScreenHeader title="My Jobs" onBack=\{goBackOrHome\} \/>\s*\) : \(\s*<ScreenHeader title="My Jobs" subtitle="[^"]*" largeTitle \/>/,
    "the worker's My Jobs tab root has no back button; the customer's hidden tab keeps one",
  );
});

test('[static] D11.1: the pickers float on the menu material OPAQUE, so the rows behind never read through', () => {
  const surface = strip(read('ui/primitives/Surface.tsx'));
  assert.match(surface, /opaque\?: boolean;/);
  assert.match(surface, /const flat = opaque \|\| reduceTransparency \|\| !canBlur;/);
  assert.match(strip(read('components/PickerPopover.tsx')), /<Surface material="menu"[^>]*\bopaque\b/);
});

test('[static] D11.2: the inbox pill row fades into the ground at its right edge while more pills lie past it', () => {
  const inbox = strip(read('screens/MessagesInboxScreen.tsx'));
  assert.match(inbox, /<Animated\.View\s+pointerEvents="none"\s+style=\{\[styles\.filterFade, edgeFade\(pillFadeTo, 90\), \{ opacity: pillFade \}\]\}/);
  assert.match(inbox, /const next = view > 0 && content - view > 1 && offset \+ view < content - 1;/);
  assert.match(inbox, /setPillsMoreRight\(\(prev\) => \(prev === next \? prev : next\)\)/, 'the state flips only at the edges');
  assert.match(inbox, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(inbox, /filterFade: \{\s*position: 'absolute',\s*top: 0,\s*right: 0,\s*bottom: 0,\s*width: 28,/);
  assert.match(strip(read('lib/theme.ts')), /export function edgeFade\(to: string, angle = 90, solidAt = 100\): ViewStyle \{/);
});

test('[static] D11.3: the Report dialog is the frosted PopModal, and no stray backdrop tap discards a report', () => {
  const dialog = strip(read('components/ReportDialog.tsx'));
  assert.match(dialog, /<PopModal\s+visible=\{visible\}\s+onRequestClose=\{onClose\}\s+backdropStyle=\{\[styles\.backdrop, isDark && styles\.backdropDark\]\}\s*>/);
  assert.doesNotMatch(dialog, /<Modal\b/);
  assert.doesNotMatch(dialog, /onBackdropPress/);
  assert.match(dialog, /useModalPresence\(visible\)/);
});

test('[static] D11.5: no lone star — the star draws only beside a figure, and an unknown summary draws no row', () => {
  const search = strip(read('screens/WorkerSearchScreen.tsx'));
  assert.match(search, /\{summary != null \? \(\s*<View style=\{styles\.proofRow\}>\s*\{ratingText !== '' \? \(\s*<>\s*<Ionicons name="star"/);
  assert.equal((search.match(/<Ionicons name="star"/g) ?? []).length, 1, 'one star, the gated one');
});

test('[static] D11.6: an unarmed destructive submit is a danger OUTLINE at full strength, not a dimmed fill', () => {
  const form = strip(read('ui/templates/FormScreen.tsx'));
  assert.match(form, /const destructiveUnarmed = submitVariant === 'destructive' && submitDisabled && !submitLoading;/);
  assert.match(form, /destructiveUnarmed\s*\? styles\.destructiveUnarmed\s*: \(submitDisabled \|\| submitLoading\) && styles\.disabled,/);
  assert.match(form, /destructiveUnarmed: \{\s*backgroundColor: 'transparent',\s*borderWidth: 1,\s*borderColor: colors\.danger,\s*\}/);
  assert.match(form, /destructiveUnarmedLabel: \{\s*color: colors\.danger,\s*\}/);
});

test('[static] D11.7-10: the evidence title says what it holds, the hired name shows once, and no title is doubled', () => {
  const client = strip(read('screens/ClientJobDetailScreen.tsx'));
  assert.match(client, /const hasBefore = job\.photos\.length \+ job\.videos\.length > 0;/);
  assert.match(client, /hasCompletionEvidence\s*\? hasBefore\s*\? 'Before & after'\s*: 'Finished work'\s*: 'Your original media'/);
  // The ASSIGNED WORKER card: the eyebrow, then straight to the worker row — the name once.
  assert.match(client, />ASSIGNED WORKER<\/Text>\s*\{workerError \?/);
  assert.match(client, /title=\{canAccept \? 'Job & Bids' : 'Job Details'\}/);
  for (const file of ['screens/ClientJobDetailScreen.tsx', 'screens/JobDetailScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    assert.doesNotMatch(strip(read(file)), /'Job Detail'|"Job Detail"/, `${file}: one name, "Job Details"`);
  }
  // One screen is "Profile" (the tab); the two others say which profile.
  assert.match(strip(read('screens/ProfileScreen.tsx')), /<ScreenHeader title="Profile" largeTitle \/>/);
  assert.match(strip(read('screens/ProfileDetailsScreen.tsx')), /title="Profile Details"/);
  assert.match(strip(read('screens/WorkerProfileScreen.tsx')), /<ScreenHeader title="Worker Profile" onBack=\{goBackOrHome\} \/>/);
});

test('[static] D13: a soft fade sits behind the floating bar, takes no touch, and steps aside for Map and pinned footers', () => {
  const shared = strip(read('components/MeltTabBar.shared.tsx'));
  const fade = shared.slice(shared.indexOf('export function UnderBarFade'), shared.indexOf('export function pillStyle'));
  assert.ok(fade.length > 0, 'UnderBarFade lives beside the pill style');
  assert.match(fade, /<Animated\.View\s+pointerEvents="none"/, 'the fade takes no touch');
  assert.match(fade, /const fadeStops = underBarFade\(insets\.bottom, meltBar\);/, 'its stops come from the pure geometry tests/meltTabBar.test.mjs executes');
  assert.match(fade, /edgeFade\(ground, 180, fadeStops\.solidAt\)/, 'it reads the shared edge-fade helper, solid from the pill centre');
  assert.match(fade, /height: fadeStops\.height/, 'no taller than the line content clears, so a list at its end is never washed');
  assert.match(fade, /const ground = isDark \? palette\.authGroundBottom : palette\.background;/, "the ground is the page's own foot");
  assert.match(fade, /const onMap = state\.routes\[state\.index\]\?\.name === 'Map';/);
  assert.match(fade, /const shown = !onMap && !footPinned;/, 'off on the Map tab and over a pinned footer');
  assert.match(fade, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(shared, /underBarFade: \{ position: 'absolute', left: 0, right: 0, bottom: 0 \}/);
  assert.doesNotMatch(strip(read('ui/tokens.ts')), /fadeAbove/, 'the fade has no reach of its own above the clearance line');

  // Drawn by the wrapper BEFORE the bar, so both paths' pill sits on it and each root still paints nothing.
  const wrapper = strip(read('components/MeltTabBar.tsx'));
  assert.match(wrapper, /<>\s*<UnderBarFade state=\{props\.state\} \/>\s*<Bar \{\.\.\.props\} \/>\s*<\/>/);

  // Every pinned surface asks usePillReserve() for its lift, and that hook registers it, by focus, as a count.
  const nav = strip(read('ui/primitives/BottomNav.tsx'));
  assert.match(nav, /export function usePinnedFooterPadding\(\): number \{\s*return usePillReserve\(\) \+ PINNED_FOOTER_BOTTOM_PADDING;/);
  assert.match(nav, /const register = useCallback\(\(delta: 1 \| -1\) => setCount\(\(current\) => Math\.max\(0, current \+ delta\)\), \[\]\);/);
  assert.match(nav, /navigation\.addListener\('focus', focus\)/);
  assert.match(nav, /navigation\.addListener\('blur', blur\)/);
  assert.match(strip(read('navigation/ModeShell.tsx')), /<PinnedFootProvider>[\s\S]*?<WorkerRoot \/> : <CustomerRoot \/>[\s\S]*?<\/PinnedFootProvider>/);
});

test('[static] D12: a rule drawn as a view of its own is the Divider; nothing hand-draws a hairline view', () => {
  const divider = strip(read('ui/primitives/Divider.tsx'));
  assert.match(divider, /thickness\?: number;/);
  assert.match(divider, /const thickness = fixedThickness \?\? \(dialled > 0 \? dialled : StyleSheet\.hairlineWidth\);/);

  // The adopted rules, each at the thickness and colour it drew before.
  const adopted = [
    ['screens/ChatScreen.tsx', /<Divider thickness=\{1\} style=\{styles\.jobDividerRule\} \/>/],
    ['screens/MessagesInboxScreen.tsx', /<Divider thickness=\{1\} color=\{withAlpha\(colors\.inboxRule, isDark \? 0\.11 : 1\)\} \/>/],
    ['components/GlassDropdown.tsx', /<Divider thickness=\{1\} color=\{rule\} style=\{styles\.rule\} \/>/],
    ['components/JobLivePage.tsx', /<Divider thickness=\{1\} style=\{styles\.hr\} \/>/],
    ['components/JobSummaryCard.tsx', /<Divider thickness=\{1\} style=\{styles\.divider\} \/>/],
    ['screens/WorkerHomeScreen.tsx', /<Divider orientation="vertical" thickness=\{1\} style=\{styles\.summaryDivider\} \/>/],
  ];
  for (const [file, wear] of adopted) assert.match(strip(read(file)), wear, `${file} wears the Divider`);

  // CATCHES a new hand-drawn rule: a style named as a rule whose shape is a 1 pt or hairline
  // stroke, or any hairline-tall view. Edge borders on rows (borderTopWidth) are not views and
  // stay where they are — a row's own rule sits inside its pressed fill and its hit box.
  const ALLOW = {
    'screens/WorkerHomeScreen.tsx:searchDivider':
      "a 26 pt tick inside the SearchBar's trailing slot, placed by that row; the Divider's stretch would re-place it",
  };
  const RULE_KEY = /(rule|Rule|divider|Divider|^hr$|Sep$|separator|Separator)/;
  const seen = new Set();
  for (const dir of ['screens', 'components']) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!name.endsWith('.tsx') || name.includes('.web.')) continue;
      const file = `${dir}/${name}`;
      const source = strip(read(file));
      for (const m of source.matchAll(/^[ \t]+(\w+): \{([^{}]*)\}/gm)) {
        const [, key, body] = m;
        const stroke = /\b(height|width): (1|StyleSheet\.hairlineWidth),/.test(body);
        const hairlineView = /\bheight: StyleSheet\.hairlineWidth\b/.test(body);
        if (!(hairlineView || (stroke && RULE_KEY.test(key)))) continue;
        seen.add(`${file}:${key}`);
        assert.ok(ALLOW[`${file}:${key}`], `${file} ${key}: draw the rule with ui/primitives/Divider`);
      }
    }
  }
  for (const [where, reason] of Object.entries(ALLOW)) {
    assert.ok(reason.length > 30, `${where} needs a real reason`);
    assert.ok(seen.has(where), `${where} is allowed but no longer drawn — drop it from the list`);
  }
});
