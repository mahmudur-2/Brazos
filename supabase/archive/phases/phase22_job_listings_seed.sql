-- ============================================================================
-- Brazos · Replace job listings with realistic, neighborhood-distributed data
-- Paste into Supabase → SQL Editor and run. Re-runnable — each run clears out
-- whatever it can safely clear and reseeds fresh, rather than accumulating.
--
-- Requires phase12 (job_locations), phase17 (portfolio_items), and phase18
-- (job_requests) already applied — this checks those tables before deleting
-- anything. All three were confirmed live via scripts/verify-schema.mjs
-- before this file was written.
--
-- WHAT THIS DOES
--   1. Finds jobs that must be KEPT: anything referenced by
--      portfolio_items.source_job_id (a worker featured a photo from it), or
--      by job_requests.thread_job_id / created_job_id (a Hire Again
--      negotiation lives in that job's conversation thread, or was created
--      by accepting one). Everything else is fair game.
--   2. Deletes every other job. bids and reviews on those jobs are deleted
--      explicitly first — their foreign keys predate this repo's
--      phase-numbered migrations and, unlike every FK added since phase8,
--      aren't confirmed to cascade, so this doesn't rely on an assumption.
--      job_locations, messages, message_reads and message_reactions all
--      cascade automatically via already-established FKs; a moderation
--      report on a deleted job just loses its job reference
--      (reports.job_id is ON DELETE SET NULL) rather than being removed.
--   3. Seeds 112 new listings across 4 real Brooklyn neighborhoods, each
--      clustered inside a single ~0.27mi hotspot grid cell — the exact cell
--      size job_hotspots() aggregates by (phase12) — so each neighborhood's
--      count lands predictably in the map legend's tier (lib/hotspots.ts):
--        Gravesend     3 jobs  ->  1-4  tier  (low)
--        Borough Park 12 jobs  ->  5-19 tier  (medium)
--        Flatbush     32 jobs  -> 20-49 tier  (high)
--        Flatlands    65 jobs  -> 50+   tier  (peak)
--      Category/title/description/price are drawn from a 36-listing template
--      pool spanning all 6 named categories (handyman, cleaning, moving,
--      dog_walking, yard_work, errands), so nothing reads as placeholder text.
--   4. About a third of jobs get 1-2 photos. There is no existing demo-photo
--      convention anywhere in this codebase to reuse — no bundled assets
--      beyond app icons, no external URL pattern, and phase11's own demo
--      seed carries no photos either. This uses picsum.photos, a free,
--      no-key placeholder image service, since inventing a bespoke asset
--      pipeline for throwaway seed data isn't worth it.
--
-- NOT VERIFIED: this has not been executed. DELETE/INSERT on `jobs` requires
-- an authenticated session under RLS (jobs_insert_own / jobs_delete_own check
-- auth.uid()), and this environment only has the anon key — there is no way
-- to run this from here. Run it yourself in the SQL Editor and read the
-- NOTICE lines it prints (job counts before/after) to confirm it did what
-- this comment says.
-- ============================================================================

-- 1. Jobs that must survive --------------------------------------------------
drop table if exists pg_temp.protected_job_ids;
create temp table protected_job_ids as
select distinct j.id
from public.jobs j
where exists (select 1 from public.portfolio_items pi where pi.source_job_id = j.id)
   or exists (select 1 from public.job_requests jr where jr.thread_job_id = j.id)
   or exists (select 1 from public.job_requests jr where jr.created_job_id = j.id);

do $$
declare
  v_protected integer;
  v_total integer;
begin
  select count(*) into v_protected from protected_job_ids;
  select count(*) into v_total from public.jobs;
  raise notice 'Protecting % of % existing jobs (referenced by a portfolio item or a Hire Again request) — deleting the rest.',
    v_protected, v_total;
end $$;

-- 2. Clear out everything else -----------------------------------------------
-- Break the jobs<->bids circular reference before bids are removed.
update public.jobs
   set accepted_bid_id = null
 where id not in (select id from protected_job_ids);

delete from public.bids
 where job_id not in (select id from protected_job_ids);

delete from public.reviews
 where job_id not in (select id from protected_job_ids);

delete from public.jobs
 where id not in (select id from protected_job_ids);

-- 3. Template pool: category, title, description, price in cents -----------
drop table if exists pg_temp.job_templates;
create temp table job_templates (
  category text,
  title text,
  description text,
  price_cents integer
);

