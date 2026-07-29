-- ============================================================================
-- Brazos · Realistic job seed across the app's full 10-category list
-- Paste into Supabase → SQL Editor and run. Re-runnable — each run clears out
-- whatever it can safely clear and reseeds fresh. Supersedes phase22's job
-- seed (kept in place as history, not deleted) — that one only covered the
-- original 7 job_category enum values and its distribution never actually
-- rendered correctly; see supabase/phase23 vs the fix in
-- components/HotspotMap.native.tsx for why.
--
-- Contents
--   1. Extend job_category (Postgres enum) with 4 new values
--   2. Widen job_requests' category CHECK to match
--   3. Marker function for scripts/verify-schema.mjs
--   4. Clear existing jobs (protected-aware, same rule as phase22)
--   5. 50-listing template pool across all 10 categories
--   6. Neighborhood targets
--   7. Seed: status mix, matching bids, varied created_at, photos, posters
--
-- ---------------------------------------------------------------------------
-- WHY THE ENUM NEEDS EXTENDING FIRST
-- ---------------------------------------------------------------------------
-- "The existing 10 job categories" refers to SKILL_CATEGORIES
-- (lib/skillCategories.ts) — built for profiles.categories, a free-text
-- array with no DB constraint. jobs.category is a REAL Postgres enum type
-- (`job_category`), still only holding the original 7 values. That
-- component's own comment at the time said the job list "can't be freely
-- extended" — true only in the sense that nothing had done it yet, not that
-- it's structurally impossible. Section 1 does it: 'furniture_assembly',
-- 'tv_mounting', 'painting', 'packing' are added as real enum members, and
-- lib/jobs.ts's JOB_CATEGORIES/LABELS/ICONS were updated alongside this file
-- so the rest of the app (category chips, filters, job cards) renders these
-- correctly rather than falling back to a raw enum string.
--
-- Section 2 exists because job_requests.category (a separate plain-text
-- column with its own CHECK, added in phase18) has its own hardcoded list of
-- 7 valid values. Without widening it too, a real "Hire Again" request for
-- one of the 4 new categories would be silently rejected by that constraint
-- — a latent bug this migration would otherwise introduce by only fixing
-- half of the category system.
--
-- ---------------------------------------------------------------------------
-- A REAL POSTGRES GOTCHA THIS FILE WORKS AROUND
-- ---------------------------------------------------------------------------
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction as a
-- statement that USES the new value (casts to it, compares it, etc.) — even
-- on modern Postgres, which allows the ALTER itself inside a transaction.
-- Using a value before the transaction that added it has committed raises
-- "unsafe use of new value of enum type". Section 1 ends with an explicit
-- `commit;` so the additions are durable before section 7 casts any row to
-- 'furniture_assembly'/'tv_mounting'/'painting'/'packing'. That `commit;` is
-- a harmless no-op if the SQL Editor already runs each statement
-- autocommitted — it only matters, and only helps, if it doesn't.
--
-- NOT VERIFIED: this has not been executed. DELETE/INSERT on `jobs` and
-- ALTER TYPE both require privileges this environment's anon key doesn't
-- have. Run it yourself and read the NOTICE lines it prints.
-- ============================================================================

-- 1. Extend the enum ----------------------------------------------------
alter type public.job_category add value if not exists 'furniture_assembly';
alter type public.job_category add value if not exists 'tv_mounting';
alter type public.job_category add value if not exists 'painting';
alter type public.job_category add value if not exists 'packing';

commit;

-- 2. Widen job_requests' category constraint to match ------------------
alter table public.job_requests
  drop constraint if exists job_requests_category_valid;

alter table public.job_requests
  add constraint job_requests_category_valid check (
    category in (
      'dog_walking', 'cleaning', 'moving', 'yard_work', 'handyman', 'errands',
      'furniture_assembly', 'tv_mounting', 'painting', 'packing', 'other'
    )
  );

-- 3. Marker so scripts/verify-schema.mjs can confirm this migration ran.
create or replace function public.job_categories_expanded()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.job_categories_expanded() from public;
grant execute on function public.job_categories_expanded() to authenticated;

