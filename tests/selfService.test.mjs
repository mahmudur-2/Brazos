import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 9 guards — worker self-service.
 *
 * What must stay true:
 *   1. phase53 keeps the security posture: explicit grants on everything new
 *      (the phase32 lesson), update_my_profile's allowlist widened by exactly
 *      the two availability keys, portfolio SELECT narrowed to
 *      published-or-owner, saved_workers private to the saver.
 *   2. Prices are honest: a NULL price renders "Ask for a quote", never $0.
 *   3. The avatar path stays failure-safe: an upload error keeps the
 *      previous photo and says so.
 *   4. The new surfaces are reachable (ProfileStack rows + registrations).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');
const dir = (rel) => readdirSync(join(root, rel));

test('phase53 posture: grants, allowlist, draft policies', async () => {
  const sql = await read('supabase/phase53_worker_self_service.sql');
  // Explicit narrow grants on both new tables.
  assert.match(sql, /grant select, insert, update, delete on public\.worker_services to authenticated/);
  assert.match(sql, /grant select, insert, delete on public\.saved_workers to authenticated/);
  assert.match(sql, /revoke all on public\.worker_services from public, anon/);
  assert.match(sql, /revoke all on public\.saved_workers from public, anon/);
  // The two — and only two — new profile keys.
  assert.match(sql, /'accepting_work', 'availability_note'/);
  assert.ok(!/'rating_avg'|'verification_status'|'banned'/.test(sql.slice(sql.indexOf('k.key not in'))), 'no protected key joins the allowlist');
  // Draft visibility: published-or-owner on BOTH portfolio and services.
  assert.match(sql, /published = true or worker_id = auth\.uid\(\)/);
  // The availability columns are column-granted, not table-granted.
  assert.match(sql, /grant select \(accepting_work, availability_note\) on public\.profiles to authenticated/);
  assert.ok(!/grant select on public\.profiles to authenticated/.test(sql), 'never a whole-table profiles grant');
  // Function grants re-stated (phase32 lesson).
  assert.match(sql, /grant execute on function public\.update_my_profile\(jsonb\) to authenticated/);
  assert.match(sql, /grant execute on function public\.worker_self_service_enabled\(\) to authenticated/);
});

test('saving an already-saved worker is a silent no-op, not an UPDATE', async () => {
  // saveWorker issued a plain upsert, which PostgREST compiles to ON CONFLICT
  // DO UPDATE. saved_workers has no UPDATE grant and no UPDATE policy, so the
  // conflict path was refused and a second save surfaced as an error.
  const lib = await read('lib/savedWorkers.ts');
  const start = lib.indexOf('export async function saveWorker');
  assert.ok(start > 0, 'saveWorker must exist');
  const body = lib.slice(start, lib.indexOf('export async function unsaveWorker'));

  // DO NOTHING, so the write needs INSERT and nothing more.
  assert.match(body, /ignoreDuplicates: true/, 'the save must take the DO NOTHING path');
  assert.match(body, /onConflict: 'user_id,worker_id'/);

  // The repair must stay client-side: nothing may hand the table UPDATE.
  for (const file of dir('supabase').filter((f) => f.endsWith('.sql'))) {
    const sql = (await read(`supabase/${file}`)).toLowerCase();
    assert.ok(
      !/on public\.saved_workers\s+for update/.test(sql),
      `supabase/${file} adds an UPDATE policy to saved_workers; the client relies on DO NOTHING instead`
    );
    assert.ok(
      !/grant[^;]*\bupdate\b[^;]*on public\.saved_workers/.test(sql),
      `supabase/${file} grants UPDATE on saved_workers; the client relies on DO NOTHING instead`
    );
  }
});

