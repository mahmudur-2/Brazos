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
  assert.match(moment, /if \(!isFreshMoment\(heldAt\) \|\| !claim\(`held:\$\{paymentId\}`\)\) return;\s*tap\(\);\s*if \(reduced\) return;/);
  assert.match(moment, /if \(!isFreshMoment\(releasedAt\) \|\| !claim\(`released:\$\{paymentId\}`\)\) return;\s*confirm\(\);\s*if \(reduced\) return;/);
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
