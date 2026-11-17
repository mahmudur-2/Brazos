import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * B2 (production-36h) — THE ADMIN QUEUE ON THE ACCESS LANE'S CALLS. The list is
 * admin_open_reports_v2(); a report is closed by dismiss_report(uuid), which answers true when it
 * closed it and false, with no error, when it was already closed: the screen then reads the list
 * again and shows no error. A ban is confirmed through lib/dialog first. lib/moderation.ts runs here
 * with its one import replaced by a stub client; the screen's handlers run as written.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) => stripTypeScriptTypes(source, { mode: 'strip' });

let js = strip(read('lib/moderation.ts'));
const IMPORT = "import { supabase } from './supabase';";
assert.ok(js.includes(IMPORT));
js = js.replace(IMPORT, () => 'const supabase = { rpc: (...args) => globalThis.__admin_reports_rpc(...args) };');
const moderation = await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));

function server(answer) {
  const calls = [];
  globalThis.__admin_reports_rpc = async (name, args) => {
    calls.push(args === undefined ? [name] : [name, args]);
    return answer;
  };
  return calls;
}

test('the list is admin_open_reports_v2(), with no arguments', async () => {
  const row = { id: 'r1', reported_id: 'u2', status: 'open' };
  const calls = server({ data: [row], error: null });
  assert.deepEqual(await moderation.fetchAdminReports(), { data: [row], error: null });
  assert.deepEqual(calls, [['admin_open_reports_v2']]);
});

test('dismiss_report answering false (already closed) is no error; true is no error; a refusal is passed on', async () => {
  let calls = server({ data: false, error: null });
  assert.deepEqual(await moderation.dismissReport('r1'), { error: null });
  assert.deepEqual(calls, [['dismiss_report', { p_report_id: 'r1' }]]);

  server({ data: true, error: null });
  assert.deepEqual(await moderation.dismissReport('r1'), { error: null });

  const refusal = { message: 'Only admins may dismiss reports', code: 'P0001' };
  server({ data: null, error: refusal });
  assert.deepEqual(await moderation.dismissReport('r1'), { error: refusal });
});

test('[static] the server contract: both calls are in the generated types; the old table write and the old list are gone', () => {
  const types = read('types/database.ts');
  assert.match(types, /admin_open_reports_v2: \{\s*Args: never/);
  assert.match(types, /dismiss_report: \{ Args: \{ p_report_id: string \}; Returns: boolean \}/);
  const lib = read('lib/moderation.ts');
  assert.doesNotMatch(lib, /rpc\('admin_open_reports'\)/);
  assert.doesNotMatch(lib, /\.from\('reports'\)\s*\.update/);
});

// The screen's handlers, as written, with their calls stubbed.
const screen = read('screens/AdminReportsScreen.tsx');
const start = screen.indexOf('  async function handleBan(report: AdminReport) {');
const end = screen.indexOf('  return (', start);
assert.ok(start > 0 && end > start, 'the three handlers');
const handlers = strip(screen.slice(start, end));
const NAMES = ['confirmAsync', 'setActioningId', 'banUser', 'unbanUser', 'dismissReport', 'alertAsync', 'userMessage', 'load'];
const build = new Function(...NAMES, `${handlers}\nreturn { handleBan, handleDismiss };`);

function run({ confirm = true, answer = { error: null } } = {}) {
  const log = [];
  const deps = {
    confirmAsync: async (o) => (log.push(`confirm ${o.title} / ${o.message} / ${o.confirmText} / destructive ${o.destructive}`), confirm),
    setActioningId: () => {},
    banUser: async (target, report) => (log.push(`ban ${target} ${report}`), answer),
    unbanUser: async () => answer,
    dismissReport: async (id) => (log.push(`dismiss ${id}`), answer),
    alertAsync: async (title) => log.push(`alert ${title}`),
    userMessage: (e) => e.message,
    load: async () => log.push('reload list'),
  };
  return { ...build(...NAMES.map((n) => deps[n])), log };
}
const REPORT = { id: 'r1', reported_id: 'u2', reported_name: 'Sam' };

test('a dismiss of a report that was already closed reloads the list and shows no error', async () => {
  const r = run();
  await r.handleDismiss(REPORT);
  assert.deepEqual(r.log, ['dismiss r1', 'reload list']);

  const refused = run({ answer: { error: { message: 'Only admins may dismiss reports' } } });
  await refused.handleDismiss(REPORT);
  assert.deepEqual(refused.log, ['dismiss r1', 'alert Could not dismiss']);
});

// T1: each clause as ban_user does it; nobody is signed out any more (B1: the suspended screen).
const BAN_ASK =
  'confirm Ban Sam? / This suspends their account. They can no longer post, bid or message. ' +
  'Their unfinished jobs are cancelled, and their phone number cannot be used for a new account. / Ban / destructive true';

test('a ban asks first through lib/dialog, in the T1 words; Cancel bans nobody', async () => {
  const cancelled = run({ confirm: false });
  await cancelled.handleBan(REPORT);
  assert.deepEqual(cancelled.log, [BAN_ASK]);

  const r = run();
  await r.handleBan(REPORT);
  assert.deepEqual(r.log, [BAN_ASK, 'ban u2 r1', 'reload list']);
  assert.doesNotMatch(screen, /signed out/);
  assert.match(screen, /import \{ alertAsync, confirmAsync \} from '\.\.\/lib\/dialog';/);
  assert.doesNotMatch(screen, /\bAlert\./);
});

// T2: the reported review or message, quoted under its label; nothing for the other kinds or no text.
test('the report card quotes a reported review or message as the server sent it, and nothing else', () => {
  const long = 'x'.repeat(200);
  assert.deepEqual(moderation.reportSubject({ subject_kind: 'review', subject_text: 'Never showed up.' }), { label: 'Reported Review', text: 'Never showed up.' });
  assert.deepEqual(moderation.reportSubject({ subject_kind: 'message', subject_text: long }), { label: 'Reported Message', text: long }, 'not cut again');
  for (const kind of ['review', 'message']) {
    assert.equal(moderation.reportSubject({ subject_kind: kind, subject_text: null }), null, `${kind} with no text`);
    assert.equal(moderation.reportSubject({ subject_kind: kind, subject_text: '' }), null, `${kind} with empty text`);
  }
  // A job's text is its title, already on the card; a profile or a portfolio item has none.
  assert.equal(moderation.reportSubject({ subject_kind: 'job', subject_text: 'Rake and bag the front yard' }), null);
  assert.equal(moderation.reportSubject({ subject_kind: 'profile', subject_text: null }), null);
  assert.equal(moderation.reportSubject({ subject_kind: 'portfolio_item', subject_text: null }), null);
  assert.equal(moderation.reportSubject({ subject_kind: null, subject_text: null }), null, 'an old report with no subject');

  const card = screen.replace(/\s+/g, ' ');
  assert.match(card, /const subject = reportSubject\(item\);/);
  assert.match(card, /\{subject \? \( <> <Text style=\{styles\.job\} numberOfLines=\{1\}> \{subject\.label\} <\/Text> <Card level="well" style=\{styles\.quote\}> <Text style=\{styles\.description\}>“\{subject\.text\}”<\/Text> <\/Card> <\/> \) : null\}/);
});
