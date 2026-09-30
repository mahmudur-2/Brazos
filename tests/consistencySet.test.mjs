import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// 2026-09-28 (LUX-LIST-64 #64) — THE CONSISTENCY SET, from the audit's M-25,
// M-17, M-31 and M-37: one filter memory and one radius control, one noun per
// audience (tests/offerActionParity.test.mjs pins the words), one way to close
// a sheet, one dialog order, one confirm engine, and the pitch as the place a
// question goes before the hire.
//
// CATCHES: a browse surface that forgets the other's filters; a second radius
// control on the job list; a sheet with its own close (an X, a bottom Cancel);
// a dialog with the action on the left; a confirm that skips the host; a Modal
// that does not report itself (the engine would stack a second modal on iOS).
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const presence = await import('../lib/modalPresence.ts');

test('[executed] the modal count, and the wait for one still leaving', () => {
  const { anyModalOpen, modalClosed, modalOpened, modalSettleDelay, openModalCount, MODAL_SETTLE_MS, MODAL_SETTLE_INSTANT_MS, resetModalPresence } = presence;
  resetModalPresence();
  assert.equal(anyModalOpen(), false);
  assert.equal(modalSettleDelay(1_000), 0, 'nothing ever opened: no wait');
  modalOpened();
  modalOpened();
  assert.equal(openModalCount(), 2);
  modalClosed(10_000, MODAL_SETTLE_INSTANT_MS);
  assert.equal(openModalCount(), 1, 'one of two still up');
  modalClosed(10_000, MODAL_SETTLE_MS);
  assert.equal(anyModalOpen(), false);
  assert.equal(modalSettleDelay(10_100), MODAL_SETTLE_MS - 100, 'the longest leaving still runs');
  assert.equal(modalSettleDelay(10_000 + MODAL_SETTLE_MS + 1), 0);
  modalClosed(20_000);
  assert.equal(openModalCount(), 0, 'never below zero');
  resetModalPresence();
});

