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
