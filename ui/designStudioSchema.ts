import {
  STATIC_MATERIALS,
  getDesignOverrides,
  patchDesignOverrides,
  patchMaterialOverride,
  setOverrideValue,
  type DesignOverrides,
  type MaterialOverride,
  type PaletteNamespace,
  type StudioValue,
} from '../lib/designOverrides';
import type { MaterialName } from './tokens';

export type { StudioValue } from '../lib/designOverrides';

/**
 * RUN S2 (C1) — THE DESIGN STUDIO'S SCHEMA REGISTRY.
 *
 * Every control the studio offers is ONE ENTRY here: what it is called in
 * plain English, the technical key the export JSON uses, what visibly
 * changes, where it lives in the category tree, how it is edited (kind,
 * range, step), what today's shipped value is, and how its override is read
 * and written. The panel (components/DesignStudioPanel.tsx) renders ENTIRELY
 * from this registry — zero hand-wired rows — so adding a control is adding
 * an entry, never editing the panel.
 *
 * DEFAULTS ARE READ, NEVER RESTATED. `defaultValue` resolves from the live
 * token surfaces through the context the panel supplies (the static
 * materials table via lib/designOverrides.ts's re-surface — the
 * blur-boundary fence keeps the `materials` import unique to that file —
 * and the palettes the panel passes in), so a token retune moves the
 * studio's defaults with it and "reset" always lands on today's shipped
 * value. tests/designStudio.test.mjs executes this registry: labels and
 * descriptions non-empty, keys unique, every numeric default inside its own
 * range, and every default equal to the token value it claims to mirror.
 *
 * Colour TOKENS (the full palette walk, both themes) are enumerated at
 * runtime by the Colors category rather than listed here — a new palette
 * token appears in the studio with no edit to any file (C5 wires that
 * enumeration; the two G1 colour dials below are the C1 seed).
 */

export type StudioKind = 'number' | 'decimal' | 'color' | 'boolean' | 'enum' | 'text';

export type StudioTier = 'basic' | 'advanced';

/** 'token': the dial rewrites a shared token every wearer reads. 'local':
 *  the dial tunes one surface's own value. The export JSON carries this. */
export type StudioScope = 'token' | 'local';

export type StudioCategoryKey =
  | 'chrome'
  | 'navigation'
  | 'sheets'
  | 'menus'
  | 'cards'
  | 'buttons'
  | 'inputs'
  | 'colors'
  | 'spacing'
  | 'borders'
  | 'shadows'
  | 'blur'
  | 'layout'
  | 'advanced';

export type StudioCategory = {
  key: StudioCategoryKey;
  label: string;
  /** An Ionicons glyph name — icons live on CATEGORIES ONLY. The fence
   *  validates every name against the installed glyphmap. */
  icon: string;
};

export const STUDIO_CATEGORIES: readonly StudioCategory[] = [
  { key: 'chrome', label: 'Chrome & Header', icon: 'browsers-outline' },
  { key: 'navigation', label: 'Navigation', icon: 'navigate-outline' },
  { key: 'sheets', label: 'Sheets', icon: 'albums-outline' },
  { key: 'menus', label: 'Menus & Popovers', icon: 'list-outline' },
  { key: 'cards', label: 'Cards', icon: 'card-outline' },
  { key: 'buttons', label: 'Buttons & Pills', icon: 'radio-button-on-outline' },
  { key: 'inputs', label: 'Inputs & Search', icon: 'search-outline' },
  { key: 'colors', label: 'Colors', icon: 'color-palette-outline' },
  { key: 'spacing', label: 'Spacing', icon: 'resize-outline' },
  { key: 'borders', label: 'Borders & Dividers', icon: 'remove-outline' },
  { key: 'shadows', label: 'Shadows & Glows', icon: 'sunny-outline' },
  { key: 'blur', label: 'Blur & Material', icon: 'water-outline' },
  { key: 'layout', label: 'Layout', icon: 'grid-outline' },
  { key: 'advanced', label: 'Advanced', icon: 'construct-outline' },
];

export const STUDIO_CATEGORY_BY_KEY: ReadonlyMap<StudioCategoryKey, StudioCategory> = new Map(
  STUDIO_CATEGORIES.map((category) => [category.key, category]),
);

