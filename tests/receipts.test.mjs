// 2026-09-30 (the build run, idea 8) — THE RECEIPT: after a release, the customer's "Receipt" and the
// worker's "You've been paid", as drawn (the record's §3, full-list demos M1 and M2). The builder is
// executed here — the same file the send-receipts edge function imports — and the function's own
// rules are fenced statically. The ledger side is proven in supabase/tests/190_receipts.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_LABELS,
  CLOSING_LINE,
  buildReceipt,
  cardLabel,
  escapeHtml,
  jobNumberLabel,
  money,
} from '../supabase/functions/send-receipts/receipt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// The drawn job: $80 agreed, 7.5% on each side — $86 charged, $74 to the worker.
const DETAILS = {
  job_number: 186,
  title: 'Move a dresser down two flights',
  category: 'moving',
  location: 'Park Slope, Brooklyn, NY',
  posted_at: '2026-09-10T14:00:00Z',
  hired_at: '2026-09-12T15:00:00Z',
  held_at: '2026-09-12T15:05:00Z',
  completed_at: '2026-09-29T12:50:00Z',
  released_at: '2026-09-29T13:40:00Z',
  release_reason: 'approved',
  provider: 'stripe',
  agreed_cents: 8000,
  protection_fee_cents: 600,
  tax_cents: 0,
  charged_cents: 8600,
  worker_fee_cents: 600,
  worker_fee_bps: 750,
  paid_to_worker_cents: 7400,
  customer_name: 'Dana Whitfield',
  worker_name: 'Priya Natarajan',
  offer_by_worker: true,
  offer_cents: 8000,
  offered_at: '2026-09-11T16:00:00Z',
};