insert into job_templates (category, title, description, price_cents) values
  ('handyman', 'Fix leaky kitchen faucet', 'Faucet has been dripping for about a week — needs a new cartridge or a full replacement. I already have the parts, just need someone to install them.', 8500),
  ('handyman', 'Hang 4 floating shelves', 'Bought floating shelves from IKEA and need them mounted securely into drywall with proper anchors. Wall is about 9 feet wide.', 12000),
  ('handyman', 'Patch and paint a drywall hole', 'Small hole, about 6 inches, from a doorknob. Needs patching, sanding, and painting to match the existing off-white wall.', 9500),
  ('handyman', 'Replace bathroom exhaust fan', 'Old fan is loud and barely working. New fan is already purchased — just needs to be swapped in and rewired.', 15000),
  ('handyman', 'Assemble and install a ceiling fan', 'New ceiling fan with a light kit, box still unopened. Needs wiring connected to the existing switch and mounted securely.', 13500),
  ('handyman', 'Fix squeaky front door hinges', 'Door has been squeaking loudly for months — might just need lubrication and adjustment, or new hinges.', 4500),
  ('handyman', 'Install a stair safety gate', 'Need a hardware-mounted gate installed at the top of a straight staircase, drilled into the wall studs, not pressure-fit.', 7000),
  ('handyman', 'Small handyman punch list', 'About six small tasks around the apartment: tighten cabinet hinges, caulk the tub, fix a sticking window, and a few others.', 18000),
  ('cleaning', 'Deep clean a 2-bedroom apartment', 'Moving out at the end of the month and need a thorough deep clean — kitchen, bathrooms, floors, and inside the cabinets.', 16000),
  ('cleaning', 'Weekly recurring cleaning', 'Looking for someone reliable for a 1-bedroom apartment, roughly 2 hours weekly. Standard tidy, vacuum, kitchen and bathroom.', 7500),
  ('cleaning', 'Post-renovation dust cleanup', 'Just finished a kitchen renovation and there is construction dust everywhere. Need a full top-to-bottom clean.', 20000),
  ('cleaning', 'One-time move-in clean', 'Just signed a lease on an empty apartment and want it professionally cleaned before we move furniture in this weekend.', 14000),
  ('cleaning', 'Clean before guests arrive', 'Family visiting for the holidays — need the apartment cleaned top to bottom by Friday: kitchen, bathroom, living room.', 11000),
  ('cleaning', 'Small home office cleaning', 'Small home office / studio space, about 400 square feet, needs a one-time thorough clean including the windows.', 9000),
  ('cleaning', 'Refrigerator and oven deep clean', 'Just the fridge and oven — both have not been deep cleaned in a long time and need serious scrubbing.', 6500),
  ('moving', 'Help moving a couch and dresser', 'Moving two big pieces of furniture from a 3rd floor walkup to a truck outside, then a short drive to the new place.', 13000),
  ('moving', 'Studio apartment move, no truck needed', 'Moving a full studio apartment worth of boxes and small furniture, one flight of stairs, need 2 people for about 3 hours.', 22000),
  ('moving', 'Load and unload a rental truck', 'Rented a U-Haul already — just need help loading at the old place and unloading at the new one, both on the ground floor.', 15000),
  ('moving', 'Move an upright piano', 'Need to move an upright piano from a first-floor apartment onto a moving truck. Please only respond if you have real experience with this.', 25000),
  ('moving', 'Help carrying furniture up 4 flights', 'New mattress and bed frame delivery arriving at the curb — need help carrying it up to a 4th floor walkup.', 8000),
  ('moving', 'Small apartment move across the neighborhood', '1-bedroom apartment move, about 10 blocks away, mostly boxes and a bed frame. Already have a van.', 17500),
  ('dog_walking', 'Daily midday walk for a friendly lab', 'Need someone to walk my 3-year-old lab mix for 30 minutes on weekdays while I am at work. Very friendly, no issues on leash.', 2000),
  ('dog_walking', 'Weekend walks for two small dogs', 'Two small terriers, need walks Saturday and Sunday mornings, about 20 minutes each. Easy dogs, they love people.', 1800),
  ('dog_walking', 'One-time walk, regular sitter is out sick', 'My usual dog walker is out sick and I need a one-time 30 minute walk this afternoon for my golden retriever.', 2200),
  ('dog_walking', 'Puppy potty breaks, 3 times a day', '8-month-old puppy still being house trained — need quick 10-15 minute outings three times a day this week.', 1500),
  ('dog_walking', 'Dog walking while I recover from surgery', 'Recovering from knee surgery for a few weeks and cannot walk my dog myself. Medium-sized, well-behaved, needs a 25 minute walk daily.', 2000),
  ('yard_work', 'Mow and edge a small backyard', 'Small backyard, maybe 400 square feet of grass, needs mowing and edging. A mower is available on-site if needed.', 5000),
  ('yard_work', 'Fall leaf cleanup, front and back yard', 'Leaves have piled up all over the yard, need raking and bagging for pickup. Bags are already provided.', 7500),
  ('yard_work', 'Weed and mulch the flower beds', 'Flower beds along the front of the house are overrun with weeds, need weeding and fresh mulch (I will buy the mulch).', 9000),
  ('yard_work', 'Trim overgrown hedges', 'Hedges along the side of the house have not been trimmed in over a year and are getting out of control.', 11000),
  ('yard_work', 'Plant spring flowers in the front beds', 'Bought flats of annuals, need help planting them in the front beds plus a general yard tidy-up.', 6500),
  ('errands', 'Grocery pickup and delivery', 'Need someone to pick up a grocery order from the store and drop it at my apartment — I will send over the list.', 2500),
  ('errands', 'Pick up dry cleaning', 'Need dry cleaning picked up from the cleaners on the corner and dropped off at my building front desk.', 1500),
  ('errands', 'Return a package at the post office', 'Have a package that needs to be returned, already labeled and sealed — just needs to go to the post office.', 1200),
  ('errands', 'Pick up a prescription from the pharmacy', 'Need a prescription picked up from the pharmacy and dropped at my door — I am unable to leave the house today.', 1800),
  ('errands', 'Wait for a furniture delivery', 'Furniture delivery window is 12-4pm and I cannot be home. Need someone to receive it and place it inside.', 4000)
