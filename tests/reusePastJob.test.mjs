// 2026-09-30 (the build run, idea 2) — REUSE A PAST JOB: in the + sheet, a row closed until tapped,
// then a strip of compact cards; a card opens a fresh post on its Review step, filled from that job.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  REUSABLE_STATUSES,
  REUSE_CARD_MAX,
  REUSE_CARD_MIN,
  reusableJobs,
  reuseCardFigure,
  reuseCardInstant,
  reuseCardWidth,
} from '../lib/reuseJobs.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

const job = (id, status, created_at, completed_at = null) => ({ id, status, created_at, completed_at });

test('[executed] offered: the jobs past or taken, the most recent first — never a draft, never one still open', () => {
  assert.deepEqual([...REUSABLE_STATUSES], ['assigned', 'in_progress', 'completed', 'cancelled']);
  const posted = [
    job('open', 'open', '2026-09-29T10:00:00Z'),
    job('draft', 'draft', '2026-09-29T11:00:00Z'),
    job('old-done', 'completed', '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z'),
    job('hired', 'assigned', '2026-09-20T10:00:00Z'),
    job('recent-done', 'completed', '2026-09-10T10:00:00Z', '2026-09-25T10:00:00Z'),
    job('cancelled', 'cancelled', '2026-09-15T10:00:00Z'),
    job('mystery', 'someday', '2026-09-28T10:00:00Z'),
  ];
  assert.deepEqual(
    reusableJobs(posted).map((j) => j.id),
    ['recent-done', 'hired', 'cancelled', 'old-done'],
    'finished jobs sort by when they were finished; the rest by when they were posted'
  );
  assert.equal(reuseCardInstant(posted[2]), '2026-09-03T10:00:00Z');
  assert.equal(reuseCardInstant(posted[3]), '2026-09-20T10:00:00Z');
});

test('[executed] a card is just wide enough for its title in three lines, from 128 to 160', () => {
  assert.equal(REUSE_CARD_MIN, 128);
  assert.equal(REUSE_CARD_MAX, 160);
  assert.equal(reuseCardWidth('Fix a door', 22), 128, 'a short title takes the least');
  assert.equal(reuseCardWidth('Mount three floating shelves in the hallway', 22), 128);
  const medium = reuseCardWidth('Deep clean a two-bedroom flat before the inspection', 22);
  assert.ok(medium > 128 && medium < 160, `a longer title widens a little: ${medium}`);
  assert.equal(reuseCardWidth('x'.repeat(80), 22), 160, 'never past 160');
});

test('[executed] the card\'s price is the budget the new post carries, else none', () => {
  // Group 2's review: a card reading the hired price opened a post carrying a different one.
  const none = { budget_cents: null, budget_min_cents: null, budget_max_cents: null };
  assert.equal(reuseCardFigure({ ...none, budget_cents: 9000 }), 'budget');
  assert.equal(reuseCardFigure({ ...none, budget_max_cents: 12000 }), 'budget');
  assert.equal(reuseCardFigure(none), null, 'no figure is made up');
});

test('[static] the sheet: one read per opening, the row closed until tapped, the compact cards', () => {
  const sheet = flat(read('components/CreateSheet.tsx'));
  // One batched read per opening, shared with Needs you; neither shows the last opening's jobs.
  assert.equal((sheet.match(/useMyJobsHub\(\)/g) ?? []).length, 1);
  assert.match(sheet, /setHubReady\(false\); void refresh\(\)\.then\(\(\) => \{ if \(alive\) setHubReady\(true\); \}\);/);
  assert.match(sheet, /<NeedsYou hub=\{hub\} ready=\{hubReady\} onOpen=\{onOpenJob\} \/>/);
  // Under the first action, and closed until tapped.
  assert.match(sheet, /\{index === 0 && onReuseJob \? \( <ReusePastJob hub=\{hub\} ready=\{hubReady\} visible=\{visible\} onPick=\{onReuseJob\} \/> \) : null\}/);
  assert.match(sheet, /const \[open, setOpen\] = useState\(false\);/);
  assert.match(sheet, /accessibilityLabel="Reuse a past job" accessibilityHint="Start from one you posted before" accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(sheet, /<DropdownBody open=\{open\} grow>/);
  // The compact card: as wide as its title needs in 128–160, three lines at most, the price at the bottom right.
  assert.match(sheet, /\{ width: reuseCardWidth\(job\.title, 2 \* \(spacing\.md - 1\)\) \}/);
  assert.match(sheet, /<Text style=\{styles\.cardTitle\} numberOfLines=\{3\}>/);
  assert.match(sheet, /cardPrice: \{ alignSelf: 'flex-end',/);
  assert.match(sheet, /const price = figure === 'budget' \? budgetRangeLabel\(job\) : null;/);
  // A failed read is absent, never "nothing to reuse".
  assert.match(sheet, /\) : hub\.error \? null : jobs\.length === 0 \? \(/);
  // The tree routes; the sheet only draws.
  const tree = flat(read('navigation/CustomerRoot.tsx'));
  assert.match(tree, /onReuseJob=\{\(job\) => runCreateAction\(\(\) => navigateAcrossTabs\('Home', 'PostJob', \{ reuseJobId: job\.id \}\)\) \}/);
});

test('[static] the post: a NEW job, filled from the old one, on its Review step — no schedule, no media', () => {
  const screen = read('screens/PostJobScreen.tsx');
  assert.match(screen, /const reuseJobId = !isEditing && !params\?\.hireWorkerId \? params\?\.reuseJobId \?\? null : null;/);
  const load = screen.slice(screen.indexOf('if (!reuseJobId) return;'), screen.indexOf('}, [reuseJobId]);'));
  assert.ok(load.length > 200, 'the reuse load exists');
  for (const copied of ['setTitle(job.title)', 'setDescription(job.description)', 'setCategory(job.category)', 'setLocation(job.location', 'setPricingMode(pricingModeFrom(job.pricing_mode))', "setAddress(loc.address_line ?? '')", 'setStep(POST_STEPS.length - 1)']) {
    assert.ok(load.includes(copied), `copies: ${copied}`);
  }
  for (const kept of ['setScheduledDate', 'setArrivalStartHour', 'setPhotos', 'setVideos', 'sessionUploadsRef', 'originalPhotosRef']) {
    assert.ok(!load.includes(kept), `never copies: ${kept}`);
  }
  // The Fable review: the source on its own line, the instruction whole under it.
  assert.match(screen, /\? 'Change anything, or just Publish\.'/);
  assert.match(screen, /\? `Copied from “\$\{reusedFrom\}”` : null;/);
  // Group 2's review: a reuse never touches the draft slot and offers no "Save draft"; and it is
  // its own screen — keyed by the job it copies — never a rewrite of a post already open.
  assert.match(screen, /const usesDraft = isFreshPost && !reuseJobId;/);
  assert.match(flat(screen), /secondary=\{ usesDraft \? \{ label: 'Save draft'/);
  assert.match(flat(read('navigation/CustomerRoot.tsx')), /<CustomerHomeStack\.Screen name="PostJob" component=\{PostJobScreen\} getId=\{\(\{ params \}\) => params\?\.reuseJobId\} \/>/);
});
