/**
 * RUN S2 (C1) — WHERE THE DESIGN STUDIO MAY EXIST.
 *
 * The studio is PERMANENT and DEV-ONLY: the old "strip before TestFlight"
 * instruction is superseded. It exists in exactly two worlds —
 *
 *   - a Metro session (`__DEV__` true), and
 *   - a build whose EAS Update channel is `internal` or `development`
 *     (the operator's `share` build is a RELEASE build on channel
 *     `internal`, so `__DEV__` alone would hide the studio exactly where
 *     the operator tunes; eas.json is the record of the channels).
 *
 * Everything else FAILS CLOSED: `preview`, `production`, an unknown
 * channel, and a null/unreadable channel all hide the studio. expo-updates
 * documents that Expo Go and development builds always report a null
 * channel — that is what the `__DEV__` arm is for, and why null must never
 * count as "internal".
 *
 * The channel read follows the lib/blur.tsx boundary shape: one lazy,
 * caught require, resolved once per process. The API is the installed
 * expo-updates' own `channel: string | null` export (verified against
 * node_modules/expo-updates/build/Updates.d.ts) — a binary without the
 * module, or a web export, resolves to null and the gate stays closed
 * unless Metro is driving.
 *
 * BOTH mounts read this one constant: the Appearance screen's entry row and
 * the panel mount in navigation/ModeShell.tsx. tests/designStudio.test.mjs
 * pins the gate's logic, its channel set, and both call sites — no future
 * run may loosen any of the three.
 */

type UpdatesModule = { channel?: string | null };

/** The only channels where the studio may exist. Allow-list, never block-list. */
export const DESIGN_STUDIO_CHANNELS = ['internal', 'development'] as const;

function readUpdateChannel(): string | null {
  try {
    const updates = require('expo-updates') as UpdatesModule | null;
    const channel = updates?.channel;
    return typeof channel === 'string' && channel.length > 0 ? channel : null;
  } catch {
    return null;
  }
}

/** The pure rule, separated so the fence can execute the whole truth table. */
export function resolveDesignStudioAvailable(channel: string | null, dev: boolean): boolean {
  if (dev) return true;
  if (channel == null) return false;
  return (DESIGN_STUDIO_CHANNELS as readonly string[]).includes(channel);
}

/** Whether this binary may show the design studio — resolved once. */
export const designStudioAvailable: boolean = resolveDesignStudioAvailable(
  readUpdateChannel(),
  __DEV__ === true,
);