/**
 * What an entry's readers resolve against. The panel builds one per render
 * from the live stores and the palettes it imports; the fence builds one in
 * Node from the executed token modules. Nothing in here is a hook.
 */
export type StudioContext = {
  overrides: DesignOverrides;
  staticMaterials: typeof STATIC_MATERIALS;
  /** lib/theme's two ColorPalettes, as plain string records. */
  appLight: Record<string, string>;
  appDark: Record<string, string>;
  /** ui/tokens' two EmeraldPalettes, as plain string records. */
  emeraldLight: Record<string, string>;
  emeraldDark: Record<string, string>;
  isDark: boolean;
  /** The nav flush formula's live answer — navBottomPad's automatic value. */
  navBottomPadAuto: number;
  /** ui/primitives SURFACE_GLOW_ALPHA — the standing glow strength. */
  glowAlphaDefault: number;
};

export type StudioEntry = {
  /** Unique — the override address and the panel's row identity. */
  key: string;
  /** Plain English a beginner understands, read in context — the category
   *  supplies the noun ("Cards > Corner roundness"). */
  plainLabel: string;
  /** The identifier the export JSON carries; rendered as secondary text. */
  technicalKey: string;
  /** One line: what visibly changes when this dial moves. */
  description: string;
  category: StudioCategoryKey;
  subcategory?: string;
  tier: StudioTier;
  kind: StudioKind;
  scope: StudioScope;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** Another entry's key this one falls back to until touched. */
  inheritsFrom?: string;
  /** Today's shipped value, read from the token surfaces via ctx. */
  defaultValue: (ctx: StudioContext) => StudioValue;
  /** The live override, or undefined when the entry sits at its default. */
  overrideValue: (ctx: StudioContext) => StudioValue | undefined;
  /** Apply an override; undefined returns the entry to its default. */
  write: (value: StudioValue | undefined) => void;
};

/** An entry's current value: the override when set, else the default. */
export function currentValueOf(entry: StudioEntry, ctx: StudioContext): StudioValue {
  return entry.overrideValue(ctx) ?? entry.defaultValue(ctx);
}

export function isModified(entry: StudioEntry, ctx: StudioContext): boolean {
  return entry.overrideValue(ctx) !== undefined;
}

/** A StudioContext over the store's current state, for non-hook callers
 *  (the fence, resets, export). The panel supplies the palettes. */
export function studioContext(
  palettes: Pick<StudioContext, 'appLight' | 'appDark' | 'emeraldLight' | 'emeraldDark'>,
  live: Pick<StudioContext, 'isDark' | 'navBottomPadAuto' | 'glowAlphaDefault'>,
): StudioContext {
  return { overrides: getDesignOverrides(), staticMaterials: STATIC_MATERIALS, ...palettes, ...live };
}

// ---------------------------------------------------------------------------
// Entry builders — each returns ONE entry; the registry below is the list.
// ---------------------------------------------------------------------------

/** A dial stored in the generic values bag under its own key. */
export function bagEntry(
  entry: Omit<StudioEntry, 'overrideValue' | 'write'>,
): StudioEntry {
  return {
    ...entry,
    overrideValue: (ctx) => ctx.overrides.values?.[entry.key],
    write: (value) => setOverrideValue(entry.key, value),
  };
}

type NumericMaterialProp = 'blur' | 'scrimAlpha' | 'borderAlpha' | 'fallbackScrimAlpha';

const MATERIAL_SUBCATEGORY: Record<MaterialName, string> = {
  chrome: 'Nav bar chrome',
  sheet: 'Sheet glass',
  menu: 'Menu glass',
};

function materialDial(
  material: MaterialName,
  prop: NumericMaterialProp,
  row: Pick<StudioEntry, 'plainLabel' | 'description' | 'tier' | 'kind' | 'min' | 'max' | 'step'>,
): StudioEntry {
  return {
    key: `material.${material}.${prop}`,
    technicalKey: `materials.${material}.${prop}`,
    category: 'blur',
    subcategory: MATERIAL_SUBCATEGORY[material],
    scope: 'token',
    ...row,
    defaultValue: (ctx) => ctx.staticMaterials[material][prop],
    overrideValue: (ctx) => ctx.overrides.materials[material]?.[prop],
    write: (value) => {
      const patch: MaterialOverride = {};
      patch[prop] = value as number | undefined;
      patchMaterialOverride(material, patch);
    },
  };
}