-- 4. Clear existing jobs (protected-aware, same rule as phase22) -------
-- The table was already emptied manually before this file was written, so on
-- a first run this whole section is a no-op — it's here so re-running this
-- file later (after real activity exists) is still safe rather than needing
-- phase22 run alongside it.
drop table if exists pg_temp.protected_job_ids;
create temp table protected_job_ids as
select distinct j.id
from public.jobs j
where exists (select 1 from public.portfolio_items pi where pi.source_job_id = j.id)
   or exists (select 1 from public.job_requests jr where jr.thread_job_id = j.id)
   or exists (select 1 from public.job_requests jr where jr.created_job_id = j.id);

update public.jobs
   set accepted_bid_id = null
 where id not in (select id from protected_job_ids);

delete from public.bids
 where job_id not in (select id from protected_job_ids);

delete from public.reviews
 where job_id not in (select id from protected_job_ids);

delete from public.jobs
 where id not in (select id from protected_job_ids);

-- 5. Template pool: 5 listings x 10 categories, all with a real specific
--    title/description and a price that reflects the actual task -----------
drop table if exists pg_temp.job_templates;
create temp table job_templates (
  id serial primary key,
  category text,
  title text,
  description text,
  price_cents integer
);

insert into job_templates (category, title, description, price_cents) values
  ('handyman', 'Fix leaky kitchen faucet', 'Faucet has been dripping for about a week — needs a new cartridge or a full replacement. I already have the parts, just need someone to install them.', 8500),
  ('handyman', 'Patch and paint a drywall hole', 'Small hole, about 6 inches, from a doorknob. Needs patching, sanding, and painting to match the existing off-white wall.', 9500),
  ('handyman', 'Replace bathroom exhaust fan', 'Old fan is loud and barely working. New fan is already purchased — just needs to be swapped in and rewired.', 15000),
  ('handyman', 'Fix squeaky front door hinges', 'Door has been squeaking loudly for months — might just need lubrication and adjustment, or new hinges.', 4500),
  ('handyman', 'Install a stair safety gate', 'Need a hardware-mounted gate installed at the top of a straight staircase, drilled into the wall studs, not pressure-fit.', 7000),

  ('cleaning', 'Deep clean a 2-bedroom apartment before move-out', 'Moving out at the end of the month and need a thorough deep clean — kitchen, bathrooms, floors, and inside the cabinets.', 16000),
  ('cleaning', 'Weekly recurring cleaning, 1-bedroom apartment', 'Looking for someone reliable for a 1-bedroom apartment, roughly 2 hours weekly. Standard tidy, vacuum, kitchen and bathroom.', 7500),
  ('cleaning', 'Post-renovation dust cleanup', 'Just finished a kitchen renovation and there is construction dust everywhere. Need a full top-to-bottom clean.', 20000),
  ('cleaning', 'One-time move-in clean, empty apartment', 'Just signed a lease on an empty apartment and want it professionally cleaned before we move furniture in this weekend.', 14000),
  ('cleaning', 'Refrigerator and oven deep clean', 'Just the fridge and oven — both have not been deep cleaned in a long time and need serious scrubbing.', 6500),

  ('moving', 'Move a queen mattress and frame up 3 flights', 'Mattress and frame are already at the curb, need them carried up to a 3rd floor walkup, no elevator.', 9500),
  ('moving', 'Load and unload a rental truck', 'Rented a U-Haul already — just need help loading at the old place and unloading at the new one, both on the ground floor.', 15000),
  ('moving', 'Help moving a couch and dresser', 'Moving two big pieces of furniture from a 3rd floor walkup to a truck outside, then a short drive to the new place.', 13000),
  ('moving', 'Small studio move across the neighborhood', 'Studio apartment move, about 10 blocks away, mostly boxes and a bed frame. Already have a van.', 17500),
  ('moving', 'Move an upright piano, first floor only', 'Need to move an upright piano from a first-floor apartment onto a moving truck. Please only respond if you have real experience with this.', 25000),

  ('dog_walking', 'Weekly dog walking, 2 dogs, mornings only', 'Two friendly dogs, need a reliable weekly morning walk, about 30 minutes, Monday through Friday.', 6500),
  ('dog_walking', 'Daily midday walk for a friendly lab', 'Need someone to walk my 3-year-old lab mix for 30 minutes on weekdays while I am at work. Very friendly, no issues on leash.', 2000),
  ('dog_walking', 'One-time walk, regular sitter is out sick', 'My usual dog walker is out sick and I need a one-time 30 minute walk this afternoon for my golden retriever.', 2200),
  ('dog_walking', 'Puppy potty breaks, 3 times a day', '8-month-old puppy still being house trained — need quick 10-15 minute outings three times a day this week.', 1500),
  ('dog_walking', 'Dog walking while I recover from surgery', 'Recovering from knee surgery for a few weeks and cannot walk my dog myself. Medium-sized, well-behaved, needs a 25 minute walk daily.', 2000),

  ('yard_work', 'Mow and edge a small backyard', 'Small backyard, maybe 400 square feet of grass, needs mowing and edging. A mower is available on-site if needed.', 5000),
  ('yard_work', 'Fall leaf cleanup, front and back yard', 'Leaves have piled up all over the yard, need raking and bagging for pickup. Bags are already provided.', 7500),
  ('yard_work', 'Weed and mulch the flower beds', 'Flower beds along the front of the house are overrun with weeds, need weeding and fresh mulch (I will buy the mulch).', 9000),
  ('yard_work', 'Trim overgrown hedges along the driveway', 'Hedges along the side of the house have not been trimmed in over a year and are getting out of control.', 11000),
  ('yard_work', 'Plant spring flowers in the front beds', 'Bought flats of annuals, need help planting them in the front beds plus a general yard tidy-up.', 6500),

  ('errands', 'Grocery pickup and delivery', 'Need someone to pick up a grocery order from the store and drop it at my apartment — I will send over the list.', 2500),
  ('errands', 'Pick up dry cleaning', 'Need dry cleaning picked up from the cleaners on the corner and dropped off at my building front desk.', 1500),
  ('errands', 'Wait for a furniture delivery', 'Furniture delivery window is 12-4pm and I cannot be home. Need someone to receive it and place it inside.', 4000),
  ('errands', 'Pick up a prescription from the pharmacy', 'Need a prescription picked up from the pharmacy and dropped at my door — I am unable to leave the house today.', 1800),
  ('errands', 'Return a package at the post office', 'Have a package that needs to be returned, already labeled and sealed — just needs to go to the post office.', 1200),

  ('furniture_assembly', 'Assemble IKEA bookshelf and mount to wall', 'Standard IKEA Billy bookshelf, still in the box, needs assembling and anchoring to the wall for tip-over safety.', 6500),
  ('furniture_assembly', 'Assemble a 6-drawer dresser', 'Flat-pack dresser from an online order, all hardware included, just needs assembly and the drawers aligned properly.', 5500),
  ('furniture_assembly', 'Put together a crib and changing table', 'Nursery furniture arriving this week — need the crib and changing table assembled and set up before the baby arrives.', 9000),
  ('furniture_assembly', 'Assemble and anchor a bunk bed frame', 'Bunk bed for the kids room, needs full assembly plus anchoring to the wall since it will be climbed on.', 8500),
  ('furniture_assembly', 'Build a home office desk and file cabinet', 'Two flat-pack pieces — a desk and a matching file cabinet — both still boxed, need full assembly.', 7500),

  ('tv_mounting', 'Mount a 55-inch TV above the fireplace', 'TV and mount are both already purchased. Wall is brick above the fireplace, so it will need masonry anchors.', 12000),
  ('tv_mounting', 'Wall-mount a 43-inch TV in the bedroom', 'Standard drywall, mount already purchased, just needs proper stud placement and a level install.', 6500),
  ('tv_mounting', 'Mount TV and hide cables in the wall', 'Want the TV mounted and all the cables run inside the wall with an in-wall cable kit so nothing is visible.', 11000),
  ('tv_mounting', 'Remount a TV that fell off a loose bracket', 'Bracket pulled out of the drywall — need it remounted properly into studs, TV itself is fine.', 7000),
  ('tv_mounting', 'Mount two TVs in a home gym', 'Two TVs going up on opposite walls of a home gym, both on articulating arms so they can be angled.', 15000),

  ('painting', 'Paint a small bedroom, walls only', 'Roughly 10x12 bedroom, walls only (not ceiling or trim), paint already purchased in a light gray.', 22000),
  ('painting', 'Touch up scuffed hallway walls', 'Hallway walls have scuffs and scrapes from moving furniture, need touch-up painting to match the existing white.', 9000),
  ('painting', 'Paint an accent wall, dark navy', 'One accent wall in the living room, dark navy paint already purchased, needs careful cutting-in around trim.', 13000),
  ('painting', 'Paint a wooden fence, front yard', 'Wood picket fence along the front yard, needs a fresh coat of white paint, moderate prep work first.', 18000),
  ('painting', 'Paint a nursery, ceiling included', 'Small nursery room, soft yellow on the walls and white on the ceiling, paint already purchased.', 26000),

  ('packing', 'Pack up a 1-bedroom apartment before movers arrive', 'Movers come Saturday and nothing is packed yet. Need help boxing up everything except the bed and couch.', 15000),
  ('packing', 'Pack fragile kitchen items only', 'Just the kitchen — dishes, glassware, and small appliances — need to be carefully wrapped and boxed.', 7000),
  ('packing', 'Unpack and organize kitchen after a move', 'Just moved in and the kitchen boxes are still sealed. Need help unpacking and organizing cabinets and drawers.', 9500),
  ('packing', 'Pack a storage unit efficiently', 'Renting a storage unit and want everything packed and stacked efficiently to maximize the space.', 11000),
  ('packing', 'Pack up a home office, books and electronics', 'Home office move — need books, files, and electronics carefully packed and labeled by room.', 8500)
