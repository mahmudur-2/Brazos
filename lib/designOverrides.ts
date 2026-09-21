import { useMemo, useSyncExternalStore } from 'react';
import { materials, setMetricSource, type MaterialName, type MaterialSpec } from '../ui/tokens';

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
  /**
   * T1 (C1): THE METRIC BAG — the live half of ui/tokens.ts's `spacing`,
   * `radius`, `controls` and the three dialled `layout` keys, addressed
   * `<group>.<key>` exactly as those getters spell it. It is a bag of its own
   * rather than a corner of `values` for one reason: a metric write is the
   * only kind that has to invalidate every cached stylesheet in the app, and
   * keeping it separate is what lets `metricsGeneration()` bump on metric
   * writes ALONE — a blur or colour dial leaves all 102 `themedStyles` caches
   * standing.
   */
  metrics?: Record<string, number>;
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

/**
 * 2026-09-21 — THE HARNESS SEED. `node scripts/shots.mjs --design <file>`
 * renders the app under a candidate override set — the dark rebuild's
 * directions, rendered as REAL screens rather than mockups — by setting this
 * global before the bundle loads; it is applied here exactly as the studio's
 * dials are, through the one override layer. Web only by construction (the
 * harness is the one place the global exists; no native code sets it), and
 * in memory only, like every other override. With no global the state is
 * EMPTY_DESIGN_OVERRIDES itself — the byte-identical launch the fence holds.
 */
function seededOverrides(): DesignOverrides {
  const seed = (globalThis as { __BRAZOS_DESIGN_OVERRIDES__?: unknown }).__BRAZOS_DESIGN_OVERRIDES__;
  if (!seed || typeof seed !== 'object') return EMPTY_DESIGN_OVERRIDES;
  return { ...EMPTY_DESIGN_OVERRIDES, ...(seed as Partial<DesignOverrides>) };
}

let state: StoreState = { overrides: seededOverrides(), studioOpen: false };
const listeners = new Set<() => void>();

/** T1 (C1) — the metric generation. 0 means "nothing has ever been dialled",
 *  which is the state every style cache built before this layer existed was
 *  implicitly keyed on. Bumped only in `setDesignOverrides` above. */
let metricsGen = 0;

/** The palette read point's slice — cached so a non-palette dial keeps its
 *  identity and useThemeColors' subscribers do not repaint. */
export type PaletteOverridesSlice = Pick<DesignOverrides, 'gold' | 'cardFill' | 'palette'>;

const EMPTY_PALETTE_SLICE: PaletteOverridesSlice = {};

function computePaletteSlice(overrides: DesignOverrides): PaletteOverridesSlice {
  if (overrides.gold == null && overrides.cardFill == null && overrides.palette == null) {
    return EMPTY_PALETTE_SLICE;
  }
  return { gold: overrides.gold, cardFill: overrides.cardFill, palette: overrides.palette };
}

// The seed's palette, if any, is the first slice; empty otherwise (identity).
let paletteSlice: PaletteOverridesSlice = computePaletteSlice(state.overrides);

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

/**
 * RUN S2 (C4) — the undo stack's hook-in point. ONE listener (the history
 * module registers itself), told the PREVIOUS override set on every real
 * change, whatever wrote it — a dial, a reset, a preset load, an import —
 * so undo covers all override changes by construction.
 */
type OverridesChangeListener = (previous: DesignOverrides) => void;
let changeListener: OverridesChangeListener | null = null;

export function setDesignOverridesChangeListener(
  listener: OverridesChangeListener | null,
): void {
  changeListener = listener;
}