function materialDials(material: MaterialName): StudioEntry[] {
  return [
    materialDial(material, 'blur', {
      plainLabel: 'Blur strength',
      description: 'How strongly what is behind this glass is frosted (dark theme, on device).',
      tier: 'basic',
      kind: 'number',
      min: 0,
      max: 100,
      step: 2,
    }),
    materialDial(material, 'scrimAlpha', {
      plainLabel: 'Background dimming',
      description: 'How deep the emerald tint over the blur is — higher hides more of what shows through.',
      tier: 'basic',
      kind: 'decimal',
      min: 0,
      max: 1,
      step: 0.02,
    }),
    materialDial(material, 'borderAlpha', {
      plainLabel: 'Edge line opacity',
      description: "How visible the mint hairline on this surface's edge is.",
      tier: 'advanced',
      kind: 'decimal',
      min: 0,
      max: 1,
      step: 0.02,
    }),
    materialDial(material, 'fallbackScrimAlpha', {
      plainLabel: 'Dimming without blur',
      description: 'The deeper tint used where blur cannot render (web, Reduce Transparency).',
      tier: 'advanced',
      kind: 'decimal',
      min: 0,
      max: 1,
      step: 0.02,
    }),
  ];
}

// ---------------------------------------------------------------------------
// The registry. C1 seeds it with every dial the G1 studio already offered;
// C5–C10 grow the categories. Order inside a category is display order.
// ---------------------------------------------------------------------------

export const STUDIO_REGISTRY: readonly StudioEntry[] = [
  ...materialDials('chrome'),
  ...materialDials('sheet'),
  ...materialDials('menu'),
  {
    key: 'glow.alpha',
    plainLabel: 'Glow strength',
    technicalKey: 'glowAlpha',
    description: 'How strongly the active tab and glowing surfaces halo (dark theme).',
    category: 'shadows',
    subcategory: 'Global',
    tier: 'basic',
    kind: 'decimal',
    scope: 'token',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: (ctx) => ctx.glowAlphaDefault,
    overrideValue: (ctx) => ctx.overrides.glowAlpha,
    write: (value) => patchDesignOverrides({ glowAlpha: value as number | undefined }),
  },
  {
    key: 'nav.radius',
    plainLabel: 'Top corner roundness',
    technicalKey: 'navRadius',
    description: "Rounds the nav bar's top corners — 0 is the flush, square bar.",
    category: 'navigation',
    subcategory: 'Bar container',
    tier: 'basic',
    kind: 'number',
    scope: 'token',
    unit: 'pt',
    min: 0,
    max: 40,
    step: 2,
    defaultValue: () => 0,
    overrideValue: (ctx) => ctx.overrides.navRadius,
    write: (value) => patchDesignOverrides({ navRadius: value as number | undefined }),
  },
  {
    key: 'nav.bottomPad',
    plainLabel: 'Space below the nav bar',
    technicalKey: 'navBottomPad',
    description:
      "Padding between the bar's icon row and the physical bottom edge — automatic from the safe area until touched.",
    category: 'navigation',
    subcategory: 'Bar container',
    tier: 'basic',
    kind: 'number',
    scope: 'token',
    unit: 'pt',
    min: 0,
    max: 34,
    step: 2,
    defaultValue: (ctx) => ctx.navBottomPadAuto,
    overrideValue: (ctx) => ctx.overrides.navBottomPad,
    write: (value) => patchDesignOverrides({ navBottomPad: value as number | undefined }),
  },
  {
    key: 'color.gold',
    plainLabel: 'Gold accent',
    technicalKey: 'gold',
    description:
      'The metal line-work — eyebrows, hairlines, icons, rings — in whichever theme is showing.',
    category: 'colors',
    subcategory: 'Accents',
    tier: 'basic',
    kind: 'color',
    scope: 'token',
    defaultValue: (ctx) => (ctx.isDark ? ctx.appDark.gold : ctx.appLight.gold),
    overrideValue: (ctx) => ctx.overrides.gold,
    write: (value) => patchDesignOverrides({ gold: value as string | undefined }),
  },
  {
    key: 'color.cardFill',
    plainLabel: 'Card surface (dark)',
    technicalKey: 'cardFill',
    description: "The dark theme's card fill; the light theme never reads it.",
    category: 'colors',
    subcategory: 'Accents',
    tier: 'basic',
    kind: 'color',
    scope: 'token',
    defaultValue: (ctx) => ctx.appDark.surface,
    overrideValue: (ctx) => ctx.overrides.cardFill,
    write: (value) => patchDesignOverrides({ cardFill: value as string | undefined }),
  },
];