;

-- 6. Neighborhood targets, matched to the map legend's tiers -----------------
drop table if exists pg_temp.seed_neighborhoods;
create temp table seed_neighborhoods (
  name text, blat double precision, blng double precision, n integer
);
insert into seed_neighborhoods (name, blat, blng, n) values
  ('Gravesend',     40.5947, -73.9707,  3),
  ('Borough Park',  40.6330, -73.9903, 14),
  ('Flatbush',      40.6407, -73.9589, 35),
  ('Flatlands',     40.6234, -73.9276, 60);

-- 7. Generate and insert -----------------------------------------------------
-- Same row-by-row approach as phase22 (each job's own returned id is used
-- immediately for its own job_locations row — see that file for why this
-- avoids the join-back problem a bulk insert would have).
do $$
declare
  v_dlat double precision := 0.27 / 69.0;
  v_dlng double precision := 0.27 / (69.0 * cos(radians(40.7128)));
  v_nb record;
  v_tpl record;
  v_tpl_bag integer[];
  v_tpl_bag_pos integer;
  v_owner uuid;
  v_worker uuid;
  v_job_id uuid;
  v_bid_id uuid;
  v_photos jsonb;
  v_lat double precision;
  v_lng double precision;
  v_status text;
  v_roll double precision;
  v_created_at timestamptz;
  v_profile_count integer;
  v_can_assign boolean;
  v_seq integer := 0;
  v_open_count integer := 0;
  v_assigned_count integer := 0;
  v_completed_count integer := 0;
  v_i integer;
