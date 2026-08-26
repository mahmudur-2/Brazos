import { useMemo, useSyncExternalStore } from 'react';
import { materials, type MaterialName, type MaterialSpec } from '../ui/tokens';

/**
 * RUN G1 (C2), GENERALISED BY RUN S2 (C1) — THE LIVE THEME OVERRIDE LAYER.
 *
 * A small in-memory store of partial overrides over the static design tokens,
 * merged at the token read points: hooks/useThemeColors.ts folds the palette
 * dials into every resolved palette, ui/primitives/Surface.tsx resolves its
 * material through `resolveMaterials`, and the nav bar reads the glow, radius
 * and bottom-pad dials. The design studio panel is the one writer, driven
 * entirely by the schema registry in ui/designStudioSchema.ts.
 *
 * THREE PROPERTIES, ALL LOAD-BEARING:
 *   - IN MEMORY ONLY. Nothing persists; a relaunch is a full reset. This is a
 *     tuning instrument, not a setting. (Named PRESETS persist in
 *     AsyncStorage, but loading one is an explicit act — see
 *     lib/designStudioPresets.ts.)
 *   - EMPTY MEANS BYTE-IDENTICAL. With no override set, every resolver below
 *     returns the SAME OBJECT it was given — identity, not a copy — so style
 *     caches keyed on the palette object (lib/theme.ts `themedStyles`) behave
 *     exactly as they did before this layer existed. The executed fence in
 *     tests/themeTokens.test.mjs holds that.
 *   - LIVE, AND SLICED. Consumers subscribe through useSyncExternalStore.
 *     RUN S2: subscriptions are per-slice — the palette read point watches
 *     only the palette dials, materials wearers only the material dials, and
 *     schema-keyed dials are watched per key — so turning one dial repaints
 *     only the surfaces that actually read that value.
 *
 * S2's GENERALISATION adds two addressable stores beside the named dials:
 *   - `values`: a flat bag keyed by schema-entry key, for every dial the
 *     registry declares that is not a material or palette colour. A consumer
 *     reads its dial with `useOverrideValue(key)` (or the typed numeric/
 *     string helpers) and falls back to its static token.
 *   - `palette`: per-theme colour-token replacements, keys namespaced
 *     `app.<role>` (lib/theme's ColorPalette) and `emerald.<token>`
 *     (ui/tokens' EmeraldPalette), folded in by `applyPaletteOverrides`.
 * The G1 dials (`gold`, `cardFill`, the material trio, glow/nav) keep their
 * exact shapes and behaviour — the executed G1 fences hold them.
 */

/** Per-material dials. G1 shipped the first three; S2 exposes the rest of
 *  the MaterialSpec through the same store (colours and the no-blur
 *  fallback mix). `radius`/`radiusTopOnly` stay structural, not dialled. */
export type MaterialOverride = {
  blur?: number;
  scrimAlpha?: number;
  borderAlpha?: number;
  scrimColor?: string;
  borderColor?: string;
  fallbackScrimAlpha?: number;
};

/** What a schema-keyed dial may hold. */
export type StudioValue = string | number | boolean;

export type PaletteThemeKey = 'light' | 'dark';

/** The two palette surfaces a colour override may address. */
export type PaletteNamespace = 'app' | 'emerald';

export type DesignOverrides = {
  materials: Partial<Record<MaterialName, MaterialOverride>>;
  /** Glow strength — the active nav tab and any Surface glow. */
  glowAlpha?: number;
  /** The nav chrome's top-corner radius (launch value 0: square, flush). */
  navRadius?: number;
  /** When set, REPLACES the nav's flush formula max(inset − 16, 6). */
  navBottomPad?: number;
  /** Replaces the resolved palette's gold, either theme. */
  gold?: string;
  /** Replaces the DARK palette's card surface; light never reads it. */
  cardFill?: string;
  /** S2 (C1): schema-keyed dial values — see the header. */
  values?: Record<string, StudioValue>;
  /** S2 (C1): per-theme colour-token overrides, keys `app.*` / `emerald.*`. */
  palette?: Partial<Record<PaletteThemeKey, Record<string, string>>>;
};

export const EMPTY_DESIGN_OVERRIDES: DesignOverrides = { materials: {} };

/** The static table, re-surfaced so the schema registry can read defaults
 *  without importing `materials` from ui/tokens — the blur-boundary fence
 *  keeps that import unique to this file. */
export const STATIC_MATERIALS: Record<MaterialName, MaterialSpec> = materials;

type StoreState = {
  overrides: DesignOverrides;
  studioOpen: boolean;
};

