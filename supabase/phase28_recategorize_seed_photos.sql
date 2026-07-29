-- phase28_recategorize_seed_photos.sql
--
-- phase22/phase23 gave seeded jobs photos from picsum.photos, keyed off a
-- per-job seed string. picsum has no notion of category — the seed only
-- picks WHICH random stock photo comes back, not what's in it — so a
-- furniture-assembly job could get (and did get) a landscape photo with
-- nothing to do with the job. phase23 now uses loremflickr.com with
-- category keywords instead (see the v_photo_keyword case there), but that
-- only affects jobs seeded from here on — this migration fixes the photos
-- already sitting on live rows.
--
-- Every photo URL containing "picsum.photos" is replaced with a loremflickr
-- URL built from that job's own category, keeping the same keyword mapping
-- phase23 uses. ?lock=<hash> keeps each photo stable across reloads instead
-- of re-randomizing on every fetch.
--
-- Safe to run more than once: once no job has a picsum URL left, it updates
-- nothing.

do $$
declare
  v_job record;
  v_new_photos jsonb;
  v_keyword text;
  v_updated integer := 0;
begin
  for v_job in
    select id, category, photos
    from public.jobs
    where photos::text like '%picsum.photos%'
  loop
    v_keyword := case v_job.category::text
      when 'handyman' then 'handyman,tools'
      when 'cleaning' then 'cleaning,housekeeping'
      when 'moving' then 'moving,boxes'
      when 'dog_walking' then 'dog,leash'
      when 'yard_work' then 'gardening,yard'
      when 'errands' then 'delivery,package'
      when 'furniture_assembly' then 'furniture,assembly'
      when 'tv_mounting' then 'television,wall'
      when 'painting' then 'paint,wall'
      when 'packing' then 'moving,boxes'
      else 'home,repair'
    end;

    select jsonb_agg(
      'https://loremflickr.com/800/600/' || v_keyword
        || '?lock=' || abs(hashtext(v_job.id::text || ':' || (ord - 1)::text))
      order by ord
    )
    into v_new_photos
    from jsonb_array_elements(v_job.photos) with ordinality as t(elem, ord);

    update public.jobs set photos = coalesce(v_new_photos, '[]'::jsonb) where id = v_job.id;
    v_updated := v_updated + 1;
  end loop;

  raise notice 'Recategorized photos on % job(s) that had picsum.photos placeholders.', v_updated;
end $$;
