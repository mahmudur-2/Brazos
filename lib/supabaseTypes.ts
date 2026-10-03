import type { Database as GeneratedDatabase } from '../types/database';

/**
 * F7 (fix run, 2026-10-03) — THE DATABASE TYPE THE CLIENT IS TYPED WITH.
 *
 * types/database.ts is generated (`npm run db:types`, local only) and is used
 * as generated, with ONE correction, made here rather than by editing the
 * generated file: every function argument also accepts `null`.
 *
 * WHY. A Postgres function parameter can never be declared NOT NULL — passing
 * NULL is always legal SQL, and PostgREST forwards a JSON null as SQL NULL.
 * The generator nonetheless types each argument as its bare type
 * (`p_budget_min_cents?: number`), so every call site that sends an explicit
 * `null` would have to send `undefined` instead. That is not the same call:
 * an omitted key falls back to the parameter's DEFAULT (not always NULL), and
 * PostgREST picks among a function's overloads by the argument NAMES sent, so
 * dropping keys can choose a different overload or none. Keeping the payloads
 * byte-for-byte as they are, and typing them truthfully, is the safe flip.
 *
 * Nothing else is loosened: table rows, inserts, updates, view rows, enums
 * and return types are exactly the generator's.
 */
type NullableArgs<A> = A extends Record<string, unknown> ? { [K in keyof A]: A[K] | null } : A;

type WithNullableFunctionArgs<F> = {
  [N in keyof F]: { [P in keyof F[N]]: P extends 'Args' ? NullableArgs<F[N][P]> : F[N][P] };
};

export type Database = {
  [S in keyof GeneratedDatabase]: GeneratedDatabase[S] extends { Functions: infer F }
    ? { [P in keyof GeneratedDatabase[S]]: P extends 'Functions' ? WithNullableFunctionArgs<F> : GeneratedDatabase[S][P] }
    : GeneratedDatabase[S];
};

/** The app's job status vocabulary, as the database enum spells it. */
export type JobStatusEnum = GeneratedDatabase['public']['Enums']['job_status'];
