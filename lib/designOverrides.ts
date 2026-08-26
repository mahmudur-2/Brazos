import { useMemo, useSyncExternalStore } from 'react';
import { materials, type MaterialName, type MaterialSpec } from '../ui/tokens';

/**
 * RUN G1 (C2) — THE LIVE THEME OVERRIDE LAYER.
 *
 * A small in-memory store of partial overrides over the static design tokens,
 * merged at the token read points: hooks/useThemeColors.ts folds `gold` and
 * `cardFill` into every resolved palette, ui/primitives/Surface.tsx resolves
 * its material through `resolveMaterials`, and the nav bar reads the glow,
 * radius and bottom-pad dials. The design studio panel (C3) is the one writer.
 *
 * THREE PROPERTIES, ALL LOAD-BEARING:
 *   - IN MEMORY ONLY. Nothing persists; a relaunch is a full reset. This is a
 *     tuning instrument, not a setting.
 *   - EMPTY MEANS BYTE-IDENTICAL. With no override set, every resolver below
 *     returns the SAME OBJECT it was given — identity, not a copy — so style
 *     caches keyed on the palette object (lib/theme.ts `themedStyles`) behave
 *     exactly as they did before this layer existed. The executed fence in
 *     tests/themeTokens.test.mjs holds that.
 *   - LIVE. Consumers subscribe through useSyncExternalStore, so a dial tap
 *     repaints every wearer of the changed value at once.
 */

/** Per-material dials: blur intensity, scrim alpha, hairline alpha. */
export type MaterialOverride = {
  blur?: number;
  scrimAlpha?: number;
  borderAlpha?: number;
};

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
};

export const EMPTY_DESIGN_OVERRIDES: DesignOverrides = { materials: {} };

type StoreState = {
  overrides: DesignOverrides;
  studioOpen: boolean;
};

let state: StoreState = { overrides: EMPTY_DESIGN_OVERRIDES, studioOpen: false };
const listeners = new Set<() => void>();

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

export function resetDesignOverrides(): void {
  setDesignOverrides(EMPTY_DESIGN_OVERRIDES);
}

export function setDesignStudioOpen(open: boolean): void {
  state = { ...state, studioOpen: open };
  emit();
}

/** The live override set — every consumer of a dialled value reads this. */
export function useDesignOverrides(): DesignOverrides {
  return useSyncExternalStore(subscribe, getDesignOverrides, getDesignOverrides);
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
    if (!dial || (dial.blur == null && dial.scrimAlpha == null && dial.borderAlpha == null)) {
      resolved[name] = spec;
      continue;
    }
    changed = true;
    resolved[name] = {
      ...spec,
      blur: dial.blur ?? spec.blur,
      scrimAlpha: dial.scrimAlpha ?? spec.scrimAlpha,
      borderAlpha: dial.borderAlpha ?? spec.borderAlpha,
    };
  }
  return changed ? resolved : materials;
}

/**
 * Fold the palette dials into a resolved palette. `gold` applies in either
 * theme (the dial tunes what is on screen); `cardFill` is by definition the
 * DARK card surface and light never reads it. With neither set, the palette
 * comes back untouched — the same object.
 */
export function applyPaletteOverrides<P extends { gold: string; surface: string }>(
  palette: P,
  overrides: DesignOverrides,
  isDark: boolean,
): P {
  const gold = overrides.gold;
  const cardFill = isDark ? overrides.cardFill : undefined;
  if (gold == null && cardFill == null) return palette;
  const merged = { ...palette };
  if (gold != null) merged.gold = gold;
  if (cardFill != null) merged.surface = cardFill;
  return merged;
}

/** The resolved materials, live — what Surface actually wears. */
export function useMaterials(): Record<MaterialName, MaterialSpec> {
  const overrides = useDesignOverrides();
  return useMemo(() => resolveMaterials(overrides), [overrides]);
}