;

-- 4. Neighborhood targets, matched to the map legend's tiers -----------------
-- Coordinates are each neighborhood's approximate real-world center. Jobs are
-- jittered within 80% of one hotspot grid cell around that point so every job
-- in a neighborhood lands in the SAME cell, rather than spreading thin across
-- several and missing the intended tier.
drop table if exists pg_temp.seed_neighborhoods;
create temp table seed_neighborhoods (
  name text, blat double precision, blng double precision, n integer
);
insert into seed_neighborhoods (name, blat, blng, n) values
  ('Gravesend',     40.5947, -73.9707,  3),
  ('Borough Park',  40.6330, -73.9903, 12),
  ('Flatbush',      40.6407, -73.9589, 32),
  ('Flatlands',     40.6234, -73.9276, 65);

-- 5. Generate and insert -----------------------------------------------------
-- Row-by-row rather than one set-based insert: each job's `jobs` row and its
-- `job_locations` row must agree on the exact same jittered coordinate, and
-- reconciling that after two separate bulk inserts means joining generated
-- rows back up by some column with no natural key — the same problem
-- phase11's demo seed works around with a fragile matching title string. A
-- loop sidesteps it entirely: each job's own returned id is used immediately
-- for its own location row, so there's nothing to join back at all.
do $$
declare
  v_dlat double precision := 0.27 / 69.0;
  v_dlng double precision := 0.27 / (69.0 * cos(radians(40.7128)));
  v_nb record;
  v_tpl record;
  v_owner uuid;
  v_job_id uuid;
  v_photos jsonb;
  v_lat double precision;
  v_lng double precision;
  v_seq integer := 0;
  v_i integer;
begin
  if not exists (select 1 from public.profiles) then
    raise exception 'No profiles exist to own seeded jobs — sign up at least one account first.';
  end if;

  for v_nb in select * from seed_neighborhoods loop
    for v_i in 1..v_nb.n loop
      v_seq := v_seq + 1;

      select * into v_tpl from job_templates order by random() limit 1;
      select id into v_owner from public.profiles order by random() limit 1;

      -- ~35% of jobs get 1-2 photos; the rest get none, so it reads as
      -- "some listings have photos" rather than either all or none.
      v_photos := case
        when random() < 0.35 then (
          select jsonb_agg(
            'https://picsum.photos/seed/brazos-job-' || v_seq || '-' || gs || '/800/600'
          )
          from generate_series(1, 1 + (random() < 0.4)::int) as gs
        )
        else '[]'::jsonb
      end;

      insert into public.jobs (
        client_id, title, description, category, location, budget_cents, status, photos
      )
      values (
        v_owner, v_tpl.title, v_tpl.description, v_tpl.category::job_category,
        v_nb.name || ', Brooklyn, NY', v_tpl.price_cents, 'open', v_photos
      )
      returning id into v_job_id;

      v_lat := ((floor(v_nb.blat / v_dlat) + 0.5) * v_dlat) + (random() - 0.5) * v_dlat * 0.8;
      v_lng := ((floor(v_nb.blng / v_dlng) + 0.5) * v_dlng) + (random() - 0.5) * v_dlng * 0.8;

      insert into public.job_locations (job_id, lat, lng)
      values (v_job_id, v_lat, v_lng);
    end loop;
  end loop;

  raise notice 'Seeded % new jobs across % neighborhoods (Gravesend 3, Borough Park 12, Flatbush 32, Flatlands 65).',
    v_seq, (select count(*) from seed_neighborhoods);
end $$;

drop table if exists pg_temp.protected_job_ids;
drop table if exists pg_temp.job_templates;
drop table if exists pg_temp.seed_neighborhoods;
