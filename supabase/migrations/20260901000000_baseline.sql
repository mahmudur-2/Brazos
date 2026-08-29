


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."bid_status" AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'withdrawn'
);


ALTER TYPE "public"."bid_status" OWNER TO "postgres";


CREATE TYPE "public"."dispute_reason" AS ENUM (
    'not_as_described',
    'incomplete',
    'damage',
    'no_show',
    'other'
);


ALTER TYPE "public"."dispute_reason" OWNER TO "postgres";


CREATE TYPE "public"."dispute_status" AS ENUM (
    'open',
    'withdrawn',
    'resolved'
);


ALTER TYPE "public"."dispute_status" OWNER TO "postgres";


CREATE TYPE "public"."job_category" AS ENUM (
    'dog_walking',
    'cleaning',
    'moving',
    'yard_work',
    'handyman',
    'errands',
    'other',
    'furniture_assembly',
    'tv_mounting',
    'painting',
    'packing'
);


ALTER TYPE "public"."job_category" OWNER TO "postgres";


CREATE TYPE "public"."job_status" AS ENUM (
    'open',
    'assigned',
    'in_progress',
    'completed',
    'cancelled',
    'draft'
);


ALTER TYPE "public"."job_status" OWNER TO "postgres";


CREATE TYPE "public"."job_visibility" AS ENUM (
    'open_market',
    'direct'
);


ALTER TYPE "public"."job_visibility" OWNER TO "postgres";


CREATE TYPE "public"."offer_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'withdrawn',
    'expired',
    'superseded'
);


ALTER TYPE "public"."offer_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."offer_status" IS 'BRAZOS_MASTER_PLAN.md §H.2, verbatim. pending -> accepted | declined | withdrawn | expired | superseded. A counter marks its parent superseded; accept_offer() (Phase 3B) marks sibling chains superseded.';



CREATE TYPE "public"."offer_type" AS ENUM (
    'marketplace_bid',
    'direct_offer'
);


ALTER TYPE "public"."offer_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."offer_type" IS 'How a negotiation started. Set once on the root offer and inherited unchanged by every counter in the chain (enforced by job_offers_parent_inherits_fkey). marketplace_bid = a worker answering a public open job. direct_offer = a customer offering work to one named worker.';



CREATE TYPE "public"."payment_kind" AS ENUM (
    'job_payment',
    'tip'
);


ALTER TYPE "public"."payment_kind" OWNER TO "postgres";


COMMENT ON TYPE "public"."payment_kind" IS '§G: job_payment = the protected checkout for a hire. tip = Phase 10''s review-time tip. Phase 5 writes only job_payment.';



