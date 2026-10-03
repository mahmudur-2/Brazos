import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
