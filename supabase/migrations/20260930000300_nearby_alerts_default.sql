-- 20260930000300_nearby_alerts_default.sql — night1 (n1): nearby-job alerts
-- default ON for every account.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-04 — night1 (n1), entry (1).
-- docs/SCOPE.md lists "worker discovery with radius and default-on nearby
-- alerts" under In v1, while the schema shipped the column as
-- `"nearby_jobs" boolean DEFAULT false NOT NULL` (20260901000000_baseline.sql
-- line 6040, the live definition; the historical copy in
-- supabase/phase20_push_notifications.sql line 146 is superseded and is not
-- edited). SCOPE wins: the default flips to true. Reason: time-to-first-bid
-- depends on how many qualified workers learn about a job, and the alert is
-- already scoped to the worker's own categories and radius
-- (nearby_radius_miles, presets 1 / 3 / 5 / 10). The one-tap opt-out stays on
-- the notification settings screen.
--
-- THE VERSION: the planner named this file 20260930000000; n3 (20260930000100)
-- and n6 (20260930000200) landed first, so per the run's D5 continue-path it
-- takes the newest existing version plus 100.
--
-- TWO STATEMENTS AND A COMMENT, nothing else — no function, no policy, no
-- grant, no new object:
--   (a) the column default becomes true, so every prefs row created from now
--       on — the profiles_default_notification_prefs trigger inserts
--       (user_id) only, baseline line 1166 — starts with the alert on;
--   (b) the backfill, decided: every existing row still holding false is set
--       to true, stamping updated_at, so no installed account is left on the
--       old default;
--   (c) the column comment records the decision.
-- profiles.accepting_work needs NO statement here: it has defaulted to true
-- since the baseline (line 2239, comment at line 2250), and
-- supabase/tests/100_nearby_alerts_default.sql asserts that default alongside
-- this one. Additive only, so the staging pipeline applies it on push with no
-- operator tap.

alter table public.notification_prefs alter column nearby_jobs set default true;

update public.notification_prefs set nearby_jobs = true, updated_at = now() where nearby_jobs = false;

comment on column public.notification_prefs.nearby_jobs is
  'Nearby-job alerts. Default ON since 2026-09-04 (docs/DECISIONS.md, night1 n1 entry 1): docs/SCOPE.md''s default-on nearby alerts wins over the old schema default of false; every existing row was backfilled to true by migration 20260930000300; the one-tap opt-out is on the notification settings screen. Scoped by the worker''s categories and nearby_radius_miles.';
