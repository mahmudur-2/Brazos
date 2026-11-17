// production-36h S1, A14-F (F5): the access lane's written limits are written where a later reader
// looks: the header of the migration that holds the behaviour, and docs/ARCHITECTURE.md for the
// cleanup's view. Each check reads the words, folded to single spaces with the SQL comment marks
// removed, so a new line break changes nothing and a lost sentence fails. The file:line a header
// names in the approved Terms is read too, so the reference stays true. Red control: the files
// before A14-F (F5) fail every test here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const fold = (text) => text.replace(/\s+/g, ' ').trim();

/** A migration's header: its comment lines before the first line that is only "begin;". */
function header(path) {
  const lines = read(path).split('\n');
  const end = lines.indexOf('begin;');
  assert.ok(end > 0, `${path} has a header before begin;`);
  return fold(lines.slice(0, end).map((line) => line.replace(/^--\s?/, '')).join(' '));
}

const has = (text, words, where) => assert.ok(text.includes(words), `${where} says: ${words}`);

const BAN = 'supabase/migrations/20261116400200_ban_switch.sql';
const GUARD = 'supabase/migrations/20261116400500_active_account_rule.sql';
const DELETION = 'supabase/migrations/20261116410000_account_deletion_process.sql';
const DOC = 'docs/ARCHITECTURE.md';

test('F5 (a), (b): the deletion file names the cleanup view, who reads it, that it is not on the payment list, and the speed', () => {
  const text = header(DELETION);
  for (const words of [
    'account_cleanup_attention lists every cleanup row not finished whose customer step has been open for 1 hour.',
    'Only the service role can read it: no client role, and no admin in the app.',
    'It is NOT part of payment_attention, so the owner\'s payment list does not show it and nothing pushes it',
    'the settlements run (every 5 minutes) gives the cleanup at most one row, and only in a quiet run',
    'while the money passes use the run, it gets none',
    'A row whose step is still open 1 hour after it was opened gets its line on this view.',
  ]) has(text, words, DELETION);
});

test('F5 (a), (b): docs/ARCHITECTURE.md names the view, its readers, that it is not on the payment list, and the speed', () => {
  const text = fold(read(DOC));
  for (const words of [
    'at most one row a run (every 5 minutes), and only in a quiet run',
    'while the money passes use the run, none.',
    'A row whose customer step is still open after 1 hour gets a line on `account_cleanup_attention`.',
    'Only the service role can read that view (no client role, no admin in the app), and it is not part of `payment_attention`',
    '`account_cleanup_attention` (service_role; not part of `payment_attention`)',
  ]) has(text, words, DOC);
});

test('F5 (c): the ban file says a suspended worker\'s finished job follows the normal approval and payout, and where Terms stops', () => {
  const text = header(BAN);
  for (const words of [
    'WRITTEN LIMIT (A14-F, C14-05): a suspended worker\'s FINISHED job (completed, its payment still held) is not touched by the ban.',
    'It follows the normal approval (the customer\'s own, or the automatic one) and the normal payout',
    'Terms section 12 (lib/legal/termsOfService.ts:349-353) speaks only of unfinished jobs.',
  ]) has(text, words, BAN);
  // The approved sentence is where the header says it is.
  const terms = read('lib/legal/termsOfService.ts').split('\n').slice(348, 353).join(' ');
  assert.match(fold(terms), /When an account is suspended, its unfinished jobs are cancelled/);
});

test('F5 (d): the ban file says the lock cycle ends cleanly and gives the recipe that closes it', () => {
  const text = header(BAN);
  for (const words of [
    'WRITTEN LIMIT (A14-F, C14-06), that one cycle: its end is clean.',
    'a deadlock error (40P01) and rolls the whole of it back: no money moves, no row is half-written',
    'in withdraw_offer() and decline_offer(), after the guard, read the offer without a lock, read the job its thread line will name',
    'take that job\'s key-share lock (select 1 from jobs where id = that job for key share), and only then the offer\'s row lock',
    'Every path then locks the job before the offer.',
  ]) has(text, words, BAN);
});

test('F5 (e): the fingerprint reads two printed texts and is blind to grants, owner, comment, cost and prosqlbody; proof (d) has its limit', () => {
  const ban = header(BAN);
  for (const words of [
    'this corrects the wording "never printed function text"): two of those values ARE printed text.',
    'pg_get_function_arguments() and pg_get_function_result() deparse the catalog',
    'The fingerprint is blind to the grants (proacl), the owner, the comment, the cost and prosqlbody',
  ]) has(ban, words, BAN);
  const guard = header(GUARD);
  for (const words of [
    'WRITTEN LIMIT (A14-F, C14-07): (d) reads each policy\'s expression as printed text and asks only that it CALLS is_active_user()',
    '(true or (select is_active_user())) would pass',
    'it reads tables only (relkind r and p), never a view.',
  ]) has(guard, words, GUARD);
});
