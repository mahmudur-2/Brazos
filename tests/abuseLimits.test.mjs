// B10 (docs/lean/AUDIT-LEDGER.md): the text caps and the per-account rates. The behaviour is proven
// on the database (supabase/tests/410_abuse_limits.sql); this fences the two migrations' shape, keeps
// the app's input limits equal to the server's caps, and runs every refusal sentence through the
// app's own error mapper, which must show it as written.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const caps = read('supabase/migrations/20261112032000_text_caps.sql');
const rates = read('supabase/migrations/20261112032500_rate_limits.sql');

globalThis.__DEV__ = false; // what a user of a release build sees
const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);

const CAP_SENTENCES = [
  'That message is too long. Keep it under 2,000 characters.',
  'That report is too long. Keep it under 2,000 characters.',
];
const RATES = [
  // table, action, maximum, window, owner column, sentence
  ['messages', 'message', 30, '1 minute', 'sender_id', 'You’re sending messages too fast. Wait a minute and try again.'],
  ['jobs', 'job_post', 10, '1 hour', 'client_id', 'You’ve posted a lot of jobs in the last hour. Try again later.'],
  ['job_offers', 'offer', 30, '1 hour', 'author_id', 'You’ve sent a lot of offers in the last hour. Try again later.'],
  ['reports', 'report', 10, '1 day', 'reporter_id', 'You’ve sent a lot of reports. Try again later.'],
];
// SQL writes the apostrophe as '' inside a literal; the sentences above use the typographic one only
// for readability here, so compare on the plain one.
const plain = (s) => s.replace(/’/g, "'");
const sqlLiteral = (s) => plain(s).replace(/'/g, "''");

test('B10 · a message and a report description hold at most 2,000 characters, and the app stops typing there', () => {
  assert.match(caps, /create or replace trigger messages_content_length\s+before insert or update of content on public\.messages\s+for each row execute function public\.reject_overlong_text\(\s*'content', '2000', 'That message is too long\. Keep it under 2,000 characters\.'\);/);
  assert.match(caps, /create or replace trigger reports_description_length\s+before insert or update of description on public\.reports\s+for each row execute function public\.reject_overlong_text\(\s*'description', '2000', 'That report is too long\. Keep it under 2,000 characters\.'\);/);
  assert.match(caps, /if tg_op = 'UPDATE' and v_text is not distinct from \(to_jsonb\(old\) ->> tg_argv\[0\]\) then/, 'an unchanged legacy row is not judged');
  assert.doesNotMatch(caps.slice(caps.indexOf('create or replace function public.reject_overlong_text'), caps.indexOf('as $$')), /security definer/i);
  assert.match(caps, /revoke all on function public\.reject_overlong_text\(\) from public, anon, authenticated, service_role;/);

  assert.match(read('components/ChatComposer.tsx'), /export const CHAT_MESSAGE_MAX = 2000;/);
  assert.match(read('lib/moderation.ts'), /export const REPORT_DESCRIPTION_MAX = 2000;/);
  const dialog = read('components/ReportDialog.tsx');
  assert.match(dialog, /import \{ REPORT_DESCRIPTION_MAX, type ReportSubject \} from '\.\.\/lib\/moderation';/);
  assert.match(dialog, /<TextField\s+label="What happened\? \(optional\)"[\s\S]*?maxLength=\{REPORT_DESCRIPTION_MAX\}[\s\S]*?\/>/);
});

test('B10 · the four rates, each on its owner column, with its sentence', () => {
  for (const [table, action, max, window, owner, sentence] of RATES) {
    const at = rates.indexOf(`before insert on public.${table}\n`);
    assert.ok(at > 0, `a before-insert limit on ${table}`);
    const trigger = rates.slice(at, rates.indexOf(');', at));
    assert.ok(
      trigger.includes(`'${action}', '${max}', '${window}', '${owner}',`),
      `${table}: ${action}, ${max} per ${window}, counted on ${owner}`,
    );
    assert.ok(trigger.includes(`'${sqlLiteral(sentence)}'`), `${table}: the sentence`);
  }
  assert.match(rates, /before insert on public\.messages\n\s+for each row\n\s+when \(new\.job_offer_id is null\)/, 'an offer card is not a message the person typed');
  assert.match(rates, /before insert on public\.jobs\n\s+for each row\n\s+when \(new\.visibility = 'open_market'\)/, 'a direct offer’s draft job is not a post');
});

test('B10 · only a person’s own write counts, and the schedule’s repeat visits never do', () => {
  const fn = rates.slice(rates.indexOf('create or replace function public.enforce_rate_limit()'), rates.indexOf('revoke all on function public.enforce_rate_limit()'));
  assert.match(fn, /if v_user is null or \(to_jsonb\(new\) ->> tg_argv\[3\]\) is distinct from v_user::text then\s+return new;/);
  assert.match(fn, /get diagnostics v_stack = pg_context;\s+if v_stack ~ 'series_\(open\|offer\)_visit\\\(' then\s+return new;/);
  assert.match(fn, /raise exception using errcode = 'P0001', message = tg_argv\[4\];/);
  // The two functions the regex names are the ones that act as the customer.
  const series = read('supabase/migrations/20260930001000_job_series.sql');
  assert.match(series, /create or replace function public\.series_offer_visit\(p_series public\.job_series, p_visit date\)/);
  assert.match(series, /create or replace function public\.series_open_visit\(p_series public\.job_series, p_visit date, p_passed_by uuid\)/);
});

test('B10 · one private counter row per account and action, nothing to clean up', () => {
  assert.match(rates, /primary key \(user_id, action\)/);
  assert.match(rates, /alter table public\.rate_counters enable row level security;/);
  assert.match(rates, /revoke all on table public\.rate_counters from public, anon, authenticated, service_role;/);
  assert.match(rates, /on conflict \(user_id, action\) do update\s+set hits = case when c\.window_start = excluded\.window_start then c\.hits \+ 1 else 1 end,\s+window_start = excluded\.window_start/);
  assert.match(rates, /revoke all on function public\.rate_limit_take\(uuid, text, integer, interval\) from public, anon, authenticated, service_role;\s+grant execute on function public\.rate_limit_take\(uuid, text, integer, interval\) to service_role;/);
  assert.match(rates, /revoke all on function public\.enforce_rate_limit\(\) from public, anon, authenticated, service_role;/);
  for (const sql of [caps, rates]) {
    assert.doesNotMatch(sql, /drop |rename |truncate|delete from/i, 'nothing the staging scan stops on');
  }
});

test('B10 · every refusal reaches the person as written', () => {
  for (const sentence of [...CAP_SENTENCES, ...RATES.map((r) => plain(r[5]))]) {
    assert.equal(userMessage({ message: sentence, code: 'P0001' }), sentence);
  }
});