let state: StoreState = { overrides: EMPTY_DESIGN_OVERRIDES, studioOpen: false };
const listeners = new Set<() => void>();

/** The palette read point's slice — cached so a non-palette dial keeps its
 *  identity and useThemeColors' subscribers do not repaint. */
export type PaletteOverridesSlice = Pick<DesignOverrides, 'gold' | 'cardFill' | 'palette'>;

const EMPTY_PALETTE_SLICE: PaletteOverridesSlice = {};
let paletteSlice: PaletteOverridesSlice = EMPTY_PALETTE_SLICE;

function computePaletteSlice(overrides: DesignOverrides): PaletteOverridesSlice {
  if (overrides.gold == null && overrides.cardFill == null && overrides.palette == null) {
    return EMPTY_PALETTE_SLICE;
  }
  return { gold: overrides.gold, cardFill: overrides.cardFill, palette: overrides.palette };
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDesignOverrides(): DesignOverrides {
  return state.overrides;
}

export function setDesignOverrides(next: DesignOverrides): void {
  state = { ...state, overrides: next };
  const nextSlice = computePaletteSlice(next);
  if (
    nextSlice.gold !== paletteSlice.gold ||
    nextSlice.cardFill !== paletteSlice.cardFill ||
    nextSlice.palette !== paletteSlice.palette
  ) {
    paletteSlice = nextSlice;
  }
  emit();
}

/** Patch the global dials, leaving the per-material set alone. */
export function patchDesignOverrides(patch: Partial<Omit<DesignOverrides, 'materials'>>): void {
  setDesignOverrides({ ...state.overrides, ...patch });
}

/** Patch one material's dials, leaving every other override alone. */
export function patchMaterialOverride(material: MaterialName, patch: MaterialOverride): void {
  setDesignOverrides({
    ...state.overrides,
    materials: {
      ...state.overrides.materials,
      [material]: { ...state.overrides.materials[material], ...patch },
    },
  });
}

/** Read one schema-keyed dial's override, or undefined when at default. */
export function getOverrideValue(key: string): StudioValue | undefined {
  return state.overrides.values?.[key];
}

/** Set (or, with undefined, clear) one schema-keyed dial. The bag itself is
 *  pruned when its last key clears, so "no overrides" stays one shape. */
export function setOverrideValue(key: string, value: StudioValue | undefined): void {
  const current = state.overrides.values;
  if (value === undefined) {
    if (!current || !(key in current)) return;
    const next = { ...current };
    delete next[key];
    const { values: _dropped, ...rest } = state.overrides;
    setDesignOverrides(Object.keys(next).length ? { ...rest, values: next } : rest);
    return;
  }
  if (current && current[key] === value) return;
  setDesignOverrides({ ...state.overrides, values: { ...current, [key]: value } });
}

/** Read one palette-token override (`app.*` / `emerald.*`) for one theme. */
export function getPaletteTokenOverride(theme: PaletteThemeKey, key: string): string | undefined {
  return state.overrides.palette?.[theme]?.[key];
}

/** Set (or, with undefined, clear) one palette-token override for one theme. */
export function setPaletteTokenOverride(
  theme: PaletteThemeKey,
  key: string,
  hex: string | undefined,
): void {
  const bank = state.overrides.palette?.[theme];
  if (hex === undefined) {
    if (!bank || !(key in bank)) return;
    const nextBank = { ...bank };
    delete nextBank[key];
    const nextPalette = { ...state.overrides.palette };
    if (Object.keys(nextBank).length) nextPalette[theme] = nextBank;
    else delete nextPalette[theme];
    const { palette: _dropped, ...rest } = state.overrides;
    setDesignOverrides(
      Object.keys(nextPalette).length ? { ...rest, palette: nextPalette } : rest,
    );
    return;
  }
  if (bank && bank[key] === hex) return;
  setDesignOverrides({
    ...state.overrides,
    palette: {
      ...state.overrides.palette,
      [theme]: { ...bank, [key]: hex },
    },
  });
}

export function resetDesignOverrides(): void {
  setDesignOverrides(EMPTY_DESIGN_OVERRIDES);
}

export function setDesignStudioOpen(open: boolean): void {
  state = { ...state, studioOpen: open };
  emit();
}

/** The live override set — the panel and coarse consumers read this. */
export function useDesignOverrides(): DesignOverrides {
  return useSyncExternalStore(subscribe, getDesignOverrides, getDesignOverrides);
}

/** One schema-keyed dial, live — re-renders only when THAT key moves. */
export function useOverrideValue(key: string): StudioValue | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getOverrideValue(key),
    () => getOverrideValue(key),
  );
}

