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
// CATCHES: a count that is estimated rather than counted, or that counts a
// cleared message; a stamp too wide for its column; a second state → stage
// mapping; the swipe tiles drawing through a see-through row (#28).
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const visibility = await import('../lib/conversationVisibility.ts');
const time = await import('../lib/time.ts');

test('[executed] the unseen count is COUNTED: newer than the read, still in my copy, never a hand-set mark', () => {
  const { countUnseen, FULLY_UNREAD_AT } = visibility;
  const stamps = [
    { key: 'job:a', created_at: '2026-09-28T10:00:00.000Z' },
    { key: 'job:a', created_at: '2026-09-28T11:00:00.000Z' },
    { key: 'job:a', created_at: '2026-09-28T12:00:00.000Z' },
    { key: 'direct:b', created_at: '2026-09-27T09:00:00.000Z' },
    { key: 'job:c', created_at: '2026-09-28T12:00:00.000Z' },
    { key: 'job:z', created_at: '2026-09-28T12:00:00.000Z' },
  ];
  const counts = countUnseen(stamps, [
    // Read at 10:30 — the two after it count, the one before does not.
    { key: 'job:a', readAt: '2026-09-28T10:30:00+00:00', state: null },
    // Never opened: every one of theirs counts.
    { key: 'direct:b', readAt: null, state: null },
    // Marked unread by hand: no number — the mark is the fact.
    { key: 'job:c', readAt: FULLY_UNREAD_AT, state: null },
  ]);
  assert.deepEqual(counts, { 'job:a': 2, 'direct:b': 1 }, 'job:z was never asked about');

  // A CLEARED message never counts: the ONE clearedBy decides.
  const cleared = countUnseen(stamps, [
    { key: 'job:a', readAt: null, state: { cleared_before: '2026-09-28T11:00:00.000Z' } },
  ]);
  assert.deepEqual(cleared, { 'job:a': 1 }, 'at or before the watermark is out of my copy');
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

test('[static] #28 — the swipe tiles draw only in the strip the row has uncovered', () => {
  const fast = stripComments(read('components/SwipeableRow.motion120.tsx'));
  assert.match(fast, /translateX: revealWidth \+ translateX\.value/);
  assert.match(fast, /translateX: -\(revealWidth \+ translateX\.value\)/);
  assert.match(fast, /<Animated\.View style=\{\[styles\.tilesClip, \{ width: revealWidth \}, clipStyle\]\}>/);
  const shared = stripComments(read('components/SwipeableRow.shared.tsx'));
  assert.match(shared, /tilesClip: \{\s*position: 'absolute',\s*right: 0,\s*top: 0,\s*bottom: 0,\s*overflow: 'hidden',\s*\}/);
});

test('[static] #53 — the ••• opens the glass dropdown: two groups, no "…", the red rows red', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));
  assert.match(screen, /<GlassDropdown\s+request=\{menuRequest\}\s+groups=\{menuGroups\}/);
  assert.doesNotMatch(screen, /subtitle="Manage this conversation"/, 'the bottom sheet is gone');
  for (const label of ["'Mute'", "'Mark as Unread'", "'Archive'", "'Block'", "'Report'", "'Clear chat'", "'Delete chat'"]) {
    assert.ok(screen.includes(label), `the menu carries ${label}`);
  }
  assert.doesNotMatch(screen, /label: '[^']*…'/, 'no row ends in "…"');
  const menu = stripComments(read('components/GlassDropdown.tsx'));
  assert.match(menu, /<Surface material="dropdown" fill=\{paneFills\.dropdown\} radius=\{RADIUS\}/);
  assert.match(menu, /const SCREEN_EDGE = 8;/);
  assert.match(menu, /item\.destructive \? colors\.dropDanger : colors\.dropGlyph/);
});
