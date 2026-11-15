-- 20261115000300_drop_set_payouts_enabled.sql — pack 1, A16: set_payouts_enabled(text, boolean) goes.
--
-- R5's service-only switch (20260905000000_stripe_foundation.sql §7). Nothing calls it: no edge
-- function, no script, no SQL function (connect-status writes set_payouts_status(uuid, text),
-- 20260915000000_connect_onboarding.sql), and no tool outside the repository. A second writer of
-- payouts_enabled that skips payouts_status is one that can disagree with it.
--
-- A DROP FUNCTION is not one of scripts/staging-scan.sh's destructive shapes, and no installed build
-- can call it (service_role only). Proof: supabase/tests/060_connect.sql §5 (hasnt_function),
-- 010_offers.sql G, 030_payments.sql §14, 040_authz.sql.

begin;

drop function public.set_payouts_enabled(text, boolean);

commit;
