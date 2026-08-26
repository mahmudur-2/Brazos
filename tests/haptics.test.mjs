import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// The wrapper cannot be IMPORTED here: it pulls Platform from react-native,
// whose entry point Node cannot resolve, and every other lib module in this
// suite is read the same way for the same reason. So the fence is on the
// source — and it is written to be falsifiable rather than decorative: the
// three counting assertions below fail on zero occurrences just as loudly as
// they fail on two, so a green result means the needles were really found.
test('[static] lib/haptics exposes three no-ops, and web never reaches the vendor', () => {
  const source = read('lib/haptics.ts');
  const code = stripComments(source);
  const flat = flatten(source);

  // 1. THE THREE EXPORTS, EACH WITH THE FEEDBACK KIND IT WAS SPECIFIED WITH.
  assert.match(code, /export function tap\(\): void \{/);
  assert.match(code, /export function confirm\(\): void \{/);
  assert.match(code, /export function select\(\): void \{/);
  assert.match(flat, /tap\(\): void \{ fire\(\(h\) => h\.impactAsync\(/);
  assert.match(flat, /confirm\(\): void \{ fire\(\(h\) => h\.notificationAsync\(/);
  assert.match(flat, /select\(\): void \{ fire\(\(h\) => h\.selectionAsync\(\)\)/);
  assert.match(code, /ImpactFeedbackStyle\?\.Light \?\? 'light'/);
  assert.match(code, /NotificationFeedbackType\?\.Success \?\? 'success'/);

  // 2. THE VENDOR IS NEVER STATICALLY IMPORTED. A top-level import would run
  //    expo-haptics' module scope on every platform, web included, which is
  //    exactly what this boundary exists to prevent.
  assert.doesNotMatch(code, /import[^;]*from 'expo-haptics'/);

  // 3. THE VENDOR IS NAMED EXACTLY ONCE IN EXECUTABLE CODE, AND IT IS A
  //    require. Comments are stripped first, so the docblock's mentions do
  //    not pad the count.
  const vendorHits = [...code.matchAll(/expo-haptics/g)];
  assert.equal(vendorHits.length, 1, 'expo-haptics must be named once, in the sole load site');
  assert.match(code, /require\('expo-haptics'\)/);

  // 4. THAT SOLE require IS UNREACHABLE ON WEB. load() is the only function
  //    that requires the vendor, it has exactly one call site, and that call
  //    site sits on the non-web arm of a Platform ternary — so on web the
  //    handle is decided without the vendor ever being executed.
  const loadCalls = [...code.matchAll(/(?<!function )\bload\(\)/g)];
  assert.equal(loadCalls.length, 1, 'load() must have exactly one call site');
  assert.match(
    flat,
    /const haptics: HapticsModule \| null = Platform\.OS === 'web' \? null : load\(\);/,
    'the one call site must be the non-web arm of the Platform ternary'
  );

  // 5. WITH A NULL HANDLE EVERY EXPORT IS A NO-OP, AND BOTH FAILURE SHAPES
  //    ARE SWALLOWED: a synchronous throw by the try/catch, the rejected
  //    UnavailabilityError by the .catch.
  assert.match(flat, /function fire\(call: \(module: HapticsModule\) => Promise<void>\): void \{ if \(!haptics\) return; try \{/);
  assert.match(flat, /void call\(haptics\)\.catch\(\(\) => \{\}\);/);
});
