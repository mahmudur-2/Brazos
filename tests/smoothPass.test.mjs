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
    // Runs only while a recording is live; the recorder stops on blur and on background.
    'components/AudioMeterBars.tsx': /const indeterminate = levels === null;/,
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