test('[static] M-31 — one confirm engine: confirmAsync draws the host, the system alert is the fallback', () => {
  const dialog = stripComments(read('lib/dialog.ts'));
  // The newest host whose level is the number of modals on screen; else the system alert.
  assert.match(dialog, /return top && top\.level === openModalCount\(\) \? top : null;/);
  assert.match(dialog, /return host \? host\.present\(options\) : nativeConfirm\(options\);/);
  assert.match(dialog, /export function registerConfirmHost\(entry: ConfirmHostEntry\): \(\) => void/);
  assert.match(dialog, /Alert\.alert\(/, 'the native fallback stays');
  const host = stripComments(read('components/ConfirmHost.tsx'));
  assert.match(host, /registerConfirmHost\(\{/);
  assert.match(host, /const wait = level === 0 \? modalSettleDelay\(\) : 0;/, 'the root waits for a leaving sheet');
  assert.match(host, /void nativeConfirm\(next\.options\)/, 'the watchdog: nothing can hang');
  assert.match(host, /const SHOW_WATCHDOG_MS = 1000;/);
  assert.match(host, /<ConfirmDialog\b[\s\S]*onShow=\{/);
  // The [+] sheet asks its switch with the sheet still up (M-38): it hosts that confirm.
  assert.match(stripComments(read('components/CreateSheet.tsx')), /<ConfirmHost level=\{1\} \/>/);
  const app = stripComments(read('App.tsx'));
  // (A JSX comment strips to a bare `{}`.)
  assert.match(app, /<\/NavigationContainer>\s*(\{\}\s*)?<ConfirmHost \/>\s*<\/ModeProvider>/, 'mounted once, inside the mode provider');
  assert.equal((app.match(/<ConfirmHost \/>/g) ?? []).length, 1);

  // Every component that renders a React Native Modal reports it.
  for (const file of [
    'components/ActionSheet.tsx',
    'components/AmountPrompt.tsx',
    'components/ConfirmDialog.tsx',
    'components/CountryPicker.tsx',
    'components/CreateSheet.tsx',
    'components/DistanceChips.tsx',
    'components/EditBudgetDialog.tsx',
    'components/GlassDropdown.tsx',
    'components/JobSummaryCard.tsx',
    'components/MediaViewer.tsx',
    'components/PhotoViewer.tsx',
    'components/PriceDropdown.tsx',
    'components/ReactionPicker.tsx',
    'components/ReportDialog.tsx',
    'components/ServicePickerSheet.tsx',
    'ui/primitives/Sheet.tsx',
  ]) {
    const source = stripComments(read(file));
    // 2026-09-30: a frosted dialog's Modal is drawn by components/PopModal.tsx; the dialog still
    // reports it.
    assert.ok(source.includes('<Modal') || source.includes('<PopModal'), `${file} renders a Modal`);
    assert.match(source, /useModalPresence\(/, `${file} must report its Modal`);
  }
});

test('[static] M-31 — one dialog order: Cancel on the left, the action on the right', () => {
  const order = (file, cancel, action) => {
    const source = stripComments(read(file));
    const a = source.indexOf(cancel);
    const b = source.indexOf(action, a);
    assert.ok(a > 0 && b > a, `${file}: ${cancel} renders before ${action}`);
  };
  order('components/ConfirmDialog.tsx', 'title={cancelText}', 'title={confirmText}');
  order('components/AmountPrompt.tsx', 'title="Cancel"', 'title={confirmText}');
  order('components/EditBudgetDialog.tsx', 'title="Cancel"', 'title="Save"');
  const confirm = stripComments(read('components/ConfirmDialog.tsx'));
  assert.match(confirm, /actions: \{\s*flexDirection: 'row',/);
  assert.match(confirm, /action: \{\s*flex: 1,\s*\}/, 'the action takes the rest of the row');
});

test('[static] M-31 — one way to close a sheet: the handle, the title, one word', () => {
  for (const [file, word] of [
    ['components/ActionSheet.tsx', 'Close'],
    ['components/CreateSheet.tsx', 'Close'],
    ['components/ServicePickerSheet.tsx', 'Close'],
  ]) {
    const source = stripComments(read(file));
    assert.match(source, new RegExp(`<SheetHeader[\\s\\S]*?dismissWord="${word}"`), `${file} wears the one header`);
  }
  const sheet = stripComments(read('ui/primitives/Sheet.tsx'));
  assert.match(sheet, /<SheetHeader\s+title=\{title\}\s+dismissWord=\{dismissWord\}\s+onDismiss=\{onClose\}\s+onCancel=\{onCancel\}/);
  assert.match(sheet, /dismissWord = 'Close',/, 'closing only dismisses unless a sheet says Done');
  assert.doesNotMatch(stripComments(read('components/ActionSheet.tsx')), /accessibilityLabel="Cancel"/, 'no bottom Cancel row');
  assert.doesNotMatch(stripComments(read('components/ServicePickerSheet.tsx')), /name="close"/, 'no X');
  const header = stripComments(read('ui/primitives/SheetHeader.tsx'));
  assert.match(header, /export type SheetDismissWord = 'Done' \| 'Close';/);
  assert.match(header, /accessibilityLabel=\{dismissWord\}/);
});

test('[static] M-25 — one filter memory, and one radius control on the job list', () => {
  const session = stripComments(read('lib/jobFilterSession.ts'));
  assert.match(session, /return userId !== null && userId === owner \? model : DEFAULT_JOB_FILTERS;/, 'owned by one user');
  assert.doesNotMatch(session, /AsyncStorage|SecureStore|localStorage/, 'session only, never on disk');
  for (const file of ['screens/MapScreen.tsx', 'screens/WorkerResultsScreen.tsx']) {
    const source = stripComments(read(file));
    assert.match(source, /= useSessionJobFilters\(\);/, `${file} reads the one memory`);
    assert.doesNotMatch(source, /useState<JobFilterModel>/, `${file} keeps no filter model of its own`);
  }
  const list = stripComments(read('screens/WorkerResultsScreen.tsx'));
  assert.match(list, /distance=\{undefined\}/, 'the sheet carries no Distance row on the list');
  const chips = stripComments(read('components/DistanceChips.tsx'));
  assert.match(chips, /label=\{isPreset \? 'Custom' : distanceChipLabel\(value\)\}/);
  assert.match(chips, /options=\{DISTANCE_CUSTOM_VALUES\.map/, 'the sheet\'s own ruled custom list');
});

test('[static] M-37 — before the hire, the pitch is where a question goes', () => {
  const composer = stripComments(read('components/OfferComposer.tsx'));
  assert.match(composer, /Questions\? Put them in your pitch — chat opens the moment you’re hired\./);
  const detail = stripComments(read('screens/JobDetailScreen.tsx'));
  assert.match(detail, /Questions go in your bid; chat opens once hired\./);
});
