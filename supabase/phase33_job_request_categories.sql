-- BRAZOS · Phase 33 · widen the job_requests category check
--
-- Safe to run repeatedly. One CHECK constraint on one table. No data is
-- modified or deleted, no function is redefined, no policy, grant or RLS
-- setting is touched, and phase29-32 are not altered in any way.
--
-- WHY
-- ---
-- phase18 created job_requests with the category list that existed at the
-- time:
--
--     check (category in ('dog_walking','cleaning','moving','yard_work',
--                         'handyman','errands','other'))
--
-- phase23 then added four values to the public.job_category enum —
-- furniture_assembly, tv_mounting, painting and packing — and the app's
-- JOB_CATEGORIES list (lib/jobs.ts) grew with it. job_requests.category is
-- plain text with its own hand-written check, so it never followed.
--
-- The result is a live bug rather than a theoretical one: the Hire Again form
-- offers all eleven categories, but choosing one of the four newer ones makes
-- create_job_request() fail on the constraint. The customer sees a raw
-- constraint error and no request is sent. Any request in Painting, Packing,
-- Furniture Assembly or TV/Furniture Mounting is unsendable today.
--
-- This brings the list back in line with the enum. It is deliberately still a
-- text column with an explicit list rather than a change of column type:
-- retyping it to public.job_category would also force create_job_request()
-- and respond_job_request() to be redefined to cast their text parameter, and
-- widening the check is the smaller change that fixes the actual failure.
--
-- KEEP IN SYNC WITH: public.job_category (the enum) and JOB_CATEGORIES in
-- lib/jobs.ts. All three are the same eleven values.

begin;

-- Dropped and re-added rather than altered, because a CHECK constraint cannot
-- be modified in place. Existing rows all hold one of the original seven
-- values, which the new list is a superset of, so the re-add validates
-- against every stored row without rewriting any of them.
alter table public.job_requests
  drop constraint if exists job_requests_category_valid;

alter table public.job_requests
  add constraint job_requests_category_valid check (
    category in (
      'dog_walking',
      'cleaning',
      'moving',
      'yard_work',
      'handyman',
      'errands',
      'furniture_assembly',
      'tv_mounting',
      'painting',
      'packing',
      'other'
    )
  );

comment on constraint job_requests_category_valid on public.job_requests is
  'Mirrors the public.job_category enum. Update both together.';

commit;