test('the bookmark call site treats a duplicate save as success', async () => {
  // With DO NOTHING there is no error to surface, so the toggle must land on
  // saved. A guard that treated "no rows changed" as failure would re-create
  // the defect in the UI instead of the query.
  const src = await read('screens/WorkerProfileScreen.tsx');
  const start = src.indexOf('async function toggleSaved()');
  assert.ok(start > 0, 'toggleSaved must exist');
  const body = src.slice(start, src.indexOf('}', src.indexOf('if (!saveError)', start)));

  assert.match(body, /await saveWorker\(user\.id, params\.workerId\)/);
  assert.match(body, /if \(!saveError\) setSavedByMe/);
  // No count/rows check that would reinterpret an idempotent save as a failure.
  assert.ok(!/\bcount\b|\.length === 0|data\?\.length/.test(body), 'no row-count failure test');
});

test('a NULL price is "Ask for a quote", never zero dollars', async () => {
  const services = await read('lib/services.ts');
  assert.match(services, /if \(service\.price_cents == null\) return 'Ask for a quote'/);
  const sql = await read('supabase/phase53_worker_self_service.sql');
  assert.match(sql, /price_cents is null or price_cents > 0/);
});

test('the avatar path stays failure-safe', async () => {
  const src = await read('screens/ProfileScreen.tsx');
  // An upload error must fall back to the existing avatar and tell the user,
  // not clobber the photo or lose the rest of the save.
  const uploadIdx = src.indexOf('uploadAvatar(user.id, pendingAsset)');
  assert.ok(uploadIdx > 0, 'the avatar upload call exists');
  const after = src.slice(uploadIdx - 400, uploadIdx + 600);
  assert.match(after, /let avatar = profile\?\.avatar_url \?\? null/);
  assert.match(after, /avatar = url/);
});

test('the new surfaces are reachable from the Profile tab', async () => {
  // The Profile surface is three pages since the golden-master split
  // (decision 10). Two of these rows live on the hub and one on its account
  // & safety page, which the hub's "Account" chip opens — so the guarantee
  // is that the SURFACE reaches all three, not that one file does.
  const [hub, accountSafety] = await Promise.all([
    read('screens/ProfileScreen.tsx'),
    read('screens/AccountSafetyScreen.tsx'),
  ]);
  assert.ok(hub.includes(`navigate('AccountSafety')`), 'the hub must open account & safety');
  const surface = hub + accountSafety;
  for (const route of ['ServicesPricing', 'SavedWorkers', 'PaymentMethods']) {
    // Either an explicit dispatch, or a row in the hub's settings table —
    // master 45's five rows are data, so their route names appear as
    // `route: 'X'` and are dispatched through one shared navigate call.
    const linked =
      surface.includes(`navigate('${route}')`) || surface.includes(`route: '${route}'`);
    assert.ok(linked, `the Profile surface must link ${route}`);
  }
  const shared = await read('navigation/sharedStacks.tsx');
  for (const name of ['ServicesPricing', 'SavedWorkers', 'PaymentMethods', 'WorkerProfile', 'PostJob']) {
    assert.ok(
      new RegExp(`<ProfileStack\\.Screen name="${name}"`).test(shared),
      `ProfileStack must register ${name}`
    );
  }
});

test('the public profile shows availability truth and gates drafts', async () => {
  const src = await read('screens/WorkerProfileScreen.tsx');
  assert.match(src, /accepting_work === false/);
  // Services list hides other people's drafts client-side too (RLS is the
  // authority; the filter keeps the owner's own draft label honest).
  assert.match(src, /s\.published \|\| isSelf/);
  assert.match(src, /servicePriceLabel/);
  // Save/unsave exists and is absent on your own profile. Amended for 4E:
  // a tombstoned (deleted) account is also unsaveable — the same §4.3
  // dead-end-tap rule that suppresses Hire — so the condition gained the
  // canHire-backed `hireable` conjunct.
  assert.match(src, /!isSelf && user && hireable \?/);
});

test('PaymentMethods never renders a fake stored method', async () => {
  const src = await read('screens/PaymentMethodsScreen.tsx');
  assert.match(src, /No stored payment methods/);
  assert.ok(!/\*{4}|ending in|Visa|Mastercard/i.test(src), 'no fabricated card UI');
});