begin
  select count(*) into v_profile_count from public.profiles;
  if v_profile_count = 0 then
    raise exception 'No profiles exist to own seeded jobs — sign up at least one account first.';
  end if;

  -- Assigning a job to a worker means picking a REAL profile other than the
  -- poster. With only one account in the whole project there is no second
  -- person to assign to, so every job falls back to 'open' regardless of the
  -- status roll below — reported explicitly rather than silently.
  v_can_assign := v_profile_count >= 2;
  if not v_can_assign then
    raise notice 'Only 1 profile exists — every seeded job will be status=open (no second account to assign as a worker).';
  end if;
  if v_profile_count < 5 then
    raise notice '% profile(s) exist — poster variety across the 112 seeded jobs is limited to however many real accounts that is.',
      v_profile_count;
  end if;

  for v_nb in select * from seed_neighborhoods loop
    -- Bag shuffle per neighborhood: draw templates without replacement until
    -- the bag is empty, then reshuffle a fresh one. `order by random() limit
    -- 1` per job (the old approach) draws independently every time, so
    -- neighborhoods with dozens of jobs pulled from ~25 templates reliably
    -- produced the same title/description/price more than once — visible as
    -- pixel-identical job cards in the same zone. This guarantees every
    -- template is used once before any of them repeat.
    v_tpl_bag := array(select id from job_templates order by random());
    v_tpl_bag_pos := 0;

    for v_i in 1..v_nb.n loop
      v_seq := v_seq + 1;

      v_tpl_bag_pos := v_tpl_bag_pos + 1;
      if v_tpl_bag_pos > array_length(v_tpl_bag, 1) then
        v_tpl_bag := array(select id from job_templates order by random());
        v_tpl_bag_pos := 1;
      end if;
      select * into v_tpl from job_templates where id = v_tpl_bag[v_tpl_bag_pos];
      select id into v_owner from public.profiles order by random() limit 1;

      -- Status mix: ~80% open, ~10% assigned, ~10% completed — "mostly open,
      -- with real activity", not zero-signal or artificially even thirds.
      v_roll := random();
      if v_can_assign and v_roll < 0.90 and v_roll >= 0.80 then
        v_status := 'assigned';
      elsif v_can_assign and v_roll >= 0.90 then
        v_status := 'completed';
      else
        v_status := 'open';
      end if;

      -- created_at spread over the last ~3 weeks, biased so a completed job
      -- reads as older than one still open — the ordering a real job's
      -- lifecycle would actually have, not just noise.
      v_created_at := case v_status
        when 'completed' then now() - ((7 + random() * 14) * interval '1 day') - (random() * interval '20 hours')
        when 'assigned'  then now() - ((2 + random() * 12) * interval '1 day') - (random() * interval '20 hours')
        else                  now() - ((random() * 14) * interval '1 day')      - (random() * interval '20 hours')
      end;

      -- ~35% of jobs get 1-2 photos — see phase22 for why picsum.photos
      -- rather than a bespoke asset (no existing demo-photo convention here).
      v_photos := case
        when random() < 0.35 then (
          select jsonb_agg(
            'https://picsum.photos/seed/brazos-job23-' || v_seq || '-' || gs || '/800/600'
          )
          from generate_series(1, 1 + (random() < 0.4)::int) as gs
        )
        else '[]'::jsonb
      end;

      if v_status in ('assigned', 'completed') then
        select id into v_worker from public.profiles where id <> v_owner order by random() limit 1;

        insert into public.jobs (
          client_id, title, description, category, location, budget_cents,
          status, assigned_worker_id, final_amount_cents, photos, created_at
        )
        values (
          v_owner, v_tpl.title, v_tpl.description, v_tpl.category::job_category,
          v_nb.name || ', Brooklyn, NY', v_tpl.price_cents,
          v_status::job_status, v_worker, v_tpl.price_cents, v_photos, v_created_at
        )
        returning id into v_job_id;

        -- A real accepted bid, not just a status flag — otherwise an
        -- assigned/completed job would show "0 bids" in the UI, which reads
        -- as more broken than an open job with none at all.
        insert into public.bids (job_id, worker_id, amount_cents, message, status)
        values (v_job_id, v_worker, v_tpl.price_cents, 'Happy to take this on — available this week.', 'accepted')
        returning id into v_bid_id;

        update public.jobs set accepted_bid_id = v_bid_id where id = v_job_id;

        if v_status = 'assigned' then v_assigned_count := v_assigned_count + 1;
        else v_completed_count := v_completed_count + 1;
        end if;
      else
        insert into public.jobs (
          client_id, title, description, category, location, budget_cents,
          status, photos, created_at
        )
        values (
          v_owner, v_tpl.title, v_tpl.description, v_tpl.category::job_category,
          v_nb.name || ', Brooklyn, NY', v_tpl.price_cents,
          'open'::job_status, v_photos, v_created_at
        )
        returning id into v_job_id;

        v_open_count := v_open_count + 1;
      end if;

      v_lat := ((floor(v_nb.blat / v_dlat) + 0.5) * v_dlat) + (random() - 0.5) * v_dlat * 0.8;
      v_lng := ((floor(v_nb.blng / v_dlng) + 0.5) * v_dlng) + (random() - 0.5) * v_dlng * 0.8;

      insert into public.job_locations (job_id, lat, lng)
      values (v_job_id, v_lat, v_lng);
    end loop;
  end loop;

  raise notice 'Seeded % jobs: % open, % assigned, % completed. By neighborhood — Gravesend 3, Borough Park 14, Flatbush 35, Flatlands 60.',
    v_seq, v_open_count, v_assigned_count, v_completed_count;
end $$;

drop table if exists pg_temp.protected_job_ids;
drop table if exists pg_temp.job_templates;
drop table if exists pg_temp.seed_neighborhoods;
