-- 20261112000200_schema_fingerprint.sql — ledger B7, second half (docs/critical/production-path.md, B2).
--
-- public.schema_fingerprint(): one jsonb value, { section: [one object per catalog row] }, for the
-- 19 sections scripts/verify-schema.mjs compares. A plain reader: it reads catalogs only, removes
-- nothing and decides nothing. What a correct hosted project always has that a local build has not
-- (minor version, platform extensions and roles, owners, extension-owned objects, ids) is removed
-- by the script's RULES, each with its reason, so the same rows can be compared both ways.
--
-- Never read: table rows, the Vault, cron run history, comments, column positions, object ids.
-- Function bodies and timer commands ARE read (the script compares their md5 and never prints
-- them); that is why this is service_role only.
--
-- Proof: supabase/tests/332_schema_fingerprint.sql and tests/verifySchema.test.mjs.

begin;

create or replace function public.schema_fingerprint()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $fn$
  with
  ext as (
    select d.classid, d.objid from pg_depend d where d.deptype = 'e'
  ),
  rel as (
    select c.oid, c.relname, c.relkind,
           exists (select 1 from ext where ext.classid = 'pg_class'::regclass and ext.objid = c.oid) as extension
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
  ),
  fn as (
    select p.oid,
           exists (select 1 from ext where ext.classid = 'pg_proc'::regclass and ext.objid = p.oid) as extension
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
  )
  select jsonb_build_object(
    'server', jsonb_build_array(jsonb_build_object('version_num', current_setting('server_version_num')::int)),

    'extensions', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object('name', e.extname, 'version', e.extversion, 'schema', n.nspname) as x
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace) s),

    'enums', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'name', t.typname,
               'labels', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)) as x
        from pg_type t
       where t.typnamespace = 'public'::regnamespace and t.typtype = 'e') s),

    'tables', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'name', r.relname, 'kind', r.relkind::text,
               'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity,
               'replica_identity', c.relreplident::text,
               'owner', pg_get_userbyid(c.relowner), 'extension', r.extension) as x
        from rel r join pg_class c on c.oid = r.oid
       where r.relkind in ('r', 'p')) s),

    'columns', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', r.relname, 'name', a.attname,
               'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
               'default', pg_get_expr(d.adbin, d.adrelid),
               'identity', a.attidentity::text, 'generated', a.attgenerated::text,
               'extension', r.extension) as x
        from rel r
        join pg_attribute a on a.attrelid = r.oid
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where r.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped) s),

    'constraints', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', r.relname, 'name', con.conname, 'type', con.contype::text,
               'definition', pg_get_constraintdef(con.oid), 'extension', r.extension) as x
        from pg_constraint con join rel r on r.oid = con.conrelid) s),

    'indexes', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', r.relname, 'name', i.relname,
               'definition', pg_get_indexdef(ix.indexrelid), 'extension', r.extension) as x
        from pg_index ix
        join rel r on r.oid = ix.indrelid
        join pg_class i on i.oid = ix.indexrelid) s),

    'functions', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'identity', p.oid::regprocedure::text,
               'result', pg_get_function_result(p.oid),
               'language', l.lanname, 'kind', p.prokind::text,
               'security_definer', p.prosecdef, 'volatility', p.provolatile::text,
               'strict', p.proisstrict, 'config', to_jsonb(p.proconfig),
               'owner', pg_get_userbyid(p.proowner), 'extension', f.extension,
               'body', p.prosrc) as x
        from fn f
        join pg_proc p on p.oid = f.oid
        join pg_language l on l.oid = p.prolang) s),

    'function_grants', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'function', p.oid::regprocedure::text,
               'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,
               'privilege', a.privilege_type, 'extension', f.extension) as x
        from fn f
        join pg_proc p on p.oid = f.oid
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a) s),

    'table_grants', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', r.relname, 'column', null::text,
               'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,
               'privilege', a.privilege_type, 'extension', r.extension) as x
        from rel r
        join pg_class c on c.oid = r.oid
        cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a
       where r.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      union all
      select jsonb_build_object(
               'table', r.relname, 'column', att.attname::text,
               'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,
               'privilege', a.privilege_type, 'extension', r.extension)
        from rel r
        join pg_attribute att on att.attrelid = r.oid
        cross join lateral aclexplode(att.attacl) a
       where att.attacl is not null and att.attnum > 0 and not att.attisdropped) s),

    'default_privileges', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'role', pg_get_userbyid(d.defaclrole)::text,
               'schema', coalesce(n.nspname::text, ''),
               'type', d.defaclobjtype::text,
               'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,
               'privilege', a.privilege_type) as x
        from pg_default_acl d
        left join pg_namespace n on n.oid = d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) a
       where d.defaclnamespace = 0 or n.nspname = 'public') s),

    'policies', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', p.tablename, 'name', p.policyname, 'permissive', p.permissive,
               'roles', to_jsonb(p.roles), 'command', p.cmd, 'using', p.qual, 'check', p.with_check) as x
        from pg_policies p
       where p.schemaname = 'public') s),

    'triggers', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'schema', n.nspname, 'table', c.relname, 'name', t.tgname,
               'definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled::text) as x
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal
         and (n.nspname = 'public'
              or (p.pronamespace = 'public'::regnamespace
                  and ((n.nspname = 'auth' and c.relname = 'users')
                       or (n.nspname = 'storage' and c.relname = 'objects'))))) s),

    'views', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'name', r.relname, 'kind', r.relkind::text,
               'definition', pg_get_viewdef(r.oid), 'options', to_jsonb(c.reloptions),
               'owner', pg_get_userbyid(c.relowner), 'extension', r.extension) as x
        from rel r join pg_class c on c.oid = r.oid
       where r.relkind in ('v', 'm')) s),

    'realtime', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'publication', p.pubname, 'all_tables', p.puballtables,
               'insert', p.pubinsert, 'update', p.pubupdate,
               'delete', p.pubdelete, 'truncate', p.pubtruncate) as x
        from pg_publication p
       where p.pubname = 'supabase_realtime'
      union all
      select jsonb_build_object(
               'member', pt.schemaname || '.' || pt.tablename,
               'columns', to_jsonb(pt.attnames), 'row_filter', pt.rowfilter)
        from pg_publication_tables pt
       where pt.pubname = 'supabase_realtime') s),

    'schedules', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object('jobname', j.jobname, 'schedule', j.schedule, 'command', j.command, 'active', j.active) as x
        from cron.job j) s),

    'buckets', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'id', b.id, 'name', b.name, 'public', b.public,
               'file_size_limit', b.file_size_limit, 'allowed_mime_types', to_jsonb(b.allowed_mime_types)) as x
        from storage.buckets b) s),

    'storage_policies', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object(
               'table', p.tablename, 'name', p.policyname, 'permissive', p.permissive,
               'roles', to_jsonb(p.roles), 'command', p.cmd, 'using', p.qual, 'check', p.with_check) as x
        from pg_policies p
       where p.schemaname = 'storage' and p.tablename in ('objects', 'buckets')) s),

    'migrations', (select coalesce(jsonb_agg(s.x order by s.x::text), '[]'::jsonb) from (
      select jsonb_build_object('version', m.version) as x
        from supabase_migrations.schema_migrations m) s)
  )
$fn$;
revoke all on function public.schema_fingerprint() from public, anon, authenticated;
grant execute on function public.schema_fingerprint() to service_role;
comment on function public.schema_fingerprint() is
  'B7: the catalog rows scripts/verify-schema.mjs compares, in 19 sections. Reads catalogs only (no table rows, no Vault, no cron history). Returns function bodies and timer commands, which the script compares by md5 and never prints: service_role only.';

commit;
