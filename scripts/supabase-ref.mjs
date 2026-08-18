/**
 * THE Supabase project-ref parsers (one shared implementation — see
 * verify-schema.mjs's env-parity gate, which these were extracted from, and
 * eas-build-pre-install.mjs, which pins production builds to the production
 * project). Refs only are ever compared and printed — never a URL, key, or
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