/** Registry entries grouped by category, in category order. */
export function entriesByCategory(): ReadonlyMap<StudioCategoryKey, StudioEntry[]> {
  const grouped = new Map<StudioCategoryKey, StudioEntry[]>();
  for (const category of STUDIO_CATEGORIES) grouped.set(category.key, []);
  for (const entry of STUDIO_REGISTRY) grouped.get(entry.category)?.push(entry);
  return grouped;
}

// ---------------------------------------------------------------------------
// Export and import (C4). One validation path serves the paste field, the
// raw editor and preset loads: unknown keys and invalid values are DROPPED
// and listed, a malformed paste can never crash or partially apply, and
// every numeric survives only clamped to its schema range.
// ---------------------------------------------------------------------------

const REGISTRY_BY_KEY: ReadonlyMap<string, StudioEntry> = new Map(
  STUDIO_REGISTRY.map((entry) => [entry.key, entry]),
);
const REGISTRY_BY_TECHNICAL: ReadonlyMap<string, StudioEntry> = new Map(
  STUDIO_REGISTRY.map((entry) => [entry.technicalKey, entry]),
);

/** #RGB, #RRGGBB or #RRGGBBAA, '#' optional, case-insensitive → #UPPER. */
export function normalizeHex(raw: string): string | null {
  const bare = raw.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(bare)) return null;
  const full =
    bare.length === 3
      ? bare
          .split('')
          .map((c) => c + c)
          .join('')
      : bare;
  return `#${full.toUpperCase()}`;
}

export type StudioExportItem = {
  technicalKey: string;
  scope: StudioScope;
  value: StudioValue;
  default: StudioValue;
};

/**
 * The share/export payload: MODIFIED values only, grouped by category label,
 * each entry carrying its technicalKey and scope. Palette-bank colours (the
 * runtime-enumerated tokens) export as `palette.<theme>.<ns>.<role>`.
 */
export function exportModifiedOverrides(ctx: StudioContext): Record<string, StudioExportItem[]> {
  const grouped: Record<string, StudioExportItem[]> = {};
  const push = (label: string, item: StudioExportItem) => {
    (grouped[label] ??= []).push(item);
  };
  for (const entry of STUDIO_REGISTRY) {
    const value = entry.overrideValue(ctx);
    if (value === undefined) continue;
    const label = STUDIO_CATEGORY_BY_KEY.get(entry.category)?.label ?? entry.category;
    push(label, {
      technicalKey: entry.technicalKey,
      scope: entry.scope,
      value,
      default: entry.defaultValue(ctx),
    });
  }
  const banks = ctx.overrides.palette;
  if (banks) {
    const colorsLabel = STUDIO_CATEGORY_BY_KEY.get('colors')?.label ?? 'Colors';
    for (const theme of ['light', 'dark'] as const) {
      const bank = banks[theme];
      if (!bank) continue;
      for (const key of Object.keys(bank).sort()) {
        const dot = key.indexOf('.');
        const namespace = key.slice(0, dot) as PaletteNamespace;
        const role = key.slice(dot + 1);
        const defaults =
          namespace === 'app'
            ? theme === 'dark'
              ? ctx.appDark
              : ctx.appLight
            : theme === 'dark'
              ? ctx.emeraldDark
              : ctx.emeraldLight;
        push(colorsLabel, {
          technicalKey: `palette.${theme}.${key}`,
          scope: 'token',
          value: bank[key],
          default: defaults[role] ?? '',
        });
      }
    }
  }
  return grouped;
}

