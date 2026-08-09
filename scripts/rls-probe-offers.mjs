#!/usr/bin/env node
/**
 * RLS probe for the unified offer model (phase46's job_offers_select_party).
 *
 *   node scripts/rls-probe-offers.mjs
 *
 * Proves, against the LIVE database and as real authenticated users rather
 * than service role, that:
 *
 *   1. anon              cannot read job_offers at all
 *   2. anon              cannot read bids at all
 *   3. worker A          cannot see worker B's offer on a shared job
 *   4. worker A          cannot see worker B's row in the legacy bids table
 *   5. the job's owner   CAN see both offers
 *
 * READ-ONLY BY CONSTRUCTION. This script performs no INSERT, UPDATE, DELETE or
 * RPC that writes. It does not create accounts, jobs or offers, and it must not
 * be extended to — CLAUDE.md forbids modifying production Supabase data, and
 * placing a probe bid would additionally fire real push notifications at the
 * job's owner and at every other pending bidder (phase20's bids_notify ->
 * enqueue_notification). Cases 3-5 therefore require fixtures that ALREADY
 * exist; if they do not, this reports that and exits rather than creating them.
 *
 * Credentials come from the environment, never from .env and never from source.
 * Set them for this command only:
 *
 *   PROBE_WORKER_A_EMAIL / PROBE_WORKER_A_PASSWORD
 *   PROBE_WORKER_B_EMAIL / PROBE_WORKER_B_PASSWORD
 *   PROBE_CUSTOMER_EMAIL / PROBE_CUSTOMER_PASSWORD
 *   PROBE_JOB_ID           (optional; auto-discovered from the customer if unset)
 *
 * Nothing sensitive is printed: no passwords, no access tokens, no offer
 * amounts, no messages. Only ids, and only the ids the probe is asserting on.
 *
 * Exit code is 0 only if every runnable case PASSES. A case that cannot run
 * because credentials or fixtures are absent is reported SKIPPED and makes the
 * run inconclusive (exit 2) — it is never counted as a pass.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL = env.SUPABASE_URL?.replace(/\/$/, '');
const ANON = env.SUPABASE_KEY;
if (!URL || !ANON) {
  console.error('Missing SUPABASE_URL / SUPABASE_KEY in .env');
  process.exit(2);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(label, detail) {
  passed++;
  console.log(`  PASS     ${label}${detail ? `  — ${detail}` : ''}`);
}
function fail(label, detail) {
  failed++;
  console.log(`  FAIL     ${label}${detail ? `  — ${detail}` : ''}`);
}
function skip(label, why) {
  skipped++;
  console.log(`  SKIPPED  ${label}  — ${why}`);
}

function client(accessToken) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

async function signIn(role) {
  const email = process.env[`PROBE_${role}_EMAIL`];
  const password = process.env[`PROBE_${role}_PASSWORD`];
  if (!email || !password) return null;

  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    console.error(`  (sign-in failed for ${role}: ${error?.message ?? 'no session'})`);
    return null;
  }
  return { userId: data.user.id, token: data.session.access_token };
}

// ---------------------------------------------------------------------------

console.log('RLS probe — unified offers (job_offers + legacy bids)\n');

// --- Cases 1-3: anon sees nothing. No credentials needed. -------------------
// `payments` joined the list in Phase 5: phase50 extended the ledger and
// revoked every anon path; a publishable key must never read money rows.
// (Participant-level payment isolation — payer/payee only — is covered by
// scripts/phase5-proof.sql as real identities, since the live table has no
// rows to probe against until real checkouts exist.)
console.log('anon (publishable key, no session)');

for (const table of ['job_offers', 'bids', 'payments']) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const body = await res.json().catch(() => ({}));
  const rows = Array.isArray(body) ? body.length : null;

  if (res.ok && rows === 0) {
    // 200 with zero rows is RLS filtering, which is also correct.
    pass(`anon cannot read ${table}`, `HTTP ${res.status}, 0 rows`);
  } else if (!res.ok) {
    pass(`anon cannot read ${table}`, `HTTP ${res.status} ${body.code ?? ''}`.trim());
  } else {
    fail(`anon cannot read ${table}`, `HTTP ${res.status} returned ${rows} row(s)`);
  }
}

// --- Cases 3-5: need three real sessions and an existing shared job ---------
console.log('\nauthenticated (real user sessions, not service role)');

const [a, b, customer] = await Promise.all([
  signIn('WORKER_A'),
  signIn('WORKER_B'),
  signIn('CUSTOMER'),
]);

if (!a || !b || !customer) {
  const missing = [!a && 'WORKER_A', !b && 'WORKER_B', !customer && 'CUSTOMER']
    .filter(Boolean)
    .join(', ');
  const why = `no session for ${missing} — set PROBE_*_EMAIL / PROBE_*_PASSWORD`;
  skip("worker A cannot see worker B's offer (job_offers)", why);
  skip("worker A cannot see worker B's row (bids)", why);
  skip('the job owner can see both offers', why);
} else {
  const cx = client(customer.token);

  // Find a job the customer owns that carries live offers from BOTH workers.
  // Read as the customer because that is the only session RLS shows both to.
  let jobId = process.env.PROBE_JOB_ID ?? null;
  if (!jobId) {
    const { data } = await cx
      .from('job_offers')
      .select('job_id, worker_id')
      .eq('customer_id', customer.userId)
      .eq('offer_type', 'marketplace_bid');

    const byJob = new Map();
    for (const row of data ?? []) {
      if (!byJob.has(row.job_id)) byJob.set(row.job_id, new Set());
      byJob.get(row.job_id).add(row.worker_id);
    }
    for (const [job, workers] of byJob) {
      if (workers.has(a.userId) && workers.has(b.userId)) {
        jobId = job;
        break;
      }
    }
  }

  if (!jobId) {
    const why =
      'no existing job carries live offers from BOTH probe workers. This script ' +
      'will not create one (read-only by constraint); create the fixture ' +
      'deliberately, or set PROBE_JOB_ID';
    skip("worker A cannot see worker B's offer (job_offers)", why);
    skip("worker A cannot see worker B's row (bids)", why);
    skip('the job owner can see both offers', why);
  } else {
    console.log(`  (target job ${jobId})`);

    // Establish ground truth as the customer: both offer ids must exist.
    const { data: allOffers } = await cx
      .from('job_offers')
      .select('id, worker_id')
      .eq('job_id', jobId);

    const offersA = (allOffers ?? []).filter((o) => o.worker_id === a.userId);
    const offersB = (allOffers ?? []).filter((o) => o.worker_id === b.userId);

    // CASE 5 first: it is the ground truth the other two are measured against.
    if (offersA.length > 0 && offersB.length > 0) {
      pass(
        'the job owner CAN see both offers',
        `${offersA.length} from A + ${offersB.length} from B`
      );
    } else {
      fail(
        'the job owner CAN see both offers',
        `owner sees ${offersA.length} from A and ${offersB.length} from B`
      );
    }

    const ax = client(a.token);

    // CASE 3: worker A must not see any of B's job_offers rows.
    const { data: aSeesOffers, error: aOffersErr } = await ax
      .from('job_offers')
      .select('id, worker_id')
      .eq('job_id', jobId);

    if (aOffersErr) {
      fail("worker A cannot see worker B's offer (job_offers)", `query error: ${aOffersErr.message}`);
    } else {
      const leaked = (aSeesOffers ?? []).filter((o) => o.worker_id === b.userId);
      const own = (aSeesOffers ?? []).filter((o) => o.worker_id === a.userId);
      if (leaked.length === 0 && own.length > 0) {
        pass(
          "worker A cannot see worker B's offer (job_offers)",
          `A sees ${own.length} own row(s), 0 of B's`
        );
      } else if (leaked.length > 0) {
        fail(
          "worker A cannot see worker B's offer (job_offers)",
          `LEAK: A can read ${leaked.length} of B's row(s): ${leaked.map((o) => o.id).join(', ')}`
        );
      } else {
        fail(
          "worker A cannot see worker B's offer (job_offers)",
          'A cannot see their OWN offer either — policy is wrong in the other direction'
        );
      }
    }

    // CASE 4: same, through the frozen legacy table.
    const { data: aSeesBids, error: aBidsErr } = await ax
      .from('bids')
      .select('id, worker_id')
      .eq('job_id', jobId);

    if (aBidsErr) {
      pass("worker A cannot see worker B's row (bids)", `query rejected: ${aBidsErr.message}`);
    } else {
      const leaked = (aSeesBids ?? []).filter((r) => r.worker_id === b.userId);
      if (leaked.length === 0) {
        pass(
          "worker A cannot see worker B's row (bids)",
          `A sees ${(aSeesBids ?? []).length} row(s), 0 of B's`
        );
      } else {
        fail(
          "worker A cannot see worker B's row (bids)",
          `LEAK: A can read ${leaked.length} of B's legacy row(s): ${leaked.map((r) => r.id).join(', ')}`
        );
      }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) {
  console.log('RLS PROBE FAILED — a policy is letting data across a user boundary.');
  process.exit(1);
}
if (skipped > 0) {
  console.log('RLS PROBE INCONCLUSIVE — skipped cases are NOT passes.');
  process.exit(2);
}
console.log('RLS probe clean.');
process.exit(0);
