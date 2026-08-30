import { supabase } from './supabase';

/**
 * Server-driven configuration — the small set of values that must be
 * changeable without shipping a binary.
 *
 * THE THIRD CONFIGURATION SURFACE, AND THE ONLY ONE THAT MOVES AT RUNTIME.
 * lib/featureFlags.ts is a compile-time constant table: flipping a flag is a
 * release. config/env.ts is deployment configuration: changing a value is a
 * rebuild, because Metro inlines it. This file is the one place a value can
 * change while a binary is in a user's hands, which is exactly why it is kept
 * SMALL. A kill-switch belongs here; a feature flag does not.
 *
 * IT CANNOT BLOCK THE APP. Every failure — no table, no network, no session,
 * a row of the wrong shape, a value of the wrong type — resolves to FALLBACK.
 * A configuration read that can fail a launch is worse than no configuration
 * read at all: the whole point is that it is reached on a cold start, before
 * the user has done anything worth losing. There is no throw path in this
 * module and there must never be one.
 *
 * THE FIRST CONSUMER IS THE PAYMENTS KILL SWITCH (R6a, D15). `paymentsEnabled`
 * is seeded in `app_config` and read on focus by every screen that offers a
 * checkout, tip or release CTA; when it is false those CTAs are hidden in every
 * payments mode. The database refuses regardless — this is the second lock,
 * never the only one — which is why a FAILED read falls back to true rather
 * than locking a paying customer out. The other three values are still
 * consumed by nothing.
 *
 * THE EXPECTED TABLE SHAPE is one row per setting — `key` text primary key,
 * `value` jsonb — read with an anonymous-safe SELECT policy, because this is
 * the one read that has to work before anyone is signed in. Rows are merged
 * OVER the fallback, so a table that exists but is missing a key still yields
 * a complete config, and a key nobody recognises is ignored rather than
 * carried into the app.
 */

export type RemoteConfig = {
  /**
   * When true, the app shows a maintenance notice instead of its normal
   * entry surface. The one value here that genuinely has to reach a shipped
   * binary faster than a release can.
   */
  maintenanceMode: boolean;
  /** Shown only while maintenanceMode is true. Empty means use the default copy. */
  maintenanceMessage: string;
  /**
   * The oldest app `version` (app.config.ts's `version`, and therefore the
   * OTA runtime version) still allowed to run. A build below it is asked to
   * update. Compared as a version string by the consumer, not here.
   */
  minimumSupportedVersion: string;
  /**
   * Whether new job posting is accepting writes. A brake for an incident,
   * never a product decision — a permanent "off" belongs in a feature flag or
   * in the schema, where it can be reasoned about.
   */
  postingEnabled: boolean;
  /**
   * The payments kill switch (R6a, D15). False hides every checkout, tip and
   * release CTA in every mode; the database's own switch refuses the RPCs
   * regardless. Fallback true: an unreadable config must never lock a paying
   * customer out.
   */
  paymentsEnabled: boolean;
};

/**
 * What the app believes when the server says nothing. Every value is the
 * PERMISSIVE one: an unreachable config must never lock a user out of an app
 * that was working a minute ago.
 */
export const FALLBACK: RemoteConfig = {
  maintenanceMode: false,
  maintenanceMessage: '',
  minimumSupportedVersion: '0.0.0',
  postingEnabled: true,
  paymentsEnabled: true,
};

/** Narrowing helpers — a value of the wrong type is ignored, never coerced. */
const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

type ConfigRow = { key: string | null; value: unknown };

/**
 * Merge whatever the table returned over FALLBACK, one key at a time. An
 * unrecognised key is dropped; a recognised key holding the wrong type keeps
 * its fallback. A single bad row can therefore never take the rest down.
 */
function merge(rows: ConfigRow[]): RemoteConfig {
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    if (row && typeof row.key === 'string') byKey.set(row.key, row.value);
  }
  return {
    maintenanceMode: asBoolean(byKey.get('maintenanceMode'), FALLBACK.maintenanceMode),
    maintenanceMessage: asString(byKey.get('maintenanceMessage'), FALLBACK.maintenanceMessage),
    minimumSupportedVersion: asString(
      byKey.get('minimumSupportedVersion'),
      FALLBACK.minimumSupportedVersion
    ),
    postingEnabled: asBoolean(byKey.get('postingEnabled'), FALLBACK.postingEnabled),
    paymentsEnabled: asBoolean(byKey.get('paymentsEnabled'), FALLBACK.paymentsEnabled),
  };
}

/**
 * Read the server's configuration. Resolves to FALLBACK on ANY failure and
 * never rejects — callers do not need a try/catch and must not add one that
 * changes the outcome.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig> {
  try {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error || !Array.isArray(data)) {
      // Logged at debug volume rather than as an error, so an absent table or
      // policy does not read as a fault in the app.
      console.log('[remoteConfig] using fallback:', error?.message ?? 'no rows returned');
      return FALLBACK;
    }
    return merge(data as ConfigRow[]);
  } catch (err) {
    console.log('[remoteConfig] using fallback:', err instanceof Error ? err.message : 'unknown');
    return FALLBACK;
  }
}
