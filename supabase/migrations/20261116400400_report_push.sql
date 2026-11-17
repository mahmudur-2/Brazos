-- report_push — production-36h S1, M2 (R2-f). A new report reaches every active admin as a
-- notification, so a report no longer waits unseen.
--
-- 1. NEW notify_admins(p_type, p_title, p_body, p_data, p_dedupe): one enqueue_notification() per
--    ACTIVE admin, dedupe key p_dedupe || ':' || <admin id> (for a report:
--    report:<report id>:<admin id>). No client may call it; the money lane will call it later from
--    its own definer code. Kept small on purpose.
-- 2. NEW trigger function notify_admins_on_report() and the AFTER INSERT trigger reports_notify_admins.
--    Words: title "New report", body "A report needs review. Open Profile, then Account & safety, then
--    Review reports." (the old app's own row labels: screens/ProfileScreen.tsx 'Account & safety',
--    screens/AccountSafetyScreen.tsx 'Review reports'). No reporter words go on a lock screen.
--    The tap opens ProfileMain (where Account & Safety lists the reports): a destination the
--    installed app already routes (lib/notificationRoutes.ts TAB_FOR_SCREEN, resolveTarget), so the
--    old app neither crashes nor shows "Couldn't open this notification". The type 'report_new' is
--    new; the old feed shows an unknown type with the bell icon (NotificationsScreen KIND_ICONS ?? ).
-- The existing limit of 10 reports a day per reporter (reports_rate_limit) caps the pushes.
-- 0. The order rule: this file restates no existing function; it stops if one of its new names
--    already exists, so it never replaces a body it was not written from.

begin;

do $order_rule$
declare
  v_bad text;
begin
  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values ('public.notify_admins(text,text,text,jsonb,text)'), ('public.notify_admins_on_report()')) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is not null then
    raise exception 'report_push: a function this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$order_rule$;

create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_data jsonb, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin uuid;
begin
  for v_admin in
    select p.id
    from public.profiles p
    where coalesce(p.is_admin, false)
      and not coalesce(p.banned, false)
      and p.deleted_at is null
    order by p.id
  loop
    -- Category 'jobs' and no actor: a report must not be mutable by an admin's own notification
    -- settings (should_notify() delivers 'jobs' always), and no person is the actor.
    perform public.enqueue_notification(
      v_admin, null, 'jobs', p_type, p_title, p_body, p_data, p_dedupe || ':' || v_admin::text
    );
  end loop;
end;
$function$;

revoke all on function public.notify_admins(text, text, text, jsonb, text) from public, anon, authenticated;

comment on function public.notify_admins(text, text, text, jsonb, text) is
  'report_push: one notification per ACTIVE admin (is_admin, not banned, not deleted), category ''jobs'' with no actor — a report must not be mutable by an admin''s own notification settings — dedupe key p_dedupe || '':'' || <admin id>. Definer code only; no client may call it.';

create or replace function public.notify_admins_on_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.notify_admins(
    'report_new',
    'New report',
    'A report needs review. Open Profile, then Account & safety, then Review reports.',
    jsonb_build_object('screen', 'ProfileMain', 'reportId', new.id),
    'report:' || new.id::text
  );
  return null;
end;
$function$;

revoke all on function public.notify_admins_on_report() from public, anon, authenticated;

comment on function public.notify_admins_on_report() is
  'report_push: AFTER INSERT on reports — tells every active admin that a report arrived (notify_admins). The tap opens ProfileMain, a screen every installed app routes.';

drop trigger if exists reports_notify_admins on public.reports;
create trigger reports_notify_admins
  after insert on public.reports
  for each row execute function public.notify_admins_on_report();

commit;
