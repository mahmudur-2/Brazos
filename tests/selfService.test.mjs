import test from 'node:test';
import assert from 'node:assert/strict';
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

test('phase53 posture: grants, allowlist, draft policies', async () => {
  const sql = await read('supabase/archive/phases/phase53_worker_self_service.sql');
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

test('a NULL price is "Ask for a quote", never zero dollars', async () => {
  const services = await read('lib/services.ts');
  assert.match(services, /if \(service\.price_cents == null\) return 'Ask for a quote'/);
  const sql = await read('supabase/archive/phases/phase53_worker_self_service.sql');
  assert.match(sql, /price_cents is null or price_cents > 0/);
});

test('services carries no currency formatting of its own — formatBudget is the one formatter (F-011)', async () => {
  const services = await read('lib/services.ts');
  // The dollar figure must flow through THE money formatter…
  assert.match(services, /import \{ formatBudget \} from '\.\/jobs'/);
  assert.match(services, /formatBudget\(service\.price_cents\)/);
  // …and the byte-identical re-implementation cannot quietly return: no
  // cents→dollars arithmetic, no locale call, no hand-assembled dollar string.
  assert.doesNotMatch(
    services,
    /toLocaleString|minimumFractionDigits|\/ 100|\$\$\{/,
    'lib/services.ts must not format currency itself'
  );
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
  // 2026-09-29 (LUX-LIST-2 #7): Account & safety is a row of the hub's table,
  // like the others below, dispatched through the one shared navigate call.
  assert.ok(
    hub.includes(`route: 'AccountSafety'`) && hub.includes('navigation.navigate(row.route)'),
    'the hub must open account & safety'
  );
  const surface = hub + accountSafety;
  // Lean D5: SavedWorkers left with saved workers.
  for (const route of ['ServicesPricing', 'PaymentMethods']) {
    // Either an explicit dispatch, or a row in the hub's settings table —
    // master 45's five rows are data, so their route names appear as
    // `route: 'X'` and are dispatched through one shared navigate call.
    const linked =
      surface.includes(`navigate('${route}')`) || surface.includes(`route: '${route}'`);
    assert.ok(linked, `the Profile surface must link ${route}`);
  }
  const shared = await read('navigation/sharedStacks.tsx');
  for (const name of ['ServicesPricing', 'PaymentMethods', 'WorkerProfile', 'PostJob']) {
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
  // (The save/unsave toggle left with saved workers in lean D5.)
});

test('PaymentMethods never renders a fake stored method', async () => {
  const src = await read('screens/PaymentMethodsScreen.tsx');
  assert.match(src, /No stored payment methods/);
  assert.ok(!/\*{4}|ending in|Visa|Mastercard/i.test(src), 'no fabricated card UI');
});
