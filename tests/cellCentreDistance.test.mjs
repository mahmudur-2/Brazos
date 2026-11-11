// B2 (docs/lean/AUDIT-LEDGER.md): a job's distance is its market cell's, never its exact point's.
// The behaviour is proven on the database (supabase/tests/400_access_matrix.sql §1); this fences the
// migration's shape: one cell-centre definition on the job_hotspots grid, both measuring functions
// use it, nothing destructive, every grant restated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = 'supabase/migrations/20261112030000_distance_from_cell_centre.sql';
const sql = read(MIGRATION);
const between = (from, to) => {
  const start = sql.indexOf(from);
  const end = sql.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} … ${to} must be in ${MIGRATION}`);
  return sql.slice(start, end);
};

test("B2 · the cell centre is job_hotspots' own grid, defined once", () => {
  const hotspots = read('supabase/migrations/20260901000000_baseline.sql');
  assert.match(hotspots, /0\.27 \/ 69\.0 as dlat,\s*0\.27 \/ \(69\.0 \* cos\(radians\(40\.7128\)\)\) as dlng/);
  assert.match(hotspots, /\(cc\.ilat \+ 0\.5\) \* p\.dlat as cell_lat,\s*\(cc\.ilng \+ 0\.5\) \* p\.dlng as cell_lng/);

  const centre = between('create or replace function public.market_cell_centre(', 'comment on function public.market_cell_centre');
  assert.match(centre, /\(floor\(p_lat \/ \(0\.27 \/ 69\.0\)\) \+ 0\.5\) \* \(0\.27 \/ 69\.0\)/);
  assert.match(centre, /\(floor\(p_lng \/ \(0\.27 \/ \(69\.0 \* cos\(radians\(40\.7128\)\)\)\)\) \+ 0\.5\)\s*\* \(0\.27 \/ \(69\.0 \* cos\(radians\(40\.7128\)\)\)\)/);
  assert.doesNotMatch(centre, /security definer/i);
  assert.match(sql, /revoke all on function public\.market_cell_centre\(double precision, double precision\) from public, anon, authenticated, service_role;/);
});

test('B2 · jobs_within_radius measures to the cell centre, with its clamp and grants unchanged', () => {
  const body = between('CREATE OR REPLACE FUNCTION "public"."jobs_within_radius"', 'COMMENT ON FUNCTION "public"."jobs_within_radius"');
  assert.match(body, /cross join lateral public\.market_cell_centre\(loc\.lat, loc\.lng\) c/);
  assert.match(body, /sin\(radians\(\(c\.lat - p_lat\) \/ 2\)\) \^ 2/);
  assert.match(body, /cos\(radians\(c\.lat\)\)/);
  assert.match(body, /sin\(radians\(\(c\.lng - p_lng\) \/ 2\)\) \^ 2/);
  assert.doesNotMatch(body, /loc\.lat - p_lat|loc\.lng - p_lng|radians\(loc\.lat\)/, 'no distance to the exact point is left');
  assert.match(body, /least\(greatest\(coalesce\(nullif\(p_radius_miles, 0\), 25\), 0\.5\), 3000\)/);
  assert.match(body, /round\(\(2 \* 3958\.8 \* asin\(/, 'still snapped to half a mile');
  assert.match(body, /SECURITY DEFINER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION "public"\."jobs_within_radius"[^;]*FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION "public"\."jobs_within_radius"[^;]*TO authenticated;/);
});

test('B2 · the nearby alert matches homes against the cell centre', () => {
  const body = between('create or replace function public.notify_nearby_for_job(p_job_id uuid)', 'revoke all on function public.notify_nearby_for_job');
  assert.match(body, /select \* into v_cell from public\.market_cell_centre\(v_loc\.lat, v_loc\.lng\);/);
  assert.match(body, /v_cell\.lat between np\.home_lat - \(np\.nearby_radius_miles \/ 69\.0\)/);
  assert.match(body, /power\(sin\(radians\(v_cell\.lng - np\.home_lng\) \/ 2\), 2\)/);
  assert.doesNotMatch(body, /v_loc\.lat between|radians\(v_loc\.|v_loc\.lng - /, 'no match against the exact point is left');
  assert.match(body, /'job_nearby:' \|\| v_job\.id::text \|\| ':' \|\| v_candidate\.user_id::text/, 'the same dedupe key');
  assert.match(sql, /revoke all on function public\.notify_nearby_for_job\(uuid\) from public, anon, authenticated, service_role;/);
});

test('B2 · additive, and the client comment no longer promises an exact distance', () => {
  assert.doesNotMatch(sql, /drop |rename |truncate|delete from/i, 'nothing the staging scan stops on');
  const hotspots = read('lib/hotspots.ts');
  assert.doesNotMatch(hotspots, /Exact job-level distance/);
  assert.match(hotspots, /centre of\s+\* the job's ~0\.27-mile market cell/);
});
