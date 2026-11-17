// PART 5b T1 (a defect the robot phone test found): on the job page the worker's counter form opens under
// the reply card's buttons; when nothing follows the card, that is the foot of the screen, and its amount
// field sat under the tab bar until the person scrolled. Now the page scrolls, once the form opens and again
// once the keyboard is up, just enough that the form's heading and its amount field are in view.
//   [executed] lib/scrollReveal.ts's arithmetic, and the page's own effect as written (types stripped), run
//              with stand-ins for the measured boxes, the frame, the keyboard and the scroller.
//   [static]   the measured views are the ones the effect names; no LayoutAnimation, no timer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1').replace(/\s+/g, ' ');

const { revealShift } = await import(pathToFileURL(join(root, 'lib/scrollReveal.ts')).href);

test('T1 · [executed] revealShift moves the page only as far as the field needs, never past the heading', () => {
  const band = { visibleTop: 100, visibleBottom: 742, margin: 16 };
  // The form opened at the foot: the field's bottom is 454 pt under the band (with the margin).
  assert.equal(revealShift({ ...band, headingTop: 1000, fieldBottom: 1180 }), 454);
  // Already in view, or exactly at the margin: the page stays.
  assert.equal(revealShift({ ...band, headingTop: 400, fieldBottom: 600 }), 0);
  assert.equal(revealShift({ ...band, headingTop: 400, fieldBottom: 726 }), 0);
  // Both cannot fit: the heading stays at the top of the band (16 pt under it), the field as far up as that allows.
  assert.equal(revealShift({ ...band, visibleBottom: 400, headingTop: 300, fieldBottom: 700 }), 184);
  // A heading already above the band never pulls the page back up.
  assert.equal(revealShift({ ...band, headingTop: 50, fieldBottom: 900 }), 0);
  // Unmeasured is no move.
  assert.equal(revealShift({ ...band, headingTop: Number.NaN, fieldBottom: Number.NaN }), 0);
});

// The page's effect, as written.
const detail = read('screens/JobDetailScreen.tsx');
const effectStart = detail.indexOf('  useEffect(() => {\n    if (!showCounterForm) return;');
const effectEnd = detail.indexOf('  }, [showCounterForm, navClearance, reducedMotion]);', effectStart);
assert.ok(effectStart > 0 && effectEnd > effectStart, 'the counter form\'s effect is found');
const effectJs = stripTypeScriptTypes(detail.slice(effectStart, effectEnd) + '  }, []);\n', { mode: 'strip' });

/** Runs the effect once for one page; returns what it did. Boxes are window coordinates { top, bottom }. */
function openForm({ open = true, band, contentTop, form, field, navClearance = 110, reducedMotion = false }) {
  const frames = [];
  const listeners = [];
  const scrolls = [];
  let cancelled = 0;
  let cleanup;
  const ref = (box) => ({ current: box ? { measureInWindow: (cb) => cb(0, box.top, 393, box.bottom - box.top) } : null });
  const scope = {
    useEffect: (fn) => { cleanup = fn(); },
    showCounterForm: open,
    Keyboard: { addListener: (event, fn) => { const l = { event, fn, removed: false, remove() { this.removed = true; } }; listeners.push(l); return l; } },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => { cancelled += 1; },
    scrollBandRef: ref(band),
    contentTopRef: ref(contentTop),
    counterFormRef: ref(form),
    counterAmountRef: ref(field),
    scrollRef: { current: { scrollTo: (o) => scrolls.push(o) } },
    revealShift,
    navClearance,
    spacing: { md: 16 },
    reducedMotion,
  };
  new Function(...Object.keys(scope), effectJs)(...Object.values(scope));
  const flush = async () => { while (frames.length) frames.shift()(); await new Promise((r) => setImmediate(r)); };
  return { frames, listeners, scrolls, flush, cleanup: () => cleanup?.(), cancelled: () => cancelled };
}

// An iPhone page: the scroller's band from 100 to 852; the tab bar covers its foot (navClearance 110).
const SHORT = { band: { top: 100, bottom: 852 }, contentTop: { top: 100, bottom: 100 }, form: { top: 1000, bottom: 1400 }, field: { top: 1100, bottom: 1180 } };

test('T1 · [executed] the form opened at the foot of a short page: one scroll brings its heading and amount field above the tab bar', async () => {
  const run = openForm(SHORT);
  assert.equal(run.scrolls.length, 0, 'nothing before the form\'s layout frame');
  await run.flush();
  // 1180 + 16 − (852 − 110) = 454; the page was at the top (100 − 100 = 0).
  assert.deepEqual(run.scrolls, [{ y: 454, animated: true }]);
  // Already scrolled 300 pt: the same shift from there.
  const scrolled = openForm({ ...SHORT, contentTop: { top: -200, bottom: -200 }, form: { top: 700, bottom: 1100 }, field: { top: 800, bottom: 880 } });
  await scrolled.flush();
  assert.deepEqual(scrolled.scrolls, [{ y: 300 + 154, animated: true }]);
});