CREATE TYPE "public"."payment_status" AS ENUM (
    'unfunded',
    'pending',
    'authorized',
    'held',
    'released',
    'paid_out',
    'refunded',
    'partially_refunded',
    'failed',
    'voided'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."payment_status" IS 'BRAZOS_MASTER_PLAN.md §H.3: unfunded -> authorized -> held -> released -> paid_out, branches failed/voided (from authorized) and refunded/partially_refunded (from held). The legacy ''pending'' label predates the repo''s migrations; nothing writes it and it is kept only because enum values cannot be dropped.';



CREATE TYPE "public"."user_role" AS ENUM (
    'client',
    'worker',
    'both'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."verification_status" AS ENUM (
    'unverified',
    'pending',
    'verified'
);


ALTER TYPE "public"."verification_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (
    select 1 from public.job_offers o where o.id = p_bid_id and o.job_id = p_job_id
  ) then
    raise exception 'Bid not found for this job';
  end if;

  perform public.accept_offer(p_bid_id);
end;
$$;


ALTER FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") IS 'DEPRECATED compatibility shim (phase46, body superseded by phase47). Delegates to accept_offer(); `bids` statuses follow via the projection trigger. Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."accept_legal_documents"("p_documents" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_doc jsonb;
  v_key text;
  v_version text;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' then
    raise exception 'Expected an array of documents';
  end if;

  for v_doc in select * from jsonb_array_elements(p_documents)
  loop
    v_key := v_doc->>'document';
    v_version := v_doc->>'version';

    if v_key is null or btrim(v_key) = '' then
      raise exception 'Document key missing';
    end if;
    if v_version is null or btrim(v_version) = '' then
      raise exception 'Document version missing';
    end if;

    insert into public.legal_acceptances (user_id, document, version)
    values (v_user, v_key, v_version)
    on conflict (user_id, document, version) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."accept_legal_documents"("p_documents" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_legal_documents"("p_documents" "jsonb") IS 'Records acceptance of one or more legal documents for the calling user, timestamped by the server clock.';



CREATE OR REPLACE FUNCTION "public"."accept_offer"("p_offer_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
  v_job public.jobs;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- LOCK ORDER: jobs, THEN job_offers — phase46's rule, unchanged.
  select job_id into v_job.id from public.job_offers where id = p_offer_id;
  if v_job.id is null then
    raise exception 'Offer not found';
  end if;

  select * into v_job from public.jobs where id = v_job.id for update;
  if not found then
    raise exception 'Job not found';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;

  if v_offer.status = 'accepted' then
    return v_offer.job_id;
  end if;
  -- Phase 50: a lapsed offer cannot win, however fast the tap after the
  -- deadline. Flipped first so the row records expired, not a failed accept.
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has expired and can no longer be accepted';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_offer.customer_id, v_offer.worker_id) then
    raise exception 'This offer cannot be accepted';
  end if;
  if not public.is_profile_active(v_offer.worker_id) then
    raise exception 'Worker is not available';
  end if;
  if v_offer.job_id <> v_job.id then
    raise exception 'Offer no longer belongs to this job';
  end if;
  if v_job.accepted_offer_id is not null or v_job.assigned_worker_id is not null then
    raise exception 'This job has already been assigned';
  end if;
  if v_offer.offer_type = 'marketplace_bid' and v_job.status <> 'open' then
    raise exception 'This job no longer accepts offers';
  end if;
  if v_offer.offer_type = 'direct_offer' and v_job.status <> 'draft' then
    raise exception 'This job no longer accepts offers';
  end if;

  update public.job_offers
     set status = 'accepted', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  -- Phase 50: siblings that had already lapsed record expired; only genuinely
  -- live rivals record superseded. Under the job lock, so atomic either way.
  update public.job_offers
     set status = 'expired', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending'
     and expires_at is not null
     and expires_at <= now();

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending';

  update public.jobs
     set status = 'assigned'::public.job_status,
         assigned_worker_id = v_offer.worker_id,
         accepted_offer_id = v_offer.id,
         final_amount_cents = v_offer.amount_cents
   where id = v_offer.job_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'accepted', v_offer.amount_cents
  );

  return v_offer.job_id;
end;
$$;


ALTER FUNCTION "public"."accept_offer"("p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."account_deletion_blockers"() RETURNS TABLE("kind" "text", "ref_id" "uuid", "label" "text", "detail" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with me as (select auth.uid() as uid)
  select b.kind, b.ref_id, b.label, b.detail
  from (
    -- Jobs the caller posted or is assigned to, not yet in a terminal state.
    select
      'job'::text as kind,
      j.id as ref_id,
      coalesce(nullif(btrim(j.title), ''), 'Untitled job') as label,
      -- No 'open' or 'draft' branch: both are terminal for this gate (see the
      -- header), so neither can reach this CASE.
      case j.status::text
        when 'assigned'    then 'A worker is assigned to this job.'
        when 'in_progress' then 'Work is underway on this job.'
        else 'This job has not reached a final state yet.'
      end as detail,
      1 as sort_group,
      j.created_at as sort_key
    from public.jobs j
    cross join me
    where me.uid is not null
      and (j.client_id = me.uid or j.assigned_worker_id = me.uid)
      and (
        j.status is null
        or j.status not in ('completed', 'cancelled', 'open', 'draft')
      )

    union all

    -- Money that has not finished moving, in either direction.
    select
      case when p.payee_id = me.uid
        then 'payment_incoming'::text
        else 'payment_outgoing'::text
      end as kind,
      coalesce(p.job_id, p.id) as ref_id,
      case when p.payee_id = me.uid
        then 'Payment owed to you'
        else 'Payment you sent'
      end as label,
      case p.status::text
        when 'held'               then 'This payment is being held for a job and has not been released.'
        when 'unfunded'           then 'This payment has not been funded yet.'
        when 'pending'            then 'This payment has not settled yet.'
        when 'authorized'         then 'This payment is authorized but has not been held or released.'
        when 'partially_refunded' then 'A refund on this payment has not completed.'
        else 'This payment has not reached a final state yet.'
      end as detail,
      2 as sort_group,
      p.created_at as sort_key
    from public.payments p
    cross join me
    where me.uid is not null
      and (p.payer_id = me.uid or p.payee_id = me.uid)
      and (
        p.status is null
        or p.status not in ('released', 'paid_out', 'refunded', 'failed', 'voided')
      )

    union all

    -- Disputes the caller opened, or that sit on a job they are party to.
    select
      'dispute'::text as kind,
      d.job_id as ref_id,
      'Open dispute' as label,
      'A dispute on this job has to be resolved before this account can be deleted.' as detail,
      3 as sort_group,
      d.created_at as sort_key
    from public.job_disputes d
    join public.jobs dj on dj.id = d.job_id
    cross join me
    where me.uid is not null
      and (
        d.opened_by = me.uid
        or dj.client_id = me.uid
        or dj.assigned_worker_id = me.uid
      )
      and (
        d.status is null
        or d.status not in ('resolved', 'withdrawn')
      )
  ) b
  order by b.sort_group, b.sort_key desc, b.label;
$$;


ALTER FUNCTION "public"."account_deletion_blockers"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."account_deletion_blockers"() IS 'Everything still tying auth.uid() to money or to another person''s work. Empty = deletion permitted. Every status filter is an allow-list of terminal values (NOT IN), so an unclassified or newly added enum value blocks by default. Takes no parameters on purpose: a caller-supplied id would make this an oracle for other accounts.';



CREATE OR REPLACE FUNCTION "public"."account_deletion_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."account_deletion_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."account_deletion_enabled"() IS 'phase67 sentinel. Present only if phase67_account_deletion.sql committed: the auth.users FK drops, profiles.deleted_at, the single lifecycle predicate, and both deletion RPCs.';



CREATE OR REPLACE FUNCTION "public"."active_work_lifecycle_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."active_work_lifecycle_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_open_reports"() RETURNS TABLE("id" "uuid", "reporter_id" "uuid", "reported_id" "uuid", "reporter_name" "text", "reported_name" "text", "reported_banned" boolean, "job_id" "uuid", "job_title" "text", "reason" "text", "description" "text", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    r.id, r.reporter_id, r.reported_id,
    rp.full_name, rd.full_name, rd.banned,
    r.job_id, j.title,
    r.reason, r.description, r.status, r.created_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles rd on rd.id = r.reported_id
  left join public.jobs j on j.id = r.job_id
  where exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  )
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$$;


ALTER FUNCTION "public"."admin_open_reports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_worker_embeddings"("p_rows" "jsonb", "p_model" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  update public.worker_semantic_docs d
     set embedding       = (r.embedding)::extensions.vector(384),
         embedding_model = p_model,
         embedded_hash   = r.source_hash,
         generated_at    = now(),
         updated_at      = now()
  from (
    select (e ->> 'worker_id')::uuid as worker_id,
           (e ->> 'source_hash')     as source_hash,
           (e -> 'embedding')::text  as embedding
    from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e -> 'embedding') = 'array'
  ) r
  where d.worker_id = r.worker_id
    -- The evidence changed while the model was running. Writing this vector
    -- with the NEW hash would mark a stale embedding fresh and it would never
    -- be regenerated, so the result is dropped and re-queued next pass.
    and d.source_hash = r.source_hash;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."apply_worker_embeddings"("p_rows" "jsonb", "p_model" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_worker_embeddings"("p_rows" "jsonb", "p_model" "text") IS 'service_role only. Stores generated vectors, ignoring any whose source hash moved while the model was running.';



CREATE OR REPLACE FUNCTION "public"."area_for_point"("p_lat" double precision, "p_lng" double precision) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_code   text;
  v_rings  jsonb;
  v_ring   jsonb;
  v_n      integer;
  v_i      integer;
  v_inside boolean;
  x1 double precision; y1 double precision;
  x2 double precision; y2 double precision;
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;

  for v_code, v_rings in
    select a.code, a.rings
    from public.areas a
    where p_lat between a.min_lat and a.max_lat
      and p_lng between a.min_lng and a.max_lng
  loop
    v_inside := false;

    for v_ring in select value from jsonb_array_elements(v_rings) loop
      v_n := jsonb_array_length(v_ring);
      if v_n >= 3 then
        for v_i in 0 .. v_n - 1 loop
          x1 := (v_ring -> v_i ->> 0)::double precision;
          y1 := (v_ring -> v_i ->> 1)::double precision;
          x2 := (v_ring -> ((v_i + 1) % v_n) ->> 0)::double precision;
          y2 := (v_ring -> ((v_i + 1) % v_n) ->> 1)::double precision;
          if ((y1 > p_lat) <> (y2 > p_lat))
             and (p_lng < (x2 - x1) * (p_lat - y1) / nullif(y2 - y1, 0) + x1) then
            v_inside := not v_inside;
          end if;
        end loop;
      end if;
    end loop;

    if v_inside then
      return v_code;
    end if;
  end loop;

  return null;
end
$$;


ALTER FUNCTION "public"."area_for_point"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."area_for_point"("p_lat" double precision, "p_lng" double precision) IS 'Which seeded area contains this point, or null. Even-odd rule over areas.rings, bounding box prefiltered. Deliberately extension-free.';



CREATE OR REPLACE FUNCTION "public"."ban_user"("p_target" "uuid", "p_report_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_phone text;
  v_job record;
  v_other uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may ban users';
  end if;

  update public.profiles set banned = true where id = p_target;

  select phone into v_phone from public.profiles where id = p_target;
  if v_phone is not null and length(btrim(v_phone)) > 0 then
    insert into public.banned_phones (phone, banned_profile_id)
    values (btrim(v_phone), p_target)
    on conflict (phone) do nothing;
  end if;

  -- Cancel anything still in flight, notifying the counterparty.
  for v_job in
    select id, client_id, assigned_worker_id
    from public.jobs
    where status in ('open', 'assigned', 'in_progress')
      and (client_id = p_target or assigned_worker_id = p_target)
  loop
    update public.jobs set status = 'cancelled' where id = v_job.id;

    v_other := case
      when v_job.client_id = p_target then v_job.assigned_worker_id
      else v_job.client_id
    end;

    -- Notify the counterparty in the job's thread. There's no system-sender
    -- concept in `messages`, so this is attributed to the banned user — that
    -- way it lands as an INBOUND message for the person being notified,
    -- rather than appearing as something they sent themselves.
    if v_other is not null then
      insert into public.messages (job_id, sender_id, content)
      values (
        v_job.id,
        p_target,
        'This job was cancelled automatically because this account was suspended by Brazos.'
      );
    end if;
  end loop;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."ban_user"("p_target" "uuid", "p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bids_projection_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."bids_projection_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bids_projection_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase47_bids_projection_trigger.sql has been applied. Created last inside phase47''s transaction, so its presence proves the entire file committed.';



CREATE OR REPLACE FUNCTION "public"."bids_projection_v2_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."bids_projection_v2_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bids_projection_v2_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase48_bids_drift_view_rewrite.sql has been applied. Created last inside phase48''s transaction, so its presence proves the whole file committed, including the reprojection and its zero-drift assertion.';



CREATE OR REPLACE FUNCTION "public"."build_worker_semantic_source"("p_worker" "uuid") RETURNS TABLE("source_text" "text", "evidence" "jsonb", "source_hash" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_completed_titles text[] := '{}';
  v_completed_by_category jsonb := '{}'::jsonb;
  v_completed_total integer := 0;
  v_portfolio_captions text[] := '{}';
  v_portfolio_categories text[] := '{}';
  v_profile_categories text[] := '{}';
  v_bio text;
  v_text text;
begin
  if p_worker is null then
    return;
  end if;

  -- Completed work, most recent first. Capped: gte-small truncates at 512
  -- tokens, so a worker with 200 finished jobs would otherwise push their
  -- portfolio and bio out of the window entirely.
  select
    coalesce(array_agg(t.title order by t.created_at desc), '{}'),
    count(*)::int
  into v_completed_titles, v_completed_total
  from (
    select j.title, j.created_at
    from public.jobs j
    where j.assigned_worker_id = p_worker
      and j.status = 'completed'
      and j.title is not null
    order by j.created_at desc
    limit 25
  ) t;

  select coalesce(jsonb_object_agg(c.category, c.n), '{}'::jsonb)
  into v_completed_by_category
  from (
    select j.category::text as category, count(*)::int as n
    from public.jobs j
    where j.assigned_worker_id = p_worker
      and j.status = 'completed'
    group by j.category
  ) c;

  select
    coalesce(array_agg(p.caption) filter (where p.caption is not null), '{}'),
    coalesce(array_agg(distinct p.category), '{}')
  into v_portfolio_captions, v_portfolio_categories
  from (
    select pi.caption, pi.category
    from public.portfolio_items pi
    where pi.worker_id = p_worker
    order by pi.display_order, pi.created_at
    limit 20
  ) p;

  select coalesce(pr.categories, '{}'), nullif(btrim(coalesce(pr.bio, '')), '')
  into v_profile_categories, v_bio
  from public.profiles pr
  where pr.id = p_worker;

  -- Ordered strongest evidence first, so that if gte-small's 512-token window
  -- truncates anything it truncates the weakest signal.
  v_text := concat_ws(
    E'\n',
    nullif(array_to_string(v_completed_titles, '. '), ''),
    nullif(
      replace(array_to_string(array(select jsonb_object_keys(v_completed_by_category)), ', '), '_', ' '),
      ''
    ),
    nullif(replace(array_to_string(v_portfolio_categories, ', '), '_', ' '), ''),
    nullif(array_to_string(v_portfolio_captions, '. '), ''),
    nullif(replace(array_to_string(v_profile_categories, ', '), '_', ' '), ''),
    v_bio
  );

  v_text := left(btrim(coalesce(v_text, '')), 2000);

  source_text := v_text;
  evidence := jsonb_build_object(
    'completed_total', v_completed_total,
    'completed_by_category', v_completed_by_category,
    'portfolio_categories', to_jsonb(v_portfolio_categories),
    'profile_categories', to_jsonb(v_profile_categories),
    'has_bio', v_bio is not null
  );
  source_hash := md5(v_text);
  return next;
end;
$$;


ALTER FUNCTION "public"."build_worker_semantic_source"("p_worker" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."build_worker_semantic_source"("p_worker" "uuid") IS 'Assembles one worker''s embedding input from completed job titles/categories, portfolio, advertised categories and public bio. Job descriptions, review text and names are deliberately excluded.';



CREATE OR REPLACE FUNCTION "public"."can_delete_own_job"("p_job_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client_id uuid;
  v_status    public.job_status;
begin
  -- Only the two columns the decision needs.
  select j.client_id, j.status
    into v_client_id, v_status
    from public.jobs j
   where j.id = p_job_id;

  -- (a) OWNERSHIP first. A missing job leaves v_client_id NULL and falls out
  --     here, so "does not exist" and "not yours" return the same FALSE.
  --     An anonymous caller has auth.uid() = NULL, which is distinct from any
  --     real client_id, so anon is denied here too.
  if v_client_id is null then
    return false;
  end if;
  if v_client_id is distinct from auth.uid() then
    return false;
  end if;
  if not public.is_active_user() then
    return false;
  end if;

  -- (b) STATUS: only an open job may be deleted (phase29's term).
  if v_status is distinct from 'open'::public.job_status then
    return false;
  end if;

  -- (c) ENGAGEMENT: legacy bids (phase14) and live offers (phase46).
  if exists (select 1 from public.bids b where b.job_id = p_job_id) then
    return false;
  end if;
  if exists (select 1 from public.job_offers o where o.job_id = p_job_id) then
    return false;
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."can_delete_own_job"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_delete_own_job"("p_job_id" "uuid") IS 'phase60. The whole jobs DELETE condition as one call, so jobs_delete_own holds no inline subquery on bids/job_offers to policy-expand (42P17). Returns a bare boolean; every denial reason looks identical to the caller.';



CREATE OR REPLACE FUNCTION "public"."claim_notification_batch"("p_limit" integer DEFAULT 100) RETURNS TABLE("outbox_id" "uuid", "recipient_id" "uuid", "type" "text", "title" "text", "body" "text", "data" "jsonb", "tokens" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.attempts < 5
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ),
  marked as (
    update public.notification_outbox o
       set attempts = o.attempts + 1
      from claimed c
     where o.id = c.id
    returning o.*
  )
  select
    m.id,
    m.recipient_id,
    m.type,
    m.title,
    m.body,
    m.data,
    coalesce(
      array(
        select t.token from public.push_tokens t
        where t.user_id = m.recipient_id and t.active
      ),
      array[]::text[]
    )
  from marked m;
end;
$$;


ALTER FUNCTION "public"."claim_notification_batch"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_job_stats"("p_client_id" "uuid") RETURNS TABLE("posted" bigint, "completed" bigint, "cancelled" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    count(*) filter (where status <> 'draft'),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled')
  from public.jobs
  where client_id = p_client_id;
$$;


ALTER FUNCTION "public"."client_job_stats"("p_client_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."client_job_stats"("p_client_id" "uuid") IS 'Counted (never estimated) posting history for any client — the JobDetail trust signal. SECURITY DEFINER because the counts deliberately cover rows the viewer cannot read row-wise after phase58 dropped the legacy permissive policy.';



CREATE OR REPLACE FUNCTION "public"."close_requests_on_block"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.job_requests
     set status = 'closed',
         updated_at = now()
   where status in ('pending', 'countered')
     and (
       (client_id = new.blocker_id and worker_id = new.blocked_id)
       or (client_id = new.blocked_id and worker_id = new.blocker_id)
     );
  return new;
end;
$$;


ALTER FUNCTION "public"."close_requests_on_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conversation_parties"("p_job_id" "uuid", "p_direct_thread_id" "uuid", OUT "party_a" "uuid", OUT "party_b" "uuid") RETURNS "record"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if (p_job_id is null) = (p_direct_thread_id is null) then
    raise exception 'Exactly one of p_job_id and p_direct_thread_id is required';
  end if;

  if p_job_id is not null then
    select j.client_id, j.assigned_worker_id into party_a, party_b
    from public.jobs j
    where j.id = p_job_id
      and (j.client_id = v_user or j.assigned_worker_id = v_user);
  else
    select t.user_a, t.user_b into party_a, party_b
    from public.direct_threads t
    where t.id = p_direct_thread_id
      and (t.user_a = v_user or t.user_b = v_user);
  end if;

  if party_a is null then
    -- Same wording whether the row is absent or the caller is not party to
    -- it, so this cannot be used to probe other people's conversations.
    raise exception 'Conversation not found';
  end if;
end;
$$;


ALTER FUNCTION "public"."conversation_parties"("p_job_id" "uuid", "p_direct_thread_id" "uuid", OUT "party_a" "uuid", OUT "party_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."counter_notification_copy_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."counter_notification_copy_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."counter_notification_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."counter_notification_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."counter_offer"("p_offer_id" "uuid", "p_amount_cents" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
  -- phase63: the cap, named once. Mirrored by MAX_COUNTERS_PER_SIDE in
  -- lib/offers.ts, which only drives what the UI offers — this is the
  -- enforcement.
  v_max_per_side constant integer := 10;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
  -- LOCK ORDER: jobs, THEN job_offers (phase46:679-692). This lock is what
  -- makes the cap count below atomic — every row that can contribute to it
  -- belongs to this job. Do not move the count above it.
  perform 1 from public.jobs where id = v_job_id for update;

  select * into v_parent from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_parent.customer_id, v_parent.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Phase 50: countering a lapsed offer records the lapse and refuses.
  if public.expire_offer_if_stale(v_parent) then
    raise exception 'This offer has expired and can no longer be countered';
  end if;
  if v_parent.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_parent.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_parent.customer_id, v_parent.worker_id) then
    raise exception 'This offer cannot be updated';
  end if;

  -- >>> phase63: 10 per side, per chain. Scoped to ONE chain by
  -- root_offer_id and to ONE side by author_id; the chain-opening root is
  -- excluded by parent_offer_id is not null. Read under the locks above.
  select count(*) into v_used
  from public.job_offers o
  where o.root_offer_id = v_parent.root_offer_id
    and o.author_id = v_actor
    and o.parent_offer_id is not null;
  if v_used >= v_max_per_side then
    raise exception
      'You have used all % counter-offers on this negotiation. Accept or decline to continue.',
      v_max_per_side;
  end if;
  -- <<< phase63

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  v_next := case when v_actor = v_parent.customer_id
                 then v_parent.worker_id else v_parent.customer_id end;
  v_new_id := gen_random_uuid();

  -- expires_at deliberately not set here: the column default gives the
  -- counter its own fresh 7-day window.
  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, status
  )
  values (
    v_new_id, v_parent.job_id, v_parent.offer_type, p_offer_id, v_parent.root_offer_id,
    v_parent.customer_id, v_parent.worker_id, v_actor, v_next,
    p_amount_cents, 'pending'
  );

  if v_parent.offer_type = 'direct_offer' then
    update public.jobs set budget_cents = p_amount_cents where id = v_parent.job_id;
  end if;

  perform public.offer_post_event(
    v_new_id, v_parent.root_offer_id, v_actor, 'countered', p_amount_cents
  );

  return v_new_id;
end;
$$;


ALTER FUNCTION "public"."counter_offer"("p_offer_id" "uuid", "p_amount_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."counteroffer_cap_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."counteroffer_cap_enabled"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "message" "text",
    "status" "public"."bid_status" DEFAULT 'pending'::"public"."bid_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bids" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_bid"("p_job_id" "uuid", "p_amount_cents" integer, "p_message" "text" DEFAULT ''::"text") RETURNS "public"."bids"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_offer_id uuid;
  v_offer public.job_offers;
  v_bid public.bids;
begin
  v_offer_id := public.create_offer(
    p_amount_cents := p_amount_cents,
    p_job_id := p_job_id,
    p_message := p_message
  );

  select * into v_offer from public.job_offers where id = v_offer_id;

  -- Read back the row the projection wrote, rather than assembling a
  -- plausible-looking one here. If the two ever disagreed, the caller would
  -- get the lie instead of the truth.
  select * into v_bid from public.bids where id = v_offer.root_offer_id;
  if not found then
    -- Cannot happen while the trigger is installed; surfaced rather than
    -- papered over with a synthesized row.
    raise exception 'Bid projection missing for offer %', v_offer_id;
  end if;

  return v_bid;
end;
$$;


ALTER FUNCTION "public"."create_bid"("p_job_id" "uuid", "p_amount_cents" integer, "p_message" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_bid"("p_job_id" "uuid", "p_amount_cents" integer, "p_message" "text") IS 'DEPRECATED compatibility shim (phase46, body superseded by phase47). Delegates to create_offer(); the `bids` row is written by the job_offers projection trigger, not here. Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."create_default_notification_prefs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.notification_prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_default_notification_prefs"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "public"."job_category" DEFAULT 'other'::"public"."job_category" NOT NULL,
    "location_text" "text",
    "budget_cents" integer,
    "status" "public"."job_status" DEFAULT 'open'::"public"."job_status" NOT NULL,
    "assigned_worker_id" "uuid",
    "accepted_bid_id" "uuid",
    "final_amount_cents" integer,
    "scheduled_for" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    "completion_photo_url" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "completion_photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "videos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "completion_videos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visibility" "public"."job_visibility" DEFAULT 'open_market'::"public"."job_visibility" NOT NULL,
    "accepted_offer_id" "uuid",
    "budget_min_cents" integer,
    "budget_max_cents" integer,
    "scheduled_date" "date",
    "arrival_start_hour" smallint,
    "arrival_end_hour" smallint,
    "en_route_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "property_id" "uuid",
    "area_code" "text",
    CONSTRAINT "jobs_arrival_window_valid" CHECK (((("arrival_start_hour" IS NULL) = ("arrival_end_hour" IS NULL)) AND (("arrival_start_hour" IS NULL) OR (("arrival_start_hour" >= 0) AND ("arrival_start_hour" <= 23) AND (("arrival_end_hour" >= 1) AND ("arrival_end_hour" <= 24)) AND ("arrival_start_hour" < "arrival_end_hour"))))),
    CONSTRAINT "jobs_budget_range_valid" CHECK (((("budget_min_cents" IS NULL) OR ("budget_min_cents" > 0)) AND (("budget_max_cents" IS NULL) OR ("budget_max_cents" > 0)) AND (("budget_min_cents" IS NULL) OR ("budget_max_cents" IS NULL) OR ("budget_min_cents" <= "budget_max_cents")))),
    CONSTRAINT "jobs_completion_videos_is_array" CHECK (("jsonb_typeof"("completion_videos") = 'array'::"text")),
    CONSTRAINT "jobs_money_ceiling" CHECK (((("budget_cents" IS NULL) OR (("budget_cents" > 0) AND ("budget_cents" <= 10000000))) AND (("budget_min_cents" IS NULL) OR (("budget_min_cents" > 0) AND ("budget_min_cents" <= 10000000))) AND (("budget_max_cents" IS NULL) OR (("budget_max_cents" > 0) AND ("budget_max_cents" <= 10000000))))),
    CONSTRAINT "jobs_videos_is_array" CHECK (("jsonb_typeof"("videos") = 'array'::"text"))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."jobs"."videos" IS 'Short videos attached to the posting, as public job-photos URLs. Max 2, enforced in create_job/update_job_details. Mirrors the shape of jobs.photos.';



COMMENT ON COLUMN "public"."jobs"."completion_videos" IS 'Video the assigned worker attached when marking the job complete, as public job-photos URLs. Max 1, enforced in transition_job_status(). Mirrors the shape of jobs.completion_photos.';



COMMENT ON COLUMN "public"."jobs"."visibility" IS 'open_market = posted for anyone to bid on. direct = created for one named worker (a direct offer), never listed publicly. Discovery functions filter on this in addition to status.';



COMMENT ON COLUMN "public"."jobs"."accepted_offer_id" IS 'The job_offers row that won. Additive alongside accepted_bid_id, which stays authoritative until Phase 3B moves accept_bid() over and drops it.';



COMMENT ON COLUMN "public"."jobs"."en_route_at" IS 'When the assigned worker tapped "I''m on my way" (mark_worker_arrival). Static declaration — there is no live location anywhere. NULL for jobs worked before phase51 or where the worker skipped it.';



COMMENT ON COLUMN "public"."jobs"."arrived_at" IS 'When the assigned worker tapped "I''ve arrived" (mark_worker_arrival). Setting it backfills en_route_at so the pair can never read arrived-but-never-en-route.';



COMMENT ON COLUMN "public"."jobs"."completed_at" IS 'When transition_job_status moved this job to completed. Drives the 72h auto-release clock (job_payment_state). NULL for jobs completed before phase51 — their clock never runs, deliberately.';



COMMENT ON COLUMN "public"."jobs"."property_id" IS 'Optional link to the poster''s saved property. Never required: every job posted before phase78 has none, and a one-off job never needs one.';



CREATE OR REPLACE FUNCTION "public"."create_job"("p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer DEFAULT NULL::integer, "p_photos" "jsonb" DEFAULT '[]'::"jsonb", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_videos" "jsonb" DEFAULT '[]'::"jsonb", "p_budget_min_cents" integer DEFAULT NULL::integer, "p_budget_max_cents" integer DEFAULT NULL::integer, "p_scheduled_date" "date" DEFAULT NULL::"date", "p_arrival_start_hour" smallint DEFAULT NULL::smallint, "p_arrival_end_hour" smallint DEFAULT NULL::smallint, "p_address_line" "text" DEFAULT NULL::"text") RETURNS "public"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  -- 10 photos per the screen-13 spec (was 5 before phase49).
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  -- Server cap stays 2 (permissive superset) so already-installed builds that
  -- allow two clips keep working; the phase-4 UI itself offers one.
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  insert into public.jobs (
    client_id, title, description, category, location,
    budget_cents, budget_min_cents, budget_max_cents,
    scheduled_date, arrival_start_hour, arrival_end_hour,
    photos, videos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    -- Legacy single-budget mirror: the range's ceiling, so every pre-range
    -- reader (including the locked Worker Home) shows a real, stated number.
    coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    p_budget_min_cents, p_budget_max_cents,
    p_scheduled_date, p_arrival_start_hour, p_arrival_end_hour,
    coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  if p_lat is not null or v_address is not null then
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (v_job.id, p_lat, p_lng, v_address);
  end if;

  return v_job;
end;
$$;


ALTER FUNCTION "public"."create_job"("p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_job_request"("p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_amount_cents" integer, "p_photos" "jsonb" DEFAULT '[]'::"jsonb", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_thread_job_id" "uuid" DEFAULT NULL::"uuid", "p_videos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return public.create_offer(
    p_amount_cents := p_amount_cents,
    p_worker_id := p_worker_id,
    p_title := p_title,
    p_description := p_description,
    p_category := p_category,
    p_location := p_location,
    p_photos := p_photos,
    p_videos := p_videos,
    p_lat := p_lat,
    p_lng := p_lng,
    p_thread_job_id := p_thread_job_id
  );
end;
$$;


ALTER FUNCTION "public"."create_job_request"("p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_amount_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid", "p_videos" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_job_request"("p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_amount_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid", "p_videos" "jsonb") IS 'DEPRECATED compatibility shim (phase46). Delegates to create_offer()''s direct branch. Returns an offer id, not a job_requests id — old builds cannot render the resulting negotiation card (zero production impact: no live rows existed at cutover). Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."create_offer"("p_amount_cents" integer, "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_message" "text" DEFAULT NULL::"text", "p_worker_id" "uuid" DEFAULT NULL::"uuid", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_category" "text" DEFAULT NULL::"text", "p_location" "text" DEFAULT NULL::"text", "p_photos" "jsonb" DEFAULT '[]'::"jsonb", "p_videos" "jsonb" DEFAULT '[]'::"jsonb", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_thread_job_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_customer uuid;
  v_worker uuid;
  v_type public.offer_type;
  v_target_job uuid;
  v_awaiting uuid;
  v_offer_id uuid := gen_random_uuid();
  v_thread uuid;
  v_direct uuid;
  v_stale public.job_offers;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_job_id is not null and p_worker_id is not null then
    raise exception 'Send either a bid on a job or an offer to a worker, not both';
  end if;
  if length(coalesce(p_message, '')) > 500 then
    raise exception 'Message is too long';
  end if;

  if p_job_id is not null then
    ---------------------------------------------------------------- marketplace
    select * into v_job from public.jobs where id = p_job_id for share;
    if not found
       or v_job.status <> 'open'
       or v_job.visibility <> 'open_market' then
      raise exception 'Job is not open';
    end if;
    if v_job.client_id = v_actor then
      raise exception 'A client cannot bid on their own job';
    end if;
    if public.is_blocked_between(v_actor, v_job.client_id) then
      raise exception 'Bid is not allowed';
    end if;

    -- Phase 50: a lapsed previous chain must not block the re-bid the
    -- one-active-chain rule promises. Flip it before the unique index sees
    -- the new root.
    for v_stale in
      select * from public.job_offers o
      where o.job_id = p_job_id and o.worker_id = v_actor
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'marketplace_bid';
    v_target_job := v_job.id;
    v_customer := v_job.client_id;
    v_worker := v_actor;
    v_awaiting := v_job.client_id;

    -- >>> phase61: the chain's thread identity. The pair thread already
    -- exists (phase52's trigger), so this is a get-or-create lookup, not a
    -- new thread population. v_thread stays NULL: see the header for why a
    -- marketplace chain must NOT bind to a job thread.
    v_direct := public.ensure_direct_thread(v_customer, v_worker);
    -- <<< phase61

  else
    -------------------------------------------------------------- direct offer
    if p_worker_id is null then
      raise exception 'Choose a worker to send this offer to';
    end if;
    if p_worker_id = v_actor then
      raise exception 'You cannot send an offer to yourself';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_worker_id) then
      raise exception 'That person is no longer available';
    end if;
    if not public.job_request_parties_ok(v_actor, p_worker_id) then
      raise exception 'This offer cannot be sent';
    end if;
    if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
      raise exception 'Title must be between 1 and 80 characters';
    end if;
    if length(btrim(coalesce(p_description, ''))) > 500 then
      raise exception 'Description must be 500 characters or fewer';
    end if;
    if p_category is null then
      raise exception 'Choose a category';
    end if;
    if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
      raise exception 'Photos must be an array with at most 5 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
      where jsonb_typeof(photo.value) <> 'string' or length(photo.value #>> '{}') > 2048
    ) then
      raise exception 'Each photo must be a valid URL or storage reference';
    end if;
    if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
      raise exception 'Videos must be an array with at most 2 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
      where jsonb_typeof(video.value) <> 'string' or length(video.value #>> '{}') > 2048
    ) then
      raise exception 'Each video must be a valid URL or storage reference';
    end if;
    if (p_lat is null) <> (p_lng is null)
       or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
      raise exception 'Coordinates are invalid';
    end if;

    -- Phase 50: same lapsed-chain sweep for the per-pair direct cap.
    for v_stale in
      select * from public.job_offers o
      where o.customer_id = v_actor and o.worker_id = p_worker_id
        and o.offer_type = 'direct_offer'
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'direct_offer';
    v_customer := v_actor;
    v_worker := p_worker_id;
    v_awaiting := p_worker_id;

    v_target_job := gen_random_uuid();
    insert into public.jobs (
      id, client_id, title, description, category, location,
      budget_cents, status, visibility, photos, videos
    )
    values (
      v_target_job, v_actor, btrim(p_title), coalesce(btrim(p_description), ''),
      p_category::public.job_category, p_location,
      p_amount_cents, 'draft'::public.job_status, 'direct'::public.job_visibility,
      coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb)
    );

    if p_lat is not null then
      insert into public.job_locations (job_id, lat, lng)
      values (v_target_job, p_lat, p_lng);
    end if;

    if p_thread_job_id is not null then
      select j.id into v_thread
      from public.jobs j
      where j.id = p_thread_job_id
        and j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id;
    end if;
    if v_thread is null then
      select j.id into v_thread
      from public.jobs j
      where j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id
        and j.status = 'completed'
      order by j.created_at desc
      limit 1;
    end if;
    if v_thread is null then
      v_direct := public.ensure_direct_thread(v_actor, p_worker_id);
    end if;
  end if;

  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, message, status
  )
  values (
    v_offer_id, v_target_job, v_type, null, v_offer_id,
    v_customer, v_worker, v_actor, v_awaiting,
    p_amount_cents, nullif(btrim(coalesce(p_message, '')), ''), 'pending'
  );

  -- >>> phase61: was `if v_type = 'direct_offer' then` — the root message is
  -- what gives a chain its thread identity, and both kinds need one now.
  -- Exactly one of v_thread / v_direct is set on either path, which is what
  -- the messages_one_thread XOR constraint (phase36:87-98) requires.
  insert into public.messages (
    job_id, direct_thread_id, sender_id, content,
    job_offer_id, request_event, request_amount_cents
  )
  values (v_thread, v_direct, v_actor, '', v_offer_id, 'created', p_amount_cents);
  -- <<< phase61

  return v_offer_id;
exception
  when unique_violation then
    raise exception 'You already have a live offer open here. Settle it before sending another.';
end;
$$;


ALTER FUNCTION "public"."create_offer"("p_amount_cents" integer, "p_job_id" "uuid", "p_message" "text", "p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_photos" "jsonb", "p_videos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewee_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "reviews_photos_is_array" CHECK (("jsonb_typeof"("photos") = 'array'::"text")),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reviews"."photos" IS 'Photos the reviewer attached, as public job-photos URLs under reviews/<uid>/. Max 5, enforced in create_review(). Empty for every review written before phase37.';



CREATE OR REPLACE FUNCTION "public"."create_review"("p_job_id" "uuid", "p_reviewee_id" "uuid", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text", "p_photos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_review public.reviews;
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'completed' then
    raise exception 'Completed job not found';
  end if;
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.client_id = v_user and p_reviewee_id = v_job.assigned_worker_id)
    or (v_job.assigned_worker_id = v_user and p_reviewee_id = v_job.client_id)
  ) then
    raise exception 'Review parties are invalid';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception 'Review comment is too long';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Reviews can carry at most 5 photos';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each review photo must be a valid URL or storage reference';
  end if;

  insert into public.reviews (
    job_id, reviewer_id, reviewee_id, rating, comment, photos
  )
  values (
    p_job_id, v_user, p_reviewee_id, p_rating, nullif(btrim(p_comment), ''), v_photos
  )
  returning * into v_review;

  return v_review;
end;
$$;


ALTER FUNCTION "public"."create_review"("p_job_id" "uuid", "p_reviewee_id" "uuid", "p_rating" integer, "p_comment" "text", "p_photos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false)
  );
$$;


ALTER FUNCTION "public"."current_user_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_banned"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select p.banned from public.profiles p where p.id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."current_user_is_banned"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_push_token"("p_token" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  update public.push_tokens set active = false where token = p_token;
$$;


ALTER FUNCTION "public"."deactivate_push_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_offer"("p_offer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  if v_offer.status = 'declined' then
    return;
  end if;
  -- Phase 50: declining a lapsed offer records expired — the truthful outcome
  -- — and returns without error; "make this go away" is satisfied either way.
  if public.expire_offer_if_stale(v_offer) then
    return;
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;

  update public.job_offers
     set status = 'declined', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'declined', v_offer.amount_cents
  );
end;
$$;


ALTER FUNCTION "public"."decline_offer"("p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_cancelled integer := 0;
  v_withdrawn integer := 0;
  v_offer_failures integer := 0;
  v_auth_deleted integer;
begin
  -- (a)
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- (a2) phase75: lock every job this account is party to, before the gate
  --      reads them. jobs first, always - see the header.
  perform 1
  from public.jobs
  where client_id = v_user or assigned_worker_id = v_user
  order by id
  for update;

  -- (b) The gate. Never a silent no-op: the client matches this exact string
  --     and re-renders the blocker list instead of showing a raw error.
  --     Read AFTER the lock above, so what it sees cannot move under it.
  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  -- (c) Cancel, do not orphan. Raw UPDATE because transition_job_status()
  --     permits only assigned -> in_progress and in_progress -> completed and
  --     authorises only the assigned worker; an open job has no assigned
  --     worker at all. Drafts stay at draft on purpose. IN not NOT IN, so an
  --     unrecognised status is never auto-cancelled. No exception handler
  --     here, deliberately the opposite call from (d): a refusal to cancel the
  --     user's own live posting must abort, or the tombstone commits with a
  --     posting nobody can cancel.
  --
  --     phase75: offers other people authored on these jobs are now settled by
  --     the jobs_settle_offers_on_cancel trigger, which fires on this UPDATE.
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';

  get diagnostics v_cancelled = row_count;

  -- (d) Withdraw outbound commitments through withdraw_offer(), which posts
  --     the chain event that keeps the bids projection and the feed
  --     consistent. Each withdrawal is its own subtransaction: a pending offer
  --     sits on somebody else's job, and one refusal must not veto a deletion
  --     the user is entitled to. Failures are counted and named.
  if to_regclass('public.job_offers') is not null
     and to_regprocedure('public.withdraw_offer(uuid)') is not null then
    for v_offer in
      select o.id
      from public.job_offers o
      where o.author_id = v_user
        and o.status = 'pending'
        and (o.expires_at is null or o.expires_at > now())
      order by o.created_at
    loop
      begin
        perform public.withdraw_offer(v_offer.id);
        v_withdrawn := v_withdrawn + 1;
      exception when others then
        v_offer_failures := v_offer_failures + 1;
        raise notice
          'phase67: offer % could not be withdrawn (%) - left as-is, continuing.',
          v_offer.id, sqlerrm;
        continue;
      end;
    end loop;
  end if;

  -- (e) Hard delete private-only rows carrying no counterparty value.
  --     saved_workers on the user_id side ONLY - a row where this account is
  --     the worker_id is somebody else's private list. mutes goes both ways.
  --     blocks is NOT here: a block has to survive.
  if to_regclass('public.push_tokens') is not null then
    delete from public.push_tokens where user_id = v_user;
  end if;
  if to_regclass('public.notification_prefs') is not null then
    delete from public.notification_prefs where user_id = v_user;
  end if;
  if to_regclass('public.notification_outbox') is not null then
    delete from public.notification_outbox where recipient_id = v_user;
  end if;
  if to_regclass('public.saved_workers') is not null then
    delete from public.saved_workers where user_id = v_user;
  end if;
  if to_regclass('public.mutes') is not null then
    delete from public.mutes where muter_id = v_user or muted_id = v_user;
  end if;
  if to_regclass('public.message_reads') is not null then
    delete from public.message_reads where user_id = v_user;
  end if;
  if to_regclass('public.message_reactions') is not null then
    delete from public.message_reactions where user_id = v_user;
  end if;
  if to_regclass('public.portfolio_items') is not null then
    delete from public.portfolio_items where worker_id = v_user;
  end if;
  if to_regclass('public.worker_services') is not null then
    delete from public.worker_services where worker_id = v_user;
  end if;
  if to_regclass('public.worker_semantic_docs') is not null then
    delete from public.worker_semantic_docs where worker_id = v_user;
  end if;

  -- (f) Scrub the profile to a tombstone. NOT touched on purpose: id,
  --     created_at, rating_avg, rating_count, and banned - deletion must never
  --     launder a ban.
  update public.profiles
     set full_name         = 'Deleted user',
         phone             = null,
         avatar_url        = null,
         bio               = null,
         availability_note = null,
         categories        = null,
         completion_rate   = null,
         on_time_pct       = null,
         response_time     = null,
         is_admin          = false,
         accepting_work    = false,
         deleted_at        = now()
   where id = v_user;

  -- verification_status is a named enum this repo never defines, so the reset
  -- runs only if 'unverified' is actually a label. The app treats anything but
  -- 'verified' as unverified, so skipping is safe; guessing would break it.
  if exists (
    select 1
    from information_schema.columns c
    join pg_namespace ns on ns.nspname = c.udt_schema
    join pg_type t on t.typname = c.udt_name and t.typnamespace = ns.oid
    join pg_enum e on e.enumtypid = t.oid
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'verification_status'
      and e.enumlabel = 'unverified'
  ) then
    execute 'update public.profiles set verification_status = ''unverified'' where id = $1'
      using v_user;
  else
    raise notice
      'phase67: profiles.verification_status left as-is (no ''unverified'' label found).';
  end if;

  -- stripe_account_id appears in no migration in this repo; cleared only if
  -- the live table actually has it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_account_id'
  ) then
    execute 'update public.profiles set stripe_account_id = null where id = $1'
      using v_user;
  end if;

  -- (g) Denormalised identity on retained tables: audited, nothing to scrub.
  --     One exception, unscrubbable: notification_outbox.title/.body embed the
  --     actor's display name with no actor column. Recorded as a follow-up.

  -- (h) Storage cleanup deliberately not attempted.

  -- (i) The auth row. Only reachable because phase67 section 1 dropped every
  --     public foreign key pointing at auth.users. The row-count assertion is
  --     not padding: RLS is enabled on auth.users and this DELETE lands only
  --     while the function owner carries BYPASSRLS. Without the check, a
  --     zero-row DELETE would commit the tombstone and the scrub while the
  --     account could still sign in.
  delete from auth.users where id = v_user;

  get diagnostics v_auth_deleted = row_count;
  if v_auth_deleted <> 1 then
    raise exception
      'phase67: auth.users delete affected % row(s), expected 1. '
      'Rolling back - the profile scrub must not commit without it.',
      v_auth_deleted;
  end if;

  raise notice
    'phase67: account % deleted (% open posting(s) cancelled, % outbound offer(s) withdrawn, % withdrawal(s) failed).',
    v_user, v_cancelled, v_withdrawn, v_offer_failures;

  -- RETAINED DELIBERATELY, all pointing at the tombstone: reviews, reports,
  -- blocks, banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, job_requests, messages, conversations, direct_threads,
  -- job_checklist_items, job_locations.
end;
$_$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_my_account"() IS 'Deletes the CALLING account (auth.uid() only â€” no parameters). Refuses with ACCOUNT_DELETION_BLOCKED while account_deletion_blockers() returns anything. Leaves a tombstone profiles row so retained reviews, payments and disputes still resolve to "Deleted user"; deletes the auth.users row last.';



CREATE OR REPLACE FUNCTION "public"."direct_thread_notifications_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."direct_thread_notifications_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drain_notification_outbox"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'send_push_service_key';

  if v_url is null or v_key is null then
    raise exception 'drain_notification_outbox: vault secrets missing';
  end if;

  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."drain_notification_outbox"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_portfolio_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (
    select count(*) from public.portfolio_items where worker_id = new.worker_id
  ) >= 20 then
    raise exception 'Portfolio is limited to 20 photos. Remove one to add another.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_portfolio_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_notification"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text", "p_type" "text", "p_title" "text", "p_body" "text", "p_data" "jsonb", "p_dedupe_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.should_notify(p_recipient, p_actor, p_category) then
    return;
  end if;

  insert into public.notification_outbox (
    recipient_id, category, type, title, body, data, dedupe_key
  )
  values (
    p_recipient, p_category, p_type, p_title, p_body,
    coalesce(p_data, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) do nothing;
end;
$$;


ALTER FUNCTION "public"."enqueue_notification"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text", "p_type" "text", "p_title" "text", "p_body" "text", "p_data" "jsonb", "p_dedupe_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_direct_thread"("p_a" "uuid", "p_b" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_low uuid := least(p_a, p_b);
  v_high uuid := greatest(p_a, p_b);
  v_id uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'A direct thread needs two different people';
  end if;

  insert into public.direct_threads (user_a, user_b)
  values (v_low, v_high)
  on conflict (user_a, user_b) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.direct_threads
    where user_a = v_low and user_b = v_high;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."ensure_direct_thread"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_thread_for_offer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- ensure_direct_thread orders the pair and upserts; parties are distinct by
  -- job_offers_parties_distinct. Any failure here must not lose the offer
  -- insert itself — the thread is a convenience the next read can rebuild.
  begin
    perform public.ensure_direct_thread(new.customer_id, new.worker_id);
  exception when others then
    raise warning 'ensure_thread_for_offer skipped for offer %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_thread_for_offer"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_thread_for_offer"() IS 'AFTER INSERT on job_offers: guarantees the pair''s direct_threads row exists from the first offer between two users (phase52 — offer-scoped pre-hire chat). Never fails the offer insert.';



CREATE TABLE IF NOT EXISTS "public"."job_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "offer_type" "public"."offer_type" NOT NULL,
    "parent_offer_id" "uuid",
    "root_offer_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "awaiting_id" "uuid",
    "amount_cents" integer NOT NULL,
    "message" "text",
    "status" "public"."offer_status" DEFAULT 'pending'::"public"."offer_status" NOT NULL,
    "source_table" "text",
    "source_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    CONSTRAINT "job_offers_amount_positive" CHECK (("amount_cents" > 0)),
    CONSTRAINT "job_offers_author_is_party" CHECK ((("author_id" = "customer_id") OR ("author_id" = "worker_id"))),
    CONSTRAINT "job_offers_awaiting_is_party" CHECK ((("awaiting_id" IS NULL) OR (("awaiting_id" = "customer_id") OR ("awaiting_id" = "worker_id")))),
    CONSTRAINT "job_offers_money_ceiling" CHECK ((("amount_cents" > 0) AND ("amount_cents" <= 10000000))),
    CONSTRAINT "job_offers_parties_distinct" CHECK (("customer_id" <> "worker_id")),
    CONSTRAINT "job_offers_root_author_matches_type" CHECK ((("parent_offer_id" IS NOT NULL) OR (("offer_type" = 'marketplace_bid'::"public"."offer_type") AND ("author_id" = "worker_id")) OR (("offer_type" = 'direct_offer'::"public"."offer_type") AND ("author_id" = "customer_id")))),
    CONSTRAINT "job_offers_root_shape" CHECK ((("parent_offer_id" IS NULL) = ("root_offer_id" = "id"))),
    CONSTRAINT "job_offers_source_shape" CHECK ((("source_table" IS NULL) = ("source_id" IS NULL))),
    CONSTRAINT "job_offers_source_table_known" CHECK ((("source_table" IS NULL) OR ("source_table" = ANY (ARRAY['bids'::"text", 'job_requests'::"text"]))))
);


ALTER TABLE "public"."job_offers" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_offers" IS 'The single negotiation table (BRAZOS_MASTER_PLAN.md §G). One row per offer REVISION; a negotiation is a chain linked by parent_offer_id and sharing a root_offer_id. Replaces bids + job_requests; both are retired in Phase 3B.';



COMMENT ON COLUMN "public"."job_offers"."offer_type" IS 'Set once on the root, inherited by every counter. Never changes within a chain.';



COMMENT ON COLUMN "public"."job_offers"."parent_offer_id" IS 'Null on a root offer; the offer this one answers otherwise. A counter is identified by HAVING a parent, not by a kind/type value.';



COMMENT ON COLUMN "public"."job_offers"."root_offer_id" IS 'The chain''s first offer. Equals id on a root. Inherited unchanged by every descendant.';



COMMENT ON COLUMN "public"."job_offers"."customer_id" IS 'Stable chain participant. Not "who moved last" (author_id) and not "whose turn" (awaiting_id).';



COMMENT ON COLUMN "public"."job_offers"."worker_id" IS 'Stable chain participant. Not "who moved last" (author_id) and not "whose turn" (awaiting_id).';



COMMENT ON COLUMN "public"."job_offers"."awaiting_id" IS 'Whose move is next; null once the chain is settled. Compare against auth.uid() before allowing any action.';



COMMENT ON COLUMN "public"."job_offers"."source_table" IS 'Provenance for the phase44/phase45 backfills: ''bids'' or ''job_requests''. Null for natively created offers.';



COMMENT ON COLUMN "public"."job_offers"."expires_at" IS 'When a pending offer lapses (§H.2 expired). NULL = never (pre-phase50 rows). Enforced at decision time inside the RPCs: accept/counter REFUSE a lapsed row (their flip rolls back with the refusal, by transaction semantics), while the non-raising touches — decline, create_offer''s re-bid sweep — persist the expired flip. my_pending_offers() excludes lapsed rows; there is no cron (repo rule: on-read-check only).';



CREATE OR REPLACE FUNCTION "public"."expire_offer_if_stale"("p_offer" "public"."job_offers") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_offer.status = 'pending'
     and p_offer.expires_at is not null
     and p_offer.expires_at <= now() then
    update public.job_offers
       set status = 'expired', awaiting_id = null, updated_at = now()
     where id = p_offer.id;
    perform public.offer_post_event(
      p_offer.id, p_offer.root_offer_id, coalesce(auth.uid(), p_offer.author_id),
      'expired', p_offer.amount_cents
    );
    return true;
  end if;
  return false;
end;
$$;


ALTER FUNCTION "public"."expire_offer_if_stale"("p_offer" "public"."job_offers") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_active_mode"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select p.active_mode from public.profiles p where p.id = auth.uid()),
    'customer'
  );
$$;


ALTER FUNCTION "public"."get_my_active_mode"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'both'::"public"."user_role" NOT NULL,
    "verification_status" "public"."verification_status" DEFAULT 'unverified'::"public"."verification_status" NOT NULL,
    "stripe_account_id" "text",
    "rating_avg" numeric(3,2) DEFAULT 0,
    "rating_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completion_rate" numeric,
    "on_time_pct" numeric,
    "response_time" integer,
    "bio" "text",
    "language" "text" DEFAULT 'en'::"text",
    "categories" "text"[],
    "is_admin" boolean DEFAULT false NOT NULL,
    "banned" boolean DEFAULT false NOT NULL,
    "active_mode" "text" DEFAULT 'customer'::"text" NOT NULL,
    "accepting_work" boolean DEFAULT true NOT NULL,
    "availability_note" "text",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "profiles_active_mode_check" CHECK (("active_mode" = ANY (ARRAY['customer'::"text", 'worker'::"text"]))),
    CONSTRAINT "profiles_availability_note_check" CHECK ((("availability_note" IS NULL) OR ("length"("availability_note") <= 140)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."accepting_work" IS 'Screen 66: whether the worker is currently taking new work. Display truth only — nothing blocks a customer from sending an offer; the worker declines as usual.';



COMMENT ON COLUMN "public"."profiles"."availability_note" IS 'Screen 66: a short free-text availability line ("Weekday evenings, weekends"). 140 chars.';



COMMENT ON COLUMN "public"."profiles"."deleted_at" IS 'Set by delete_my_account(). The row is a TOMBSTONE from that moment: it exists only so retained reviews, payments and disputes still resolve to a name ("Deleted user"). Never re-used, never un-set. Read it only through is_profile_active()/is_active_user() â€” phase67 is the one place this column is compared to null.';



CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.*
  from public.profiles p
  where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_phone text := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
begin
  if v_phone is not null and exists (
    select 1 from public.banned_phones bp where bp.phone = v_phone
  ) then
    raise exception 'This phone number is not eligible to register.';
  end if;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    v_phone,
    'both'
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    role = coalesce(public.profiles.role, 'both');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hardening_fixes_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."hardening_fixes_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.is_profile_active(auth.uid());
$$;


ALTER FUNCTION "public"."is_active_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_active_user"() IS 'The caller''s own is_profile_active(). Deliberately nothing but a call to it, so a ban rule and a deletion rule can never disagree.';



CREATE OR REPLACE FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.blocks bl
    where ((bl.blocker_id = a and bl.blocked_id = b)
        or (bl.blocker_id = b and bl.blocked_id = a))
      and (bl.expires_at is null or bl.expires_at > now())
  );
$$;


ALTER FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") IS 'True when either user has an ACTIVE block on the other (symmetric in effect). phase77: a block whose expires_at has passed behaves exactly as no block; NULL expires_at is permanent.';



CREATE OR REPLACE FUNCTION "public"."is_profile_active"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and not coalesce(p.banned, false)
      and p.deleted_at is null
  );
$$;


ALTER FUNCTION "public"."is_profile_active"("p_user" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_profile_active"("p_user" "uuid") IS 'THE account-lifecycle predicate (CLAUDE.md P3-31): true when the profile exists, is not banned, and has not been deleted. Every other gate calls this rather than re-deriving it.';



CREATE OR REPLACE FUNCTION "public"."job_bid_count"("p_job_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select public.job_offer_count(p_job_id) $$;


ALTER FUNCTION "public"."job_bid_count"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_bid_count"("p_job_id" "uuid") IS 'DEPRECATED compatibility shim (phase46) — now a wrapper over job_offer_count(). Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."job_bid_counts"("p_job_ids" "uuid"[]) RETURNS TABLE("job_id" "uuid", "bid_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select c.job_id, c.offer_count from public.job_offer_counts(p_job_ids) c $$;


ALTER FUNCTION "public"."job_bid_counts"("p_job_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_bid_counts"("p_job_ids" "uuid"[]) IS 'DEPRECATED compatibility shim (phase46) — now a wrapper over job_offer_counts(). Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."job_categories_expanded"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."job_categories_expanded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_hotspots"() RETURNS TABLE("ilat" bigint, "ilng" bigint, "cell_lat" double precision, "cell_lng" double precision, "job_count" integer, "categories" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  ),
  cell_cats as (
    select
      floor(loc.lat / p.dlat)::bigint as ilat,
      floor(loc.lng / p.dlng)::bigint as ilng,
      j.category::text as category,
      count(*)::int as n
    from public.jobs j
    join public.job_locations loc on loc.job_id = j.id
    cross join params p
    where j.status = 'open'
      and j.visibility = 'open_market'
    group by 1, 2, 3
  )
  select
    cc.ilat,
    cc.ilng,
    (cc.ilat + 0.5) * p.dlat as cell_lat,
    (cc.ilng + 0.5) * p.dlng as cell_lng,
    sum(cc.n)::int as job_count,
    jsonb_object_agg(cc.category, cc.n) as categories
  from cell_cats cc
  cross join params p
  group by cc.ilat, cc.ilng, p.dlat, p.dlng;
$$;


ALTER FUNCTION "public"."job_hotspots"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_hotspots"() IS 'Aggregated open-market job counts per ~0.27mi grid cell. Returns NO individual job coordinates, and never covers direct/draft jobs.';



CREATE OR REPLACE FUNCTION "public"."job_offer_count"("p_job_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select count(*)::int
  from public.job_offers o
  where o.job_id = p_job_id
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null;
$$;


ALTER FUNCTION "public"."job_offer_count"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") IS 'Count of distinct marketplace bidders on a job (root offers only), readable by anyone. Bypasses job_offers RLS deliberately — a bare count exposes nothing sensitive.';



CREATE OR REPLACE FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) RETURNS TABLE("job_id" "uuid", "offer_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select o.job_id, count(*)::int
  from public.job_offers o
  where auth.uid() is not null
    and p_job_ids is not null
    and array_length(p_job_ids, 1) <= 200
    and o.job_id = any (p_job_ids)
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null
  group by o.job_id;
$$;


ALTER FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) IS 'Batched job_offer_count(). Jobs with no offers are absent; the caller treats a missing id as zero. Capped at 200 ids so this cannot become a bulk scan.';



CREATE OR REPLACE FUNCTION "public"."job_offer_rpcs_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."job_offer_rpcs_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_offer_rpcs_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase46_offer_rpcs_and_rls.sql has been applied. Created last inside phase46''s transaction, so its presence proves the entire file committed.';



CREATE OR REPLACE FUNCTION "public"."job_offers_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."job_offers_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_offers_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase43_job_offers_foundation.sql has been applied. Created last inside phase43''s transaction, so its presence proves the entire file committed.';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "payee_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "platform_fee_cents" integer NOT NULL,
    "stripe_payment_intent_id" "text",
    "status" "public"."payment_status" DEFAULT 'unfunded'::"public"."payment_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "public"."payment_kind" DEFAULT 'job_payment'::"public"."payment_kind" NOT NULL,
    "offer_id" "uuid",
    "provider" "text" DEFAULT 'sandbox'::"text" NOT NULL,
    "provider_ref" "text",
    "authorized_at" timestamp with time zone,
    "held_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "release_reason" "text",
    "paid_out_at" timestamp with time zone,
    CONSTRAINT "payments_amount_positive" CHECK (("amount_cents" > 0)),
    CONSTRAINT "payments_fee_not_negative" CHECK (("platform_fee_cents" >= 0)),
    CONSTRAINT "payments_money_ceiling" CHECK ((("amount_cents" > 0) AND ("amount_cents" <= 10000000))),
    CONSTRAINT "payments_parties_distinct" CHECK (("payer_id" <> "payee_id")),
    CONSTRAINT "payments_provider_known" CHECK (("provider" = 'sandbox'::"text")),
    CONSTRAINT "payments_release_reason_known" CHECK ((("release_reason" IS NULL) OR ("release_reason" = ANY (ARRAY['approved'::"text", 'auto_approved'::"text"]))))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'The money ledger: one row per money event. Phase 5 writes exactly one kind (job_payment) through the sandbox RPCs and stops at held - no release/payout path exists yet. Wallet/earnings surfaces must derive from this table, never a hand-kept balance. F-002 (phase76): RLS verified enabled at apply time; the SELECT boundary is carried by pre-existing policy(ies) created outside version control: parties view own payments. phase76 created no policy because these already exist; this comment is the version-controlled record of their names.';



COMMENT ON COLUMN "public"."payments"."offer_id" IS 'The accepted job_offers row this payment funds — the auditable link from money to the negotiation that produced it.';



COMMENT ON COLUMN "public"."payments"."provider" IS 'Always ''sandbox'' in Phase 5 (enforced by payments_provider_known). A production provider phase widens the CHECK deliberately.';



COMMENT ON COLUMN "public"."payments"."provider_ref" IS 'The provider''s reference for this payment. Sandbox refs are fabricated (sandbox_<uuid>) and say so by their shape. stripe_payment_intent_id is the abandoned pre-repo column, unused, kept for the cleanup phase to drop.';



COMMENT ON COLUMN "public"."payments"."released_at" IS 'When the job_payment left held for released. Stamped only by sandbox_release_job_payment / the 72h auto-release inside job_payment_state; tips are born released and stamp it at insert.';



COMMENT ON COLUMN "public"."payments"."release_reason" IS '''approved'' = the customer approved the finished work; ''auto_approved'' = the 72h on-read clock ran out. NULL for tips and for anything not yet released.';



COMMENT ON COLUMN "public"."payments"."paid_out_at" IS 'When the payee''s simulated cash-out swept this row released -> paid_out (phase55). Sandbox only — no real transfer exists.';



CREATE OR REPLACE FUNCTION "public"."job_payment_state"("p_job_id" "uuid") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found or (v_job.client_id <> v_actor
                   and v_job.assigned_worker_id is distinct from v_actor) then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    return null;
  end if;

  if v_payment.status = 'held'
     and v_job.status = 'completed'
     and v_job.completed_at is not null
     and now() >= v_job.completed_at + interval '72 hours'
     and not exists (
       select 1 from public.job_disputes d
       where d.job_id = p_job_id and d.status = 'open'
     ) then
    update public.payments
       set status = 'released',
           released_at = now(),
           release_reason = 'auto_approved',
           updated_at = now()
     where id = v_payment.id
    returning * into v_payment;
  end if;

  return v_payment;
end;
$$;


ALTER FUNCTION "public"."job_payment_state"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."job_payment_state"("p_job_id" "uuid") IS 'The job''s active job_payment row for its two parties, running the 72h auto-release check on the way (release_reason ''auto_approved''). NULL when checkout never ran. The on-read pattern, same as offer expiry — there is no cron.';



CREATE OR REPLACE FUNCTION "public"."job_request_parties_ok"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if public.is_blocked_between(p_a, p_b) then
    return false;
  end if;
  if not (public.is_profile_active(p_a) and public.is_profile_active(p_b)) then
    return false;
  end if;
  return true;
end;
$$;


ALTER FUNCTION "public"."job_request_parties_ok"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_in_cell"("p_ilat" bigint, "p_ilng" bigint) RETURNS TABLE("id" "uuid", "client_id" "uuid", "title" "text", "description" "text", "category" "text", "location" "text", "budget_cents" integer, "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join params p
  where j.status = 'open'
    and j.visibility = 'open_market'
    and floor(loc.lat / p.dlat)::bigint = p_ilat
    and floor(loc.lng / p.dlng)::bigint = p_ilng
  order by j.created_at desc;
$$;


ALTER FUNCTION "public"."jobs_in_cell"("p_ilat" bigint, "p_ilng" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."jobs_in_cell"("p_ilat" bigint, "p_ilng" bigint) IS 'Open-market jobs within one hotspot grid cell, WITHOUT lat/lng. Never covers direct/draft jobs.';



CREATE OR REPLACE FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) RETURNS TABLE("id" "uuid", "client_id" "uuid", "title" "text", "description" "text", "category" "text", "location" "text", "budget_cents" integer, "status" "text", "created_at" timestamp with time zone, "photos" "jsonb", "videos" "jsonb", "distance_miles" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with bounded as (
    select least(greatest(coalesce(nullif(p_radius_miles, 0), 25), 0.5), 50)::double precision as radius_miles
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.snapped_miles as distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join bounded b
  cross join lateral (
    select greatest(
             0.5,
             round((2 * 3958.8 * asin(least(1, sqrt(
               sin(radians((loc.lat - p_lat) / 2)) ^ 2
               + cos(radians(p_lat)) * cos(radians(loc.lat))
                 * sin(radians((loc.lng - p_lng) / 2)) ^ 2
             ))) * 2)::numeric, 0) / 2.0
           )::double precision as snapped_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.snapped_miles <= b.radius_miles
  order by d.snapped_miles asc, j.created_at desc, j.id asc;
$$;


ALTER FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) IS 'Open-market jobs within p_radius_miles of (p_lat, p_lng), nearest first. Never returns raw stored coordinates, and never covers direct/draft jobs.';



CREATE OR REPLACE FUNCTION "public"."legal_acceptance_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."legal_acceptance_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_direct_thread_read"("p_thread_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  update public.direct_threads
     set user_a_read_at = case when user_a = v_user then now() else user_a_read_at end,
         user_b_read_at = case when user_b = v_user then now() else user_b_read_at end
   where id = p_thread_id
     and (user_a = v_user or user_b = v_user);
end;
$$;


ALTER FUNCTION "public"."mark_direct_thread_read"("p_thread_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") RETURNS "public"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_step not in ('en_route', 'arrived') then
    raise exception 'Unknown arrival step';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' then
    raise exception 'Arrival can only be marked before the job is started';
  end if;

  update public.jobs
     set en_route_at = coalesce(en_route_at, now()),
         arrived_at = case
           when p_step = 'arrived' then coalesce(arrived_at, now())
           else arrived_at
         end
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;


ALTER FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") IS 'The assigned worker declares en_route or arrived on an assigned job. Monotonic + idempotent: timestamps are set once, never cleared; arrived backfills en_route. No live location exists anywhere.';



CREATE OR REPLACE FUNCTION "public"."mark_worker_semantic_stale"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  begin
    if tg_table_name = 'jobs' then
      if tg_op <> 'DELETE' and new.assigned_worker_id is not null then
        perform public.refresh_worker_semantic_doc(new.assigned_worker_id);
      end if;
      -- Reassignment has to update the worker who LOST the job too.
      if tg_op = 'UPDATE'
         and old.assigned_worker_id is not null
         and old.assigned_worker_id is distinct from new.assigned_worker_id then
        perform public.refresh_worker_semantic_doc(old.assigned_worker_id);
      end if;

    elsif tg_table_name = 'portfolio_items' then
      if tg_op = 'DELETE' then
        perform public.refresh_worker_semantic_doc(old.worker_id);
      else
        perform public.refresh_worker_semantic_doc(new.worker_id);
      end if;

    elsif tg_table_name = 'profiles' then
      if tg_op <> 'DELETE' then
        perform public.refresh_worker_semantic_doc(new.id);
      end if;
    end if;
  exception when others then
    raise notice 'worker semantic refresh skipped: %', sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."mark_worker_semantic_stale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marketplace_thread_identity_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."marketplace_thread_identity_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[] DEFAULT '{}'::"text"[], "p_limit" integer DEFAULT 12, "p_min_similarity" double precision DEFAULT 0.30) RETURNS TABLE("worker_id" "uuid", "full_name" "text", "avatar_url" "text", "verification_status" "text", "rating_avg" numeric, "rating_count" integer, "categories" "text"[], "matched_categories" "text"[], "evidence_categories" "text"[], "related_completed" integer, "completed_total" integer, "semantic_score" double precision, "final_score" double precision, "reason_code" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  -- RANKING WEIGHTS. Declared as plain literals on purpose: tests/
  -- workerMatching.test.mjs reads them straight out of this file and drives its
  -- ranking assertions with whatever is actually deployed here, so the weights
  -- and the regression they are supposed to guarantee cannot drift apart.
  --
  -- w_semantic dominates because the defect being fixed is precisely a generic
  -- category tick outranking real, relevant completed work. w_rating is held
  -- low enough that a well-reviewed but irrelevant worker cannot climb over a
  -- clearly more relevant one: the most rating can ever contribute is 0.15,
  -- while the semantic gap between a paraphrase match and an unrelated
  -- document is worth several times that.
  w_semantic     constant double precision := 0.55;
  w_related_jobs constant double precision := 0.15;
  w_rating       constant double precision := 0.15;
  w_category     constant double precision := 0.10;
  w_history      constant double precision := 0.05;

  v_viewer     uuid := auth.uid();
  v_query      extensions.vector(384);
  v_limit      integer := least(greatest(coalesce(p_limit, 12), 1), 30);
  v_floor      double precision := least(greatest(coalesce(p_min_similarity, 0.30), 0), 1);
  v_categories text[] := coalesce(p_categories, '{}');
begin
  if v_viewer is null then
    raise exception 'Sign in to search for workers.' using errcode = '42501';
  end if;

  if p_query_embedding is null or coalesce(array_length(p_query_embedding, 1), 0) <> 384 then
    raise exception 'Query embedding must have exactly 384 dimensions.' using errcode = '22023';
  end if;

  v_query := ('[' || array_to_string(p_query_embedding, ',') || ']')::extensions.vector(384);

  return query
  with stats as (
    select
      j.assigned_worker_id as wid,
      count(*)::int as completed_total,
      count(*) filter (where j.category::text = any (v_categories))::int as related_completed
    from public.jobs j
    where j.status = 'completed'
      and j.assigned_worker_id is not null
    group by j.assigned_worker_id
  ),
  scored as (
    select
      p.id,
      p.full_name,
      p.avatar_url,
      -- THE FIX. p.verification_status is a named enum type in the live
      -- database (not text), which is why `return query` failed at execution
      -- time with 42804 even though this function's DDL created cleanly and
      -- verify-schema's limit=0 probe never noticed. Every other selected
      -- column below was checked against its real source type - see the file
      -- header - and none of them needed a cast.
      p.verification_status::text as verification_status,
      p.rating_avg,
      p.rating_count,
      coalesce(p.categories, '{}'::text[]) as categories,
      -- ORDER BY, because INTERSECT guarantees no ordering of its own and the
      -- first entry ends up in the result explanation. Cardinality is all the
      -- score uses, but the sentence under a card should not change between
      -- two identical searches.
      array(
        select unnest(coalesce(p.categories, '{}'::text[]))
        intersect
        select unnest(v_categories)
        order by 1
      ) as matched_categories,
      -- Which categories this worker's COMPLETED work is actually in, taken
      -- from the aggregate half of `evidence`. Never any free text, so a result
      -- explanation structurally cannot quote a client's job title.
      array(
        select t.k
        from jsonb_each_text(coalesce(d.evidence -> 'completed_by_category', '{}'::jsonb)) t(k, v)
        order by (t.v)::int desc, t.k
        limit 2
      )::text[] as evidence_categories,
      -- Cosine similarity. Clamped at 0 so an opposed vector cannot go
      -- negative and drag a worker below someone with no evidence at all.
      greatest(0::double precision, 1 - (d.embedding <=> v_query)) as sim,
      coalesce(s.completed_total, 0) as completed_total,
      coalesce(s.related_completed, 0) as related_completed
    from public.worker_semantic_docs d
    join public.profiles p on p.id = d.worker_id
    left join stats s on s.wid = p.id
    where d.embedding is not null
      -- Never rank the searcher against themselves.
      and p.id <> v_viewer
      -- Banned/inactive accounts stay out, matching is_profile_active().
      and coalesce(p.banned, false) = false
      -- phase68: public.is_profile_active(uuid) is the canonical predicate.
      -- Inlined here for scan performance, not duplicated by accident.
      and p.deleted_at is null
  ),
  blended as (
    select
      sc.*,
      (
        w_semantic * sc.sim
        + w_related_jobs * least(sc.related_completed / 5.0, 1)
        + w_rating * (
            -- Same shrinkage as ratingScore() in lib/workerSearch.ts: neutral
            -- 0.6 for an unreviewed worker, pulled toward the real average only
            -- as the review count earns it.
            0.6 + (least(greatest(coalesce(sc.rating_avg, 0) / 5.0, 0), 1) - 0.6)
                  * least(coalesce(sc.rating_count, 0) / 5.0, 1)
          )
        + w_category * (
            case
              when cardinality(v_categories) = 0 then 0.5
              else least(cardinality(sc.matched_categories)::numeric / cardinality(v_categories), 1)
            end
          )
        + w_history * least(sc.completed_total / 10.0, 1)
      )::double precision as final_score
    from scored sc
  )
  select
    b.id,
    b.full_name,
    b.avatar_url,
    b.verification_status,
    b.rating_avg,
    b.rating_count,
    b.categories,
    b.matched_categories,
    b.evidence_categories,
    b.related_completed,
    b.completed_total,
    b.sim,
    b.final_score,
    case
      when b.related_completed > 0 then 'related_completed'
      when b.completed_total > 0   then 'similar_work'
      when cardinality(b.matched_categories) > 0 then 'lists_category'
      else 'general'
    end as reason_code
  from blended b
  -- Below the floor the match is not defensible, so the row is dropped rather
  -- than used to pad the page out to p_limit.
  where b.sim >= v_floor
  -- id is the final tie-break so two identically-scored workers always come
  -- back in the same order, run to run.
  order by b.final_score desc, b.sim desc, b.id asc
  limit v_limit;
end;
$$;


ALTER FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[], "p_limit" integer, "p_min_similarity" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[], "p_limit" integer, "p_min_similarity" double precision) IS 'Hybrid semantic + reputation worker ranking. Requires a signed-in caller, excludes the caller and banned accounts, and returns only card-renderable fields — never the embedding, source_text or evidence blob. phase40 cast verification_status to text; no other behavioural change from phase39.';



CREATE OR REPLACE FUNCTION "public"."messaging_lock_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."messaging_lock_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid" DEFAULT NULL::"uuid", "p_direct_thread_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    -- A job's own thread: the pair is the client and the worker they hired.
    when p_job_id is not null then exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and j.assigned_worker_id is not null
        and j.status in ('assigned', 'in_progress', 'completed')
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
    -- The pair's own thread: open once ANY job between these two people has
    -- reached assignment. A cancelled job does not unlock anything.
    when p_direct_thread_id is not null then exists (
      select 1
      from public.direct_threads t
      join public.jobs j
        on (j.client_id = t.user_a and j.assigned_worker_id = t.user_b)
        or (j.client_id = t.user_b and j.assigned_worker_id = t.user_a)
      where t.id = p_direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and j.status in ('assigned', 'in_progress', 'completed')
    )
    else false
  end;
$$;


ALTER FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid", "p_direct_thread_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid", "p_direct_thread_id" "uuid") IS 'THE pre-confirmation messaging gate (phase66). True once the caller and their counterparty share a job that reached assignment and was not cancelled — the state accept_offer() produces. Answers only about the caller''s own conversations. Used by both messages_insert_party and the chat screen, so the enforcement and the UI cannot drift.';



CREATE OR REPLACE FUNCTION "public"."mirror_offer_chain_to_bids"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.offer_type = 'marketplace_bid' then
    perform public.project_offer_chain_to_bids(new.root_offer_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."mirror_offer_chain_to_bids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_pending_job_requests"() RETURNS TABLE("id" "uuid", "thread_job_id" "uuid", "direct_thread_id" "uuid", "client_id" "uuid", "worker_id" "uuid", "amount_cents" integer, "status" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select o.id, o.thread_job_id, o.direct_thread_id,
         o.customer_id, o.worker_id, o.amount_cents, o.status, o.updated_at
  from public.my_pending_offers() o
  where o.offer_type = 'direct_offer';
$$;


ALTER FUNCTION "public"."my_pending_job_requests"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_pending_job_requests"() IS 'DEPRECATED compatibility shim (phase46) — now a filtered view of my_pending_offers(). Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."my_pending_offers"() RETURNS TABLE("id" "uuid", "job_id" "uuid", "offer_type" "text", "thread_job_id" "uuid", "direct_thread_id" "uuid", "customer_id" "uuid", "worker_id" "uuid", "amount_cents" integer, "status" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    o.id, o.job_id, o.offer_type::text,
    t.job_id, t.direct_thread_id,
    o.customer_id, o.worker_id, o.amount_cents, o.status::text, o.updated_at
  from public.job_offers o
  left join lateral (
    select m.job_id, m.direct_thread_id
    from public.messages m
    where m.job_offer_id = o.root_offer_id
      and m.request_event = 'created'
    order by m.created_at
    limit 1
  ) t on true
  where o.awaiting_id = auth.uid()
    and o.status = 'pending'
    and (o.expires_at is null or o.expires_at > now())
  order by o.updated_at desc;
$$;


ALTER FUNCTION "public"."my_pending_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notification_feed_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."notification_feed_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_display_name"("p_user" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(nullif(btrim(p.full_name), ''), 'Someone')
  from public.profiles p where p.id = p_user;
$$;


ALTER FUNCTION "public"."notify_display_name"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_nearby_for_job"("p_job_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_job public.jobs;
  v_loc public.job_locations;
  v_candidate record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null or v_job.status <> 'open' then
    return;
  end if;

  select * into v_loc from public.job_locations where job_id = p_job_id;
  if v_loc.job_id is null then
    return;
  end if;

  for v_candidate in
    select np.user_id
    from public.notification_prefs np
    join public.profiles p on p.id = np.user_id
    where np.nearby_jobs
      and np.home_lat is not null
      and np.home_lng is not null
      and np.user_id <> v_job.client_id
      and not coalesce(p.banned, false)
      and (
        p.categories is null
        or array_length(p.categories, 1) is null
        or v_job.category::text = any(p.categories)
      )
      and v_loc.lat between np.home_lat - (np.nearby_radius_miles / 69.0)
                        and np.home_lat + (np.nearby_radius_miles / 69.0)
      and 3958.8 * 2 * asin(sqrt(
            power(sin(radians(v_loc.lat - np.home_lat) / 2), 2)
            + cos(radians(np.home_lat)) * cos(radians(v_loc.lat))
              * power(sin(radians(v_loc.lng - np.home_lng) / 2), 2)
          )) <= np.nearby_radius_miles
  loop
    perform public.enqueue_notification(
      v_candidate.user_id,
      v_job.client_id,
      'nearby_jobs',
      'job_nearby',
      'New job near you',
      left(v_job.title, 80) || coalesce(' · ' || v_job.location, ''),
      jsonb_build_object('screen', 'JobDetail', 'jobId', v_job.id::text),
      'job_nearby:' || v_job.id::text || ':' || v_candidate.user_id::text
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."notify_nearby_for_job"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_bid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_job public.jobs;
  v_worker_name text;
  v_rival record;
begin
  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_worker_name := public.notify_display_name(new.worker_id);

  -- (2) The client who posted the job.
  perform public.enqueue_notification(
    v_job.client_id,
    new.worker_id,
    'bids',
    'bid_received',
    'New bid on ' || left(v_job.title, 60),
    v_worker_name || ' bid $' || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00'),
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.job_id::text),
    'bid_received:' || new.id::text
  );

  -- (3) Competitive pressure: everyone else who already bid on this job.
  -- Governed by the same 'bids' toggle — of the five switches the user has,
  -- this is bid activity, so it belongs with bids rather than job updates.
  for v_rival in
    select distinct b.worker_id
    from public.bids b
    where b.job_id = new.job_id
      and b.worker_id <> new.worker_id
      and b.status = 'pending'
  loop
    perform public.enqueue_notification(
      v_rival.worker_id,
      new.worker_id,
      'bids',
      'bid_competition',
      'Another bid came in',
      'Someone else bid on ' || left(v_job.title, 60) || '. Your bid is still pending.',
      jsonb_build_object('screen', 'JobDetail', 'jobId', new.job_id::text),
      'bid_competition:' || new.id::text || ':' || v_rival.worker_id::text
    );
  end loop;

  return new;
end;
$_$;


ALTER FUNCTION "public"."notify_on_bid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_dispute"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_worker uuid;
begin
  select assigned_worker_id into v_worker from public.jobs where id = new.job_id;
  if v_worker is not null then
    perform public.enqueue_notification(
      v_worker,
      new.opened_by,
      'jobs',
      'dispute_opened',
      'An issue was reported',
      'The customer reported an issue with the finished work — the payment holds while it''s open.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'dispute_opened:' || new.id::text
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_dispute"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_job_location"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.notify_nearby_for_job(new.job_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_job_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_job_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_recipient uuid;
  v_actor uuid;
  v_amount text;
  v_title text;
  v_body text;
  v_type text;
begin
  v_amount := '$' || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00');

  if tg_op = 'INSERT' then
    -- A new request always awaits the worker.
    v_recipient := new.awaiting_id;
    v_actor := new.client_id;
    v_type := 'hire_request';
    v_title := 'New job request';
    v_body := public.notify_display_name(v_actor) || ' wants to hire you for '
              || left(new.title, 50) || ' at ' || v_amount || '.';

  elsif new.status = 'countered'
        and (
          old.status is distinct from new.status
          or old.amount_cents is distinct from new.amount_cents
        ) then
    -- The turn passed to awaiting_id, so they are the one to tell.
    v_recipient := new.awaiting_id;
    v_actor := case when new.awaiting_id = new.client_id then new.worker_id else new.client_id end;
    v_type := 'hire_countered';
    v_title := 'Counter-offer';
    v_body := public.notify_display_name(v_actor) || ' countered at ' || v_amount || '.';

  elsif new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    -- respond_job_request() parks awaiting_id on whoever acted, so the person
    -- to notify is the other party.
    v_actor := new.awaiting_id;
    v_recipient := case when new.awaiting_id = new.client_id then new.worker_id else new.client_id end;
    if new.status = 'accepted' then
      v_type := 'hire_accepted';
      v_title := 'Request accepted';
      v_body := public.notify_display_name(v_actor) || ' accepted at ' || v_amount || '.';
    else
      v_type := 'hire_declined';
      v_title := 'Request declined';
      v_body := public.notify_display_name(v_actor) || ' declined the request.';
    end if;

  else
    -- 'closed' is what the block trigger sets. Nobody wants a push telling
    -- them a negotiation ended because they were blocked.
    return new;
  end if;

  perform public.enqueue_notification(
    v_recipient,
    v_actor,
    'hire_requests',
    v_type,
    v_title,
    v_body,
    jsonb_build_object('screen', 'Chat', 'jobId', new.thread_job_id::text),
    v_type || ':' || new.id::text || ':' || new.updated_at::text
  );

  return new;
end;
$_$;


ALTER FUNCTION "public"."notify_on_job_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_job_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- (4) Assigned to a worker — covers both accepting a bid and a direct hire.
  if new.assigned_worker_id is not null
     and (old.assigned_worker_id is null or old.assigned_worker_id <> new.assigned_worker_id)
  then
    perform public.enqueue_notification(
      new.assigned_worker_id,
      new.client_id,
      'job_updates',
      'job_assigned',
      'You got the job',
      left(new.title, 80) || ' is yours. Tap for the details.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.id::text),
      'job_assigned:' || new.id::text || ':' || new.assigned_worker_id::text
    );
  end if;

  -- (5) Worker marked it complete — tell the client, and land them on the
  -- screen showing the completion photos.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.enqueue_notification(
      new.client_id,
      new.assigned_worker_id,
      'job_updates',
      'job_completed',
      'Job marked complete',
      coalesce(public.notify_display_name(new.assigned_worker_id), 'The worker')
        || ' finished ' || left(new.title, 60) || '.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text),
      'job_completed:' || new.id::text
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_job_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the negotiation triggers, which know the state — notifying
  -- here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  -- phase61: marketplace offer chains now post thread messages, which they
  -- never did before. Their lifecycle is already notified by dedicated
  -- triggers — phase20 bid_received for the root (via the phase47 projection)
  -- and phase59 offer_countered for counters — so a generic "New message"
  -- here would double-buzz the same action. Scoped to marketplace chains:
  -- direct-offer events keep the exact behaviour phase57 shipped, and normal
  -- chat never carries job_offer_id (lib/messages.ts sendMessage()).
  if new.job_offer_id is not null and new.request_event is not null then
    perform 1
      from public.job_offers o
     where o.id = new.job_offer_id
       and o.offer_type = 'marketplace_bid';
    if found then
      return new;
    end if;
  end if;

  if new.job_id is not null then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.id is null then
      return new;
    end if;
    v_recipient := case
      when v_job.client_id = new.sender_id then v_job.assigned_worker_id
      else v_job.client_id
    end;
  elsif new.direct_thread_id is not null then
    -- phase57: the pre-hire pair thread. The recipient is simply the other
    -- participant.
    select * into v_thread from public.direct_threads where id = new.direct_thread_id;
    if v_thread.id is null then
      return new;
    end if;
    v_recipient := case
      when v_thread.user_a = new.sender_id then v_thread.user_b
      else v_thread.user_a
    end;
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  v_preview := case
    when new.audio_url is not null then 'Voice message'
    when new.image_url is not null and coalesce(btrim(new.content), '') = '' then 'Photo'
    when new.image_url is not null then '📷 ' || new.content
    else new.content
  end;

  perform public.enqueue_notification(
    v_recipient,
    new.sender_id,
    'messages',
    'message',
    public.notify_display_name(new.sender_id),
    left(coalesce(nullif(btrim(v_preview), ''), 'New message'), 140),
    case
      when new.job_id is not null then
        jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text)
      else
        jsonb_build_object('screen', 'Chat', 'directThreadId', new.direct_thread_id::text)
    end,
    'message:' || new.id::text
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_offer_counter"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_job public.jobs;
  v_author_name text;
  v_author_first text;
begin
  -- Counters only: a chain row WITH a parent. Root offers keep their existing
  -- notification (phase47 projection -> phase20 bid_received), and settled
  -- rows never arrive here pending.
  if new.parent_offer_id is null
     or new.status <> 'pending'
     or new.awaiting_id is null then
    return new;
  end if;

  -- Marketplace chains only — a direct-offer counter is notified through its
  -- thread message, and a second row here would double-notify the same moment.
  if new.offer_type <> 'marketplace_bid' then
    return new;
  end if;

  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_author_name := public.notify_display_name(new.author_id);
  -- phase62: first name only. notify_display_name() already supplies the
  -- fallback for a missing profile, so a name with no space (or none at all)
  -- falls back to that whole value rather than to an empty string.
  v_author_first := coalesce(
    nullif(split_part(btrim(v_author_name), ' ', 1), ''),
    v_author_name
  );

  perform public.enqueue_notification(
    new.awaiting_id,
    new.author_id,
    'bids',
    'offer_countered',
    'New counter-offer on ' || left(v_job.title, 60),
    v_author_first || ' sent you a Counteroffer for $'
      || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00')
      || ' — your move.',
    jsonb_build_object(
      -- Unchanged from phase59: the awaiting party's OWN response surface.
      -- The job owner answers on ClientJobDetail (BidDetail lives behind it),
      -- the worker on JobDetail. Both are lib/notificationRoutes.ts's map.
      'screen',
      case when new.awaiting_id = v_job.client_id
        then 'ClientJobDetail'
        else 'JobDetail'
      end,
      'jobId', new.job_id::text
    ),
    'offer_countered:' || new.id::text
  );

  return new;
end;
$_$;


ALTER FUNCTION "public"."notify_on_offer_counter"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_payment_release"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_title text;
begin
  if new.status = 'released' and old.status is distinct from 'released'
     and new.kind = 'job_payment' then
    v_title := case when new.release_reason = 'auto_approved'
      then 'Payment released automatically'
      else 'Your work was approved' end;
    perform public.enqueue_notification(
      new.payee_id,
      new.payer_id,
      'jobs',
      'payment_released',
      v_title,
      'The payment is released to you in the sandbox ledger.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'payment_released:' || new.id::text
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_payment_release"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.enqueue_notification(
    new.reviewee_id,
    new.reviewer_id,
    'job_updates',
    'review_received',
    'You got a review',
    public.notify_display_name(new.reviewer_id) || ' left you '
      || new.rating::text || '★.',
    jsonb_build_object('screen', 'ProfileMain'),
    'review:' || new.id::text
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."offer_post_event"("p_offer_id" "uuid", "p_root_id" "uuid", "p_actor" "uuid", "p_event" "text", "p_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_job uuid;
  v_thread uuid;
begin
  select m.job_id, m.direct_thread_id
    into v_job, v_thread
  from public.messages m
  where m.job_offer_id = p_root_id
    and m.request_event = 'created'
  order by m.created_at
  limit 1;

  -- No root message => not a threaded negotiation (a marketplace bid).
  if v_job is null and v_thread is null then
    return;
  end if;

  insert into public.messages (
    job_id, direct_thread_id, sender_id, content,
    job_offer_id, request_event, request_amount_cents
  )
  values (v_job, v_thread, p_actor, '', p_offer_id, p_event, p_amount);
end;
$$;


ALTER FUNCTION "public"."offer_post_event"("p_offer_id" "uuid", "p_root_id" "uuid", "p_actor" "uuid", "p_event" "text", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."offer_scoped_chat_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."offer_scoped_chat_enabled"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "opened_by" "uuid" NOT NULL,
    "reason" "public"."dispute_reason" NOT NULL,
    "details" "text",
    "status" "public"."dispute_status" DEFAULT 'open'::"public"."dispute_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_note" "text",
    CONSTRAINT "job_disputes_details_check" CHECK ((("details" IS NULL) OR ("length"("details") <= 2000)))
);


ALTER TABLE "public"."job_disputes" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_job_dispute"("p_job_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "public"."job_disputes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_dispute public.job_disputes;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_reason is null or p_reason not in
     ('not_as_described', 'incomplete', 'damage', 'no_show', 'other') then
    raise exception 'Unknown issue reason';
  end if;
  if p_details is not null and length(p_details) > 2000 then
    raise exception 'Issue details are limited to 2000 characters';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' then
    raise exception 'An issue can be reported once the work is submitted as complete';
  end if;

  -- Idempotent-ish: an already-open report is returned rather than doubled.
  select * into v_dispute
  from public.job_disputes
  where job_id = p_job_id and status = 'open';
  if found then
    return v_dispute;
  end if;

  -- The freeze only means something while the money is still holdable.
  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found and v_payment.status in ('released', 'paid_out') then
    raise exception 'This payment was already released and can no longer be held';
  end if;

  insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
  values (p_job_id, v_payment.id, v_actor, p_reason::public.dispute_reason, p_details)
  returning * into v_dispute;

  return v_dispute;
exception
  when unique_violation then
    select * into v_dispute
    from public.job_disputes
    where job_id = p_job_id and status = 'open';
    return v_dispute;
end;
$$;


ALTER FUNCTION "public"."open_job_dispute"("p_job_id" "uuid", "p_reason" "text", "p_details" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."open_job_dispute"("p_job_id" "uuid", "p_reason" "text", "p_details" "text") IS 'The customer reports an issue on a completed job, freezing release (manual and auto) while it stays open. One open report per job; a second call returns the existing one. Refused once the payment has released.';



CREATE OR REPLACE FUNCTION "public"."phase68_deleted_at_authorization_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase68_deleted_at_authorization_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase68_deleted_at_authorization_enabled"() IS 'phase68 sentinel. Present only if phase68_deleted_at_authorization.sql committed: the five ban-check bodies now refuse a tombstoned profile as well as a banned one.';



CREATE OR REPLACE FUNCTION "public"."phase69_execute_lockdown_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase69_execute_lockdown_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase69_execute_lockdown_enabled"() IS 'phase69 sentinel. Present only if phase69_execute_privilege_lockdown.sql committed: the sixteen functions that still carried a CREATE-time default ACL now have explicit privileges, and none of the notification chain is reachable by anon.';



CREATE OR REPLACE FUNCTION "public"."phase70_unsend_message_authz_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase70_unsend_message_authz_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase70_unsend_message_authz_enabled"() IS 'phase70 sentinel. Present only if phase70_unsend_message_authz.sql committed: unsend_message carries the null-uid guard as its first statement and is executable by authenticated only - not by PUBLIC, not by anon.';



CREATE OR REPLACE FUNCTION "public"."phase71_reviews_read_lockdown_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase71_reviews_read_lockdown_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase71_reviews_read_lockdown_enabled"() IS 'phase71 sentinel. Present only if phase71_reviews_read_lockdown.sql committed: the world-readable "reviews are viewable by everyone" policy is gone, reviews_select_party is intact, and anon reads zero review rows while keeping the column-probe SELECT grant.';



CREATE OR REPLACE FUNCTION "public"."phase72_storage_read_lockdown_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase72_storage_read_lockdown_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase72_storage_read_lockdown_enabled"() IS 'phase72 sentinel. Present only if phase72_storage_read_lockdown.sql committed: avatars_read and job_photos_read both exist, serve SELECT to authenticated only, and keep their original bucket-scoped USING clauses. Anonymous fetches of already-known public-bucket URLs remain possible by design; see the file header.';



CREATE OR REPLACE FUNCTION "public"."phase73_null_safe_guards_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."phase73_null_safe_guards_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase75_security_hardening_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."phase75_security_hardening_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase76_corrections_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."phase76_corrections_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase76_corrections_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase76_rls_and_search_path_corrections.sql has been applied. Created last inside phase76''s transaction, so its presence proves the entire file - the payments RLS assertion and self-check included - committed.';



CREATE OR REPLACE FUNCTION "public"."phase76_rls_posture"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with wanted(relname) as (
    values ('payments'), ('job_offers'), ('job_locations'),
           ('notification_outbox'), ('job_disputes'), ('worker_services'),
           ('saved_workers'), ('profiles')
  )
  select jsonb_object_agg(
    w.relname,
    jsonb_build_object('rls_enabled', coalesce(c.relrowsecurity, false))
      || case when w.relname = 'payments'
              then jsonb_build_object('select_policy_count',
                     (select count(*) from pg_policies
                       where schemaname = 'public'
                         and tablename = 'payments'
                         and cmd = 'SELECT'))
              else '{}'::jsonb end)
  from wanted w
  left join (pg_class c
             join pg_namespace n
               on n.oid = c.relnamespace and n.nspname = 'public')
    on c.relname = w.relname and c.relkind = 'r'
$$;


ALTER FUNCTION "public"."phase76_rls_posture"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase76_rls_posture"() IS 'RLS posture for a fixed eight-table list as {table: {rls_enabled}} plus payments.select_policy_count. Reads only pg_class.relrowsecurity and pg_policies; returns no names, definitions or row data. Deliberately executable by anon - the SECOND such function after job_categories_expanded (phase69) - because scripts/verify-schema.mjs probes with the publishable (anon) key and this is how it sees what PostgREST cannot show (F-002).';



CREATE OR REPLACE FUNCTION "public"."phase77_conversation_features_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."phase77_conversation_features_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase77_conversation_features_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase77_conversation_features.sql has been applied. Created last inside phase77''s transaction, so its presence proves the entire file - the is_blocked_between proof matrix and the self-check included - committed.';



CREATE OR REPLACE FUNCTION "public"."phase78_properties_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."phase78_properties_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."phase78_properties_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase78_properties_and_areas.sql has been applied. Created last inside phase78''s transaction, so its presence proves the whole file committed.';



CREATE OR REPLACE FUNCTION "public"."portfolio_category_freeform_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."portfolio_category_freeform_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_wizard_fields_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true; $$;


ALTER FUNCTION "public"."post_wizard_fields_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."post_wizard_fields_enabled"() IS 'phase49 sentinel: budget range, scheduling window, and address-capable job_locations are live.';



CREATE OR REPLACE FUNCTION "public"."profile_review_summary"("p_user" "uuid") RETURNS TABLE("total" integer, "average" numeric, "five" integer, "four" integer, "three" integer, "two" integer, "one" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    count(*)::integer,
    round(avg(r.rating)::numeric, 2),
    count(*) filter (where r.rating = 5)::integer,
    count(*) filter (where r.rating = 4)::integer,
    count(*) filter (where r.rating = 3)::integer,
    count(*) filter (where r.rating = 2)::integer,
    count(*) filter (where r.rating = 1)::integer
  from public.reviews r
  where r.reviewee_id = p_user
    and auth.uid() is not null;
$$;


ALTER FUNCTION "public"."profile_review_summary"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profile_reviews"("p_user" "uuid", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "rating" integer, "comment" "text", "photos" "jsonb", "created_at" timestamp with time zone, "reviewer_id" "uuid", "reviewer_name" "text", "reviewer_avatar_url" "text", "job_category" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    r.id,
    r.rating,
    r.comment,
    r.photos,
    r.created_at,
    r.reviewer_id,
    p.full_name,
    p.avatar_url,
    j.category::text
  from public.reviews r
  join public.profiles p on p.id = r.reviewer_id
  left join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;


ALTER FUNCTION "public"."profile_reviews"("p_user" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_offer_chain_to_bids"("p_root_offer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_root public.job_offers;
  v_leaf public.job_offers;
  v_status public.bid_status;
begin
  select * into v_root from public.job_offers where id = p_root_offer_id;
  if not found or v_root.offer_type <> 'marketplace_bid' then
    return;
  end if;

  -- The chain's current revision: the row no other row points at as a parent.
  select * into v_leaf
  from public.job_offers o
  where o.root_offer_id = p_root_offer_id
    and not exists (
      select 1 from public.job_offers c where c.parent_offer_id = o.id
    );
  if not found then
    return;
  end if;

  -- offer_status -> bid_status, exhaustive over all six values so a value
  -- added later is a plainly missing branch rather than a silent null.
  --   declined / expired -> rejected  (settled without a hire)
  --   superseded         -> rejected  (only reaches the LEAF when a DIFFERENT
  --                                    chain won the job, which in the legacy
  --                                    vocabulary is exactly "rejected". Within
  --                                    a chain, a superseded row always has a
  --                                    child and so is never the leaf.)
  v_status := (case v_leaf.status
    when 'pending'    then 'pending'
    when 'accepted'   then 'accepted'
    when 'declined'   then 'rejected'
    when 'expired'    then 'rejected'
    when 'superseded' then 'rejected'
    when 'withdrawn'  then 'withdrawn'
  end)::public.bid_status;

  -- Clear any other legacy row for this pair first — a previous settled
  -- chain's row, or a pre-unification row with a different id — so the insert
  -- below cannot lose to phase1's unconditional unique (job_id, worker_id).
  --
  -- Guarded against jobs.accepted_bid_id. Section 1a already refuses to install
  -- if anything CASCADES off bids(id), but a SET NULL or RESTRICT action would
  -- still either erase a historical pointer or fail the write, so a row some
  -- job still names as its accepted bid is left alone regardless. In practice
  -- this predicate should never exclude anything — create_offer() refuses a new
  -- chain unless the job is 'open', and a job with an accepted_bid_id is not —
  -- but "should never" is not a reason to leave the door open.
  delete from public.bids b
   where b.job_id = v_root.job_id
     and b.worker_id = v_root.worker_id
     and b.id <> v_root.id
     and not exists (select 1 from public.jobs j where j.accepted_bid_id = b.id);

  -- Identity (id, message, created_at) from the root; live terms from the leaf.
  --
  -- UPDATE-then-INSERT rather than INSERT ... ON CONFLICT DO UPDATE, and the
  -- reason is notifications, not style. phase20's bids_notify is AFTER INSERT.
  -- An upsert's update path fires AFTER UPDATE and not AFTER INSERT, so it
  -- would in fact behave correctly — but that is a subtlety a reader has to
  -- know, and getting it wrong means every counter, decline and accept pushes
  -- "new bid" to the customer again. Branching explicitly makes the answer
  -- visible on the page: an existing chain is an UPDATE and is silent; a
  -- genuinely new chain is an INSERT and notifies exactly once.
  update public.bids
     set amount_cents = v_leaf.amount_cents,
         message      = v_root.message,
         status       = v_status
   where id = v_root.id;

  if not found then
    insert into public.bids (id, job_id, worker_id, amount_cents, message, status, created_at)
    values (
      v_root.id, v_root.job_id, v_root.worker_id,
      v_leaf.amount_cents, v_root.message, v_status, v_root.created_at
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."project_offer_chain_to_bids"("p_root_offer_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."project_offer_chain_to_bids"("p_root_offer_id" "uuid") IS 'DEPRECATED compatibility projection (phase47). Rebuilds the frozen `bids` row for one marketplace_bid chain from job_offers. One-way: job_offers is the source of truth and nothing reads `bids` back. Removed with the shims once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."push_notifications_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."push_notifications_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_scheduler_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."push_scheduler_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_profile_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  target uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.profiles p
  set
    rating_count = (select count(*) from public.reviews r where r.reviewee_id = target),
    rating_avg = coalesce(
      (select avg(r.rating) from public.reviews r where r.reviewee_id = target),
      0
    )
  where p.id = target;
  return null;
end;
$$;


ALTER FUNCTION "public"."recompute_profile_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_worker_semantic_doc"("p_worker" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_src record;
begin
  if p_worker is null then
    return;
  end if;

  select * into v_src from public.build_worker_semantic_source(p_worker);
  if not found then
    return;
  end if;

  insert into public.worker_semantic_docs as d
    (worker_id, source_text, evidence, source_hash, updated_at)
  values
    (p_worker, v_src.source_text, v_src.evidence, v_src.source_hash, now())
  on conflict (worker_id) do update
    set source_text = excluded.source_text,
        evidence    = excluded.evidence,
        source_hash = excluded.source_hash,
        updated_at  = now()
    -- Only when something actually moved. Without this, any touch of a job row
    -- would bump updated_at and reshuffle the refresh queue for no reason.
    where d.source_hash is distinct from excluded.source_hash
       or d.evidence    is distinct from excluded.evidence;

  -- embedded_hash is deliberately NOT cleared here. Leaving the old vector in
  -- place means a worker whose evidence just changed keeps ranking on their
  -- previous (slightly stale) document instead of vanishing from search until
  -- the next refresh pass. is_stale already flags it for re-embedding.
end;
$$;


ALTER FUNCTION "public"."refresh_worker_semantic_doc"("p_worker" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_worker_semantic_doc"("p_worker" "uuid") IS 'Recomputes one worker''s semantic document and hash. Leaves any existing embedding in place; the changed hash marks it stale via the generated is_stale column.';



CREATE OR REPLACE FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text" DEFAULT 'unknown'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Empty push token';
  end if;

  insert into public.push_tokens (user_id, token, platform, active, last_seen_at)
  values (v_user, btrim(p_token), coalesce(p_platform, 'unknown'), true, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        active       = true,
        last_seen_at = now();
end;
$$;


ALTER FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_notification"("p_outbox_id" "uuid", "p_status" "text", "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.notification_outbox
     set status = p_status,
         last_error = p_error,
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_outbox_id;
end;
$$;


ALTER FUNCTION "public"."resolve_notification"("p_outbox_id" "uuid", "p_status" "text", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_job_request"("p_request_id" "uuid", "p_action" "text", "p_amount_cents" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_action = 'accept' then
    return public.accept_offer(p_request_id);
  elsif p_action = 'decline' then
    perform public.decline_offer(p_request_id);
    return null;
  elsif p_action = 'counter' then
    perform public.counter_offer(p_request_id, p_amount_cents);
    return null;
  end if;
  raise exception 'Unknown action: %', p_action;
end;
$$;


ALTER FUNCTION "public"."respond_job_request"("p_request_id" "uuid", "p_action" "text", "p_amount_cents" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."respond_job_request"("p_request_id" "uuid", "p_action" "text", "p_amount_cents" integer) IS 'DEPRECATED compatibility shim (phase46). Delegates to accept_offer()/decline_offer()/counter_offer(). Remove once a minimum app version can be enforced.';



CREATE OR REPLACE FUNCTION "public"."review_integrity_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."review_integrity_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sandbox_authorize_job_payment"("p_job_id" "uuid") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_amount integer;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.assigned_worker_id is null or v_job.accepted_offer_id is null then
    raise exception 'This job has no accepted offer to fund yet';
  end if;
  -- phase58: was `<> 'assigned'`. The worker may legitimately have started
  -- (or even finished) before the customer funded — late funding must stay
  -- possible or the ledger can never exist for this job.
  if v_job.status not in ('assigned', 'in_progress', 'completed') then
    raise exception 'This job is not awaiting payment';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found then
    return v_payment;
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then
    raise exception 'This job has no agreed amount to authorize';
  end if;

  insert into public.payments (
    job_id, offer_id, payer_id, payee_id, kind,
    amount_cents, platform_fee_cents,
    provider, provider_ref, status, authorized_at
  )
  values (
    v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id,
    'job_payment', v_amount, 0,
    'sandbox', 'sandbox_' || gen_random_uuid(), 'authorized', now()
  )
  returning * into v_payment;

  return v_payment;
exception
  when unique_violation then
    select * into v_payment
    from public.payments
    where job_id = p_job_id and kind = 'job_payment'
      and status not in ('failed', 'voided');
    return v_payment;
end;
$$;


ALTER FUNCTION "public"."sandbox_authorize_job_payment"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_authorize_job_payment"("p_job_id" "uuid") IS 'SANDBOX ONLY — no real money. Creates (or idempotently returns) the job''s active job_payment row in `authorized`. Amount comes from the accepted offer, fee is 0 (no authoritative fee schedule exists). Second half: sandbox_hold_job_payment().';



CREATE OR REPLACE FUNCTION "public"."sandbox_cash_out"() RETURNS SETOF "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  return query
  update public.payments
     set status = 'paid_out',
         paid_out_at = now(),
         updated_at = now()
   where payee_id = v_actor
     and status = 'released'
  returning *;
end;
$$;


ALTER FUNCTION "public"."sandbox_cash_out"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_cash_out"() IS 'SANDBOX ONLY — no real money. Sweeps the caller''s released rows (job payments and tips) to paid_out, stamping paid_out_at. Zero released rows returns an empty set; repeat calls are no-ops.';



CREATE OR REPLACE FUNCTION "public"."sandbox_cash_out_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."sandbox_cash_out_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sandbox_hold_job_payment"("p_job_id" "uuid") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found or v_payment.payer_id <> v_actor then
    raise exception 'No payment to protect — authorize it first';
  end if;

  if v_payment.status = 'held' then
    return v_payment;   -- retry of a hold that already landed
  end if;
  if v_payment.status <> 'authorized' then
    raise exception 'This payment is not in an authorizable state (%)', v_payment.status;
  end if;

  update public.payments
     set status = 'held', held_at = now(), updated_at = now()
   where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;


ALTER FUNCTION "public"."sandbox_hold_job_payment"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_hold_job_payment"("p_job_id" "uuid") IS 'SANDBOX ONLY — no real money. Moves the job''s payment authorized -> held (idempotent on held). held is the Phase 5 terminal state: no function anywhere moves a payment past it.';



CREATE OR REPLACE FUNCTION "public"."sandbox_payments_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select true $$;


ALTER FUNCTION "public"."sandbox_payments_enabled"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_payments_enabled"() IS 'Marker for scripts/verify-schema.mjs: phase50_sandbox_payments_and_offer_lifecycle.sql has been applied. Created last inside phase50''s transaction, so its presence proves the entire file committed.';



CREATE OR REPLACE FUNCTION "public"."sandbox_release_job_payment"("p_job_id" "uuid") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- Same lock order as authorize/hold: job row first, then the payment.
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    raise exception 'This job has no payment to release';
  end if;
  if v_payment.payer_id <> v_actor then
    raise exception 'Only the payer can release this payment';
  end if;

  -- Idempotent success: already past held means the release (or the sandbox
  -- payout that followed it) already happened. Return the truth, change nothing.
  if v_payment.status in ('released', 'paid_out') then
    return v_payment;
  end if;

  if v_job.status <> 'completed' then
    raise exception 'Funds release only after the job is completed';
  end if;
  if exists (
    select 1 from public.job_disputes d
    where d.job_id = p_job_id and d.status = 'open'
  ) then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.status <> 'held' then
    raise exception 'This payment is not held (%)', v_payment.status;
  end if;

  update public.payments
     set status = 'released',
         released_at = now(),
         release_reason = 'approved',
         updated_at = now()
   where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;


ALTER FUNCTION "public"."sandbox_release_job_payment"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_release_job_payment"("p_job_id" "uuid") IS 'SANDBOX ONLY — no real money. The customer''s approval moves the job''s payment held -> released (idempotent once released). Refuses while a dispute is open, before completion, and from any state but held.';



CREATE OR REPLACE FUNCTION "public"."sandbox_tip_worker"("p_job_id" "uuid", "p_amount_cents" integer) RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_tip public.payments;
  v_main public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then
    raise exception 'Tips are for completed jobs';
  end if;

  -- One tip per job; a retry returns the existing row.
  select * into v_tip
  from public.payments
  where job_id = p_job_id and kind = 'tip'
    and status not in ('failed', 'voided');
  if found then
    return v_tip;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000 then
    raise exception 'Tip must be between $0.01 and $1,000';
  end if;

  select * into v_main
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided');
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  insert into public.payments (
    job_id, offer_id, payer_id, payee_id, kind,
    amount_cents, platform_fee_cents,
    provider, provider_ref, status, released_at
  )
  values (
    v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id,
    'tip', p_amount_cents, 0,
    'sandbox', 'sandbox_' || gen_random_uuid(), 'released', now()
  )
  returning * into v_tip;

  return v_tip;
exception
  when unique_violation then
    select * into v_tip
    from public.payments
    where job_id = p_job_id and kind = 'tip'
      and status not in ('failed', 'voided');
    return v_tip;
end;
$_$;


ALTER FUNCTION "public"."sandbox_tip_worker"("p_job_id" "uuid", "p_amount_cents" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sandbox_tip_worker"("p_job_id" "uuid", "p_amount_cents" integer) IS 'SANDBOX ONLY — no real money. One tip ledger row per completed job, only after the job_payment released. Born ''released''; capped at $1,000.';



CREATE OR REPLACE FUNCTION "public"."security_definer_search_path_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."security_definer_search_path_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_mode"("p_mode" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Rejected here as well as by the check constraint: the client should get a
  -- clear error, not a constraint violation, and a future column change must
  -- not silently widen what this accepts.
  if p_mode is null or p_mode not in ('customer', 'worker') then
    raise exception 'Unsupported mode: %', coalesce(p_mode, '(null)');
  end if;

  update public.profiles
     set active_mode = p_mode
   where id = v_user;

  return p_mode;
end;
$$;


ALTER FUNCTION "public"."set_active_mode"("p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_block"("p_blocked" "uuid", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_blocked is null or p_blocked = v_user then
    raise exception 'You cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_blocked) then
    raise exception 'That person is no longer available';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'A timed block must end in the future';
  end if;

  -- (blocker_id, blocked_id) is a full unique constraint (phase13), so the
  -- conflict target infers it directly. Re-blocking an expired or permanent
  -- row simply moves its expiry; created_at keeps the original block date.
  insert into public.blocks (blocker_id, blocked_id, expires_at)
  values (v_user, p_blocked, p_expires_at)
  on conflict (blocker_id, blocked_id)
  do update set expires_at = excluded.expires_at;
end;
$$;


ALTER FUNCTION "public"."set_block"("p_blocked" "uuid", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_block"("p_blocked" "uuid", "p_expires_at" timestamp with time zone) IS 'Create or re-time the caller''s block on p_blocked. NULL p_expires_at means permanent. The only path that can change an existing row''s expiry: blocks has no UPDATE policy and no UPDATE grant (phase76), deliberately. Unblocking stays the existing delete through blocks_delete_own.';



CREATE OR REPLACE FUNCTION "public"."set_conversation_state"("p_job_id" "uuid" DEFAULT NULL::"uuid", "p_direct_thread_id" "uuid" DEFAULT NULL::"uuid", "p_hidden" boolean DEFAULT NULL::boolean, "p_archived" boolean DEFAULT NULL::boolean, "p_clear" boolean DEFAULT false, "p_delete" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_mark timestamptz;
begin
  -- Membership (and the not-signed-in case) resolved server-side; the
  -- helper raises 'Conversation not found' for a thread the caller is not
  -- party to. The returned pair is not needed here.
  perform public.conversation_parties(p_job_id, p_direct_thread_id);

  if p_hidden is null and p_archived is null
     and not coalesce(p_clear, false) and not coalesce(p_delete, false) then
    raise exception 'Nothing to change';
  end if;

  -- One watermark serves clear and delete (S-2). Monotone: it never moves
  -- backward, so a repeated clear cannot resurrect older messages.
  v_mark := case when coalesce(p_clear, false) or coalesce(p_delete, false)
                 then now() end;

  if p_job_id is not null then
    insert into public.conversation_states as cs
      (user_id, job_id, hidden, archived, cleared_before, deleted, updated_at)
    values
      (v_user, p_job_id, coalesce(p_hidden, false), coalesce(p_archived, false),
       v_mark, coalesce(p_delete, false), now())
    on conflict (user_id, job_id) where job_id is not null
    do update set
      hidden = coalesce(p_hidden, cs.hidden),
      archived = coalesce(p_archived, cs.archived),
      cleared_before = case when v_mark is not null
                            then greatest(coalesce(cs.cleared_before, v_mark), v_mark)
                            else cs.cleared_before end,
      deleted = cs.deleted or coalesce(p_delete, false),
      updated_at = now();
  else
    insert into public.conversation_states as cs
      (user_id, direct_thread_id, hidden, archived, cleared_before, deleted, updated_at)
    values
      (v_user, p_direct_thread_id, coalesce(p_hidden, false), coalesce(p_archived, false),
       v_mark, coalesce(p_delete, false), now())
    on conflict (user_id, direct_thread_id) where direct_thread_id is not null
    do update set
      hidden = coalesce(p_hidden, cs.hidden),
      archived = coalesce(p_archived, cs.archived),
      cleared_before = case when v_mark is not null
                            then greatest(coalesce(cs.cleared_before, v_mark), v_mark)
                            else cs.cleared_before end,
      deleted = cs.deleted or coalesce(p_delete, false),
      updated_at = now();
  end if;
end;
$$;


ALTER FUNCTION "public"."set_conversation_state"("p_job_id" "uuid", "p_direct_thread_id" "uuid", "p_hidden" boolean, "p_archived" boolean, "p_clear" boolean, "p_delete" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_conversation_state"("p_job_id" "uuid", "p_direct_thread_id" "uuid", "p_hidden" boolean, "p_archived" boolean, "p_clear" boolean, "p_delete" boolean) IS 'The one writer for conversation_states. p_hidden / p_archived patch their flags when non-null; p_clear sets the watermark; p_delete sets the watermark AND deleted = true (S-2: one watermark serves both, and the delete-coupling lives server-side so the semantics cannot drift). deleted is never un-set here - the thread reopens by derivation the moment a message newer than the watermark exists. Caller must be party to the conversation; the counterparty''s copy is untouched.';



CREATE OR REPLACE FUNCTION "public"."set_direct_thread_read_at"("p_thread_id" "uuid", "p_read_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_read timestamptz;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  v_read := case when p_read_at is null then null
                 else least(p_read_at, now()) end;

  update public.direct_threads
     set user_a_read_at = case when user_a = v_user then v_read else user_a_read_at end,
         user_b_read_at = case when user_b = v_user then v_read else user_b_read_at end
   where id = p_thread_id
     and (user_a = v_user or user_b = v_user);
end;
$$;


ALTER FUNCTION "public"."set_direct_thread_read_at"("p_thread_id" "uuid", "p_read_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_direct_thread_read_at"("p_thread_id" "uuid", "p_read_at" timestamp with time zone) IS 'mark_direct_thread_read''s explicit-timestamp sibling (phase77, MARK_UNREAD): moves ONLY the caller''s own read column on a thread they belong to, to any past instant or NULL. The counterparty''s column cannot be reached: the CASE resolves the column from auth.uid() server-side.';



CREATE OR REPLACE FUNCTION "public"."set_job_property"("p_job_id" "uuid", "p_property_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_client uuid;
  v_owner  uuid;
  v_area   text;
begin
  if auth.uid() is null then
    raise exception 'phase78: not signed in';
  end if;

  select j.client_id into v_client from public.jobs j where j.id = p_job_id;
  if v_client is null then
    raise exception 'phase78: job not found';
  end if;
  if v_client <> auth.uid() then
    raise exception 'phase78: not your job';
  end if;

  if p_property_id is null then
    update public.jobs set property_id = null where id = p_job_id;
    return;
  end if;

  select p.owner_id, p.area_code into v_owner, v_area
  from public.properties p where p.id = p_property_id;
  if v_owner is null then
    raise exception 'phase78: property not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'phase78: not your property';
  end if;

  update public.jobs
  set property_id = p_property_id,
      area_code   = coalesce(v_area, area_code)
  where id = p_job_id;
end
$$;


ALTER FUNCTION "public"."set_job_property"("p_job_id" "uuid", "p_property_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_offers_on_cancelled_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_offer record;
begin
  for v_offer in
    select o.id, o.root_offer_id, o.amount_cents, o.customer_id
    from public.job_offers o
    where o.job_id = new.id
      and o.status = 'pending'
    order by o.created_at
    for update
  loop
    update public.job_offers
       set status = 'declined', awaiting_id = null, updated_at = now()
     where id = v_offer.id;

    -- The job's client is the party the cancellation acts for. A failure to
    -- post one chain event must not veto the cancellation itself, which is
    -- either an account deletion the user is entitled to or an admin ban.
    begin
      perform public.offer_post_event(
        v_offer.id, v_offer.root_offer_id, v_offer.customer_id,
        'declined', v_offer.amount_cents
      );
    exception when others then
      raise notice 'phase75: chain event for offer % not posted (%)', v_offer.id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."settle_offers_on_cancelled_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if not public.is_profile_active(p_recipient) then
    return false;
  end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if not public.is_profile_active(p_actor) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      -- phase75: transactional, deliberately always on.
      when 'jobs'          then true
      else true
    end;
  end if;

  return v_allowed;
end;
$$;


ALTER FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") IS 'Single server-side gate: ban, block, mute, per-category preference, and having a live device.';



CREATE OR REPLACE FUNCTION "public"."start_live_location"("p_lat" double precision, "p_lng" double precision, "p_expires_at" timestamp with time zone, "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_direct_thread_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  select party_a, party_b into v_a, v_b
  from public.conversation_parties(p_job_id, p_direct_thread_id);

  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if public.is_blocked_between(v_a, coalesce(v_b, v_a)) then
    raise exception 'Location sharing is not available';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;
  if p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '8 hours' then
    raise exception 'Sharing must end in the future, at most 8 hours from now';
  end if;

  if p_job_id is not null then
    insert into public.live_location_shares as s
      (sharer_id, job_id, lat, lng, started_at, updated_at, expires_at)
    values (v_user, p_job_id, p_lat, p_lng, now(), now(), p_expires_at)
    on conflict (sharer_id, job_id) where job_id is not null
    do update set lat = excluded.lat, lng = excluded.lng,
                  started_at = now(), updated_at = now(),
                  expires_at = excluded.expires_at
    returning id into v_id;
  else
    insert into public.live_location_shares as s
      (sharer_id, direct_thread_id, lat, lng, started_at, updated_at, expires_at)
    values (v_user, p_direct_thread_id, p_lat, p_lng, now(), now(), p_expires_at)
    on conflict (sharer_id, direct_thread_id) where direct_thread_id is not null
    do update set lat = excluded.lat, lng = excluded.lng,
                  started_at = now(), updated_at = now(),
                  expires_at = excluded.expires_at
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."start_live_location"("p_lat" double precision, "p_lng" double precision, "p_expires_at" timestamp with time zone, "p_job_id" "uuid", "p_direct_thread_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."start_live_location"("p_lat" double precision, "p_lng" double precision, "p_expires_at" timestamp with time zone, "p_job_id" "uuid", "p_direct_thread_id" "uuid") IS 'Start (or restart) the caller''s live location share into one conversation they are party to. Window capped server-side at 8 hours; blocked pairs refused; one row per sharer per thread, revived in place. Deliberately separate from update_live_location() so a stray background heartbeat can never restart a share the user ended.';



CREATE OR REPLACE FUNCTION "public"."stop_live_location"("p_job_id" "uuid" DEFAULT NULL::"uuid", "p_direct_thread_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if (p_job_id is null) = (p_direct_thread_id is null) then
    raise exception 'Exactly one of p_job_id and p_direct_thread_id is required';
  end if;

  -- Idempotent: stopping an already-ended share is a no-op, so a retry or a
  -- double tap can never surface an error on an action that succeeded.
  update public.live_location_shares
     set expires_at = now(), updated_at = now()
   where sharer_id = v_user
     and expires_at > now()
     and ((p_job_id is not null and job_id = p_job_id)
       or (p_direct_thread_id is not null and direct_thread_id = p_direct_thread_id));
end;
$$;


ALTER FUNCTION "public"."stop_live_location"("p_job_id" "uuid", "p_direct_thread_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."stop_live_location"("p_job_id" "uuid", "p_direct_thread_id" "uuid") IS 'End the caller''s own share now by moving expires_at to now(). Only the sharer can stop a share, and only their own; already-ended is a silent no-op.';



CREATE OR REPLACE FUNCTION "public"."transition_job_status"("p_job_id" "uuid", "p_status" "text", "p_completion_photos" "jsonb" DEFAULT NULL::"jsonb", "p_completion_videos" "jsonb" DEFAULT NULL::"jsonb") RETURNS "public"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  -- phase73: NULL-safe comparison. On an unassigned job the column is NULL, and
  -- the previous inequality test yielded NULL rather than TRUE, so the guard
  -- never fired and the caller received the row.
  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;


ALTER FUNCTION "public"."transition_job_status"("p_job_id" "uuid", "p_status" "text", "p_completion_photos" "jsonb", "p_completion_videos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unban_user"("p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may unban users';
  end if;

  update public.profiles set banned = false where id = p_target;
  delete from public.banned_phones where banned_profile_id = p_target;
end;
$$;


ALTER FUNCTION "public"."unban_user"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unsend_message"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- phase73: banned or tombstoned accounts may not blank their messages.
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select sender_id, created_at into v_sender_id, v_created_at
  from public.messages
  where id = p_message_id;

  if v_sender_id is null then
    raise exception 'Message not found';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;

  if now() - v_created_at > interval '15 minutes' then
    raise exception 'Unsend is only available for 15 minutes after sending';
  end if;

  update public.messages
  set content = '',
      image_url = null,
      audio_url = null,
      audio_duration_ms = null,
      unsent_at = now()
  where id = p_message_id;
end;
$$;


ALTER FUNCTION "public"."unsend_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_job_details"("p_job_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer DEFAULT NULL::integer, "p_photos" "jsonb" DEFAULT '[]'::"jsonb", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_videos" "jsonb" DEFAULT '[]'::"jsonb", "p_budget_min_cents" integer DEFAULT NULL::integer, "p_budget_max_cents" integer DEFAULT NULL::integer, "p_scheduled_date" "date" DEFAULT NULL::"date", "p_arrival_start_hour" smallint DEFAULT NULL::smallint, "p_arrival_end_hour" smallint DEFAULT NULL::smallint, "p_address_line" "text" DEFAULT NULL::"text") RETURNS "public"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.client_id <> v_user then
    raise exception 'Only the job poster can edit this job';
  end if;
  if v_job.status <> 'open' then
    raise exception 'Only open jobs can be edited';
  end if;
  if exists (select 1 from public.job_offers o where o.job_id = p_job_id)
     or exists (select 1 from public.bids b where b.job_id = p_job_id) then
    raise exception 'Jobs with bids can no longer be edited';
  end if;

  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  update public.jobs
  set
    title = btrim(p_title),
    description = btrim(p_description),
    category = p_category,
    location = btrim(p_location),
    budget_cents = coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    budget_min_cents = p_budget_min_cents,
    budget_max_cents = p_budget_max_cents,
    scheduled_date = p_scheduled_date,
    arrival_start_hour = p_arrival_start_hour,
    arrival_end_hour = p_arrival_end_hour,
    photos = coalesce(p_photos, '[]'::jsonb),
    videos = coalesce(p_videos, '[]'::jsonb)
  where id = p_job_id
  returning * into v_job;

  if p_lat is null and v_address is null then
    delete from public.job_locations where job_id = p_job_id;
  else
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (p_job_id, p_lat, p_lng, v_address)
    on conflict (job_id) do update
      set lat = excluded.lat,
          lng = excluded.lng,
          address_line = excluded.address_line;
  end if;

  return v_job;
end;
$$;


ALTER FUNCTION "public"."update_job_details"("p_job_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_live_location"("p_lat" double precision, "p_lng" double precision, "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_direct_thread_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  select party_a, party_b into v_a, v_b
  from public.conversation_parties(p_job_id, p_direct_thread_id);

  -- A block that lands mid-share ends the feed at the next heartbeat.
  if public.is_blocked_between(v_a, coalesce(v_b, v_a)) then
    raise exception 'Location sharing is not available';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;

  update public.live_location_shares
     set lat = p_lat, lng = p_lng, updated_at = now()
   where sharer_id = v_user
     and expires_at > now()
     and ((p_job_id is not null and job_id = p_job_id)
       or (p_direct_thread_id is not null and direct_thread_id = p_direct_thread_id));

  if not found then
    raise exception 'No active location share';
  end if;
end;
$$;


ALTER FUNCTION "public"."update_live_location"("p_lat" double precision, "p_lng" double precision, "p_job_id" "uuid", "p_direct_thread_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_live_location"("p_lat" double precision, "p_lng" double precision, "p_job_id" "uuid", "p_direct_thread_id" "uuid") IS 'Heartbeat: moves the caller''s own ACTIVE share in one conversation. Raises once the share has expired or was stopped, so a client cannot keep publishing past the window it asked for.';



CREATE OR REPLACE FUNCTION "public"."update_my_profile"("p_patch" "jsonb") RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_categories text[];
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_user() then
    raise exception 'Suspended accounts cannot update profiles';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Profile update must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as k(key)
    where k.key not in (
      'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories',
      'accepting_work', 'availability_note'
    )
  ) then
    raise exception 'Profile update contains a protected or unknown field';
  end if;

  if p_patch ? 'full_name'
     and (length(btrim(coalesce(p_patch->>'full_name', ''))) < 1
          or length(btrim(p_patch->>'full_name')) > 100) then
    raise exception 'Full name must be between 1 and 100 characters';
  end if;
  if p_patch ? 'phone'
     and (length(btrim(coalesce(p_patch->>'phone', ''))) < 7
          or length(btrim(p_patch->>'phone')) > 30) then
    raise exception 'Phone number is invalid';
  end if;
  if p_patch ? 'avatar_url'
     and p_patch->>'avatar_url' is not null
     and length(p_patch->>'avatar_url') > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if p_patch ? 'bio'
     and length(coalesce(p_patch->>'bio', '')) > 200 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'language'
     and p_patch->>'language' not in ('en', 'es') then
    raise exception 'Unsupported language';
  end if;
  if p_patch ? 'categories' then
    if jsonb_typeof(p_patch->'categories') <> 'array'
       or jsonb_array_length(p_patch->'categories') > 20 then
      raise exception 'Categories must be an array with at most 20 entries';
    end if;
    select coalesce(array_agg(c.value), '{}'::text[])
      into v_categories
      from jsonb_array_elements_text(p_patch->'categories') as c(value);
  end if;
  if p_patch ? 'accepting_work'
     and jsonb_typeof(p_patch->'accepting_work') <> 'boolean' then
    raise exception 'accepting_work must be true or false';
  end if;
  if p_patch ? 'availability_note'
     and length(coalesce(p_patch->>'availability_note', '')) > 140 then
    raise exception 'Availability note is limited to 140 characters';
  end if;

  update public.profiles p
  set
    full_name = case
      when p_patch ? 'full_name' then btrim(p_patch->>'full_name')
      else p.full_name
    end,
    phone = case
      when p_patch ? 'phone' then btrim(p_patch->>'phone')
      else p.phone
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else p.avatar_url
    end,
    bio = case
      when p_patch ? 'bio' then nullif(btrim(p_patch->>'bio'), '')
      else p.bio
    end,
    language = case
      when p_patch ? 'language' then p_patch->>'language'
      else p.language
    end,
    categories = case
      when p_patch ? 'categories' then v_categories
      else p.categories
    end,
    accepting_work = case
      when p_patch ? 'accepting_work' then (p_patch->'accepting_work')::boolean
      else p.accepting_work
    end,
    availability_note = case
      when p_patch ? 'availability_note'
        then nullif(btrim(p_patch->>'availability_note'), '')
      else p.availability_note
    end
  where p.id = v_user;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query select p.* from public.profiles p where p.id = v_user;
end;
$$;


ALTER FUNCTION "public"."update_my_profile"("p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."view_security_invoker_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."view_security_invoker_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_job_dispute"("p_dispute_id" "uuid") RETURNS "public"."job_disputes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_dispute public.job_disputes;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_dispute
  from public.job_disputes
  where id = p_dispute_id
  for update;
  if not found or v_dispute.opened_by <> v_actor then
    raise exception 'Issue report not found';
  end if;
  if v_dispute.status = 'withdrawn' then
    return v_dispute;   -- retry of a withdraw that already landed
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'Only an open issue report can be withdrawn';
  end if;

  update public.job_disputes
     set status = 'withdrawn',
         resolved_at = now()
   where id = v_dispute.id
  returning * into v_dispute;

  return v_dispute;
end;
$$;


ALTER FUNCTION "public"."withdraw_job_dispute"("p_dispute_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."withdraw_job_dispute"("p_dispute_id" "uuid") IS 'The opener withdraws their own open issue report (idempotent on withdrawn), unfreezing release. Resolution by anyone else is a later, human phase.';



CREATE OR REPLACE FUNCTION "public"."withdraw_offer"("p_offer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Idempotent: a retry of a withdraw that already landed is not an error.
  if v_offer.status = 'withdrawn' then
    return;
  end if;
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has already expired';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.author_id is distinct from v_actor then
    raise exception 'Only the person who sent this offer can withdraw it';
  end if;

  update public.job_offers
     set status = 'withdrawn', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'withdrawn', v_offer.amount_cents
  );
end;
$$;


ALTER FUNCTION "public"."withdraw_offer"("p_offer_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."withdraw_offer"("p_offer_id" "uuid") IS 'The sender retracts their own pending offer revision (§H.2 withdrawn). The recipient''s counterpart is decline_offer(). Frees the one-live-chain slot, so a withdrawn worker may bid again.';



CREATE OR REPLACE FUNCTION "public"."worker_job_stats"("p_worker" "uuid") RETURNS TABLE("category" "text", "job_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select j.category::text, count(*)::int
  from public.jobs j
  where j.assigned_worker_id = p_worker
    and j.status = 'completed'
  group by j.category
  order by count(*) desc, j.category::text asc;
$$;


ALTER FUNCTION "public"."worker_job_stats"("p_worker" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."worker_job_stats"("p_worker" "uuid") IS 'Completed job counts per category for one worker. Aggregate only — exposes no job rows.';



CREATE OR REPLACE FUNCTION "public"."worker_self_service_enabled"() RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select true;
$$;


ALTER FUNCTION "public"."worker_self_service_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_semantic_coverage"() RETURNS TABLE("embedded" integer, "stale" integer, "total" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    count(*) filter (where d.embedding is not null)::int,
    count(*) filter (where d.is_stale)::int,
    count(*)::int
  from public.worker_semantic_docs d;
$$;


ALTER FUNCTION "public"."worker_semantic_coverage"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."worker_semantic_coverage"() IS 'service_role only. Corpus health, so the Edge Function can fall back rather than return an empty result set when nothing has been embedded yet.';



CREATE OR REPLACE FUNCTION "public"."worker_semantic_refresh_queue"("p_limit" integer DEFAULT 25) RETURNS TABLE("worker_id" "uuid", "source_text" "text", "source_hash" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  -- Workers who have never had a document built at all - a profile that
  -- existed before this migration, or one created while triggers were the only
  -- thing maintaining rows. Bounded by the same cap.
  perform public.refresh_worker_semantic_doc(m.id)
  from (
    select pr.id
    from public.profiles pr
    left join public.worker_semantic_docs d on d.worker_id = pr.id
    where d.worker_id is null
      and coalesce(pr.banned, false) = false
      -- phase68: public.is_profile_active(uuid) is the canonical predicate.
      -- Inlined here for scan performance, not duplicated by accident.
      and pr.deleted_at is null
    limit v_limit
  ) m;

  return query
  select d.worker_id, d.source_text, d.source_hash
  from public.worker_semantic_docs d
  join public.profiles pr on pr.id = d.worker_id
  where d.is_stale
    and coalesce(pr.banned, false) = false
    -- phase68: public.is_profile_active(uuid) is the canonical predicate.
    -- Inlined here for scan performance, not duplicated by accident.
    and pr.deleted_at is null
    -- A worker with no completed work, no portfolio, no categories and no bio
    -- has nothing to embed. Spending a model call on '' would produce a vector
    -- that matches everything equally badly.
    and length(btrim(d.source_text)) > 0
  order by d.updated_at asc
  limit v_limit;
end;
$$;


ALTER FUNCTION "public"."worker_semantic_refresh_queue"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."worker_semantic_refresh_queue"("p_limit" integer) IS 'service_role only. Up to p_limit workers whose embedding is missing or stale, with the text to embed. The only function that returns source_text.';



CREATE TABLE IF NOT EXISTS "public"."areas" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "borough" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "centroid_lat" double precision NOT NULL,
    "centroid_lng" double precision NOT NULL,
    "min_lat" double precision NOT NULL,
    "max_lat" double precision NOT NULL,
    "min_lng" double precision NOT NULL,
    "max_lng" double precision NOT NULL,
    "rings" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


COMMENT ON TABLE "public"."areas" IS 'Closed neighbourhood list, seeded from NYC DCP 2020 NTAs. rings is an array of rings, each an array of [lng, lat] pairs, even-odd rule (holes are just more rings). display_name and aliases are operator-editable; name is the source label.';



CREATE TABLE IF NOT EXISTS "public"."banned_phones" (
    "phone" "text" NOT NULL,
    "banned_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."banned_phones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "blocks_no_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."blocks"."expires_at" IS 'When a timed block lapses. NULL means permanent (every pre-phase77 row). An expired block behaves exactly as no block: is_blocked_between() filters on it, and set_block() is the only writer that sets it (blocks has no UPDATE policy and phase76 revoked the UPDATE grant - that posture is deliberate and unchanged).';



CREATE TABLE IF NOT EXISTS "public"."conversation_states" (
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "direct_thread_id" "uuid",
    "hidden" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "cleared_before" timestamp with time zone,
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_states_one_thread" CHECK (((("job_id" IS NOT NULL) AND ("direct_thread_id" IS NULL)) OR (("job_id" IS NULL) AND ("direct_thread_id" IS NOT NULL))))
);


ALTER TABLE "public"."conversation_states" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_states" IS 'Per-user, per-conversation inbox state (phase77): hidden (HIDDEN_CHATS), archived (ARCHIVE), and the shared clear/delete watermark (CLEAR_CHAT / DELETE_CHAT). Keyed on job_id XOR direct_thread_id under two partial unique indexes; written ONLY by set_conversation_state() because a client upsert cannot infer a partial index (the phase36 message_reads lesson). The counterparty is never told: rows are own-rows-only and carry no cross-user data.';



CREATE TABLE IF NOT EXISTS "public"."direct_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "user_a_read_at" timestamp with time zone,
    "user_b_read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "direct_threads_ordered" CHECK (("user_a" < "user_b"))
);


ALTER TABLE "public"."direct_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "sender_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "audio_url" "text",
    "audio_duration_ms" integer,
    "reply_to_id" "uuid",
    "job_request_id" "uuid",
    "request_event" "text",
    "request_amount_cents" integer,
    "unsent_at" timestamp with time zone,
    "direct_thread_id" "uuid",
    "job_offer_id" "uuid",
    "document_url" "text",
    "document_name" "text",
    "document_size_bytes" integer,
    CONSTRAINT "messages_one_thread" CHECK (((("job_id" IS NOT NULL) AND ("direct_thread_id" IS NULL)) OR (("job_id" IS NULL) AND ("direct_thread_id" IS NOT NULL)))),
    CONSTRAINT "messages_request_event_valid" CHECK ((("request_event" IS NULL) OR ("request_event" = ANY (ARRAY['created'::"text", 'countered'::"text", 'accepted'::"text", 'declined'::"text", 'closed'::"text", 'withdrawn'::"text", 'expired'::"text", 'superseded'::"text"]))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."job_offer_id" IS 'The offer revision this message records. Successor to job_request_id, which is kept for historical rows. The event vocabulary is messages_request_event_valid, widened additively by phase43.';



COMMENT ON CONSTRAINT "messages_request_event_valid" ON "public"."messages" IS 'Historical log of negotiation events, append-only in practice. phase18''s five values plus §H.2''s withdrawn/expired/superseded. Widen additively; never rewrite past rows.';



CREATE OR REPLACE VIEW "public"."conversations" WITH ("security_invoker"='true') AS
 SELECT "m"."job_id",
    NULL::"uuid" AS "direct_thread_id",
    "j"."title" AS "job_title",
    "j"."client_id",
    "j"."assigned_worker_id",
    "m"."id" AS "last_message_id",
    "m"."sender_id" AS "last_message_sender_id",
    "m"."content" AS "last_message_content",
    "m"."image_url" AS "last_message_image_url",
    "m"."audio_url" AS "last_message_audio_url",
    "m"."document_url" AS "last_message_document_url",
    "m"."document_name" AS "last_message_document_name",
    "m"."unsent_at" AS "last_message_unsent_at",
    "m"."created_at" AS "last_message_at",
    NULL::timestamp with time zone AS "my_read_at"
   FROM (( SELECT DISTINCT ON ("messages"."job_id") "messages"."id",
            "messages"."job_id",
            "messages"."sender_id",
            "messages"."content",
            "messages"."image_url",
            "messages"."created_at",
            "messages"."audio_url",
            "messages"."audio_duration_ms",
            "messages"."reply_to_id",
            "messages"."job_request_id",
            "messages"."request_event",
            "messages"."request_amount_cents",
            "messages"."unsent_at",
            "messages"."direct_thread_id",
            "messages"."job_offer_id",
            "messages"."document_url",
            "messages"."document_name",
            "messages"."document_size_bytes"
           FROM "public"."messages"
          WHERE ("messages"."job_id" IS NOT NULL)
          ORDER BY "messages"."job_id", "messages"."created_at" DESC) "m"
     JOIN "public"."jobs" "j" ON (("j"."id" = "m"."job_id")))
UNION ALL
 SELECT NULL::"uuid" AS "job_id",
    "t"."id" AS "direct_thread_id",
    NULL::"text" AS "job_title",
    "t"."user_a" AS "client_id",
    "t"."user_b" AS "assigned_worker_id",
    "m"."id" AS "last_message_id",
    "m"."sender_id" AS "last_message_sender_id",
    "m"."content" AS "last_message_content",
    "m"."image_url" AS "last_message_image_url",
    "m"."audio_url" AS "last_message_audio_url",
    "m"."document_url" AS "last_message_document_url",
    "m"."document_name" AS "last_message_document_name",
    "m"."unsent_at" AS "last_message_unsent_at",
    "m"."created_at" AS "last_message_at",
        CASE
            WHEN ("t"."user_a" = "auth"."uid"()) THEN "t"."user_a_read_at"
            ELSE "t"."user_b_read_at"
        END AS "my_read_at"
   FROM (( SELECT DISTINCT ON ("messages"."direct_thread_id") "messages"."id",
            "messages"."job_id",
            "messages"."sender_id",
            "messages"."content",
            "messages"."image_url",
            "messages"."created_at",
            "messages"."audio_url",
            "messages"."audio_duration_ms",
            "messages"."reply_to_id",
            "messages"."job_request_id",
            "messages"."request_event",
            "messages"."request_amount_cents",
            "messages"."unsent_at",
            "messages"."direct_thread_id",
            "messages"."job_offer_id",
            "messages"."document_url",
            "messages"."document_name",
            "messages"."document_size_bytes"
           FROM "public"."messages"
          WHERE ("messages"."direct_thread_id" IS NOT NULL)
          ORDER BY "messages"."direct_thread_id", "messages"."created_at" DESC) "m"
     JOIN "public"."direct_threads" "t" ON (("t"."id" = "m"."direct_thread_id")));


ALTER VIEW "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "label" "text" NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "done_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_checklist_items_label_check" CHECK ((("length"("btrim"("label")) >= 1) AND ("length"("btrim"("label")) <= 200)))
);


ALTER TABLE "public"."job_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_locations" (
    "job_id" "uuid" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address_line" "text",
    "access_notes" "text",
    CONSTRAINT "job_locations_access_notes_len" CHECK ((("access_notes" IS NULL) OR ("length"("access_notes") <= 1000))),
    CONSTRAINT "job_locations_address_line_len" CHECK ((("address_line" IS NULL) OR ("length"("address_line") <= 300))),
    CONSTRAINT "job_locations_coords_paired" CHECK ((("lat" IS NULL) = ("lng" IS NULL))),
    CONSTRAINT "job_locations_not_empty" CHECK ((("lat" IS NOT NULL) OR ("address_line" IS NOT NULL)))
);


ALTER TABLE "public"."job_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_locations" IS 'The §G job_private_details table under its original phase12 name: exact geo point, exact address and access/entry notes for one job. RLS: job owner and assigned worker only. Never added to supabase_realtime.';



COMMENT ON COLUMN "public"."job_locations"."address_line" IS 'Exact street address. NEVER exposed by a discovery function — jobs.location holds the coarse, public area label.';



COMMENT ON COLUMN "public"."job_locations"."access_notes" IS 'Entry/access instructions (gate codes, "side door", parking). Same privacy class as the address.';



CREATE TABLE IF NOT EXISTS "public"."job_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "thread_job_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" NOT NULL,
    "location" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "awaiting_id" "uuid" NOT NULL,
    "client_counters" integer DEFAULT 0 NOT NULL,
    "worker_counters" integer DEFAULT 0 NOT NULL,
    "created_job_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direct_thread_id" "uuid",
    "videos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "job_requests_amount_positive" CHECK (("amount_cents" > 0)),
    CONSTRAINT "job_requests_category_valid" CHECK (("category" = ANY (ARRAY['dog_walking'::"text", 'cleaning'::"text", 'moving'::"text", 'yard_work'::"text", 'handyman'::"text", 'errands'::"text", 'furniture_assembly'::"text", 'tv_mounting'::"text", 'painting'::"text", 'packing'::"text", 'other'::"text"]))),
    CONSTRAINT "job_requests_no_self" CHECK (("client_id" <> "worker_id")),
    CONSTRAINT "job_requests_one_thread" CHECK (((("thread_job_id" IS NOT NULL) AND ("direct_thread_id" IS NULL)) OR (("thread_job_id" IS NULL) AND ("direct_thread_id" IS NOT NULL)))),
    CONSTRAINT "job_requests_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'countered'::"text", 'accepted'::"text", 'declined'::"text", 'closed'::"text"]))),
    CONSTRAINT "job_requests_videos_is_array" CHECK (("jsonb_typeof"("videos") = 'array'::"text"))
);


ALTER TABLE "public"."job_requests" OWNER TO "postgres";


COMMENT ON CONSTRAINT "job_requests_category_valid" ON "public"."job_requests" IS 'Mirrors the public.job_category enum. Update both together.';



CREATE TABLE IF NOT EXISTS "public"."legal_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document" "text" NOT NULL,
    "version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_acceptances_document_valid" CHECK (("document" = ANY (ARRAY['terms'::"text", 'privacy'::"text"])))
);


ALTER TABLE "public"."legal_acceptances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_location_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sharer_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "direct_thread_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "live_location_shares_bounded" CHECK (("expires_at" <= ("started_at" + '08:00:00'::interval))),
    CONSTRAINT "live_location_shares_one_thread" CHECK (((("job_id" IS NOT NULL) AND ("direct_thread_id" IS NULL)) OR (("job_id" IS NULL) AND ("direct_thread_id" IS NOT NULL))))
);


ALTER TABLE "public"."live_location_shares" OWNER TO "postgres";


COMMENT ON TABLE "public"."live_location_shares" IS 'A time-bounded live position share into one conversation (phase77, LIVE_LOCATION). One row per sharer per thread, revived in place by start_live_location(); heartbeats move lat/lng/updated_at; expiry is enforced by the SELECT policy (an expired share reads as absent) and by the RPCs, never by client honesty. RPC-written only, like job_locations - but published to supabase_realtime, unlike job_locations, because a moving pin is a live feed, not an address vault.';



CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mutes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "muter_id" "uuid" NOT NULL,
    "muted_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mutes_no_self" CHECK (("muter_id" <> "muted_id"))
);


ALTER TABLE "public"."mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "dedupe_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    CONSTRAINT "notification_outbox_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."notification_outbox" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notification_outbox"."read_at" IS 'When the recipient opened this in their feed (phase56). The recipient''s only writable column.';



CREATE TABLE IF NOT EXISTS "public"."notification_prefs" (
    "user_id" "uuid" NOT NULL,
    "messages" boolean DEFAULT true NOT NULL,
    "bids" boolean DEFAULT true NOT NULL,
    "job_updates" boolean DEFAULT true NOT NULL,
    "hire_requests" boolean DEFAULT true NOT NULL,
    "nearby_jobs" boolean DEFAULT false NOT NULL,
    "nearby_radius_miles" integer DEFAULT 5 NOT NULL,
    "home_lat" double precision,
    "home_lng" double precision,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_prefs_radius_valid" CHECK (("nearby_radius_miles" = ANY (ARRAY[1, 3, 5, 10])))
);


ALTER TABLE "public"."notification_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "source_job_id" "uuid",
    "photo_url" "text" NOT NULL,
    "category" "text" NOT NULL,
    "caption" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published" boolean DEFAULT true NOT NULL,
    CONSTRAINT "portfolio_items_caption_len" CHECK ((("caption" IS NULL) OR ("length"("caption") <= 140))),
    CONSTRAINT "portfolio_items_category_not_blank" CHECK (("length"("btrim"("category")) > 0))
);


ALTER TABLE "public"."portfolio_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."portfolio_items"."published" IS 'FALSE = a draft only its owner can see (phase53). Defaults TRUE so installed builds'' inserts keep behaving exactly as before the column existed.';



CREATE TABLE IF NOT EXISTS "public"."properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "label" "text",
    "street" "text" NOT NULL,
    "unit" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "postal_code" "text",
    "area_code" "text",
    "lat" double precision,
    "lng" double precision,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "properties_city_len" CHECK ((("char_length"("city") >= 1) AND ("char_length"("city") <= 100))),
    CONSTRAINT "properties_coords_pair" CHECK ((("lat" IS NULL) = ("lng" IS NULL))),
    CONSTRAINT "properties_label_len" CHECK ((("label" IS NULL) OR ("char_length"("label") <= 60))),
    CONSTRAINT "properties_lat_range" CHECK ((("lat" IS NULL) OR (("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision)))),
    CONSTRAINT "properties_lng_range" CHECK ((("lng" IS NULL) OR (("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision)))),
    CONSTRAINT "properties_notes_len" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "properties_state_len" CHECK ((("char_length"("state") >= 2) AND ("char_length"("state") <= 40))),
    CONSTRAINT "properties_street_len" CHECK ((("char_length"("street") >= 1) AND ("char_length"("street") <= 200))),
    CONSTRAINT "properties_unit_len" CHECK ((("unit" IS NULL) OR ("char_length"("unit") <= 40)))
);


ALTER TABLE "public"."properties" OWNER TO "postgres";


COMMENT ON TABLE "public"."properties" IS 'A place a customer owns. One row per unit: a four-unit building is four rows sharing a street with different unit labels. lat/lng are resolved once when the address is entered; area_code is resolved from them through area_for_point().';



CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_valid" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "reason" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_no_self" CHECK (("reporter_id" <> "reported_id")),
    CONSTRAINT "reports_reason_valid" CHECK (("reason" = ANY (ARRAY['no_show'::"text", 'unsafe'::"text", 'harassment'::"text", 'scam'::"text", 'other'::"text"]))),
    CONSTRAINT "reports_status_valid" CHECK (("status" = ANY (ARRAY['open'::"text", 'actioned'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_workers" (
    "user_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saved_workers_not_self" CHECK (("user_id" <> "worker_id"))
);


ALTER TABLE "public"."saved_workers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_bids_projection_drift" WITH ("security_invoker"='true') AS
 WITH "chain" AS (
         SELECT "r"."id" AS "root_offer_id",
            "r"."job_id",
            "r"."worker_id",
            "leaf"."amount_cents" AS "live_amount_cents",
            (
                CASE "leaf"."status"
                    WHEN 'pending'::"public"."offer_status" THEN 'pending'::"text"
                    WHEN 'accepted'::"public"."offer_status" THEN 'accepted'::"text"
                    WHEN 'declined'::"public"."offer_status" THEN 'rejected'::"text"
                    WHEN 'expired'::"public"."offer_status" THEN 'rejected'::"text"
                    WHEN 'superseded'::"public"."offer_status" THEN 'rejected'::"text"
                    WHEN 'withdrawn'::"public"."offer_status" THEN 'withdrawn'::"text"
                    ELSE NULL::"text"
                END)::"public"."bid_status" AS "live_status",
            "leaf"."status" AS "live_offer_status"
           FROM ("public"."job_offers" "r"
             JOIN LATERAL ( SELECT "l"."id",
                    "l"."job_id",
                    "l"."offer_type",
                    "l"."parent_offer_id",
                    "l"."root_offer_id",
                    "l"."customer_id",
                    "l"."worker_id",
                    "l"."author_id",
                    "l"."awaiting_id",
                    "l"."amount_cents",
                    "l"."message",
                    "l"."status",
                    "l"."source_table",
                    "l"."source_id",
                    "l"."created_at",
                    "l"."updated_at",
                    "l"."expires_at"
                   FROM "public"."job_offers" "l"
                  WHERE (("l"."root_offer_id" = "r"."id") AND (NOT (EXISTS ( SELECT 1
                           FROM "public"."job_offers" "c"
                          WHERE ("c"."parent_offer_id" = "l"."id")))))
                 LIMIT 1) "leaf" ON (true))
          WHERE (("r"."offer_type" = 'marketplace_bid'::"public"."offer_type") AND ("r"."parent_offer_id" IS NULL))
        )
 SELECT "c"."root_offer_id",
    "c"."job_id",
    "c"."worker_id",
    "c"."live_amount_cents",
    "c"."live_status",
    "b"."amount_cents" AS "mirrored_amount_cents",
    "b"."status" AS "mirrored_status",
    'stale'::"text" AS "drift"
   FROM ("chain" "c"
     JOIN "public"."bids" "b" ON (("b"."id" = "c"."root_offer_id")))
  WHERE (("b"."amount_cents" <> "c"."live_amount_cents") OR ("b"."status" <> "c"."live_status"))
UNION ALL
 SELECT "c"."root_offer_id",
    "c"."job_id",
    "c"."worker_id",
    "c"."live_amount_cents",
    "c"."live_status",
    NULL::integer AS "mirrored_amount_cents",
    NULL::"public"."bid_status" AS "mirrored_status",
    'missing_live'::"text" AS "drift"
   FROM "chain" "c"
  WHERE (("c"."live_offer_status" = 'pending'::"public"."offer_status") AND (NOT (EXISTS ( SELECT 1
           FROM "public"."bids" "b"
          WHERE ("b"."id" = "c"."root_offer_id")))))
UNION ALL
 SELECT "b"."id" AS "root_offer_id",
    "b"."job_id",
    "b"."worker_id",
    NULL::integer AS "live_amount_cents",
    NULL::"public"."bid_status" AS "live_status",
    "b"."amount_cents" AS "mirrored_amount_cents",
    "b"."status" AS "mirrored_status",
    'orphan'::"text" AS "drift"
   FROM "public"."bids" "b"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."job_offers" "r"
          WHERE (("r"."id" = "b"."id") AND ("r"."offer_type" = 'marketplace_bid'::"public"."offer_type") AND ("r"."parent_offer_id" IS NULL)))));


ALTER VIEW "public"."v_bids_projection_drift" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_bids_projection_drift" IS 'DEPRECATED diagnostic (phase47, rewritten phase48). Genuine disagreements between `bids` and job_offers: stale (row disagrees with its own chain), missing_live (a pending chain has no row), orphan (a row with no chain, reported not repaired). Deliberately does NOT flag a settled chain whose row a later chain took over — `bids` can hold only one row per (job, worker). Retires with the compatibility shims.';



CREATE TABLE IF NOT EXISTS "public"."worker_semantic_docs" (
    "worker_id" "uuid" NOT NULL,
    "source_text" "text" DEFAULT ''::"text" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_hash" "text" DEFAULT ''::"text" NOT NULL,
    "embedding" "extensions"."vector"(384),
    "embedding_model" "text",
    "embedded_hash" "text",
    "generated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_stale" boolean GENERATED ALWAYS AS ((("embedding" IS NULL) OR ("embedded_hash" IS DISTINCT FROM "source_hash"))) STORED
);


ALTER TABLE "public"."worker_semantic_docs" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_semantic_docs" IS 'One semantic document + embedding per worker, built from completed work, portfolio and public profile. Not readable by anon or authenticated at all: reachable only through the SECURITY DEFINER functions in phase39.';



CREATE TABLE IF NOT EXISTS "public"."worker_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "price_cents" integer,
    "price_unit" "text" DEFAULT 'flat'::"text" NOT NULL,
    "published" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_services_category_check" CHECK (("length"("btrim"("category")) > 0)),
    CONSTRAINT "worker_services_description_check" CHECK ((("description" IS NULL) OR ("length"("description") <= 500))),
    CONSTRAINT "worker_services_money_ceiling" CHECK ((("price_cents" >= 0) AND ("price_cents" <= 10000000))),
    CONSTRAINT "worker_services_price_cents_check" CHECK ((("price_cents" IS NULL) OR ("price_cents" > 0))),
    CONSTRAINT "worker_services_price_unit_check" CHECK (("price_unit" = ANY (ARRAY['flat'::"text", 'hourly'::"text"]))),
    CONSTRAINT "worker_services_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 80)))
);


ALTER TABLE "public"."worker_services" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_services" IS 'Screens 64/25: a worker''s advertised services with optional pricing. Owner-managed via direct RLS DML (the portfolio_items treatment); published rows are public marketplace info, drafts are owner-only. price_cents NULL means "ask" — never rendered as $0.';



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."banned_phones"
    ADD CONSTRAINT "banned_phones_pkey" PRIMARY KEY ("phone");



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_job_id_worker_id_key" UNIQUE ("job_id", "worker_id");



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_threads"
    ADD CONSTRAINT "direct_threads_pair_unique" UNIQUE ("user_a", "user_b");



ALTER TABLE ONLY "public"."direct_threads"
    ADD CONSTRAINT "direct_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_checklist_items"
    ADD CONSTRAINT "job_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_disputes"
    ADD CONSTRAINT "job_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_locations"
    ADD CONSTRAINT "job_locations_pkey" PRIMARY KEY ("job_id");



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_chain_identity_key" UNIQUE ("id", "job_id", "offer_type", "customer_id", "worker_id", "root_offer_id");



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_id_client_key" UNIQUE ("id", "client_id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_user_id_document_version_key" UNIQUE ("user_id", "document", "version");



ALTER TABLE ONLY "public"."live_location_shares"
    ADD CONSTRAINT "live_location_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("user_id", "job_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mutes"
    ADD CONSTRAINT "mutes_muter_id_muted_id_key" UNIQUE ("muter_id", "muted_id");



ALTER TABLE ONLY "public"."mutes"
    ADD CONSTRAINT "mutes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_prefs"
    ADD CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_unique_photo" UNIQUE ("worker_id", "photo_url");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_job_id_reviewer_id_key" UNIQUE ("job_id", "reviewer_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_workers"
    ADD CONSTRAINT "saved_workers_pkey" PRIMARY KEY ("user_id", "worker_id");



ALTER TABLE ONLY "public"."worker_semantic_docs"
    ADD CONSTRAINT "worker_semantic_docs_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."worker_services"
    ADD CONSTRAINT "worker_services_pkey" PRIMARY KEY ("id");



CREATE INDEX "areas_bbox_idx" ON "public"."areas" USING "btree" ("min_lat", "max_lat", "min_lng", "max_lng");



CREATE INDEX "blocks_blocked_id_idx" ON "public"."blocks" USING "btree" ("blocked_id");



CREATE UNIQUE INDEX "conversation_states_user_direct_key" ON "public"."conversation_states" USING "btree" ("user_id", "direct_thread_id") WHERE ("direct_thread_id" IS NOT NULL);



CREATE UNIQUE INDEX "conversation_states_user_job_key" ON "public"."conversation_states" USING "btree" ("user_id", "job_id") WHERE ("job_id" IS NOT NULL);



CREATE INDEX "idx_bids_job" ON "public"."bids" USING "btree" ("job_id");



CREATE INDEX "idx_bids_worker" ON "public"."bids" USING "btree" ("worker_id");



CREATE INDEX "idx_jobs_category" ON "public"."jobs" USING "btree" ("category");



CREATE INDEX "idx_jobs_client" ON "public"."jobs" USING "btree" ("client_id");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");



CREATE INDEX "idx_reviews_reviewee" ON "public"."reviews" USING "btree" ("reviewee_id");



CREATE INDEX "job_checklist_items_job_idx" ON "public"."job_checklist_items" USING "btree" ("job_id", "position", "created_at");



CREATE INDEX "job_disputes_job_idx" ON "public"."job_disputes" USING "btree" ("job_id", "created_at" DESC);



CREATE UNIQUE INDEX "job_disputes_one_open_per_job" ON "public"."job_disputes" USING "btree" ("job_id") WHERE ("status" = 'open'::"public"."dispute_status");



CREATE INDEX "job_offers_awaiting_idx" ON "public"."job_offers" USING "btree" ("awaiting_id", "status") WHERE ("awaiting_id" IS NOT NULL);



CREATE INDEX "job_offers_customer_status_idx" ON "public"."job_offers" USING "btree" ("customer_id", "status", "created_at" DESC);



CREATE INDEX "job_offers_job_created_idx" ON "public"."job_offers" USING "btree" ("job_id", "created_at" DESC);



CREATE UNIQUE INDEX "job_offers_one_live_bid_per_worker" ON "public"."job_offers" USING "btree" ("job_id", "worker_id") WHERE (("offer_type" = 'marketplace_bid'::"public"."offer_type") AND ("status" = 'pending'::"public"."offer_status"));



CREATE UNIQUE INDEX "job_offers_one_live_direct_per_job" ON "public"."job_offers" USING "btree" ("job_id", "customer_id", "worker_id") WHERE (("offer_type" = 'direct_offer'::"public"."offer_type") AND ("status" = 'pending'::"public"."offer_status"));



CREATE UNIQUE INDEX "job_offers_one_live_direct_per_pair" ON "public"."job_offers" USING "btree" ("customer_id", "worker_id") WHERE (("offer_type" = 'direct_offer'::"public"."offer_type") AND ("status" = 'pending'::"public"."offer_status"));



CREATE INDEX "job_offers_parent_idx" ON "public"."job_offers" USING "btree" ("parent_offer_id") WHERE ("parent_offer_id" IS NOT NULL);



CREATE INDEX "job_offers_pending_expiry_idx" ON "public"."job_offers" USING "btree" ("expires_at") WHERE (("status" = 'pending'::"public"."offer_status") AND ("expires_at" IS NOT NULL));



CREATE INDEX "job_offers_root_idx" ON "public"."job_offers" USING "btree" ("root_offer_id", "created_at");



CREATE UNIQUE INDEX "job_offers_source_row_key" ON "public"."job_offers" USING "btree" ("source_table", "source_id") WHERE ("source_table" IS NOT NULL);



CREATE INDEX "job_offers_worker_status_idx" ON "public"."job_offers" USING "btree" ("worker_id", "status", "created_at" DESC);



CREATE INDEX "job_requests_awaiting_idx" ON "public"."job_requests" USING "btree" ("awaiting_id", "status");



CREATE INDEX "job_requests_direct_thread_idx" ON "public"."job_requests" USING "btree" ("direct_thread_id", "created_at");



CREATE UNIQUE INDEX "job_requests_one_open_per_pair" ON "public"."job_requests" USING "btree" ("client_id", "worker_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'countered'::"text"]));



CREATE INDEX "job_requests_thread_idx" ON "public"."job_requests" USING "btree" ("thread_job_id", "created_at");



CREATE INDEX "jobs_area_idx" ON "public"."jobs" USING "btree" ("area_code");



CREATE INDEX "jobs_property_idx" ON "public"."jobs" USING "btree" ("property_id");



CREATE INDEX "legal_acceptances_user_idx" ON "public"."legal_acceptances" USING "btree" ("user_id");



CREATE UNIQUE INDEX "live_location_shares_sharer_direct_key" ON "public"."live_location_shares" USING "btree" ("sharer_id", "direct_thread_id") WHERE ("direct_thread_id" IS NOT NULL);



CREATE UNIQUE INDEX "live_location_shares_sharer_job_key" ON "public"."live_location_shares" USING "btree" ("sharer_id", "job_id") WHERE ("job_id" IS NOT NULL);



CREATE INDEX "message_reactions_job_id_idx" ON "public"."message_reactions" USING "btree" ("job_id");



CREATE INDEX "messages_direct_thread_created_at_idx" ON "public"."messages" USING "btree" ("direct_thread_id", "created_at");



CREATE INDEX "messages_job_id_created_at_idx" ON "public"."messages" USING "btree" ("job_id", "created_at");



CREATE INDEX "messages_job_offer_idx" ON "public"."messages" USING "btree" ("job_offer_id", "created_at");



CREATE INDEX "messages_job_request_idx" ON "public"."messages" USING "btree" ("job_request_id", "created_at");



CREATE INDEX "notification_outbox_pending_idx" ON "public"."notification_outbox" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "payments_job_idx" ON "public"."payments" USING "btree" ("job_id", "kind");



CREATE UNIQUE INDEX "payments_one_active_per_job_kind" ON "public"."payments" USING "btree" ("job_id", "kind") WHERE ("status" <> ALL (ARRAY['failed'::"public"."payment_status", 'voided'::"public"."payment_status"]));



CREATE INDEX "payments_payee_idx" ON "public"."payments" USING "btree" ("payee_id", "created_at" DESC);



CREATE INDEX "payments_payer_idx" ON "public"."payments" USING "btree" ("payer_id", "created_at" DESC);



CREATE INDEX "portfolio_items_worker_idx" ON "public"."portfolio_items" USING "btree" ("worker_id", "display_order", "created_at");



CREATE INDEX "profiles_deleted_at_idx" ON "public"."profiles" USING "btree" ("id") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "properties_area_idx" ON "public"."properties" USING "btree" ("area_code");



CREATE UNIQUE INDEX "properties_owner_address_uniq" ON "public"."properties" USING "btree" ("owner_id", "lower"("street"), "lower"(COALESCE("unit", ''::"text")), "lower"("city"));



CREATE INDEX "properties_owner_idx" ON "public"."properties" USING "btree" ("owner_id");



CREATE INDEX "push_tokens_user_active_idx" ON "public"."push_tokens" USING "btree" ("user_id") WHERE "active";



CREATE INDEX "reports_status_created_idx" ON "public"."reports" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "reviews_job_reviewer_uniq" ON "public"."reviews" USING "btree" ("job_id", "reviewer_id");



CREATE INDEX "worker_semantic_docs_embedding_idx" ON "public"."worker_semantic_docs" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "worker_semantic_docs_stale_idx" ON "public"."worker_semantic_docs" USING "btree" ("updated_at") WHERE "is_stale";



CREATE INDEX "worker_services_worker_idx" ON "public"."worker_services" USING "btree" ("worker_id", "position", "created_at");



CREATE OR REPLACE TRIGGER "bids_notify" AFTER INSERT ON "public"."bids" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_bid"();



CREATE OR REPLACE TRIGGER "blocks_close_job_requests" AFTER INSERT ON "public"."blocks" FOR EACH ROW EXECUTE FUNCTION "public"."close_requests_on_block"();



CREATE OR REPLACE TRIGGER "job_disputes_notify" AFTER INSERT ON "public"."job_disputes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_dispute"();



CREATE OR REPLACE TRIGGER "job_locations_notify_nearby" AFTER INSERT ON "public"."job_locations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_job_location"();



CREATE OR REPLACE TRIGGER "job_offers_mirror_bids" AFTER INSERT OR UPDATE ON "public"."job_offers" FOR EACH ROW EXECUTE FUNCTION "public"."mirror_offer_chain_to_bids"();



CREATE OR REPLACE TRIGGER "job_offers_notify_counter" AFTER INSERT ON "public"."job_offers" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_offer_counter"();



CREATE OR REPLACE TRIGGER "job_offers_thread_autocreate" AFTER INSERT ON "public"."job_offers" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_thread_for_offer"();



CREATE OR REPLACE TRIGGER "job_requests_notify" AFTER INSERT OR UPDATE ON "public"."job_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_job_request"();



CREATE OR REPLACE TRIGGER "jobs_notify_status" AFTER UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_job_status"();



CREATE OR REPLACE TRIGGER "jobs_settle_offers_on_cancel" AFTER UPDATE OF "status" ON "public"."jobs" FOR EACH ROW WHEN ((("new"."status" = 'cancelled'::"public"."job_status") AND ("old"."status" IS DISTINCT FROM 'cancelled'::"public"."job_status"))) EXECUTE FUNCTION "public"."settle_offers_on_cancelled_job"();



CREATE OR REPLACE TRIGGER "jobs_worker_semantic_stale" AFTER INSERT OR UPDATE OF "status", "assigned_worker_id", "title", "category" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."mark_worker_semantic_stale"();



CREATE OR REPLACE TRIGGER "messages_notify" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_message"();



CREATE OR REPLACE TRIGGER "payments_notify_release" AFTER UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_payment_release"();



CREATE OR REPLACE TRIGGER "portfolio_items_cap" BEFORE INSERT ON "public"."portfolio_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_portfolio_cap"();



CREATE OR REPLACE TRIGGER "portfolio_items_worker_semantic_stale" AFTER INSERT OR DELETE OR UPDATE ON "public"."portfolio_items" FOR EACH ROW EXECUTE FUNCTION "public"."mark_worker_semantic_stale"();



CREATE OR REPLACE TRIGGER "profiles_default_notification_prefs" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_notification_prefs"();



CREATE OR REPLACE TRIGGER "profiles_worker_semantic_stale" AFTER INSERT OR UPDATE OF "bio", "categories" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."mark_worker_semantic_stale"();



CREATE OR REPLACE TRIGGER "reviews_notify" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_review"();



CREATE OR REPLACE TRIGGER "trg_reviews_rating" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_profile_rating"();



ALTER TABLE ONLY "public"."banned_phones"
    ADD CONSTRAINT "banned_phones_banned_profile_id_fkey" FOREIGN KEY ("banned_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_direct_thread_id_fkey" FOREIGN KEY ("direct_thread_id") REFERENCES "public"."direct_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_threads"
    ADD CONSTRAINT "direct_threads_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_threads"
    ADD CONSTRAINT "direct_threads_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_checklist_items"
    ADD CONSTRAINT "job_checklist_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_disputes"
    ADD CONSTRAINT "job_disputes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_disputes"
    ADD CONSTRAINT "job_disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."job_disputes"
    ADD CONSTRAINT "job_disputes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."job_locations"
    ADD CONSTRAINT "job_locations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_awaiting_id_fkey" FOREIGN KEY ("awaiting_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_customer_owns_job_fkey" FOREIGN KEY ("job_id", "customer_id") REFERENCES "public"."jobs"("id", "client_id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "job_offers_customer_owns_job_fkey" ON "public"."job_offers" IS 'An offer''s customer IS the job''s owner. This is what makes the job-owner half of job_offers_select_party correct at the schema level rather than by RPC convention.';



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_parent_inherits_fkey" FOREIGN KEY ("parent_offer_id", "job_id", "offer_type", "customer_id", "worker_id", "root_offer_id") REFERENCES "public"."job_offers"("id", "job_id", "offer_type", "customer_id", "worker_id", "root_offer_id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "job_offers_parent_inherits_fkey" ON "public"."job_offers" IS 'Forces every counter to carry its parent''s job, offer_type, participants and root. This is what makes "offer_type is set once and never changes" a schema guarantee rather than a convention.';



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_root_offer_id_fkey" FOREIGN KEY ("root_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_offers"
    ADD CONSTRAINT "job_offers_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_awaiting_id_fkey" FOREIGN KEY ("awaiting_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_created_job_id_fkey" FOREIGN KEY ("created_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_direct_thread_id_fkey" FOREIGN KEY ("direct_thread_id") REFERENCES "public"."direct_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_thread_job_id_fkey" FOREIGN KEY ("thread_job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_requests"
    ADD CONSTRAINT "job_requests_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_accepted_bid_fk" FOREIGN KEY ("accepted_bid_id") REFERENCES "public"."bids"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_accepted_offer_fkey" FOREIGN KEY ("accepted_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_area_code_fkey" FOREIGN KEY ("area_code") REFERENCES "public"."areas"("code") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_assigned_worker_id_fkey" FOREIGN KEY ("assigned_worker_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_location_shares"
    ADD CONSTRAINT "live_location_shares_direct_thread_id_fkey" FOREIGN KEY ("direct_thread_id") REFERENCES "public"."direct_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_location_shares"
    ADD CONSTRAINT "live_location_shares_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_location_shares"
    ADD CONSTRAINT "live_location_shares_sharer_id_fkey" FOREIGN KEY ("sharer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_direct_thread_id_fkey" FOREIGN KEY ("direct_thread_id") REFERENCES "public"."direct_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_job_request_fk" FOREIGN KEY ("job_request_id") REFERENCES "public"."job_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mutes"
    ADD CONSTRAINT "mutes_muted_id_fkey" FOREIGN KEY ("muted_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mutes"
    ADD CONSTRAINT "mutes_muter_id_fkey" FOREIGN KEY ("muter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_prefs"
    ADD CONSTRAINT "notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."job_offers"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_source_job_id_fkey" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_area_code_fkey" FOREIGN KEY ("area_code") REFERENCES "public"."areas"("code") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_workers"
    ADD CONSTRAINT "saved_workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_workers"
    ADD CONSTRAINT "saved_workers_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_semantic_docs"
    ADD CONSTRAINT "worker_semantic_docs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_services"
    ADD CONSTRAINT "worker_services_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas_select_all" ON "public"."areas" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."banned_phones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bids" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bids_select_job_owner" ON "public"."bids" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "bids"."job_id") AND ("j"."client_id" = "auth"."uid"())))) AND "public"."is_profile_active"("worker_id")));



CREATE POLICY "bids_select_own" ON "public"."bids" FOR SELECT TO "authenticated" USING (("worker_id" = "auth"."uid"()));



ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocks_delete_own" ON "public"."blocks" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocks_insert_own" ON "public"."blocks" FOR INSERT TO "authenticated" WITH CHECK (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocks_select_involved" ON "public"."blocks" FOR SELECT TO "authenticated" USING ((("blocker_id" = "auth"."uid"()) OR ("blocked_id" = "auth"."uid"())));



CREATE POLICY "checklist_delete_worker" ON "public"."job_checklist_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_checklist_items"."job_id") AND ("j"."assigned_worker_id" = "auth"."uid"()) AND ("j"."status" = ANY (ARRAY['assigned'::"public"."job_status", 'in_progress'::"public"."job_status"]))))));



CREATE POLICY "checklist_insert_worker" ON "public"."job_checklist_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_checklist_items"."job_id") AND ("j"."assigned_worker_id" = "auth"."uid"()) AND ("j"."status" = ANY (ARRAY['assigned'::"public"."job_status", 'in_progress'::"public"."job_status"]))))));



CREATE POLICY "checklist_select_parties" ON "public"."job_checklist_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_checklist_items"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))));



CREATE POLICY "checklist_update_worker" ON "public"."job_checklist_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_checklist_items"."job_id") AND ("j"."assigned_worker_id" = "auth"."uid"()) AND ("j"."status" = ANY (ARRAY['assigned'::"public"."job_status", 'in_progress'::"public"."job_status"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_checklist_items"."job_id") AND ("j"."assigned_worker_id" = "auth"."uid"()) AND ("j"."status" = ANY (ARRAY['assigned'::"public"."job_status", 'in_progress'::"public"."job_status"]))))));



CREATE POLICY "clients insert own jobs" ON "public"."jobs" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "clients update own jobs" ON "public"."jobs" FOR UPDATE USING (("auth"."uid"() = "client_id"));



ALTER TABLE "public"."conversation_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_states_select_own" ON "public"."conversation_states" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."direct_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "direct_threads_select_party" ON "public"."direct_threads" FOR SELECT TO "authenticated" USING ((("user_a" = "auth"."uid"()) OR ("user_b" = "auth"."uid"())));



CREATE POLICY "disputes_select_parties" ON "public"."job_disputes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_disputes"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))));



CREATE POLICY "job owner views bids on their job" ON "public"."bids" FOR SELECT USING (("auth"."uid"() = ( SELECT "jobs"."client_id"
   FROM "public"."jobs"
  WHERE ("jobs"."id" = "bids"."job_id"))));



ALTER TABLE "public"."job_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_locations_select_party" ON "public"."job_locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_locations"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))));



ALTER TABLE "public"."job_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_offers_select_party" ON "public"."job_offers" FOR SELECT TO "authenticated" USING ((("customer_id" = "auth"."uid"()) OR ("worker_id" = "auth"."uid"())));



ALTER TABLE "public"."job_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_requests_select_party" ON "public"."job_requests" FOR SELECT TO "authenticated" USING ((("client_id" = "auth"."uid"()) OR ("worker_id" = "auth"."uid"())));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "jobs_delete_own" ON "public"."jobs" FOR DELETE TO "authenticated" USING ("public"."can_delete_own_job"("id"));



CREATE POLICY "jobs_select_assigned_worker" ON "public"."jobs" FOR SELECT TO "authenticated" USING (("assigned_worker_id" = "auth"."uid"()));



CREATE POLICY "jobs_select_offer_party" ON "public"."jobs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."job_offers" "o"
  WHERE (("o"."job_id" = "jobs"."id") AND ("o"."worker_id" = "auth"."uid"())))));



CREATE POLICY "jobs_select_open" ON "public"."jobs" FOR SELECT TO "authenticated" USING ((("status" = 'open'::"public"."job_status") AND ("visibility" = 'open_market'::"public"."job_visibility") AND "public"."is_profile_active"("client_id")));



CREATE POLICY "jobs_select_own" ON "public"."jobs" FOR SELECT TO "authenticated" USING (("client_id" = "auth"."uid"()));



ALTER TABLE "public"."legal_acceptances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_acceptances_insert_own" ON "public"."legal_acceptances" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "legal_acceptances_select_own" ON "public"."legal_acceptances" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."live_location_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_location_shares_select_party" ON "public"."live_location_shares" FOR SELECT TO "authenticated" USING ((("expires_at" > "now"()) AND ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "live_location_shares"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."direct_threads" "t"
  WHERE (("t"."id" = "live_location_shares"."direct_thread_id") AND (("t"."user_a" = "auth"."uid"()) OR ("t"."user_b" = "auth"."uid"()))))))));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reactions_delete_own" ON "public"."message_reactions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "message_reactions_insert_own" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "message_reactions"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND ("m"."job_id" = "message_reactions"."job_id"))))));



CREATE POLICY "message_reactions_select_party" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "message_reactions"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))));



CREATE POLICY "message_reactions_update_own" ON "public"."message_reactions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reads_insert_own" ON "public"."message_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "message_reads_select_own" ON "public"."message_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "message_reads_select_party" ON "public"."message_reads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "message_reads"."job_id") AND ((("j"."client_id" = "auth"."uid"()) AND ("message_reads"."user_id" = "j"."assigned_worker_id")) OR (("j"."assigned_worker_id" = "auth"."uid"()) AND ("message_reads"."user_id" = "j"."client_id")))))));



CREATE POLICY "message_reads_update_own" ON "public"."message_reads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert_party" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."is_active_user"() AND ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "messages"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("j"."client_id", COALESCE("j"."assigned_worker_id", "j"."client_id")))))) OR (EXISTS ( SELECT 1
   FROM "public"."direct_threads" "t"
  WHERE (("t"."id" = "messages"."direct_thread_id") AND (("t"."user_a" = "auth"."uid"()) OR ("t"."user_b" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("t"."user_a", "t"."user_b")))))) AND ("public"."messaging_unlocked"("job_id", "direct_thread_id") OR ((("job_offer_id" IS NOT NULL) OR ("job_request_id" IS NOT NULL)) AND (COALESCE("btrim"("content"), ''::"text") = ''::"text") AND ("image_url" IS NULL) AND ("audio_url" IS NULL)))));



COMMENT ON POLICY "messages_insert_party" ON "public"."messages" IS 'phase36''s participant + block rule, plus phase66''s pre-confirmation lock: a free-form message may only be inserted once messaging_unlocked() is true for the thread. Structured negotiation events are exempt and payload-free. Reads (messages_select_party) are deliberately untouched, so existing pre-confirmation history keeps rendering.';



CREATE POLICY "messages_select_party" ON "public"."messages" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "messages"."job_id") AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."direct_threads" "t"
  WHERE (("t"."id" = "messages"."direct_thread_id") AND (("t"."user_a" = "auth"."uid"()) OR ("t"."user_b" = "auth"."uid"())))))));



ALTER TABLE "public"."mutes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mutes_delete_own" ON "public"."mutes" FOR DELETE TO "authenticated" USING (("muter_id" = "auth"."uid"()));



CREATE POLICY "mutes_insert_own" ON "public"."mutes" FOR INSERT TO "authenticated" WITH CHECK (("muter_id" = "auth"."uid"()));



CREATE POLICY "mutes_select_own" ON "public"."mutes" FOR SELECT TO "authenticated" USING (("muter_id" = "auth"."uid"()));



ALTER TABLE "public"."notification_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_prefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_prefs_insert_own" ON "public"."notification_prefs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notification_prefs_select_own" ON "public"."notification_prefs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notification_prefs_update_own" ON "public"."notification_prefs" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "outbox_select_recipient" ON "public"."notification_outbox" FOR SELECT TO "authenticated" USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "outbox_update_recipient" ON "public"."notification_outbox" FOR UPDATE TO "authenticated" USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



CREATE POLICY "parties view own payments" ON "public"."payments" FOR SELECT USING ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "payee_id")));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portfolio_delete_own" ON "public"."portfolio_items" FOR DELETE TO "authenticated" USING (("worker_id" = "auth"."uid"()));



CREATE POLICY "portfolio_insert_own" ON "public"."portfolio_items" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = "auth"."uid"()) AND (("source_job_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "portfolio_items"."source_job_id") AND ("j"."assigned_worker_id" = "auth"."uid"())))))));



ALTER TABLE "public"."portfolio_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portfolio_select_visible" ON "public"."portfolio_items" FOR SELECT TO "authenticated" USING ((("published" = true) OR ("worker_id" = "auth"."uid"())));



CREATE POLICY "portfolio_update_own" ON "public"."portfolio_items" FOR UPDATE TO "authenticated" USING (("worker_id" = "auth"."uid"())) WITH CHECK (("worker_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "properties_delete_own" ON "public"."properties" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "properties_insert_own" ON "public"."properties" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "properties_select_own" ON "public"."properties" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "properties_update_own" ON "public"."properties" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens_delete_own" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_tokens_insert_own" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "push_tokens_select_own" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_tokens_update_own" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK ((("reporter_id" = "auth"."uid"()) AND "public"."is_active_user"()));



CREATE POLICY "reports_select_admin" ON "public"."reports" FOR SELECT TO "authenticated" USING ("public"."current_user_is_admin"());



CREATE POLICY "reports_update_admin" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."current_user_is_admin"()) WITH CHECK ("public"."current_user_is_admin"());



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_insert_completed_party" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("reviewer_id" = "auth"."uid"()) AND "public"."is_active_user"() AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "reviews"."job_id") AND ("j"."status" = 'completed'::"public"."job_status") AND ((("j"."client_id" = "auth"."uid"()) AND ("j"."assigned_worker_id" = "reviews"."reviewee_id")) OR (("j"."assigned_worker_id" = "auth"."uid"()) AND ("j"."client_id" = "reviews"."reviewee_id"))))))));



COMMENT ON POLICY "reviews_insert_completed_party" ON "public"."reviews" IS 'Phase 10: a review is written only by a party of a COMPLETED job, only about the other party, once (the phase6 unique constraint). The rating trigger keeps aggregates in sync.';



CREATE POLICY "reviews_select_party" ON "public"."reviews" FOR SELECT TO "authenticated" USING ((("reviewer_id" = "auth"."uid"()) OR ("reviewee_id" = "auth"."uid"())));



CREATE POLICY "saved_delete_own" ON "public"."saved_workers" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_insert_own" ON "public"."saved_workers" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_active_user"()));



CREATE POLICY "saved_select_own" ON "public"."saved_workers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."saved_workers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete_own" ON "public"."worker_services" FOR DELETE TO "authenticated" USING (("worker_id" = "auth"."uid"()));



CREATE POLICY "services_insert_own" ON "public"."worker_services" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = "auth"."uid"()) AND "public"."is_active_user"()));



CREATE POLICY "services_select_visible" ON "public"."worker_services" FOR SELECT TO "authenticated" USING ((("published" = true) OR ("worker_id" = "auth"."uid"())));



CREATE POLICY "services_update_own" ON "public"."worker_services" FOR UPDATE TO "authenticated" USING (("worker_id" = "auth"."uid"())) WITH CHECK ((("worker_id" = "auth"."uid"()) AND "public"."is_active_user"()));



CREATE POLICY "users insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."worker_semantic_docs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workers insert own bids" ON "public"."bids" FOR INSERT WITH CHECK (("auth"."uid"() = "worker_id"));



CREATE POLICY "workers update own bids" ON "public"."bids" FOR UPDATE USING (("auth"."uid"() = "worker_id"));



CREATE POLICY "workers view own bids" ON "public"."bids" FOR SELECT USING (("auth"."uid"() = "worker_id"));



CREATE POLICY "avatars_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."is_active_user"()));



CREATE POLICY "avatars_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'avatars'::"text"));



CREATE POLICY "avatars_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."is_active_user"()));



CREATE POLICY "chat_audio_insert_party" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'chat-audio'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND "public"."is_active_user"() AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("j"."client_id", COALESCE("j"."assigned_worker_id", "j"."client_id"))))))));



CREATE POLICY "chat_audio_read_party" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'chat-audio'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())))))));



CREATE POLICY "chat_documents_insert_party" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'chat-documents'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND "public"."is_active_user"() AND ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("j"."client_id", COALESCE("j"."assigned_worker_id", "j"."client_id")))))) OR (EXISTS ( SELECT 1
   FROM "public"."direct_threads" "t"
  WHERE ((("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("t"."user_a" = "auth"."uid"()) OR ("t"."user_b" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("t"."user_a", "t"."user_b"))))))));



CREATE POLICY "chat_documents_read_party" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'chat-documents'::"text") AND ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."direct_threads" "t"
  WHERE ((("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("t"."user_a" = "auth"."uid"()) OR ("t"."user_b" = "auth"."uid"()))))))));



CREATE POLICY "chat_photos_insert_party" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'chat-photos'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND "public"."is_active_user"() AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())) AND (NOT "public"."is_blocked_between"("j"."client_id", COALESCE("j"."assigned_worker_id", "j"."client_id"))))))));



CREATE POLICY "chat_photos_read_party" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'chat-photos'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("j"."client_id" = "auth"."uid"()) OR ("j"."assigned_worker_id" = "auth"."uid"())))))));



CREATE POLICY "job_photos_delete_own_completion" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'job-photos'::"text") AND (("storage"."foldername"("name"))[1] <> 'postings'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("j"."assigned_worker_id" = "auth"."uid"()))))));



CREATE POLICY "job_photos_delete_own_posting" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'job-photos'::"text") AND (("storage"."foldername"("name"))[1] = 'postings'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text")));



CREATE POLICY "job_photos_delete_own_review" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'job-photos'::"text") AND (("storage"."foldername"("name"))[1] = 'reviews'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text")));



CREATE POLICY "job_photos_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'job-photos'::"text") AND "public"."is_active_user"() AND (((("storage"."foldername"("name"))[1] = 'postings'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text")) OR ((("storage"."foldername"("name"))[1] <> 'postings'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE ((("j"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("j"."assigned_worker_id" = "auth"."uid"()))))))));



CREATE POLICY "job_photos_insert_review" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'job-photos'::"text") AND "public"."is_active_user"() AND (("storage"."foldername"("name"))[1] = 'reviews'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text")));



CREATE POLICY "job_photos_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'job-photos'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT ALL ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON SCHEMA "storage" TO "dashboard_user";



REVOKE ALL ON FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_bid"("p_job_id" "uuid", "p_bid_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_legal_documents"("p_documents" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_legal_documents"("p_documents" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."accept_offer"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_offer"("p_offer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."account_deletion_blockers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_deletion_blockers"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."account_deletion_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_deletion_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."active_work_lifecycle_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."active_work_lifecycle_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_open_reports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_open_reports"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apply_worker_embeddings"("p_rows" "jsonb", "p_model" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_worker_embeddings"("p_rows" "jsonb", "p_model" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."area_for_point"("p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."area_for_point"("p_lat" double precision, "p_lng" double precision) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ban_user"("p_target" "uuid", "p_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ban_user"("p_target" "uuid", "p_report_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."bids_projection_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bids_projection_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."bids_projection_v2_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bids_projection_v2_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."build_worker_semantic_source"("p_worker" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."can_delete_own_job"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_delete_own_job"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_notification_batch"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_notification_batch"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."client_job_stats"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_job_stats"("p_client_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."close_requests_on_block"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."conversation_parties"("p_job_id" "uuid", "p_direct_thread_id" "uuid", OUT "party_a" "uuid", OUT "party_b" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."counter_notification_copy_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."counter_notification_copy_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."counter_notification_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."counter_notification_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."counter_offer"("p_offer_id" "uuid", "p_amount_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."counter_offer"("p_offer_id" "uuid", "p_amount_cents" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."counteroffer_cap_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."counteroffer_cap_enabled"() TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."bids" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bids" TO "authenticated";
GRANT ALL ON TABLE "public"."bids" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_bid"("p_job_id" "uuid", "p_amount_cents" integer, "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_bid"("p_job_id" "uuid", "p_amount_cents" integer, "p_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_default_notification_prefs"() FROM PUBLIC;



GRANT SELECT,MAINTAIN ON TABLE "public"."jobs" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_job"("p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_job"("p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_job_request"("p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_amount_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid", "p_videos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_job_request"("p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_amount_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid", "p_videos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_offer"("p_amount_cents" integer, "p_job_id" "uuid", "p_message" "text", "p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_photos" "jsonb", "p_videos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_offer"("p_amount_cents" integer, "p_job_id" "uuid", "p_message" "text", "p_worker_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "text", "p_location" "text", "p_photos" "jsonb", "p_videos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_thread_job_id" "uuid") TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_review"("p_job_id" "uuid", "p_reviewee_id" "uuid", "p_rating" integer, "p_comment" "text", "p_photos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_review"("p_job_id" "uuid", "p_reviewee_id" "uuid", "p_rating" integer, "p_comment" "text", "p_photos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."current_user_is_banned"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_banned"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."deactivate_push_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_push_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_offer"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_offer"("p_offer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."direct_thread_notifications_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."direct_thread_notifications_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."drain_notification_outbox"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_portfolio_cap"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enqueue_notification"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text", "p_type" "text", "p_title" "text", "p_body" "text", "p_data" "jsonb", "p_dedupe_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."ensure_direct_thread"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."ensure_thread_for_offer"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."job_offers" TO "service_role";
GRANT SELECT ON TABLE "public"."job_offers" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."expire_offer_if_stale"("p_offer" "public"."job_offers") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_my_active_mode"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_active_mode"() TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("role") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("verification_status") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("rating_avg") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("rating_count") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("completion_rate") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("on_time_pct") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("response_time") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("language") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("categories") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("accepting_work") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("availability_note") ON TABLE "public"."profiles" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."hardening_fixes_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hardening_fixes_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_active_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_profile_active"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_profile_active"("p_user" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_bid_count"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_bid_count"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_bid_counts"("p_job_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_bid_counts"("p_job_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_categories_expanded"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_categories_expanded"() TO "anon";
GRANT ALL ON FUNCTION "public"."job_categories_expanded"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_hotspots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_hotspots"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_offer_rpcs_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_offer_rpcs_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_offers_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_offers_enabled"() TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."job_payment_state"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_payment_state"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."job_request_parties_ok"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_request_parties_ok"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_request_parties_ok"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_in_cell"("p_ilat" bigint, "p_ilng" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_in_cell"("p_ilat" bigint, "p_ilng" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."legal_acceptance_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."legal_acceptance_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_direct_thread_read"("p_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_direct_thread_read"("p_thread_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_worker_semantic_stale"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."marketplace_thread_identity_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marketplace_thread_identity_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[], "p_limit" integer, "p_min_similarity" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[], "p_limit" integer, "p_min_similarity" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_workers_semantic"("p_query_embedding" double precision[], "p_categories" "text"[], "p_limit" integer, "p_min_similarity" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."messaging_lock_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messaging_lock_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid", "p_direct_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid", "p_direct_thread_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mirror_offer_chain_to_bids"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."my_pending_job_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_pending_job_requests"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_pending_offers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_pending_offers"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."notification_feed_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notification_feed_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."notify_display_name"("p_user" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_nearby_for_job"("p_job_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_bid"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_dispute"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_job_location"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_job_request"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_job_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_message"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_offer_counter"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_payment_release"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."notify_on_review"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."offer_post_event"("p_offer_id" "uuid", "p_root_id" "uuid", "p_actor" "uuid", "p_event" "text", "p_amount" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."offer_scoped_chat_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."offer_scoped_chat_enabled"() TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."job_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."job_disputes" TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_job_dispute"("p_job_id" "uuid", "p_reason" "text", "p_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_job_dispute"("p_job_id" "uuid", "p_reason" "text", "p_details" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase68_deleted_at_authorization_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase68_deleted_at_authorization_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase69_execute_lockdown_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase69_execute_lockdown_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase70_unsend_message_authz_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase70_unsend_message_authz_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase71_reviews_read_lockdown_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase71_reviews_read_lockdown_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase72_storage_read_lockdown_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase72_storage_read_lockdown_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase73_null_safe_guards_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase73_null_safe_guards_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase75_security_hardening_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase75_security_hardening_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase76_corrections_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase76_corrections_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase76_rls_posture"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase76_rls_posture"() TO "anon";
GRANT ALL ON FUNCTION "public"."phase76_rls_posture"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase77_conversation_features_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase77_conversation_features_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."phase78_properties_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase78_properties_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."portfolio_category_freeform_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portfolio_category_freeform_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."post_wizard_fields_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_wizard_fields_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."profile_review_summary"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profile_review_summary"("p_user" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."profile_reviews"("p_user" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profile_reviews"("p_user" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."project_offer_chain_to_bids"("p_root_offer_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."push_notifications_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_notifications_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."push_scheduler_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_scheduler_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."recompute_profile_rating"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."refresh_worker_semantic_doc"("p_worker" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_notification"("p_outbox_id" "uuid", "p_status" "text", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_notification"("p_outbox_id" "uuid", "p_status" "text", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_job_request"("p_request_id" "uuid", "p_action" "text", "p_amount_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_job_request"("p_request_id" "uuid", "p_action" "text", "p_amount_cents" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_integrity_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_integrity_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_authorize_job_payment"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_authorize_job_payment"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_cash_out"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_cash_out"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_cash_out_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_cash_out_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_hold_job_payment"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_hold_job_payment"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_payments_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_payments_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_release_job_payment"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_release_job_payment"("p_job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sandbox_tip_worker"("p_job_id" "uuid", "p_amount_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sandbox_tip_worker"("p_job_id" "uuid", "p_amount_cents" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."security_definer_search_path_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."security_definer_search_path_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_active_mode"("p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_mode"("p_mode" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_block"("p_blocked" "uuid", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_block"("p_blocked" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_conversation_state"("p_job_id" "uuid", "p_direct_thread_id" "uuid", "p_hidden" boolean, "p_archived" boolean, "p_clear" boolean, "p_delete" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_conversation_state"("p_job_id" "uuid", "p_direct_thread_id" "uuid", "p_hidden" boolean, "p_archived" boolean, "p_clear" boolean, "p_delete" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_direct_thread_read_at"("p_thread_id" "uuid", "p_read_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_direct_thread_read_at"("p_thread_id" "uuid", "p_read_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_job_property"("p_job_id" "uuid", "p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_job_property"("p_job_id" "uuid", "p_property_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."settle_offers_on_cancelled_job"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."start_live_location"("p_lat" double precision, "p_lng" double precision, "p_expires_at" timestamp with time zone, "p_job_id" "uuid", "p_direct_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_live_location"("p_lat" double precision, "p_lng" double precision, "p_expires_at" timestamp with time zone, "p_job_id" "uuid", "p_direct_thread_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."stop_live_location"("p_job_id" "uuid", "p_direct_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stop_live_location"("p_job_id" "uuid", "p_direct_thread_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transition_job_status"("p_job_id" "uuid", "p_status" "text", "p_completion_photos" "jsonb", "p_completion_videos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_job_status"("p_job_id" "uuid", "p_status" "text", "p_completion_photos" "jsonb", "p_completion_videos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."unban_user"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unban_user"("p_target" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."unsend_message"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unsend_message"("p_message_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_job_details"("p_job_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_job_details"("p_job_id" "uuid", "p_title" "text", "p_description" "text", "p_category" "public"."job_category", "p_location" "text", "p_budget_cents" integer, "p_photos" "jsonb", "p_lat" double precision, "p_lng" double precision, "p_videos" "jsonb", "p_budget_min_cents" integer, "p_budget_max_cents" integer, "p_scheduled_date" "date", "p_arrival_start_hour" smallint, "p_arrival_end_hour" smallint, "p_address_line" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_live_location"("p_lat" double precision, "p_lng" double precision, "p_job_id" "uuid", "p_direct_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_live_location"("p_lat" double precision, "p_lng" double precision, "p_job_id" "uuid", "p_direct_thread_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_profile"("p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_patch" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."view_security_invoker_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."view_security_invoker_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."withdraw_job_dispute"("p_dispute_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_job_dispute"("p_dispute_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."withdraw_offer"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_offer"("p_offer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."worker_job_stats"("p_worker" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_job_stats"("p_worker" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."worker_self_service_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_self_service_enabled"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."worker_semantic_coverage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_semantic_coverage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_semantic_refresh_queue"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_semantic_refresh_queue"("p_limit" integer) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."banned_phones" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."banned_phones" TO "authenticated";
GRANT ALL ON TABLE "public"."banned_phones" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."blocks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."blocks" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_states" TO "service_role";
GRANT SELECT ON TABLE "public"."conversation_states" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."direct_threads" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."direct_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_threads" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."job_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."job_checklist_items" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."job_locations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."job_locations" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."job_requests" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."job_requests" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."legal_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."legal_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_acceptances" TO "service_role";



GRANT ALL ON TABLE "public"."live_location_shares" TO "service_role";
GRANT SELECT ON TABLE "public"."live_location_shares" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."message_reads" TO "anon";
GRANT ALL ON TABLE "public"."message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reads" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."mutes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."mutes" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."notification_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_outbox" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."notification_outbox" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."notification_prefs" TO "anon";
GRANT ALL ON TABLE "public"."notification_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_prefs" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."portfolio_items" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_items" TO "service_role";



GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."saved_workers" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_workers" TO "service_role";



GRANT ALL ON TABLE "public"."v_bids_projection_drift" TO "service_role";



GRANT ALL ON TABLE "public"."worker_semantic_docs" TO "service_role";



GRANT ALL ON TABLE "public"."worker_services" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_services" TO "service_role";



REVOKE ALL ON TABLE "storage"."buckets" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."buckets" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."buckets" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets" TO "anon";



GRANT ALL ON TABLE "storage"."buckets_analytics" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "anon";



GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "anon";



REVOKE ALL ON TABLE "storage"."objects" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."objects" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."objects" TO "service_role";
GRANT ALL ON TABLE "storage"."objects" TO "authenticated";
GRANT ALL ON TABLE "storage"."objects" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads_parts" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "anon";



GRANT SELECT ON TABLE "storage"."vector_indexes" TO "service_role";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "authenticated";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "anon";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "service_role";




