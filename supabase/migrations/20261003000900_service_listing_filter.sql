-- 20261003000900_service_listing_filter.sql — FIX-RUN B3 review (2026-10-03): the word filter
-- reaches the one public surface 20261003000700 left out — a worker's service listings.
--
-- worker_services.title and .description are a worker's own words, published on their profile
-- (WorkerProfileScreen, Services & pricing) to anyone signed in, the same as a bio or a portfolio
-- caption. 20261003000700 guarded six surfaces and not this one, so a blocked word could be
-- published as a service. This adds the seventh trigger on the existing reject_blocked_terms()
-- — no new function, so no new ACL: that function's revoke (PUBLIC, anon, authenticated) stands,
-- and a BEFORE trigger fires for every role alike. An unchanged column on UPDATE is skipped by
-- the function itself, so a legacy listing still takes a price or a publish toggle.
--
-- Additive: one trigger created, nothing dropped, renamed, truncated or deleted.

create or replace trigger worker_services_reject_blocked_terms
  before insert or update of title, description on public.worker_services
  for each row execute function public.reject_blocked_terms('title', 'description');