/** Validate one value against its entry's kind and range. Null = dropped. */
function sanitizeEntryValue(entry: StudioEntry, value: unknown): StudioValue | null {
  switch (entry.kind) {
    case 'number':
    case 'decimal': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      const min = entry.min ?? Number.NEGATIVE_INFINITY;
      const max = entry.max ?? Number.POSITIVE_INFINITY;
      return Math.min(max, Math.max(min, value));
    }
    case 'color':
      return typeof value === 'string' ? normalizeHex(value) : null;
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'enum':
      return typeof value === 'string' && (entry.options ?? []).includes(value) ? value : null;
    case 'text':
      return typeof value === 'string' ? value : null;
  }
}

type SanitizeAccumulator = {
  materials: Record<string, Record<string, StudioValue>>;
  top: Record<string, StudioValue>;
  values: Record<string, StudioValue>;
  palette: { light: Record<string, string>; dark: Record<string, string> };
  dropped: string[];
};

const TOP_LEVEL_DIALS = ['glowAlpha', 'navRadius', 'navBottomPad', 'gold', 'cardFill'] as const;

const MATERIAL_TECHNICAL =
  /^materials\.(chrome|sheet|menu)\.(blur|scrimAlpha|borderAlpha|scrimColor|borderColor|fallbackScrimAlpha)$/;
const PALETTE_TECHNICAL = /^palette\.(light|dark)\.((?:app|emerald)\.[A-Za-z0-9_]+)$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Route one technicalKey-addressed value into the accumulator, validated. */
function foldTechnical(
  acc: SanitizeAccumulator,
  technicalKey: string,
  value: unknown,
  ctx: StudioContext,
): void {
  const material = MATERIAL_TECHNICAL.exec(technicalKey);
  if (material) {
    const [, name, prop] = material;
    const entry = REGISTRY_BY_TECHNICAL.get(technicalKey);
    const clean = entry
      ? sanitizeEntryValue(entry, value)
      : (prop === 'scrimColor' || prop === 'borderColor') && typeof value === 'string'
        ? normalizeHex(value)
        : null;
    if (clean == null) {
      acc.dropped.push(technicalKey);
      return;
    }
    (acc.materials[name] ??= {})[prop] = clean;
    return;
  }
  if ((TOP_LEVEL_DIALS as readonly string[]).includes(technicalKey)) {
    const entry = REGISTRY_BY_TECHNICAL.get(technicalKey);
    const clean = entry ? sanitizeEntryValue(entry, value) : null;
    if (clean == null) {
      acc.dropped.push(technicalKey);
      return;
    }
    acc.top[technicalKey] = clean;
    return;
  }
  const palette = PALETTE_TECHNICAL.exec(technicalKey);
  if (palette) {
    const [, theme, key] = palette;
    const dot = key.indexOf('.');
    const namespace = key.slice(0, dot) as PaletteNamespace;
    const role = key.slice(dot + 1);
    const roles = namespace === 'app' ? ctx.appLight : ctx.emeraldLight;
    const clean = typeof value === 'string' ? normalizeHex(value) : null;
    if (clean == null || !(role in roles)) {
      acc.dropped.push(technicalKey);
      return;
    }
    acc.palette[theme as 'light' | 'dark'][key] = clean;
    return;
  }
  const entry = REGISTRY_BY_TECHNICAL.get(technicalKey);
  if (entry) {
    const clean = sanitizeEntryValue(entry, value);
    if (clean == null) {
      acc.dropped.push(technicalKey);
      return;
    }
    acc.values[entry.key] = clean;
    return;
  }
  acc.dropped.push(technicalKey);
}

