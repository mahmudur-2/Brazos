-- 20261112010000_fee_math_numeric.sql — lean B5: fee math is exact in whole cents up to the
-- $100,000 ceiling (payments_money_ceiling, job_offers_money_ceiling: 10,000,000 cents).
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. Every fee multiplied two integers before dividing: p_amount_cents * bps is
-- int4 * int4 = int4, which overflows above 2,147,483,647. So quote_job_price failed from a
-- $28,633.12 job (2,863,312 * 750), and with it accept_offer and begin_job_payment;
-- cancellation_fee_cents failed from a $10,737.42 job (* 2000), and the tip ceiling from a
-- $4,294.97 job (* 5000). begin_tip_payment computed the tip's fee before the ceiling, so an
-- absurd tip raised "integer out of range" instead of the ceiling's sentence.
--
-- WHAT CHANGES. The same four functions, each copied whole from its newest definition, with
-- one change: the product is taken in numeric (p::numeric * bps / 10000). numeric is exact,
-- and round(numeric) rounds half away from zero exactly as before, so every amount below the
-- old overflow is unchanged to the cent. Signatures, security attributes, ACLs: unchanged and
-- restated.
--   quote_job_price        20260905000000_stripe_foundation.sql §1
--   cancellation_fee_cents 20260905000000_stripe_foundation.sql §8
--   enforce_tip_ceiling    20260905000000_stripe_foundation.sql §16
--   begin_tip_payment      20261111000000_tip_settlement.sql §2
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/375_fee_math.sql.

begin;

create or replace function public.quote_job_price(p_amount_cents integer, p_at timestamptz default now())
returns table (job_price_cents integer, customer_fee_cents integer, tax_cents integer, total_cents integer,
               worker_fee_cents integer, worker_receives_cents integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with f as (select * from public.current_fee(p_at)),
  c as (
    select p_amount_cents as price,
           round(p_amount_cents::numeric * f.customer_bps / 10000)::integer as cfee,
           least(p_amount_cents, greatest(round(p_amount_cents::numeric * f.worker_bps / 10000)::integer, f.worker_min_fee_cents)) as wfee,
           f.tax_bps
    from f
  ),
  t as (
    select c.*, round((c.price::numeric + c.cfee) * c.tax_bps / 10000)::integer as tax from c
  )
  select t.price, t.cfee, t.tax, t.price + t.cfee + t.tax, t.wfee, t.price - t.wfee from t
$$;
revoke all on function public.quote_job_price(integer, timestamptz) from public, anon;
grant execute on function public.quote_job_price(integer, timestamptz) to authenticated, service_role;
comment on function public.quote_job_price(integer, timestamptz) is
  'The only price arithmetic: job price, Brazos Protection (customer side), tax, the all-in total the customer pays, the worker-side fee and what the worker receives — at the schedule in force at p_at. B5 (20261112010000): products in numeric, exact to the cent up to the $100,000 ceiling.';

create or replace function public.cancellation_fee_cents(p_job_id uuid, p_amount_cents integer) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_t record;
  v_fee integer;
begin
  select * into v_t from public.job_terms(p_job_id, p_amount_cents);
  v_fee := least(v_t.cancel_fee_max_cents,
                 greatest(v_t.cancel_fee_min_cents, round(p_amount_cents::numeric * v_t.cancel_fee_bps / 10000)::integer));
  return least(v_fee, p_amount_cents);
end $$;
revoke all on function public.cancellation_fee_cents(uuid, integer) from public, anon, authenticated;

create or replace function public.enforce_tip_ceiling() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $tip$
declare
  v_fee record;
  v_base integer;
  v_limit integer;
begin
  if new.kind <> 'tip' then return new; end if;
  if new.platform_fee_cents <> 0 then
    raise exception 'Tips carry no worker-side fee';
  end if;
  select * into v_fee from public.current_fee();
  select p.amount_cents into v_base
    from public.payments p
   where p.job_id = new.job_id and p.kind = 'job_payment' and p.status not in ('failed', 'voided');
  if v_base is null then
    raise exception 'A tip needs the job payment first';
  end if;
  v_limit := least(v_fee.tip_max_cents, round(v_base::numeric * v_fee.tip_max_bps / 10000)::integer);
  if new.amount_cents > v_limit then
    raise exception 'A tip on this job can be at most $%', to_char(v_limit / 100.0, 'FM999,999,990.00');
  end if;
  return new;
end $tip$;
revoke all on function public.enforce_tip_ceiling() from public, anon, authenticated;

create or replace function public.begin_tip_payment(p_job_id uuid, p_amount_cents integer) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_main public.payments;
  v_tip public.payments;
  v_fee record;
  v_cfee integer;
  v_tax integer;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter a tip amount greater than zero'; end if;
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then raise exception 'Tips are for completed jobs'; end if;

  select * into v_main from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  select * into v_fee from public.current_fee();
  -- B5: numeric products, so an amount far over the ceiling reaches the ceiling's sentence.
  v_cfee := round(p_amount_cents::numeric * v_fee.tip_customer_bps / 10000)::integer;
  v_tax := round((p_amount_cents::numeric + v_cfee) * v_fee.tax_bps / 10000)::integer;

  select * into v_tip from public.payments
   where job_id = p_job_id and kind = 'tip' and status not in ('failed', 'voided') for update;
  if found then
    if v_tip.status <> 'unfunded' then raise exception 'A tip was already added to this job'; end if;
    if v_tip.amount_cents = p_amount_cents then return v_tip; end if;
    -- B1: no in-place rewrite of the amount, with or without an intent
    -- attached. The row keeps the amount it was minted with; a different
    -- amount gets a new row through the insert below (and its ceiling).
    update public.payments
       set status = 'voided', last_error = 'tip amount changed before funding', updated_at = now()
     where id = v_tip.id;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               platform_fee_cents, customer_fee_cents, customer_fee_bps, tax_cents,
                               provider, status, funding_due_at)
  values (v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'tip', p_amount_cents,
          0, v_cfee, v_fee.tip_customer_bps, v_tax,
          'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_tip;
  return v_tip;
end $$;
revoke all on function public.begin_tip_payment(uuid, integer) from public, anon;
grant execute on function public.begin_tip_payment(uuid, integer) to authenticated;
comment on function public.begin_tip_payment(uuid, integer) is
  'The customer starts a stripe tip on a completed job whose payment released: row born unfunded, customer fee only (platform_fee_cents = 0), capped by the tip trigger. A tip row''s amount is never rewritten: asking for a different amount voids the unfunded row and inserts a new one, through the same trigger. payment_intent.succeeded holds the tip and queues the whole tip for transfer to the worker (release_requested_at, transfer_cents); transfer.created releases it (20261111000000_tip_settlement.sql). B5 (20261112010000): fee products in numeric.';

commit;
