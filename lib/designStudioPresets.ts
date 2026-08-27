import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DesignOverrides } from './designOverrides';

/**
 * RUN S2 (C4) — NAMED PRESETS, THE STUDIO'S ONE PERSISTED TIER.
 *
 * Presets live in AsyncStorage under `brazos.designstudio.*` and hold a raw
 * override set each. They are the middle persistence tier: LIVE overrides
 * die on relaunch unless saved here, presets survive relaunch, and DEFAULTS
 * are code (changed only by a freeze run, never by the studio). Loading a
 * preset is an explicit act, sanitised through the schema's import path at
 * the call site — nothing here applies anything.
 *
 * Every storage failure is swallowed into an empty read or a false return,
 * the same fail-safe posture lib/themePreferenceStorage.ts takes: a broken
 * store can cost saved presets, never crash the studio.
 */

export const DESIGN_STUDIO_PRESETS_KEY = 'brazos.designstudio.presets.v1';

export type StoredDesignPreset = {
  name: string;
  overrides: DesignOverrides;
};

function isStoredPreset(value: unknown): value is StoredDesignPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as { name?: unknown; overrides?: unknown };
  return (
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    typeof preset.overrides === 'object' &&
    preset.overrides !== null
  );
}

async function readAll(): Promise<StoredDesignPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(DESIGN_STUDIO_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredPreset);
  } catch {
    return [];
  }
}

async function writeAll(presets: StoredDesignPreset[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(DESIGN_STUDIO_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export async function listDesignPresets(): Promise<StoredDesignPreset[]> {
  return readAll();
}

/** Save or overwrite the named preset. */
export async function saveDesignPreset(
  name: string,
  overrides: DesignOverrides,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const presets = await readAll();
  const at = presets.findIndex((preset) => preset.name === trimmed);
  const entry: StoredDesignPreset = { name: trimmed, overrides };
  if (at === -1) presets.push(entry);
  else presets[at] = entry;
  return writeAll(presets);
}

export async function loadDesignPreset(name: string): Promise<DesignOverrides | null> {
  const presets = await readAll();
  return presets.find((preset) => preset.name === name)?.overrides ?? null;
}

export async function deleteDesignPreset(name: string): Promise<boolean> {
  const presets = await readAll();
  const remaining = presets.filter((preset) => preset.name !== name);
  if (remaining.length === presets.length) return false;
  return writeAll(remaining);
}

/** Rename; refuses to clobber an existing name. */
export async function renameDesignPreset(from: string, to: string): Promise<boolean> {
  const target = to.trim();
  if (!target) return false;
  const presets = await readAll();
  if (presets.some((preset) => preset.name === target)) return false;
  const at = presets.findIndex((preset) => preset.name === from);
  if (at === -1) return false;
  presets[at] = { ...presets[at], name: target };
  return writeAll(presets);
}

// ---------------------------------------------------------------------------
// RUN S3 (C3) — PINNED CONTROLS, the studio's second persisted thing.
//
// Stars are gone; a pin is what survives. The set is a flat list of registry
// keys under its own versioned key, loaded on mount and written on every
// change, with exactly the fail-safe posture the presets above take: a broken
// store costs the operator their pins, never a crash. It lives here rather
// than in a second storage module because this file already IS the studio's
// AsyncStorage boundary.
// ---------------------------------------------------------------------------

export const DESIGN_STUDIO_PINS_KEY = 'brazos.designstudio.pins.v1';

/** The pinned registry keys, or an empty list if nothing is stored or the
 *  store is unreadable. */
export async function loadDesignPins(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DESIGN_STUDIO_PINS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string' && key.length > 0);
  } catch {
    return [];
  }
}

/** Replace the pinned set. False on any storage failure, never a throw. */
export async function saveDesignPins(keys: readonly string[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(DESIGN_STUDIO_PINS_KEY, JSON.stringify([...keys]));
    return true;
  } catch {
    return false;
  }
}

/** Duplicate under "<name> copy", suffixing until the name is free. */
export async function duplicateDesignPreset(name: string): Promise<boolean> {
  const presets = await readAll();
  const source = presets.find((preset) => preset.name === name);
  if (!source) return false;
  const taken = new Set(presets.map((preset) => preset.name));
  let candidate = `${name} copy`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${name} copy ${n}`;
  presets.push({ name: candidate, overrides: source.overrides });
  return writeAll(presets);
}