/** Fold a raw DesignOverrides-shaped object into the accumulator. */
function foldRawObject(
  acc: SanitizeAccumulator,
  raw: Record<string, unknown>,
  ctx: StudioContext,
): void {
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'materials') {
      if (!isPlainObject(value)) {
        acc.dropped.push('materials');
        continue;
      }
      for (const [name, dial] of Object.entries(value)) {
        if (!(name in ctx.staticMaterials) || !isPlainObject(dial)) {
          acc.dropped.push(`materials.${name}`);
          continue;
        }
        for (const [prop, propValue] of Object.entries(dial)) {
          foldTechnical(acc, `materials.${name}.${prop}`, propValue, ctx);
        }
      }
      continue;
    }
    if (key === 'values') {
      if (!isPlainObject(value)) {
        acc.dropped.push('values');
        continue;
      }
      for (const [valueKey, bagValue] of Object.entries(value)) {
        // Only entries whose storage IS the bag (key === technicalKey, the
        // bagEntry convention) may land here — a material or dial key in the
        // bag would sit unread by every consumer, so it is junk, not data.
        const entry = REGISTRY_BY_KEY.get(valueKey);
        const clean =
          entry && entry.technicalKey === valueKey ? sanitizeEntryValue(entry, bagValue) : null;
        if (clean == null) {
          acc.dropped.push(`values.${valueKey}`);
          continue;
        }
        acc.values[valueKey] = clean;
      }
      continue;
    }
    if (key === 'palette') {
      if (!isPlainObject(value)) {
        acc.dropped.push('palette');
        continue;
      }
      for (const [theme, bank] of Object.entries(value)) {
        if ((theme !== 'light' && theme !== 'dark') || !isPlainObject(bank)) {
          acc.dropped.push(`palette.${theme}`);
          continue;
        }
        for (const [bankKey, hex] of Object.entries(bank)) {
          foldTechnical(acc, `palette.${theme}.${bankKey}`, hex, ctx);
        }
      }
      continue;
    }
    if ((TOP_LEVEL_DIALS as readonly string[]).includes(key)) {
      foldTechnical(acc, key, value, ctx);
      continue;
    }
    acc.dropped.push(key);
  }
}

export type SanitizedOverrides = {
  overrides: DesignOverrides;
  /** Every key or value the validation dropped, by address. */
  dropped: string[];
};

/**
 * THE import path. Accepts either a raw override object (the raw editor's
 * shape) or the grouped export payload (arrays of {technicalKey, value}),
 * and returns a complete, valid override set plus the list of everything it
 * had to drop. It never throws, and because callers apply the RETURNED set
 * atomically, a malformed paste can never partially apply.
 */
export function sanitizeOverrides(input: unknown, ctx: StudioContext): SanitizedOverrides {
  const acc: SanitizeAccumulator = {
    materials: {},
    top: {},
    values: {},
    palette: { light: {}, dark: {} },
    dropped: [],
  };
  try {
    if (!isPlainObject(input)) {
      return { overrides: { materials: {} }, dropped: ['not an override object'] };
    }
    const groups = Object.values(input);
    const isExportShape = groups.length > 0 && groups.every((group) => Array.isArray(group));
    if (isExportShape) {
      for (const [label, group] of Object.entries(input)) {
        for (const item of group as unknown[]) {
          if (!isPlainObject(item) || typeof item.technicalKey !== 'string') {
            acc.dropped.push(`${label}: unreadable item`);
            continue;
          }
          foldTechnical(acc, item.technicalKey, item.value, ctx);
        }
      }
    } else {
      foldRawObject(acc, input, ctx);
    }
  } catch {
    return { overrides: { materials: {} }, dropped: ['unreadable input'] };
  }

  const materials: Record<string, Record<string, StudioValue>> = {};
  for (const [name, dial] of Object.entries(acc.materials)) {
    if (Object.keys(dial).length) materials[name] = dial;
  }
  const overrides: DesignOverrides = {
    materials: materials as DesignOverrides['materials'],
    ...(acc.top as Partial<DesignOverrides>),
  };
  if (Object.keys(acc.values).length) overrides.values = acc.values;
  const palette: NonNullable<DesignOverrides['palette']> = {};
  if (Object.keys(acc.palette.light).length) palette.light = acc.palette.light;
  if (Object.keys(acc.palette.dark).length) palette.dark = acc.palette.dark;
  if (Object.keys(palette).length) overrides.palette = palette;
  return { overrides, dropped: acc.dropped };
}
