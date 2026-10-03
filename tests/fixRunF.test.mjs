import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run, group F (built better) — the source fences for the F items.
 * Each test names the item it holds.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

test('[static] F2: the boot path never statically imports the design studio or the catalog', () => {
  const boot = {
    'navigation/ModeShell.tsx': /components\/DesignStudioPanel/,
    'App.tsx': /dev-tools\/HomeDesignStudio/,
    'navigation/sharedStacks.tsx': /dev-tools\/ComponentCatalog/,
  };
  for (const [file, module] of Object.entries(boot)) {
    const src = strip(read(file));
    const statics = src.split('\n').filter((line) => /^\s*import\b/.test(line) && module.test(line));
    assert.deepEqual(statics, [], `${file} must not import ${module} at module scope`);
    assert.match(src, new RegExp(`require\\('[./]*${module.source}'\\)`), `${file} requires it lazily`);
  }
  // Each lazy require sits behind its own gate.
  assert.match(
    strip(read('navigation/ModeShell.tsx')),
    /const DesignStudioPanel = designStudioAvailable\s*\?\s*\(require\('\.\.\/components\/DesignStudioPanel'\)/,
  );
  assert.match(
    strip(read('App.tsx')),
    /const HomeDesignStudio = SHOW_HOME_DESIGN_STUDIO\s*\?\s*\(require\('\.\/dev-tools\/HomeDesignStudio'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /function ComponentCatalog\(\) \{\s*const \{ ComponentCatalog: Catalog \} =\s*require\('\.\.\/dev-tools\/ComponentCatalog'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /\{__DEV__ \? \(\s*<ProfileStack\.Screen name="ComponentCatalog" component=\{ComponentCatalog\} \/>/,
  );
});

test('[static] F18: the shell ground re-renders only its own view, and PostJob builds its dates once a day', () => {
  const shell = strip(read('navigation/ModeShell.tsx'));
  const modeShell = shell.slice(shell.indexOf('export function ModeShell()'), shell.indexOf('function ShellGroundView('));
  assert.ok(modeShell.length > 0, 'ModeShell precedes ShellGroundView');
  assert.doesNotMatch(modeShell, /useShellGroundState\(/, 'ModeShell holds no ground state');
  assert.match(shell, /function ShellGroundView\(\{ children \}: PropsWithChildren\) \{[\s\S]*?useShellGroundState\(\)/);
  assert.match(modeShell, /<ShellGroundView>\s*\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/);

  const post = strip(read('screens/PostJobScreen.tsx'));
  assert.match(post, /const dayKey = toLocalIsoDate\(new Date\(\)\);\s*const scheduleDates = useMemo\(upcomingDates, \[dayKey\]\);/);
  assert.doesNotMatch(post, /const scheduleDates = upcomingDates\(\)/);
});

test('[static] F24: the completed count names its unit, ReviewSection takes no prompt, the orphan bar tokens are gone', () => {
  assert.match(strip(read('screens/ProfileDetailsScreen.tsx')), /\{completed\} \{completed === 1 \? 'job' : 'jobs'\} completed/);
  const section = strip(read('components/ReviewSection.tsx'));
  assert.doesNotMatch(section, /\bprompt\??:/, 'the dead prop is gone from the props type');
  assert.match(section, /Thanks for rating \{revieweeFirstName\}\./);
  assert.match(section, /placeholder=\{`Share how it went with \$\{revieweeFirstName\}…`\}/);
  for (const host of ['screens/ClientJobDetailScreen.tsx', 'screens/ReviewAndTipScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const src = strip(read(host));
    const block = src.slice(src.indexOf('<ReviewSection'));
    assert.doesNotMatch(block.slice(0, block.indexOf('/>')), /\bprompt=/, `${host} passes no prompt`);
  }
  const tokens = strip(read('ui/tokens.ts'));
  const bar = tokens.slice(tokens.indexOf('export const navBar = {'));
  assert.doesNotMatch(bar.slice(0, bar.indexOf('\n} as const;')), /\n\s*(gold|glyphColorDark):/);
});
