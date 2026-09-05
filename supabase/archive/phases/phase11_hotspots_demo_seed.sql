-- ============================================================================
-- Brazos · Hotspot map DEMO SEED  (OPTIONAL — for testing the color tiers)
-- ============================================================================
-- ⚠️  Run this ONLY to see the map's color tiers with fake data. It inserts
--     118 fake OPEN jobs clustered in four Brooklyn grid cells (one per tier).
--
-- ⚠️  SIDE EFFECT: these are real open jobs, so they WILL also appear in the
--     Find Work browse list and its realtime feed until you delete them.
--
-- ⚠️  Requires phase12_job_location_privacy.sql to have been run first —
--     exact coordinates now live in job_locations, not jobs.lat/jobs.lng.
--
-- 🧹  CLEANUP (removes every seeded job — job_locations rows cascade with it):
--       delete from public.jobs where title like 'DEMO hotspot job %';
--
-- Requires at least one row in public.profiles (any signed-up user) to own the
-- jobs. Each cluster's jobs are jittered to stay INSIDE a single grid cell so
-- the counts land in the intended tier.
--
--   cell A  55 jobs -> 50+   (deep red-orange)
--   cell B  35 jobs -> 30-49 (red)
--   cell C  20 jobs -> 15-29 (yellow)
--   cell D   8 jobs -> 5-14  (light green)
-- ============================================================================

with params as (
  select 0.27 / 69.0 as dlat,
         0.27 / (69.0 * cos(radians(40.7128))) as dlng
),
owner as (
  select id from public.profiles order by created_at limit 1
),
clusters as (
  select * from (values
    (40.6501, -73.9496, 55),
    (40.6602, -73.9600, 35),
    (40.6403, -73.9400, 20),
    (40.6700, -73.9700, 8)
  ) as c(blat, blng, n)
),
-- Expand each cluster into N rows, each with a title that uniquely encodes
-- which cluster it belongs to (used to join coordinates back after insert,
-- since `jobs` no longer has a lat/lng column to carry them through).
expanded as (
  select
    cl.blat, cl.blng,
    'DEMO hotspot job ' || cl.blat || ' #' || g as title
  from clusters cl
  cross join lateral generate_series(1, cl.n) as g
),
inserted as (
  insert into public.jobs
    (client_id, title, description, category, location, status, budget_cents)
  select
    (select id from owner),
    e.title,
    'Seed job for the hotspot map demo. Safe to delete.',
    (array['cleaning','handyman','moving','dog_walking','yard_work','errands','other'])
      [1 + floor(random() * 7)]::job_category,
    'Brooklyn, NY',
    'open',
    (2000 + floor(random() * 8000))::int
  from expanded e
  returning id, title
)
insert into public.job_locations (job_id, lat, lng)
select
  i.id,
  ((floor(e.blat / p.dlat) + 0.5) * p.dlat) + (random() - 0.5) * p.dlat * 0.8,
  ((floor(e.blng / p.dlng) + 0.5) * p.dlng) + (random() - 0.5) * p.dlng * 0.8
from inserted i
join expanded e on e.title = i.title
cross join params p;
