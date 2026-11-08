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
 *      the two availability keys, services SELECT narrowed to
 *      published-or-owner.
 *   2. Prices are honest: a NULL price renders "Ask for a quote", never $0.
 *   3. The avatar path stays failure-safe: an upload error keeps the
 *      previous photo and says so.
 *   4. The new surfaces are reachable (ProfileStack rows + registrations).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

/** The live schema: the baseline (pg_dump form); no later migration redefines what is read here. */
const baseline = () => read('supabase/migrations/20260901000000_baseline.sql');

test('phase53 posture: grants, allowlist, draft policies', async () => {
  // (saved_workers and the portfolio went in lean D5.)
  const sql = await baseline();
  const updateMyProfile = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION "public"."update_my_profile"('),
    sql.indexOf('ALTER FUNCTION "public"."update_my_profile"(')
  );
  // The two — and only two — new profile keys.
  assert.match(updateMyProfile, /'accepting_work', 'availability_note'/);
  assert.ok(updateMyProfile.indexOf('k.key not in') > 0, 'the allowlist must be findable');
  assert.ok(!/'rating_avg'|'verification_status'|'banned'/.test(updateMyProfile.slice(updateMyProfile.indexOf('k.key not in'))), 'no protected key joins the allowlist');
  // Draft visibility: published-or-owner on services.
  assert.match(
    sql,
    /CREATE POLICY "services_select_visible" ON "public"\."worker_services" FOR SELECT TO "authenticated" USING \(\(\("published" = true\) OR \("worker_id" = "auth"\."uid"\(\)\)\)\);/
  );
  // The availability columns are column-granted, not table-granted.
  for (const column of ['accepting_work', 'availability_note']) {
    assert.ok(sql.includes(`GRANT SELECT("${column}") ON TABLE "public"."profiles" TO "authenticated";`), `${column} is column-granted`);
  }
  const profilesTable = sql.match(/^GRANT ([A-Z,]+) ON TABLE "public"\."profiles" TO "authenticated";$/m)?.[1];
  assert.ok(profilesTable, 'the profiles table grant must be findable');
  assert.ok(!profilesTable.split(',').includes('SELECT'), 'never a whole-table profiles grant');
  // Function grants re-stated (phase32 lesson).
  assert.ok(sql.includes('GRANT ALL ON FUNCTION "public"."update_my_profile"("p_patch" "jsonb") TO "authenticated";'));
});

test('a NULL price is "Ask for a quote", never zero dollars', async () => {
  const services = await read('lib/services.ts');
  assert.match(services, /if \(service\.price_cents == null\) return 'Ask for a quote'/);
  const sql = await baseline();
  assert.ok(sql.includes('CONSTRAINT "worker_services_price_cents_check" CHECK ((("price_cents" IS NULL) OR ("price_cents" > 0)))'));
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