/** Typed numeric read of one schema-keyed dial. */
export function useOverrideNumber(key: string): number | undefined {
  const value = useOverrideValue(key);
  return typeof value === 'number' ? value : undefined;
}

/** Typed string read of one schema-keyed dial. */
export function useOverrideString(key: string): string | undefined {
  const value = useOverrideValue(key);
  return typeof value === 'string' ? value : undefined;
}

/** One of the named global dials, live — a per-key primitive subscription. */
export function useDesignDial(key: 'glowAlpha' | 'navRadius' | 'navBottomPad'): number | undefined {
  return useSyncExternalStore(
    subscribe,
    () => state.overrides[key],
    () => state.overrides[key],
  );
}

const readPaletteSlice = () => paletteSlice;

/** The palette dials only — what hooks/useThemeColors.ts subscribes to, so a
 *  blur or spacing dial never repaints the whole themed tree. */
export function usePaletteOverrides(): PaletteOverridesSlice {
  return useSyncExternalStore(subscribe, readPaletteSlice, readPaletteSlice);
}

const readStudioOpen = () => state.studioOpen;

export function useDesignStudioOpen(): boolean {
  return useSyncExternalStore(subscribe, readStudioOpen, readStudioOpen);
}

/**
 * The materials table with the live dials folded in. With no relevant
 * override this IS ui/tokens.ts's `materials` object, and every untouched
 * material keeps its identity even while another is being dialled.
 */
export function resolveMaterials(
  overrides: DesignOverrides,
): Record<MaterialName, MaterialSpec> {
  let changed = false;
  const resolved = {} as Record<MaterialName, MaterialSpec>;
  for (const name of Object.keys(materials) as MaterialName[]) {
    const spec = materials[name];
    const dial = overrides.materials[name];
    if (!dial || Object.values(dial).every((value) => value == null)) {
      resolved[name] = spec;
      continue;
    }
    changed = true;
    resolved[name] = {
      ...spec,
      blur: dial.blur ?? spec.blur,
      scrimAlpha: dial.scrimAlpha ?? spec.scrimAlpha,
      borderAlpha: dial.borderAlpha ?? spec.borderAlpha,
      scrimColor: dial.scrimColor ?? spec.scrimColor,
      borderColor: dial.borderColor ?? spec.borderColor,
      fallbackScrimAlpha: dial.fallbackScrimAlpha ?? spec.fallbackScrimAlpha,
    };
  }
  return changed ? resolved : materials;
}

/**
 * Fold the palette dials into a resolved palette. `gold` applies in either
 * theme (the dial tunes what is on screen); `cardFill` is by definition the
 * DARK card surface and light never reads it. S2 (C1): the per-token bank
 * applies first, scoped to the caller's namespace and theme; the two G1
 * dials keep last word so their recorded behaviour is unchanged. With
 * nothing set, the palette comes back untouched — the same object.
 */
export function applyPaletteOverrides<P extends { gold: string; surface: string }>(
  palette: P,
  overrides: PaletteOverridesSlice,
  isDark: boolean,
  namespace: PaletteNamespace = 'app',
): P {
  const gold = overrides.gold;
  const cardFill = isDark ? overrides.cardFill : undefined;
  const bank = overrides.palette?.[isDark ? 'dark' : 'light'];
  let tokenEntries: Array<[string, string]> | null = null;
  if (bank) {
    const prefix = `${namespace}.`;
    for (const key of Object.keys(bank)) {
      if (!key.startsWith(prefix)) continue;
      const role = key.slice(prefix.length);
      if (!(role in palette)) continue;
      (tokenEntries ??= []).push([role, bank[key]]);
    }
  }
  if (gold == null && cardFill == null && tokenEntries == null) return palette;
  const merged: Record<string, string> = { ...(palette as unknown as Record<string, string>) };
  if (tokenEntries) for (const [role, hex] of tokenEntries) merged[role] = hex;
  if (gold != null) merged.gold = gold;
  if (cardFill != null) merged.surface = cardFill;
  return merged as unknown as P;
}

const readMaterialDials = () => state.overrides.materials;

/** The resolved materials, live — what Surface actually wears. Subscribed to
 *  the material dials alone, so a palette or spacing dial never repaints the
 *  glass. */
export function useMaterials(): Record<MaterialName, MaterialSpec> {
  const dials = useSyncExternalStore(subscribe, readMaterialDials, readMaterialDials);
  return useMemo(() => resolveMaterials({ materials: dials }), [dials]);
}