export function setDesignOverrides(next: DesignOverrides): void {
  const previous = state.overrides;
  if (next === previous) return;
  state = { ...state, overrides: next };
  // T1 (C1) — THE GENERATION BUMPS HERE, not in the metric writer, for the
  // same reason the undo listener hooks in here: this is the ONE funnel every
  // override change passes through, so a preset load, a pasted import, a
  // category reset and an undo all invalidate the style caches by
  // construction rather than by each remembering to.
  if (next.metrics !== previous.metrics) metricsGen += 1;
  changeListener?.(previous);
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

// ---------------------------------------------------------------------------
// The live metrics (T1, C1)
// ---------------------------------------------------------------------------

/**
 * One live metric's override, or undefined at its default.
 *
 * DELIBERATELY NOT A HOOK. ui/tokens.ts's getters call this from inside
 * `themedStyles` / `metricStyles` factories — which run while a stylesheet is
 * being built, not during render — so it has to be a plain read. What makes
 * the result reach the screen is `metricsGeneration()` below: the caches key
 * on it, and `useMetricsGeneration()` is what re-renders the wearers.
 */
export function liveMetric(key: string): number | undefined {
  const value = state.overrides.metrics?.[key];
  return typeof value === 'number' ? value : undefined;
}

/** The generation the style caches key on — see `setDesignOverrides`. */
export function metricsGeneration(): number {
  return metricsGen;
}

/** Set (or, with undefined, clear) one live metric. The bag is pruned when
 *  its last key clears, so "no overrides" stays exactly one shape — the
 *  identity the G1 fence asserts. */
export function setMetricOverride(key: string, value: number | undefined): void {
  const current = state.overrides.metrics;
  if (value === undefined) {
    if (!current || !(key in current)) return;
    const next = { ...current };
    delete next[key];
    const { metrics: _dropped, ...rest } = state.overrides;
    setDesignOverrides(Object.keys(next).length ? { ...rest, metrics: next } : rest);
    return;
  }
  if (current && current[key] === value) return;
  setDesignOverrides({ ...state.overrides, metrics: { ...current, [key]: value } });
}

// The install. ui/tokens.ts holds the slot and imports nothing to fill it —
// see the MetricSource docblock there for why this direction and not the
// other one.
setMetricSource({ read: liveMetric, generation: metricsGeneration });

// ---------------------------------------------------------------------------
// Dial inheritance (T1, C1 — the mechanism ui/designStudioSchema.ts declares)
// ---------------------------------------------------------------------------

/**
 * How deep a chain may go before the walk gives up. A cap and a visited set
 * are two answers to two different malformations: the set catches an actual
 * ring (a → b → a), the cap catches a chain that is merely absurd, and a
 * registry typo can produce either.
 */
export const DIAL_INHERITANCE_DEPTH_CAP = 8;

/**
 * Child key → parent key, registered by ui/designStudioSchema.ts at load from
 * the registry's `inheritsFrom` declarations.
 *
 * It lives HERE, as data, rather than being walked out of the registry
 * directly, because the read hooks below have to resolve a chain and the
 * registry imports this module — reaching the other way would be a cycle.
 * The schema module stays the one place inheritance is DECLARED; this is only
 * where it is stored.
 */
let dialParents: Readonly<Record<string, string>> = {};

export function setDialInheritance(map: Readonly<Record<string, string>>): void {
  dialParents = map;
}

export function getDialParent(key: string): string | undefined {
  return dialParents[key];
}

/** One key's own override, whichever bag holds it. */
function ownOverride(key: string): StudioValue | undefined {
  return state.overrides.values?.[key] ?? state.overrides.metrics?.[key];
}

/**
 * Walk key → parent → … and return the first override actually set.
 * Undefined means the whole chain is untouched, and the caller falls back to
 * its own token default — so an inheriting dial reads as its parent the
 * moment the parent moves, and as itself until then.
 */
export function resolveInheritedOverride(key: string): StudioValue | undefined {
  const seen = new Set<string>();
  let current: string | undefined = key;
  for (let depth = 0; current !== undefined && depth < DIAL_INHERITANCE_DEPTH_CAP; depth += 1) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const own = ownOverride(current);
    if (own !== undefined) return own;
    current = dialParents[current];
  }
  return undefined;
}

/** One dial, live, inheritance resolved — re-renders when THAT chain moves. */
export function useDialValue(key: string): StudioValue | undefined {
  return useSyncExternalStore(
    subscribe,
    () => resolveInheritedOverride(key),
    () => resolveInheritedOverride(key),
  );
}

/** Typed numeric read of one dial, inheritance resolved. */
export function useDialNumber(key: string): number | undefined {
  const value = useDialValue(key);
  return typeof value === 'number' ? value : undefined;
}

/** Typed string read of one dial, inheritance resolved. */
export function useDialString(key: string): string | undefined {
  const value = useDialValue(key);
  return typeof value === 'string' ? value : undefined;
}

/** The metric generation, live — what makes a themed component repaint when
 *  a spacing or radius dial moves (hooks/useThemeColors.ts subscribes). */
export function useMetricsGeneration(): number {
  return useSyncExternalStore(subscribe, metricsGeneration, metricsGeneration);
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

/**
 * A joined fingerprint of several bag keys. Strings compare by value under
 * Object.is, so a component subscribing through this re-renders exactly when
 * one of ITS dials moves — how the nav trees follow the bar-container dials
 * without an object snapshot to cache.
 */
export function useOverrideFingerprint(keys: readonly string[]): string {
  const readFingerprint = () =>
    keys.map((key) => `${key}=${String(state.overrides.values?.[key])}`).join('|');
  return useSyncExternalStore(subscribe, readFingerprint, readFingerprint);
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