test('[executed] the customer\'s receipt, as drawn: the band, the amount, the facts, what happened, the lines, one closing line', () => {
  const r = buildReceipt(DETAILS, 'customer', { card: cardLabel('visa', '4242') });
  assert.equal(r.subject, 'Receipt #BZ-0186 · Move a dresser down two flights');
  assert.equal(
    r.text,
    [
      'Receipt · #BZ-0186',
      'Move a dresser down two flights',
      '',
      '$86.00',
      'Released to Priya Natarajan on Sep 29, 2026, after you approved the work.',
      '',
      'Worker: Priya Natarajan',
      'Paid with: Visa ···· 4242',
      'Category · area: Moving · Park Slope',
      'Hired: Sep 12, 2026',
      '',
      'What happened',
      '- Posted — Sep 10',
      '- Hired Priya · $86 held in protection — Sep 12',
      '- Work marked complete — Sep 29, 8:50 AM',
      '- You approved · released to Priya — Sep 29, 9:40 AM',
      '',
      'Agreed price: $80.00',
      'Protection fee: $6.00',
      'Amount charged: $86.00',
      '',
      'Questions? Reply to this email and quote the job number.',
    ].join('\n')
  );
  for (const piece of ['#BZ-0186', '$86.00', 'Released to Priya Natarajan on Sep 29, 2026, after you approved the work.', 'What happened', 'Amount charged', CLOSING_LINE]) {
    assert.ok(r.html.includes(escapeHtml(piece)), `the HTML says ${piece}`);
  }
  // The operator's cuts: no link into the app, no provider receipt number, no fee explanation.
  assert.doesNotMatch(r.html, /href=|brazos:\/\/|https?:\/\//i, 'no link of any kind');
  assert.doesNotMatch(r.html, /pi_|ch_|receipt number|what (?:the )?protection/i);
  assert.equal(r.html.split(CLOSING_LINE).length, 2, 'the closing line, once');
});

test('[executed] the worker\'s receipt: "You\'ve been paid", what moved to them, the fee with its rate', () => {
  const r = buildReceipt(DETAILS, 'worker');
  assert.equal(r.subject, 'You’ve been paid · #BZ-0186 · Move a dresser down two flights');
  assert.equal(
    r.text,
    [
      'You’ve been paid · #BZ-0186',
      'Move a dresser down two flights',
      '',
      '$74.00',
      'Released to you on Sep 29, 2026, after Dana approved the work. It arrives with your next payout.',
      '',
      'Customer: Dana Whitfield',
      'Category · area: Moving · Park Slope',
      'Hired: Sep 12, 2026',
      '',
      'What happened',
      '- You bid $80 — Sep 11',
      '- Hired · payment held in protection — Sep 12',
      '- You marked the work complete — Sep 29, 8:50 AM',
      '- Dana approved · released to you — Sep 29, 9:40 AM',
      '',
      'Agreed price: $80.00',
      'Brazos fee (7.5%): −$6.00',
      'Paid to you: $74.00',
      '',
      'Questions? Reply to this email and quote the job number.',
    ].join('\n')
  );
});

test('[executed] honest to the ledger: an automatic release says so, a customer\'s own offer says so, nothing is invented', () => {
  const auto = buildReceipt({ ...DETAILS, release_reason: 'auto_approved' }, 'customer');
  assert.match(auto.text, /Released to Priya Natarajan on Sep 29, 2026, after the approval window closed\./);
  assert.match(auto.text, /- Approved automatically · released to Priya — /);
  assert.doesNotMatch(auto.text, /Paid with/, 'no card read, no card line');
  const offered = buildReceipt({ ...DETAILS, offer_by_worker: false }, 'worker');
  assert.match(offered.text, /- Dana offered \$80 — Sep 11/);
  // The Fable review: the customer's all-in charge never appears on the worker's receipt.
  assert.doesNotMatch(buildReceipt(DETAILS, 'worker').text, /\$86/);
  const unknown = buildReceipt({ ...DETAILS, offer_by_worker: null, completed_at: null }, 'worker');
  assert.doesNotMatch(unknown.text, /You bid|offered|marked the work complete/, 'a step with no instant is left out');
  assert.throws(() => buildReceipt({ ...DETAILS, charged_cents: null }, 'customer'), /charged_cents is missing/);
  assert.throws(() => buildReceipt({ ...DETAILS, job_number: null }, 'worker'), /job_number is missing/);
  assert.throws(() => buildReceipt(DETAILS, 'someone'), /unknown side/);
  // The group 4 review: a dispute ruled for the worker says so, never "you approved"; a reason no
  // receipt can explain is refused; the fee's rate shows only when it is the fee charged.
  const ruled = buildReceipt({ ...DETAILS, release_reason: 'dispute_resolved' }, 'customer');
  assert.match(ruled.text, /after the dispute was resolved\./);
  assert.match(ruled.text, /- Dispute resolved · released to Priya — /);
  assert.doesNotMatch(ruled.text, /approved/);
  assert.match(buildReceipt({ ...DETAILS, release_reason: 'dispute_resolved' }, 'worker').text, /- Dispute resolved · released to you — /);
  assert.throws(() => buildReceipt({ ...DETAILS, release_reason: 'cancellation_fee' }, 'customer'), /release_reason/);
  const small = buildReceipt({ ...DETAILS, agreed_cents: 1000, worker_fee_cents: 100, paid_to_worker_cents: 900, charged_cents: 1075, protection_fee_cents: 75 }, 'worker');
  assert.match(small.text, /Brazos fee: −\$1\.00/, 'the minimum fee, with no rate beside it');
});

test('[executed] the small rules: the number, the money, the card, and every person-written string escaped', () => {
  assert.equal(jobNumberLabel(186), 'BZ-0186');
  assert.equal(jobNumberLabel(12345), 'BZ-12345', 'a longer number is never cut');
  assert.equal(jobNumberLabel(0), null);
  assert.equal(money(8600), '$86.00');
  assert.equal(money(-600), '−$6.00');
  assert.equal(money(123456), '$1,234.56');
  assert.equal(cardLabel('mastercard', '4444'), 'Mastercard ···· 4444');
  assert.equal(cardLabel('visa', '42'), null, 'never a guessed card');
  const hostile = buildReceipt({ ...DETAILS, title: '<img src=x onerror=alert(1)>', worker_name: 'Sam "&" <b>' }, 'customer');
  assert.doesNotMatch(hostile.html, /<img src=x|<b>/);
  assert.match(hostile.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('[static] the category words are the app\'s own, word for word', () => {
  const jobs = read('lib/jobs.ts');
  const block = jobs.slice(jobs.indexOf('export const JOB_CATEGORY_LABELS'), jobs.indexOf('};', jobs.indexOf('export const JOB_CATEGORY_LABELS')));
  const app = Object.fromEntries([...block.matchAll(/^\s*(\w+): '([^']+)',/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(CATEGORY_LABELS, app);
});

test('[static] the function: service role only, skipped and logged without the key, the test inbox, no package', () => {
  const fn = read('supabase/functions/send-receipts/index.ts');
  // lean E4 (B3): the constant-time shared gate, fenced in tests/edgeServiceAuth.test.mjs.
  assert.match(fn, /const refused = requireServiceRole\(req\);\s*if \(refused\) return refused;/);
  assert.match(fn, /if \(!RESEND_API_KEY\) \{[\s\S]*?await resolve\(row, 'skipped', 'no email service key on this project yet'\);/);
  assert.match(fn, /const to = RECEIPT_TEST_TO \|\| \(await recipientEmail\(row\.recipient_id\)\);/);
  assert.match(fn, /subject: RECEIPT_TEST_TO \? `\[Test\] \$\{message\.subject\}` : message\.subject,/);
  assert.match(fn, /'Idempotency-Key': `receipt-\$\{row\.id\}`,/);
  const imports = [...fn.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../_shared/serviceAuth.ts', './receipt.mjs'], 'plain fetch, no npm package');
  const sql = read('supabase/migrations/20260930001100_receipts.sql');
  assert.match(sql, /when \(new\.status = 'released' and old\.status is distinct from 'released'\s*and new\.kind = 'job_payment' and new\.provider in \('stripe'\)\)/, 'a sandbox payment moved no money: no receipt');
  assert.match(sql, /constraint receipt_outbox_one_per_side unique \(payment_id, role\)/);
  assert.match(sql, /where status = 'pending' and attempts < 5 and \(next_attempt_at is null or next_attempt_at <= now\(\)\)\s*\) then\s*return null;/);
  // The group 4 review: a retry waits (backoff), an overlapping run never overwrites 'sent', only a
  // missing account skips, and without a sender of its own nothing is tried.
  assert.match(sql, /next_attempt_at = case when p_status = 'pending' then now\(\) \+ make_interval\(mins => 5 \* greatest\(attempts, 1\)\) end/);
  assert.match(sql, /where id = p_id\s*and status = 'pending';/);
  assert.match(fn, /if \(res\.status === 404\) return null;\s*if \(!res\.ok\) throw new Error/);
  assert.match(fn, /if \(!RECEIPT_FROM_SET && !RECEIPT_TEST_TO\) \{/);
  assert.match(read('supabase/tests/190_receipts.sql'), /select plan\(23\);/);
});

// Codex R2-A2: a payment no longer released when the sender reads it (a reversal after the claim)
// leaves its receipt pending under the lease, never failed; 440_outbox_claim_lease.sql §7 proves the
// claim takes it again after the release. Codex R3: the decision is EXECUTED, not matched as text: the
// handler's own body runs under node (intentCancel.test.mjs's way): its imports are swapped for stubs
// (receipt.mjs's real exports among them), its types stripped, Deno.serve hands over the handler, and
// a fake fetch answers the database, the auth API and the email service. Test values only.
test('a payment not released when the sender reads it waits: no email request and no resolve call', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  const source = read('supabase/functions/send-receipts/index.ts').replace(/\r\n/g, '\n');
  globalThis.__rcStubs = {
    buildReceipt, cardLabel, notConfigured: () => null, requireServiceRole: () => null,
    SECRET_KEY: 'service-for-the-test', serviceHeaders: () => ({ 'Content-Type': 'application/json' }),
  };
  const js = stripTypeScriptTypes(
    source.replace(/^import \{([^}]*)\} from '([^']+)';$/gm, (_, names) => `const {${names}} = globalThis.__rcStubs;`), { mode: 'strip' });
  const ENV = { SUPABASE_URL: 'http://supabase.test', RESEND_API_KEY: 'resend-for-the-test', RECEIPT_FROM: 'Brazos <receipts@brazos.test>' };
  let handler = null;
  globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
  await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));

  const DB = `${ENV.SUPABASE_URL}/rest/v1/rpc`;
  const run = async (details) => {
    const calls = [];
    const original = globalThis.fetch;
    const log = console.log;
    globalThis.fetch = async (url) => {
      const at = String(url);
      calls.push(at);
      if (at === `${DB}/claim_receipt_batch`) {
        const first = calls.filter((c) => c === at).length === 1;
        return Response.json(first ? [{ id: 'rc-1', payment_id: 'pay-1', job_id: 'job-1', recipient_id: 'u-1', role: 'worker', attempts: 1 }] : []);
      }
      if (at === `${DB}/receipt_details`) return Response.json(details);
      if (at === `${DB}/resolve_receipt`) return new Response(null, { status: 204 });
      if (at.startsWith(`${ENV.SUPABASE_URL}/auth/v1/admin/users/`)) return Response.json({ email: 'worker@brazos.test' });
      if (at === 'https://api.resend.com/emails') return Response.json({ id: 'em-1' });
      return new Response('unexpected', { status: 599 });
    };
    console.log = () => {};
    try {
      const res = await handler(new Request('http://edge.test/send-receipts', { method: 'POST' }));
      return { json: await res.json(), calls };
    } finally {
      console.log = log;
      globalThis.fetch = original;
    }
  };
  const count = (calls, at) => calls.filter((c) => c === at).length;

  const waiting = await run({ ...DETAILS, released_at: null });
  assert.equal(count(waiting.calls, 'https://api.resend.com/emails'), 0, 'no email request');
  assert.equal(count(waiting.calls, `${DB}/resolve_receipt`), 0, 'no resolve call: the row stays under its lease');
  assert.deepEqual([waiting.json.claimed, waiting.json.pending, waiting.json.sent], [1, 1, 0]);

  const released = await run(DETAILS);
  assert.equal(count(released.calls, 'https://api.resend.com/emails'), 1, 'control: a released payment sends one email');
  assert.equal(count(released.calls, `${DB}/resolve_receipt`), 1, 'control: and resolves its row');
  assert.equal(released.json.sent, 1);
});