test('T1 · [executed] once the keyboard is up the band ends at the keyboard and the tab bar reserve is off; the heading still wins', async () => {
  const run = openForm({ ...SHORT, form: { top: 500, bottom: 900 }, field: { top: 600, bottom: 680 } });
  await run.flush();
  assert.deepEqual(run.scrolls, [], 'opened in view: no move');
  assert.ok(run.listeners.some((l) => l.event === 'keyboardDidShow'), 'the keyboard is listened for while the form is open');
  // The keyboard-avoiding view shrinks the band to 100..450.
  const up ={ ...SHORT, band: { top: 100, bottom: 450 }, form: { top: 500, bottom: 900 }, field: { top: 600, bottom: 680 } };
  const withKeyboard = openForm(up);
  await withKeyboard.flush();
  withKeyboard.scrolls.length = 0;
  withKeyboard.listeners.find((l) => l.event === 'keyboardDidShow').fn();
  await withKeyboard.flush();
  // keyboard up: 680 + 16 − 450 = 246 (no tab bar reserve); the heading's room is 500 − 16 − 100 = 384.
  assert.deepEqual(withKeyboard.scrolls, [{ y: 246, animated: true }]);
  // A form taller than the band: the heading stays 16 pt under the band's top.
  const tall = openForm({ ...up, form: { top: 300, bottom: 900 }, field: { top: 600, bottom: 680 } });
  await tall.flush();
  tall.scrolls.length = 0;
  tall.listeners.find((l) => l.event === 'keyboardDidShow').fn();
  await tall.flush();
  assert.deepEqual(tall.scrolls, [{ y: 184, animated: true }]);
});

test('T1 · [executed] reduced motion jumps; a closed form, a closing form and an unmeasured form move nothing', async () => {
  const still = openForm({ ...SHORT, reducedMotion: true });
  await still.flush();
  assert.deepEqual(still.scrolls, [{ y: 454, animated: false }]);
  // Not known yet (null): no animation is promised either way, so none is run.
  const unknown = openForm({ ...SHORT, reducedMotion: null });
  await unknown.flush();
  assert.deepEqual(unknown.scrolls, [{ y: 454, animated: false }]);

  const closed = openForm({ ...SHORT, open: false });
  await closed.flush();
  assert.equal(closed.frames.length + closed.scrolls.length + closed.listeners.length, 0, 'closing the form leaves the page where it is');

  const run = openForm(SHORT);
  run.cleanup();
  assert.equal(run.listeners[0].removed, true, 'the keyboard listener goes with the form');
  assert.equal(run.cancelled(), 1, 'a pending frame is cancelled');

  const gone = openForm({ ...SHORT, field: null });
  await gone.flush();
  assert.deepEqual(gone.scrolls, [], 'a form already gone is not chased');
});

test('T1 · [static] the measured views are the band, the content\'s first point, the form and its amount field; no LayoutAnimation, no timer', () => {
  const page = code('screens/JobDetailScreen.tsx');
  assert.match(page, /<View ref=\{scrollBandRef\} collapsable=\{false\} style=\{styles\.flex\}> <ScrollView ref=\{scrollRef\}/);
  assert.match(page, /showsVerticalScrollIndicator=\{false\} > <View ref=\{contentTopRef\} collapsable=\{false\} \/>/, 'the first point of the content (the content has no top padding and no gap)');
  assert.match(page, /\{showCounterForm && !windowOver \? \( <View ref=\{counterFormRef\} collapsable=\{false\} style=\{styles\.counterFormWrap\}> <OfferComposer amountFieldRef=\{counterAmountRef\}/);
  assert.match(page, /content: \{ paddingBottom: spacing\.xxl, gap: 0, \}/);
  const composer = code('components/OfferComposer.tsx');
  assert.match(composer, /<View ref=\{amountFieldRef\} collapsable=\{false\}> <OfferAmountField /);
  for (const file of ['screens/JobDetailScreen.tsx', 'components/OfferComposer.tsx', 'lib/scrollReveal.ts']) {
    assert.doesNotMatch(read(file), /LayoutAnimation/, file);
  }
  const effect = detail.slice(effectStart, effectEnd);
  assert.doesNotMatch(effect, /setTimeout|setInterval/, 'a frame, never a timer');
  // The customer's counter is a sheet (CounterOfferSheet), where the form starts at the sheet's top.
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /<CounterOfferSheet/);
});
