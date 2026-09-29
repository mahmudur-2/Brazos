// 2026-09-29 (LUX-LIST-2 #8) — the feed's day groups and the one fold it makes: two or more
// `bid_received` on the same job on the same day become ONE row, worded from the rows' own text.
import assert from 'node:assert/strict';
import test from 'node:test';

const { groupFeed, feedDayLabel } = await import('../lib/notificationGroups.ts');

const NOW = new Date(2026, 8, 29, 15, 0, 0); // 29 Sep 2026, 3 pm local
const at = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * 3600e3).toISOString();
const row = (id, type, title, body, jobId, hoursAgo, read = false) => ({
  id,
  recipient_id: 'me',
  category: 'x',
  type,
  title,
  body,
  data: jobId ? { screen: 'ClientJobDetail', jobId } : {},
  read_at: read ? at(hoursAgo) : null,
  created_at: at(hoursAgo),
});

test('day labels follow the local calendar: Today, Yesterday, This week, Earlier', () => {
  assert.equal(feedDayLabel(at(1), NOW), 'Today');
  assert.equal(feedDayLabel(at(20), NOW), 'Yesterday');
  assert.equal(feedDayLabel(at(24 * 4), NOW), 'This week');
  assert.equal(feedDayLabel(at(24 * 9), NOW), 'Earlier');
});

test('two bids on one job the same day fold into ONE row, worded from the trigger’s own text', () => {
  const groups = groupFeed(
    [
      row('a', 'bid_received', 'New bid on Assemble a sofa', 'Priya Natarajan bid $135.00', 'sofa', 1.2),
      row('b', 'bid_received', 'New bid on Assemble a sofa', 'Sam Okafor bid $120.00', 'sofa', 2.5),
      row('c', 'message', 'Dana Whitfield', 'The buzzer code is 2B.', 'wardrobe', 2, true),
    ],
    NOW,
  );
  assert.deepEqual(groups.map((g) => g.label), ['Today']);
  const [bids, message] = groups[0].entries;
  assert.equal(bids.title, '2 new bids on your job');
  assert.equal(bids.body, 'Priya Natarajan $135.00 · Sam Okafor $120.00 on Assemble a sofa.');
  assert.equal(bids.lead.id, 'a', 'the newest row leads: its time and its route');
  assert.deepEqual(bids.rows.map((r) => r.id), ['a', 'b']);
  assert.equal(bids.unread, true);
  assert.equal(message.title, 'Dana Whitfield', 'a message is never folded');
});

test('nothing else folds: one bid stays one row; other jobs, other days and other types stay apart', () => {
  const groups = groupFeed(
    [
      row('a', 'bid_received', 'New bid on Sofa', 'Priya bid $135.00', 'sofa', 1),
      row('b', 'bid_received', 'New bid on TV', 'Sam bid $90.00', 'tv', 2),
      row('c', 'bid_received', 'New bid on Sofa', 'Dana bid $150.00', 'sofa', 30),
      row('d', 'offer_countered', 'Countered', 'x', 'sofa', 3),
    ],
    NOW,
  );
  assert.deepEqual(groups.map((g) => [g.label, g.entries.map((e) => e.rows.length)]), [
    ['Today', [1, 1, 1]],
    ['Yesterday', [1]],
  ]);
  assert.equal(groups[0].entries[0].title, 'New bid on Sofa', 'a single row keeps its own words');
});

test('a folded row is read only when every row in it is read; a body that does not parse is kept whole', () => {
  const [group] = groupFeed(
    [
      row('a', 'bid_received', 'Odd title', 'Something else', 'sofa', 1, true),
      row('b', 'bid_received', 'Odd title', 'Sam Okafor bid $120.00', 'sofa', 2, true),
    ],
    NOW,
  );
  const [entry] = group.entries;
  assert.equal(entry.unread, false);
  assert.equal(entry.title, '2 new bids on your job');
  assert.equal(entry.body, 'Something else · Sam Okafor $120.00');
});
