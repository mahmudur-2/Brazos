// 2026-09-30 (the build run, idea 10) — MONEY MOMENTS YOU CAN FEEL: held pulses once with a soft
// haptic, released pops a tick with the success haptic; both only while fresh, once per payment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[static] a moment is news: fresh (two minutes), once per payment, haptic kept under Reduce Motion', () => {
  const moment = read('components/MoneyMoment.tsx');
  assert.match(moment, /export const MOMENT_FRESH_MS = 2 \* 60 \* 1000;/);
  assert.match(moment, /const played = new Set<string>\(\);/);
  // 2026-09-30 (group 1's review): the moment waits for the Reduce Motion answer (null until read)
  // before it claims its one play, and its key names the viewer as well as the payment.
  assert.match(moment, /const key = `held:\$\{user\?\.id \?\? ''\}:\$\{paymentId\}`;/);
  assert.match(moment, /const key = `released:\$\{user\?\.id \?\? ''\}:\$\{paymentId\}`;/);
  assert.match(moment, /if \(reduced === null\) return;\s*if \(!isFreshMoment\(heldAt\) \|\| !claim\(key\)\) return;\s*tap\(\);\s*if \(reduced\) return;/);
  assert.match(moment, /if \(reduced === null\) return;\s*if \(!isFreshMoment\(releasedAt\) \|\| !claim\(key\)\) return;\s*confirm\(\);\s*if \(reduced\) \{\s*pop\.setValue\(1\);/);
  // The tick that is about to pop starts hidden: no flash of it before the pop.
  assert.match(moment, /new Animated\.Value\(isFreshMoment\(releasedAt\) && !played\.has\(key\) \? 0 : 1\)/);
  assert.match(moment, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.doesNotMatch(moment, /react-native-reanimated/, 'the moments are core Animated, as drawn');
});

test('[static] both sides feel it: the customer\'s held card and release, the worker\'s card and eyebrow', () => {
  const customer = flat(read('screens/ClientJobDetailScreen.tsx'));
  assert.match(customer, /<HeldPulse paymentId=\{payment\.id\} heldAt=\{payment\.held_at\}> <Card palette=\{emeraldColors\} style=\{\[styles\.paymentCard/);
  assert.match(customer, /<Text style=\{styles\.approvalTitle\}>Payment released<\/Text> <ReleasedTick paymentId=\{payment\.id\} releasedAt=\{payment\.released_at\}/);
  const worker = flat(read('screens/WorkerJobScreen.tsx'));
  assert.match(worker, /<HeldPulse paymentId=\{payment\.id\} heldAt=\{isHeld\(payment\) \? payment\.held_at : null\}> <Card style=\{styles\.paymentCard\}>/);
  assert.match(worker, /\{isReleased\(payment\) \? \( <ReleasedTick paymentId=\{payment\.id\} releasedAt=\{payment\.released_at\}/);
});
