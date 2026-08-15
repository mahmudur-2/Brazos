# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-15 - phase70/71/72 written; staging is current through phase69

**Applied and verified on staging, 2026-08-15:** phase67, phase68, phase69 and
`phase69_default_privileges.sql`. The unauthenticated notification chain is
closed there, the ban gates route through `is_profile_active()`, and newly
created functions get no default EXECUTE.

**Written this run, applied NOWHERE yet** - evidence and the full Q1-Q5 audit:
[`docs/audits/ANON_EXPOSURE_2026-08-15.md`](docs/audits/ANON_EXPOSURE_2026-08-15.md).
Apply in this order; each file has a matching `phaseNN_rollback.sql`:

1. `supabase/phase70_unsend_message_authz.sql` - unsend_message's `<>` guard
   is inert for a null auth.uid() and the function is anon-callable (explicit
   grants stacked on an unrevoked PUBLIC default - the shape phase69's
   NULL-ACL sweep does not detect). Null-uid guard first, EXECUTE locked to
   authenticated. Expect `PHASE70 SELF-CHECK PASS`.
2. `supabase/phase71_reviews_read_lockdown.sql` - drops the world-readable
   "reviews are viewable by everyone" policy, so anon reads zero review rows.
   The anon SELECT grant deliberately stays for verify-schema's phase37
   column probe. Expect `PHASE71 SELF-CHECK PASS`.
3. `supabase/phase72_storage_read_lockdown.sql` - moves avatars_read and
   job_photos_read to authenticated, closing anonymous bucket enumeration.
   Known-URL fetches still work (public buckets bypass RLS); full closure is
   deferred to private buckets + signed URLs. If ALTER POLICY is refused, the
   error names the Dashboard fallback - re-run the file after it to install
   the sentinel. Expect `PHASE72 SELF-CHECK PASS`.

Only a green `node scripts/verify-schema.mjs` counts as applied; it now
carries the three sentinels plus a `checkRpcDenied` probe on unsend_message.

## Blockers

1. **Production is unmigrated** - it carries 28 anon-callable SECURITY
   DEFINER functions and the same two public storage read policies. A
   separate problem, out of this run's scope; nothing here touches it.
2. Until phase70/71/72 apply to staging: a signed-out caller holding a
   message UUID can blank any message under 15 minutes old, and reviews and
   both photo buckets stay anon-readable/enumerable.

Priorities and deferred items: [`BRAZOS_MASTER_PLAN.md`](BRAZOS_MASTER_PLAN.md).
