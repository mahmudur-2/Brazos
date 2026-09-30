// 2026-09-30 (the build run, idea 4; DECISIONS 2026-09-30 (1)) — UNDO INSTEAD OF "ARE YOU SURE?":
// archive, mute and mark-unread happen at once and offer a five-second Undo; money, hiring and the
// safety clean-ups keep their confirmation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = readFileSync(join(root, 'screens/MessagesInboxScreen.tsx'), 'utf8');
const body = (name) => {
  const at = inbox.indexOf(`async function ${name}(`);
  assert.ok(at > 0, `${name} must exist`);
  return inbox.slice(at, inbox.indexOf('\n  }\n', at));
};

test('[static] the three everyday actions never confirm, and each offers its Undo', () => {
  for (const name of ['toggleMute', 'markUnread', 'applyConversationState']) {
    assert.doesNotMatch(body(name), /confirmAsync|confirmThen/, `${name} must not ask first`);
    assert.match(body(name), /offerUndo\(/, `${name} must offer an Undo`);
  }
  assert.match(inbox, /\{ message: target\.archived \? 'Unarchived' : 'Archived', revert: \{ archived: target\.archived \} \}/);
  assert.match(inbox, /const UNDO_MS = 5000;/);
});

test('[static] the Undo reverses the action itself, through the same door', () => {
  assert.match(body('toggleMute'), /\? await muteUser\(user\.id, target\.userId\)\s*: await unmuteUser\(user\.id, target\.userId\);/);
  assert.match(body('markUnread'), /markConversationRead\(thread, user\.id\)/);
  assert.match(body('applyConversationState'), /setConversationStateForAll\(target\.targets, undoable\.revert\)/);
});

test('[static] the toast sits above the floating pill, and the hard actions still confirm', () => {
  assert.match(inbox, /<UndoToast[\s\S]*?bottom=\{navClearance\}/);
  assert.match(body('toggleBlock'), /await confirmAsync\(/, 'blocking still asks');
  assert.match(inbox, /async function confirmThen\(/, 'the clean-ups keep their confirmation');
});
