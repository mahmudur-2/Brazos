/**
 * THE user-facing error mapper (one shared path — no per-screen wording).
 *
 * Why this exists: the hardening run made failures visible instead of
 * silently rendering empty states, which was right — but it surfaced the
 * RAW PostgREST/Postgres text to users ("column jobs.en_route_at does not
 * exist", "could not find table 'public.worker_services' in the schema
 * cache"). That is both unreadable and internal schema disclosure.
 *
 * Every user-visible error surface routes through userMessage(). The raw
 * detail is appended ONLY under __DEV__, so a developer keeps the diagnosis
 * and a user never sees the schema.
 *
 * This is a pure module by design: no imports, so the node test suite can
 * execute it directly (the jobLifecycle/earningsMath precedent).
 */

/** Anything a Supabase call, a fetch, or a throw can hand back. */
export type ErrorLike =
  | { message?: string | null; code?: string | null; details?: string | null }
  | string
  | null
  | undefined;

const DEFAULT = 'Something went wrong. Please try again.';

/** The app is talking to a database that predates it (or vice versa). */
const VERSION_SKEW =
  'This part of the app isn’t available in this build. Check for an app update — if it persists, let us know.';
const OFFLINE =
  'Can’t reach BRAZOS right now. Check your connection and try again.';
const DENIED = 'You don’t have access to this.';
const MISSING = 'This isn’t available anymore.';
const CONFLICT = 'That was already done.';

function rawOf(error: ErrorLike): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return [error.message, error.details].filter(Boolean).join(' — ');
}

function codeOf(error: ErrorLike): string {
  if (!error || typeof error === 'string') return '';
  return String(error.code ?? '');
}

/**
 * The stable, friendly sentence for any failure. `fallback` overrides the
 * generic default when a caller has better context ("Nothing was charged").
 *
 * Classification is deliberately coarse: users act on "retry", "update the
 * app", or "you can't do that" — nothing finer changes their next move.
 */
export function userMessage(error: ErrorLike, fallback?: string): string {
  const raw = rawOf(error);
  const code = codeOf(error);
  const lower = raw.toLowerCase();

  let friendly: string;

  if (
    // undefined_column / undefined_table / undefined_function, and
    // PostgREST's schema-cache misses — all mean app-vs-database skew.
    code === '42703' ||
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    lower.includes('does not exist') ||
    lower.includes('schema cache')
  ) {
    friendly = VERSION_SKEW;
  } else if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('timeout') ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED'
  ) {
    friendly = OFFLINE;
  } else if (
    code === '42501' ||
    code === 'PGRST301' ||
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security policy')
  ) {
    friendly = DENIED;
  } else if (code === 'PGRST116' || lower.includes('not found')) {
    friendly = MISSING;
  } else if (code === '23505' || lower.includes('duplicate key')) {
    friendly = CONFLICT;
  } else if (raw && isSafeToShow(raw)) {
    // A deliberate, human-written message from one of our own RPCs (e.g.
    // "Funds release only after the job is completed") is the best text
    // available — those are written for users.
    friendly = raw;
  } else {
    friendly = fallback ?? DEFAULT;
  }

  if (__DEV__ && raw && friendly !== raw) {
    return `${friendly}\n\n[dev] ${raw}${code ? ` (${code})` : ''}`;
  }
  return friendly;
}

/**
 * Our own RPC exceptions are plain sentences. Anything carrying database
 * vocabulary — identifiers, types, SQL state — is engine text and must not
 * reach a user.
 */
function isSafeToShow(raw: string): boolean {
  if (raw.length > 160) return false;
  return !/\b(column|relation|table|constraint|schema|function|type|operator|syntax|null value|violates|pg_|public\.)\b/i.test(
    raw
  );
}

declare const __DEV__: boolean;
