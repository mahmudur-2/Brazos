import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// 2026-09-28 (LUX-LIST-64 #53–#58) — THE INBOX'S CLEAN LIST, the approved
// docs/mockups/html/refs/inbox-clean-list.html (version 9): the count beside
// the name, the stamp in the 44pt column, the job chip's stage, and the glass
// ••• menu. The two pure modules are RUN; the screen and the row are read.
//
// CATCHES: a count that is estimated rather than counted; a stamp too wide for
// its column; a second state → stage mapping.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const visibility = await import('../lib/conversationVisibility.ts');
const time = await import('../lib/time.ts');

test('[executed] the unseen count is COUNTED: newer than the read, every one when never read', () => {
  const { countUnseen } = visibility;
  const stamps = [
    { key: 'job:a', created_at: '2026-09-28T10:00:00.000Z' },
    { key: 'job:a', created_at: '2026-09-28T11:00:00.000Z' },
    { key: 'job:a', created_at: '2026-09-28T12:00:00.000Z' },
    { key: 'direct:b', created_at: '2026-09-27T09:00:00.000Z' },
    { key: 'job:z', created_at: '2026-09-28T12:00:00.000Z' },
  ];
  const counts = countUnseen(stamps, [
    // Read at 10:30 — the two after it count, the one before does not.
    { key: 'job:a', readAt: '2026-09-28T10:30:00+00:00' },
    // Never opened: every one of theirs counts.
    { key: 'direct:b', readAt: null },
  ]);
  assert.deepEqual(counts, { 'job:a': 2, 'direct:b': 1 }, 'job:z was never asked about');
});

test('[executed] the stamp fits the 44pt column: now, 12m, 4h, 1d, a weekday, then the date', () => {
  const { formatInboxStamp } = time;
  const now = Date.parse('2026-09-28T12:00:00');
  const at = (ms) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  assert.equal(formatInboxStamp(at(20_000), now), 'now');
  assert.equal(formatInboxStamp(at(12 * MIN), now), '12m');
  assert.equal(formatInboxStamp(at(4 * HOUR), now), '4h');
  assert.equal(formatInboxStamp(at(30 * HOUR), now), '1d');
  assert.match(formatInboxStamp(at(3 * DAY), now), /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
  assert.match(formatInboxStamp(at(20 * DAY), now), /^[A-Z][a-z]{2} \d{1,2}$/);
  assert.match(formatInboxStamp(at(400 * DAY), now), /^\d{1,2}\/\d{1,2}\/\d{2}$/);
  assert.equal(formatInboxStamp('not a date', now), '');
});

test('[static] one state → stage mapping, read by the rail, the Home bar and the Inbox chip', () => {
  const live = stripComments(read('lib/liveJobStatus.ts'));
  assert.match(live, /export function liveTone\(state: JobLifecycleState\): LiveTone \| null \{/);
  assert.match(live, /const tone = liveTone\(state\);\s*if \(!tone\) return null;/, 'liveJobStatus reads the one mapping');
  assert.equal((live.match(/tone: '(assigned|progress|review)'/g) ?? []).length, 0, 'no tone is spelled a second time');
  // C1: the chip's word is the lifecycle label — no second vocabulary of its own.
  assert.doesNotMatch(live, /STAGE_WORDS/);
  assert.match(live, /return tone \? \{ word: JOB_LIFECYCLE_LABELS\[state\], tone \} : null;/);
  assert.match(live, /export function inboxStage\(state: JobLifecycleState\)/);
});

test('[static] the row: the count or the mark, the stamp, the 44 column, the chip from the left edge', () => {
  const row = stripComments(read('components/ConversationRow.tsx'));
  assert.match(row, /const PHOTO = 58;/);
  assert.match(row, /const RIGHT_COLUMN = 44;/);
  assert.match(row, /initialsSize=\{20\}/);
  assert.match(row, /formatInboxStamp\(lastMessageAt\)/);
  assert.match(row, /accessibilityLabel=\{`Manage conversation with \$\{name\}`\}/, 'the ••• the E2E and the viewer press');
  assert.match(row, /<LiveDot color=\{stageColor\} size=\{6\} motion="breathe" \/>/, 'the stage dot breathes');
  assert.doesNotMatch(row, /<Card\b/, 'no card: the clean list');
});

test('[static] #53 — the ••• opens the glass dropdown: one group, no "…", the red rows red', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));
  assert.match(screen, /<GlassDropdown\s+request=\{menuRequest\}\s+groups=\{menuGroups\}/);
  assert.doesNotMatch(screen, /subtitle="Manage this conversation"/, 'the bottom sheet is gone');
  // F20: Block and Report are the one person-menu builder's, which the screen reads.
  const personMenus = stripComments(read('lib/chatMenus.ts'));
  assert.match(screen, /const menuGroups: GlassDropdownItem\[\]\[\] = menuTarget\s*\?\s*\[\s*personSafetyItems\(\{/);
  for (const label of ["'Block'", "'Report'"]) {
    assert.ok(personMenus.includes(label), `the menu carries ${label}`);
  }
  assert.doesNotMatch(screen, /label: '[^']*…'/, 'no row ends in "…"');
  assert.doesNotMatch(personMenus, /label: '[^']*…'/, 'no person row ends in "…"');
  const menu = stripComments(read('components/GlassDropdown.tsx'));
  assert.match(menu, /<Surface material="dropdown" fill=\{paneFills\.dropdown\} radius=\{RADIUS\}/);
  assert.match(menu, /const SCREEN_EDGE = 8;/);
  assert.match(menu, /item\.destructive \? colors\.dropDanger : colors\.dropGlyph/);
});

test('the row speaks what it shows: a waiting request is in the label, and a card is never a bare "…" (run 27)', () => {
  const row = stripComments(read('components/ConversationRow.tsx'));
  const label = row.match(/accessibilityLabel=\{\[([\s\S]*?)\]\s*\.filter/);
  assert.ok(label, 'the row label array was not found');
  assert.match(label[1], /awaitingRequest\s*\?\s*'Job request, needs your reply'/);
  const conversations = stripComments(read('lib/conversations.ts'));
  assert.doesNotMatch(conversations, /last_message_content \|\| '…'/);
  assert.match(conversations, /last_message_content \|\| 'Job update'/);
});

test('the inbox opens Report only after its menu has closed (run 31: iOS dismissed it with the menu)', () => {
  const inbox = stripComments(read('screens/MessagesInboxScreen.tsx'));
  const onReport = inbox.match(/onReport: \(\) => \{([\s\S]*?)\}/);
  assert.ok(onReport, 'the inbox menu has no onReport');
  assert.doesNotMatch(onReport[1], /setReportTarget\(/, 'Report must not open while the menu Modal is closing');
  assert.match(inbox, /onClosed=\{\(\) => \{[\s\S]*?reportAfterMenu\.current[\s\S]*?setReportTarget\(target\)/);
});
