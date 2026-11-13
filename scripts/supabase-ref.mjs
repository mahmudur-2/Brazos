/**
 * THE Supabase project-ref parsers (one shared implementation — see
 * verify-schema.mjs's env-parity gate, which these were extracted from, and
 * eas-build-pre-install.mjs, which pins every build profile to one project).
 * Refs only are ever compared and printed — never a URL, key, or
 * connection string. Dependency-free on purpose: the EAS pre-install hook
 * runs before node_modules exists.
 */

/** Project ref from a REST URL (https://<ref>.supabase.co). */
export function refFromRestUrl(u) {
  return String(u ?? '').match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)?.[1] ?? null;
}

/** Project ref from a direct Postgres connection string. */
export function refFromPgUrl(u) {
  const s = String(u ?? '');
  return (
    s.match(/postgres\.([a-z0-9]{16,})/i)?.[1] ??
    s.match(/@db\.([a-z0-9]+)\.supabase\./i)?.[1] ??
    null
  );
}

/**
 * Project ref from a legacy JWT-shaped anon key. New `sb_publishable_…` keys
 * carry no ref and resolve to null — callers must treat null as
 * "unresolvable", never as a match.
 */
export function refFromJwt(k) {
  try {
    return JSON.parse(Buffer.from(String(k).split('.')[1], 'base64').toString('utf8')).ref ?? null;
  } catch {
    return null;
  }
}

/**
 * The Supabase projects this repository may name — ONE definition of each.
 * Import these, never retype a ref: a second literal is how the gates drift
 * apart.
 *
 * STAGING_REF: what every non-production EAS build profile is pinned to.
 *
 * RETIRED_PRODUCTION_REF: the old production project, retired 2026-11-11
 * (docs/DECISIONS.md). Nothing may reach it: verify-schema.mjs and the
 * Production button refuse it, no build profile expects it, and the literal
 * stays the mechanical deny sentinel in CLAUDE.md.
 *
 * PRODUCTION_REF: the new production project (D-20261111-1), written here
 * 2026-11-13. Only the `production` EAS build profile is pinned to it
 * (eas-build-pre-install.mjs); the Production button reads its own
 * SUPABASE_PROJECT_REF secret and does not import this.
 */
export const STAGING_REF = 'zzkumxcjtbqoselzptig';
export const RETIRED_PRODUCTION_REF = 'avkighsiufeefyycbebf';
export const PRODUCTION_REF = 'agjwgvclzvjmpqhjutpd';

/**
 * SUPABASE_KEY format classification — one rule for both gates.
 *
 *   'legacy-jwt'  — eyJ… anon key; its payload embeds the project ref, so
 *                   the gates decode and cross-check it against the URL.
 *   'publishable' — new-format sb_publishable_… / sb_pu_… key; carries NO
 *                   ref BY DESIGN, so the REST URL is the authoritative ref
 *                   source and the live control probe is what verifies the
 *                   key actually belongs to that project.
 *   'unknown'     — anything else, including sb_secret_… (a secret key must
 *                   never ship in a client bundle). Both gates fail closed.
 */
export function keyKind(k) {
  const s = String(k ?? '');
  if (/^eyJ/.test(s)) return 'legacy-jwt';
  if (/^sb_publishable_/.test(s) || /^sb_pu_/.test(s)) return 'publishable';
  return 'unknown';
}
