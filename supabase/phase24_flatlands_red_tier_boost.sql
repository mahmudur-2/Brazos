-- phase24_flatlands_red_tier_boost.sql
--
-- Nudges the Flatlands hotspot cell over the 50-job "peak" (red) tier
-- threshold (see lib/hotspots.ts's HOTSPOT_TIERS — peak is job_count >= 50).
--
-- Why this can't just be "insert 2 rows": job_hotspots() (phase12) counts
-- OPEN jobs grouped by a 0.27mi grid cell computed from job_locations, not
-- by neighborhood name — and phase23 seeded all 60 Flatlands jobs jittered
-- around the exact same cell center, so they land in one cell. But only
-- ~80% of phase23's jobs were seeded status='open' (the rest assigned/
-- completed, which job_hotspots() excludes), so the cell's actual open
-- count is somewhere under 60, not necessarily just 1-2 short of 50. This
-- computes the real current count live and inserts exactly enough to
-- cross the threshold, rather than guessing a fixed number.
--
-- Safe to run more than once: if the cell is already at/above 50, it
-- inserts nothing.

-- Parallel rows to cycle through instead of hardcoding an exact count of
-- INSERT statements, since how many are actually needed isn't known until
-- the DO block below queries the live count.
create temp table job_templates_p24 (
  idx integer, title text, description text, category text, price_cents integer
);
insert into job_templates_p24 (idx, title, description, category, price_cents) values
  (0, 'Weed and mulch front yard beds', 'Small front yard, about 150 sq ft of beds. Need weeding and a couple bags of mulch spread — I''ll have the mulch delivered.', 'yard_work', 6500),
  (1, 'Help move a couch up one flight of stairs', 'Just need an extra pair of hands for maybe 20 minutes — one flight, no elevator. Couch is already in the lobby.', 'moving', 3000),
  (2, 'Deep clean before a move-out inspection', 'Studio apartment, moving out end of the week and need it spotless for the walkthrough — kitchen, bathroom, floors.', 'cleaning', 9500),
  (3, 'Assemble two bookshelves', 'Both are the same IKEA model, already unboxed. Should be quick if you''ve done this model before.', 'furniture_assembly', 5000),
  (4, 'Pick up prescription and a few groceries', 'Pharmacy pickup plus a short grocery list — receipts for both, I''ll reimburse plus your fee.', 'errands', 2500),
  (5, 'Walk two dogs, weekday afternoons', 'Looking for someone reliable for regular weekday afternoon walks, 30 min each. Friendly dogs, no issues on leash.', 'dog_walking', 4000);

do $$
declare
  v_dlat double precision := 0.27 / 69.0;
  v_dlng double precision := 0.27 / (69.0 * cos(radians(40.7128)));
  -- Same Flatlands base coordinates as phase23's seed_neighborhoods row.
  v_blat double precision := 40.6234;
  v_blng double precision := -73.9276;
  v_ilat bigint;
  v_ilng bigint;
  v_current_count integer;
  v_needed integer;
  v_cap constant integer := 10; -- safety ceiling; see the notice below if hit
  v_owner uuid;
  v_job_id uuid;
  v_lat double precision;
  v_lng double precision;
  v_tpl record;
  v_i integer;
  v_inserted integer := 0;
begin
  v_ilat := floor(v_blat / v_dlat)::bigint;
  v_ilng := floor(v_blng / v_dlng)::bigint;

  select count(*) into v_current_count
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  where j.status = 'open'
    and floor(loc.lat / v_dlat)::bigint = v_ilat
    and floor(loc.lng / v_dlng)::bigint = v_ilng;

  v_needed := greatest(0, 50 - v_current_count);

  if v_needed = 0 then
    raise notice 'Flatlands cell already has % open jobs — already at/above the 50-job red tier. Nothing inserted.', v_current_count;
  else
    if v_needed > v_cap then
      raise notice 'Flatlands cell has % open jobs, % short of 50 — that''s more than the % safety cap, so only inserting % and stopping. Re-run this script to add more.',
        v_current_count, v_needed, v_cap, v_cap;
      v_needed := v_cap;
    end if;

    if not exists (select 1 from public.profiles) then
      raise exception 'No profiles exist to own these jobs — sign up at least one account first.';
    end if;

    for v_i in 1..v_needed loop
      select * into v_tpl from job_templates_p24 where idx = mod(v_i - 1, 6) limit 1;
      -- A fresh random owner per job, not one owner for all of them — matches
      -- phase23's "varied poster identities across jobs" convention.
      select id into v_owner from public.profiles order by random() limit 1;

      insert into public.jobs (
        client_id, title, description, category, location, budget_cents,
        status, photos, created_at
      )
      values (
        v_owner, v_tpl.title, v_tpl.description, v_tpl.category::job_category,
        'Flatlands, Brooklyn, NY', v_tpl.price_cents,
        'open'::job_status, '[]'::jsonb, now() - (random() * interval '3 days')
      )
      returning id into v_job_id;

      -- Same jitter as phase23: capped at 0.4 * cell width so it can't
      -- drift into a neighboring cell and miss the count entirely.
      v_lat := ((v_ilat + 0.5) * v_dlat) + (random() - 0.5) * v_dlat * 0.8;
      v_lng := ((v_ilng + 0.5) * v_dlng) + (random() - 0.5) * v_dlng * 0.8;

      insert into public.job_locations (job_id, lat, lng)
      values (v_job_id, v_lat, v_lng);

      v_inserted := v_inserted + 1;
    end loop;

    raise notice 'Flatlands cell: % open jobs before, % inserted, % now — % the 50-job red tier.',
      v_current_count, v_inserted, v_current_count + v_inserted,
      case when v_current_count + v_inserted >= 50 then 'crosses' else 'still short of' end;
  end if;
end $$;

drop table if exists pg_temp.job_templates_p24;
