import {
  DIAL_INHERITANCE_DEPTH_CAP,
  STATIC_MATERIALS,
  getDesignOverrides,
  patchDesignOverrides,
  patchMaterialOverride,
  setDialInheritance,
  setMetricOverride,
  setOverrideValue,
  setPaletteTokenOverride,
  type DesignOverrides,
  type MaterialOverride,
  type PaletteNamespace,
  type PaletteThemeKey,
  type StudioValue,
} from '../lib/designOverrides';
import {
  CONTROL_DEFAULTS,
  controls,
  DIVIDER_DEFAULTS,
  layout,
  LAYOUT_METRIC_DEFAULTS,
  radius as tokenRadius,
  shadows as tokenShadows,
  RADIUS_DEFAULTS,
  spacing,
  THEME_RADIUS_DEFAULTS,
  THEME_SPACING_DEFAULTS,
  type MaterialName,
} from './tokens';

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
  | 'screens'
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
  { key: 'screens', label: 'Screens', icon: 'phone-portrait-outline' },
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
  /** For colour entries: the token's own ground, for the live contrast
   *  readout (warns below 4.5:1, never blocks). */
  contrastGround?: (ctx: StudioContext) => { label: string; hex: string } | null;
};

/**
 * An entry's current value: its own override when set, else — for an entry
 * that declares a parent — whatever the chain resolves to, else its default.
 *
 * With no `inheritsFrom` anywhere in the registry this is the exact
 * expression it has always been, which is why turning the mechanism on moved
 * no value (T1, D9/D11).
 */
export function currentValueOf(entry: StudioEntry, ctx: StudioContext): StudioValue {
  const own = entry.overrideValue(ctx);
  if (own !== undefined) return own;
  if (entry.inheritsFrom) return resolveDialValue(entry.key, ctx) ?? entry.defaultValue(ctx);
  return entry.defaultValue(ctx);
}

export function isModified(entry: StudioEntry, ctx: StudioContext): boolean {
  return entry.overrideValue(ctx) !== undefined;
}

/** A StudioContext over the store's current state, for non-hook callers
 *  (the fence, resets, export). The panel supplies the palettes. */
export function studioContext(
  palettes: Pick<StudioContext, 'appLight' | 'appDark' | 'emeraldLight' | 'emeraldDark'>,
  live: Pick<StudioContext, 'isDark' | 'glowAlphaDefault'>,
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

/**
 * RUN T1 (C5) — A DIAL ON A LIVE TOKEN.
 *
 * Same shape as `bagEntry`, but it reads and writes the METRIC bag, whose key
 * space is exactly what ui/tokens.ts's and lib/theme.ts's getters address —
 * `spacing.lg`, `radius.md`, `controls.buttonHeight`, `layout.cardGap`,
 * `theme.spacing.lg`, `theme.radius.md`. That is what makes one of these
 * reach every consumer of the token rather than one surface's own value, and
 * why writing one bumps the generation that rebuilds every cached stylesheet.
 */
function metricEntry(entry: Omit<StudioEntry, 'overrideValue' | 'write'>): StudioEntry {
  return {
    ...entry,
    overrideValue: (ctx) => ctx.overrides.metrics?.[entry.key],
    write: (value) => setMetricOverride(entry.key, value as number | undefined),
  };
}

/** The `dialEntries` convenience, for metric dials. */
function metricDials(
  category: StudioCategoryKey,
  subcategory: string,
  rows: DialRow[],
): StudioEntry[] {
  return rows.map((row) => {
    const fallback = row.defaultValue;
    return metricEntry({
      key: row.key,
      technicalKey: row.key,
      plainLabel: row.label,
      description: row.description,
      category,
      subcategory,
      tier: row.tier,
      kind: row.kind ?? 'number',
      scope: row.scope,
      unit: row.unit ?? 'pt',
      min: row.min,
      max: row.max,
      step: row.step,
      inheritsFrom: row.inheritsFrom,
      defaultValue: typeof fallback === 'function' ? fallback : () => fallback,
    });
  });
}

type NumericMaterialProp = 'blur' | 'scrimAlpha' | 'borderAlpha' | 'fallbackScrimAlpha';

const MATERIAL_SUBCATEGORY: Record<MaterialName, string> = {
  chrome: 'Nav bar chrome',
  sheet: 'Sheet glass',
  menu: 'Menu glass',
  // 2026-09-18: the [+] create sheet's see-through pane. Its dials are the
  // DARK recipe, like every material's; the light "Frost" block it also
  // carries (ui/tokens.ts LightGlassSpec) is not dialled.
  clear: 'Create sheet glass',
  // 2026-09-19: the Map design's jobs and Filters panes.
  pane: 'Map pane glass',
  // 2026-09-27 (the Lux remake): the flat card every panel wears. Not dialled
  // — no `materialDials('card')` row is registered; the label only names it.
  card: 'Card',
  // 2026-09-28 (LUX-LIST-64 #53): the Inbox ••• dropdown's glass. Not dialled.
  dropdown: 'Inbox menu glass',
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

type ColorMaterialProp = 'scrimColor' | 'borderColor';

/** A material's two colour dials (C7) — same store, colour kind. */
function materialColorDial(
  material: MaterialName,
  prop: ColorMaterialProp,
  row: Pick<StudioEntry, 'plainLabel' | 'description' | 'tier'>,
): StudioEntry {
  return {
    key: `material.${material}.${prop}`,
    technicalKey: `materials.${material}.${prop}`,
    category: 'blur',
    subcategory: MATERIAL_SUBCATEGORY[material],
    scope: 'token',
    kind: 'color',
    ...row,
    defaultValue: (ctx) => ctx.staticMaterials[material][prop],
    overrideValue: (ctx) => ctx.overrides.materials[material]?.[prop],
    write: (value) => {
      const patch: MaterialOverride = {};
      patch[prop] = value as string | undefined;
      patchMaterialOverride(material, patch);
    },
    contrastGround: (ctx) => ({ label: 'text', hex: ctx.appDark.text }),
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
    materialColorDial(material, 'scrimColor', {
      plainLabel: 'Tint colour',
      description: 'The emerald ink this glass is mixed from — its fill under the blur.',
      tier: 'advanced',
    }),
    materialColorDial(material, 'borderColor', {
      plainLabel: 'Edge line colour',
      description: "The hairline on this surface's edge.",
      tier: 'advanced',
    }),
  ];
}

// ---------------------------------------------------------------------------
// The Sheets and Menus categories (C7). The cards' fill, blur and hairlines
// are the sheet/menu MATERIALS' dials (Blur & Material); what lives here is
// geometry, the backdrop scrim, the drag handle and the menu rows. No
// spring/physics dials, by decision.
// ---------------------------------------------------------------------------

function sheetDialEntries(): StudioEntry[] {
  const docked = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'sheets', subcategory: 'Docked sheet' });
  const dialog = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'sheets', subcategory: 'Dialog cards' });
  const backdrop = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'sheets', subcategory: 'Backdrop' });
  const handle = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'sheets', subcategory: 'Drag handle' });
  return [
    docked({
      key: 'sheet.topRadius',
      inheritsFrom: 'radius.xxl',
      plainLabel: 'Top corner roundness',
      technicalKey: 'sheet.topRadius',
      description: "The docked sheet's top corners.",
      tier: 'basic',
      kind: 'number',
      scope: 'token',
      unit: 'pt',
      min: 0,
      max: 48,
      step: 1,
      defaultValue: () => tokenRadius.xxl,
    }),
    docked({
      key: 'sheet.maxHeightPct',
      plainLabel: 'Max height',
      technicalKey: 'sheet.maxHeightPct',
      description: 'How much of the screen the docked sheet may grow to cover.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: '%',
      min: 50,
      max: 100,
      step: 2,
      defaultValue: () => 88,
    }),
    docked({
      key: 'sheet.headerPad',
      inheritsFrom: 'layout.screenGutter',
      plainLabel: 'Header side padding',
      technicalKey: 'sheet.headerPad',
      description: "The sheet header row's horizontal padding.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => layout.screenGutter,
    }),
    docked({
      key: 'sheet.contentPad',
      inheritsFrom: 'layout.screenGutter',
      plainLabel: 'Content padding',
      technicalKey: 'sheet.contentPad',
      description: "The sheet body's padding on every side.",
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => layout.screenGutter,
    }),
    docked({
      key: 'sheet.footerPad',
      inheritsFrom: 'theme.spacing.lg',
      plainLabel: 'Footer padding',
      technicalKey: 'sheet.footerPad',
      description: 'Padding under the sheet content, added to the safe-area inset.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => spacing.lg,
    }),
    docked({
      key: 'sheet.sectionGap',
      inheritsFrom: 'theme.spacing.md',
      plainLabel: 'Section spacing',
      technicalKey: 'sheet.sectionGap',
      description: 'The gap between the rows and sections inside a sheet.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 32,
      step: 1,
      defaultValue: () => spacing.md,
    }),
    dialog({
      key: 'sheet.dialogRadius',
      inheritsFrom: 'radius.xl',
      plainLabel: 'Dialog corner roundness',
      technicalKey: 'sheet.dialogRadius',
      description: 'The floating action-sheet and confirm cards.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => tokenRadius.xl,
    }),
    dialog({
      key: 'sheet.promptRadius',
      inheritsFrom: 'radius.lg',
      plainLabel: 'Amount prompt roundness',
      technicalKey: 'sheet.promptRadius',
      description: "The amount prompt card's corners.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => tokenRadius.lg,
    }),
    backdrop({
      key: 'sheet.backdropColor',
      plainLabel: 'Background dimming colour',
      technicalKey: 'sheet.backdropColor',
      description:
        'The scrim behind every sheet and dialog, replacing each surface’s own per-theme default.',
      tier: 'advanced',
      kind: 'color',
      scope: 'token',
      defaultValue: (ctx) => (ctx.isDark ? ctx.emeraldDark.bg : ctx.emeraldLight.ink) ?? '',
    }),
    backdrop({
      key: 'sheet.backdropAlpha',
      plainLabel: 'Background dimming',
      technicalKey: 'sheet.backdropAlpha',
      description: 'How deep the scrim behind every sheet and dialog dims the page.',
      tier: 'basic',
      kind: 'decimal',
      scope: 'token',
      min: 0,
      max: 1,
      step: 0.02,
      defaultValue: (ctx) => (ctx.isDark ? 0.55 : 0.45),
    }),
    handle({
      key: 'sheet.handleWidth',
      plainLabel: 'Handle width',
      technicalKey: 'sheet.handleWidth',
      description: "The drag handle's width.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 16,
      max: 80,
      step: 2,
      defaultValue: () => 40,
    }),
    handle({
      key: 'sheet.handleHeight',
      plainLabel: 'Handle height',
      technicalKey: 'sheet.handleHeight',
      description: "The drag handle's thickness.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 2,
      max: 10,
      step: 1,
      defaultValue: () => 4,
    }),
    handle({
      key: 'sheet.handleColor',
      plainLabel: 'Handle colour',
      technicalKey: 'sheet.handleColor',
      description: "The drag handle's ink, in whichever theme is showing.",
      tier: 'advanced',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) => (ctx.isDark ? ctx.emeraldDark.line : ctx.emeraldLight.line) ?? '',
    }),
    handle({
      key: 'sheet.handleAlpha',
      plainLabel: 'Handle opacity',
      technicalKey: 'sheet.handleAlpha',
      description: 'How solid the drag handle renders.',
      tier: 'advanced',
      kind: 'decimal',
      scope: 'local',
      min: 0,
      max: 1,
      step: 0.02,
      defaultValue: () => 1,
    }),
    handle({
      key: 'sheet.handleSpaceAbove',
      inheritsFrom: 'theme.spacing.sm',
      plainLabel: 'Space above the handle',
      technicalKey: 'sheet.handleSpaceAbove',
      description: 'Between the sheet’s top edge and the handle.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 24,
      step: 1,
      defaultValue: () => spacing.sm,
    }),
    handle({
      key: 'sheet.handleSpaceBelow',
      inheritsFrom: 'theme.spacing.sm',
      plainLabel: 'Space below the handle',
      technicalKey: 'sheet.handleSpaceBelow',
      description: 'Between the handle and the sheet’s header.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 24,
      step: 1,
      defaultValue: () => spacing.sm,
    }),
  ];
}

function menuDialEntries(): StudioEntry[] {
  const panel = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'menus', subcategory: 'Panel' });
  const rows = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'menus', subcategory: 'Rows' });
  return [
    panel({
      key: 'menu.minWidth',
      plainLabel: 'Width',
      technicalKey: 'menu.minWidth',
      description: 'The anchored menu panel’s minimum width.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 160,
      max: 320,
      step: 4,
      defaultValue: () => 208,
    }),
    panel({
      key: 'menu.radius',
      plainLabel: 'Corner roundness',
      technicalKey: 'menu.radius',
      description: 'The menu panel’s corners — the clip and the material move together.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 32,
      step: 1,
      defaultValue: (ctx) => ctx.staticMaterials.menu.radius ?? 0,
    }),
    panel({
      key: 'menu.paddingY',
      plainLabel: 'Panel padding',
      technicalKey: 'menu.paddingY',
      description: 'Vertical breathing room inside the panel, above and below the rows.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 24,
      step: 1,
      defaultValue: () => 0,
    }),
    rows({
      key: 'menu.itemHeight',
      plainLabel: 'Row height',
      technicalKey: 'menu.itemHeight',
      description: 'Each menu row’s minimum height — never below the 44pt touch floor.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 44,
      max: 64,
      step: 1,
      defaultValue: () => 46,
    }),
    rows({
      key: 'menu.itemPaddingX',
      inheritsFrom: 'theme.spacing.lg',
      plainLabel: 'Row side padding',
      technicalKey: 'menu.itemPaddingX',
      description: 'Each menu row’s horizontal padding.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 32,
      step: 1,
      defaultValue: () => spacing.lg,
    }),
    rows({
      key: 'menu.itemSpacing',
      plainLabel: 'Row spacing',
      technicalKey: 'menu.itemSpacing',
      description: 'Extra space between the rows.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 16,
      step: 1,
      defaultValue: () => 0,
    }),
    rows({
      key: 'menu.separators',
      plainLabel: 'Separators',
      technicalKey: 'menu.separators',
      description: 'The hairline between rows.',
      tier: 'basic',
      kind: 'boolean',
      scope: 'local',
      defaultValue: () => true,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Cards, Buttons/Pills and Inputs (C8) — declared as compact tables. The
// Home screen's Post-a-Job and search pills are SCREEN-LOCAL values and are
// deliberately absent: the dispatch's continue-path defers screen-local
// tokenisation to the sweep.
// ---------------------------------------------------------------------------

type DialRow = {
  key: string;
  label: string;
  description: string;
  tier: StudioTier;
  scope: StudioScope;
  kind?: StudioKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** Another dial this one falls back to until it is touched (T1, D9). */
  inheritsFrom?: string;
  defaultValue: StudioValue | ((ctx: StudioContext) => StudioValue);
  contrastGround?: StudioEntry['contrastGround'];
};

function dialEntries(
  category: StudioCategoryKey,
  subcategory: string,
  rows: DialRow[],
): StudioEntry[] {
  return rows.map((row) => {
    const kind = row.kind ?? 'number';
    const fallback = row.defaultValue;
    return bagEntry({
      key: row.key,
      technicalKey: row.key,
      plainLabel: row.label,
      description: row.description,
      category,
      subcategory,
      tier: row.tier,
      kind,
      scope: row.scope,
      unit: row.unit ?? (kind === 'number' ? 'pt' : undefined),
      min: row.min,
      max: row.max,
      step: row.step,
      options: row.options,
      inheritsFrom: row.inheritsFrom,
      defaultValue: typeof fallback === 'function' ? fallback : () => fallback,
      contrastGround: row.contrastGround,
    });
  });
}

const themePalette = (ctx: StudioContext) => (ctx.isDark ? ctx.appDark : ctx.appLight);
const themeEmerald = (ctx: StudioContext) => (ctx.isDark ? ctx.emeraldDark : ctx.emeraldLight);
const groundOf = (ctx: StudioContext) => ({
  label: 'background',
  hex: themePalette(ctx).background ?? '',
});

function cardDialEntries(): StudioEntry[] {
  return [
    ...dialEntries('cards', 'Job card', [
      {
        key: 'card.fill',
        label: 'Fill',
        description: 'The job card’s surface, in whichever theme is showing.',
        tier: 'basic',
        scope: 'token',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).surface ?? '',
        contrastGround: (ctx) => ({ label: 'text', hex: themePalette(ctx).text ?? '' }),
      },
      { key: 'card.fillAlpha', label: 'Fill opacity', description: 'How solid the card’s surface paints.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
      { key: 'card.paddingX', label: 'Side padding', description: 'Inside the card, left and right.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'layout.cardPadding', defaultValue: layout.cardPadding },
      { key: 'card.paddingY', label: 'Top/bottom padding', description: 'Inside the card, above and below.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'layout.cardPadding', defaultValue: layout.cardPadding },
      { key: 'card.radius', label: 'Corner roundness', description: 'The job card’s corners.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'radius.lg', defaultValue: tokenRadius.lg },
      { key: 'card.borderWidth', label: 'Border width', description: 'A ring the card does not draw today — 0 keeps it off.', tier: 'advanced', scope: 'local', min: 0, max: 4, step: 1, defaultValue: 0 },
      {
        key: 'card.borderColor',
        label: 'Border colour',
        description: 'The ring’s ink, where a border width is set.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).line ?? '',
      },
      { key: 'card.borderAlpha', label: 'Border opacity', description: 'The ring’s opacity.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
      { key: 'card.shadowOpacity', label: 'Shadow opacity', description: 'The card’s drop shadow (device; the web preview cannot show it).', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: (ctx) => (ctx.isDark ? 0.5 : 0.08) },
      { key: 'card.shadowRadius', label: 'Shadow blur', description: 'How soft the card’s shadow spreads.', tier: 'advanced', scope: 'local', min: 0, max: 40, step: 1, defaultValue: (ctx) => (ctx.isDark ? 16 : 14) },
      { key: 'card.shadowOffsetX', label: 'Shadow X offset', description: 'Moves the shadow sideways.', tier: 'advanced', scope: 'local', min: -20, max: 20, step: 1, defaultValue: 0 },
      { key: 'card.shadowOffsetY', label: 'Shadow Y offset', description: 'Moves the shadow down.', tier: 'advanced', scope: 'local', min: -20, max: 20, step: 1, defaultValue: (ctx) => (ctx.isDark ? 6 : 5) },
      { key: 'card.gap', label: 'Title-body gap', description: 'The vertical rhythm between the card’s rows.', tier: 'basic', scope: 'token', min: 0, max: 32, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'card.liftScale', label: 'Lift wash strength', description: 'Scales every lit surface’s diagonal wash — 1 is today’s calibration.', tier: 'advanced', scope: 'token', kind: 'decimal', min: 0, max: 3, step: 0.05, defaultValue: 1 },
    ]),
    ...dialEntries('cards', 'List row', [
      { key: 'listRow.paddingX', label: 'Side padding', description: 'The settings/list row’s horizontal padding.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'layout.screenGutter', defaultValue: layout.screenGutter },
      { key: 'listRow.paddingY', label: 'Top/bottom padding', description: 'The settings/list row’s vertical padding.', tier: 'basic', scope: 'token', min: 0, max: 32, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'listRow.gap', label: 'Column gap', description: 'Between the glyph, the text block and the trailing control.', tier: 'advanced', scope: 'local', min: 0, max: 24, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'listRow.textGap', label: 'Title-subtitle gap', description: 'Between a row’s title and its subtitle.', tier: 'advanced', scope: 'local', min: 0, max: 12, step: 1, defaultValue: 2 },
      { key: 'listRow.minHeight', label: 'Row height', description: 'The row’s minimum height — never below the 44pt touch floor.', tier: 'advanced', scope: 'local', min: 44, max: 72, step: 1, defaultValue: controls.minTouchTarget },
      {
        key: 'listRow.fill',
        label: 'Fill',
        description: 'The row’s surface, in whichever theme is showing.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).surface ?? '',
      },
    ]),
  ];
}

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const;

function buttonDialEntries(): StudioEntry[] {
  const entries: StudioEntry[] = [];
  for (const variant of BUTTON_VARIANTS) {
    const subcategory = `${variant.charAt(0).toUpperCase()}${variant.slice(1)} button`;
    const tier: StudioTier = variant === 'primary' ? 'basic' : 'advanced';
    const rows: DialRow[] = [
      { key: `button.${variant}.height`, label: 'Height', description: `Replaces every size’s height for the ${variant} button.`, tier, scope: 'local', min: 44, max: 72, step: 1, defaultValue: 52 },
      { key: `button.${variant}.padX`, label: 'Side padding', description: `The ${variant} button’s horizontal padding.`, tier: 'advanced', scope: 'local', min: 0, max: 32, step: 1, defaultValue: 16 },
      // lib/theme's own radius scale (md = 12) — the button's shipped corner.
      { key: `button.${variant}.radius`, label: 'Corner roundness', description: `The ${variant} button’s corners.`, tier, scope: 'local', min: 0, max: 36, step: 1, defaultValue: 12 },
      {
        key: `button.${variant}.text`,
        label: 'Text colour',
        description: `The ${variant} button’s label ink, in whichever theme is showing.`,
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => {
          const palette = themePalette(ctx);
          if (variant === 'destructive') return palette.danger ?? '';
          if (variant === 'ghost') return (ctx.isDark ? palette.gold : palette.primary) ?? '';
          if (variant === 'secondary') return (ctx.isDark ? palette.ink : palette.primary) ?? '';
          return palette.onPrimary ?? '';
        },
        contrastGround: groundOf,
      },
    ];
    if (variant !== 'ghost') {
      rows.push(
        {
          key: `button.${variant}.fill`,
          label: 'Fill',
          description: `The ${variant} button’s fill, in whichever theme is showing.`,
          tier,
          scope: 'local',
          kind: 'color',
          defaultValue: (ctx) => {
            const palette = themePalette(ctx);
            if (variant === 'destructive') return palette.dangerBg ?? '';
            if (variant === 'secondary') return palette.surface ?? '';
            return palette.primary ?? '';
          },
          contrastGround: groundOf,
        },
        { key: `button.${variant}.fillAlpha`, label: 'Fill opacity', description: `How solid the ${variant} button’s fill paints.`, tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
      );
    }
    if (variant === 'secondary' || variant === 'destructive') {
      rows.push(
        {
          key: `button.${variant}.border`,
          label: 'Border colour',
          description: `The ${variant} button’s hairline.`,
          tier: 'advanced',
          scope: 'local',
          kind: 'color',
          defaultValue: (ctx) => {
            const palette = themePalette(ctx);
            if (variant === 'destructive') return palette.danger ?? '';
            return (ctx.isDark ? palette.gold : palette.border) ?? '';
          },
        },
        { key: `button.${variant}.borderAlpha`, label: 'Border opacity', description: `The ${variant} button’s hairline opacity.`, tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: (ctx) => (variant === 'secondary' && ctx.isDark ? 0.55 : 1) },
      );
    }
    entries.push(...dialEntries('buttons', subcategory, rows));
  }
  entries.push(
    ...dialEntries('buttons', 'All buttons', [
      { key: 'button.iconGap', label: 'Icon-text gap', description: 'Between a button’s glyph and its label.', tier: 'advanced', scope: 'token', min: 0, max: 20, step: 1, inheritsFrom: 'theme.spacing.sm', defaultValue: spacing.sm },
      { key: 'button.pressedOpacity', label: 'Pressed opacity', description: 'How a held button dims.', tier: 'advanced', scope: 'token', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 0.85 },
      { key: 'button.pressedScale', label: 'Pressed scale', description: 'How a held button shrinks — 1 is no scale.', tier: 'advanced', scope: 'token', kind: 'decimal', min: 0.8, max: 1.2, step: 0.02, defaultValue: 1 },
      { key: 'button.disabledOpacity', label: 'Disabled opacity', description: 'Dims the flat disabled fill — 1 keeps decision 3’s flat treatment.', tier: 'advanced', scope: 'token', kind: 'decimal', min: 0.2, max: 1, step: 0.02, defaultValue: 1 },
    ]),
    ...dialEntries('buttons', 'Chip', [
      { key: 'chip.paddingX', label: 'Side padding', description: 'Inside every chip, left and right.', tier: 'basic', scope: 'token', min: 0, max: 28, step: 1, defaultValue: 14 },
      { key: 'chip.paddingY', label: 'Top/bottom padding', description: 'Inside every chip, above and below.', tier: 'basic', scope: 'token', min: 0, max: 20, step: 1, defaultValue: 10 },
      { key: 'chip.radius', label: 'Corner roundness', description: 'Every chip’s corners — 999 is the full pill.', tier: 'advanced', scope: 'token', min: 0, max: 999, step: 2, defaultValue: tokenRadius.pill },
      { key: 'chip.gap', label: 'Icon-text gap', description: 'Between a chip’s glyph and its label.', tier: 'advanced', scope: 'local', min: 0, max: 16, step: 1, defaultValue: 6 },
      { key: 'chip.borderWidth', label: 'Border width', description: 'Every chip’s hairline weight.', tier: 'advanced', scope: 'token', min: 0, max: 3, step: 1, defaultValue: 1 },
      { key: 'chip.minHeight', label: 'Tappable height', description: 'Interactive chips’ minimum height — never below the 44pt touch floor.', tier: 'advanced', scope: 'local', min: 44, max: 64, step: 1, defaultValue: 44 },
    ]),
    ...dialEntries('buttons', 'Status pill', [
      { key: 'pill.paddingX', label: 'Side padding', description: 'Inside the status pill, left and right.', tier: 'advanced', scope: 'local', min: 0, max: 24, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'pill.paddingY', label: 'Top/bottom padding', description: 'Inside the status pill, above and below.', tier: 'advanced', scope: 'local', min: 0, max: 16, step: 1, defaultValue: spacing.xs + 2 },
      { key: 'pill.radius', label: 'Corner roundness', description: 'The status pill’s corners — 999 is the full pill.', tier: 'advanced', scope: 'local', min: 0, max: 999, step: 2, defaultValue: tokenRadius.pill },
      { key: 'pill.borderWidth', label: 'Border width', description: 'The status pill’s hairline weight.', tier: 'advanced', scope: 'local', min: 0, max: 3, step: 1, defaultValue: 1 },
    ]),
  );
  return entries;
}

function inputDialEntries(): StudioEntry[] {
  return [
    ...dialEntries('inputs', 'Search field', [
      { key: 'search.height', label: 'Height', description: 'The search pill’s minimum height — never below the 44pt touch floor.', tier: 'basic', scope: 'token', min: 44, max: 64, step: 1, inheritsFrom: 'controls.fieldHeight', defaultValue: controls.fieldHeight },
      { key: 'search.radius', label: 'Corner roundness', description: 'The search pill’s corners — 999 is the full pill.', tier: 'basic', scope: 'token', min: 0, max: 999, step: 2, defaultValue: tokenRadius.pill },
      { key: 'search.paddingX', label: 'Side padding', description: 'Inside the search pill, left and right.', tier: 'advanced', scope: 'local', min: 0, max: 32, step: 1, inheritsFrom: 'theme.spacing.lg', defaultValue: spacing.lg },
      { key: 'search.gap', label: 'Icon-text gap', description: 'Between the glyph, the text and the trailing controls.', tier: 'advanced', scope: 'local', min: 0, max: 20, step: 1, inheritsFrom: 'theme.spacing.sm', defaultValue: spacing.sm },
      {
        key: 'search.fill',
        label: 'Fill',
        description: 'The search pill’s surface, in whichever theme is showing.',
        tier: 'basic',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).surface ?? '',
      },
      {
        key: 'search.border',
        label: 'Border colour',
        description: 'The search pill’s resting hairline.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).line ?? '',
      },
      { key: 'search.borderAlpha', label: 'Border opacity', description: 'The resting hairline’s opacity.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
      {
        key: 'search.focusBorder',
        label: 'Focus border colour',
        description: 'The hairline while the field is focused — unset keeps the resting one.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).line ?? '',
      },
      { key: 'search.focusGlow', label: 'Focus glow', description: 'An emerald halo while the field is focused — 0 is off, today’s state.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 0 },
      {
        key: 'search.placeholderColor',
        label: 'Placeholder colour',
        description: 'The empty field’s hint ink.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themeEmerald(ctx).muted ?? '',
      },
      { key: 'search.placeholderAlpha', label: 'Placeholder opacity', description: 'The hint ink’s opacity.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
      { key: 'search.iconSize', label: 'Icon size', description: 'The magnifier glyph.', tier: 'advanced', scope: 'local', min: 12, max: 28, step: 1, defaultValue: 18 },
      { key: 'search.iconOffsetX', label: 'Icon X offset', description: 'Nudges the magnifier sideways.', tier: 'advanced', scope: 'local', min: -12, max: 12, step: 1, defaultValue: 0 },
      { key: 'search.iconOffsetY', label: 'Icon Y offset', description: 'Nudges the magnifier up or down.', tier: 'advanced', scope: 'local', min: -12, max: 12, step: 1, defaultValue: 0 },
    ]),
    ...dialEntries('inputs', 'Toggle', [
      { key: 'toggle.trackWidth', label: 'Track width', description: 'The drawn toggle’s track.', tier: 'advanced', scope: 'local', min: 40, max: 80, step: 1, defaultValue: 52 },
      { key: 'toggle.trackHeight', label: 'Track height', description: 'The drawn toggle’s track.', tier: 'advanced', scope: 'local', min: 24, max: 44, step: 1, defaultValue: 32 },
      { key: 'toggle.knobSize', label: 'Knob size', description: 'The disc that carries the state.', tier: 'advanced', scope: 'local', min: 18, max: 36, step: 1, defaultValue: 26 },
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Chrome/Header and Layout (C9). SPACING's scale multipliers and per-step
// token dials are deliberately ABSENT: the spacing tokens are consumed at
// stylesheet build time (themedStyles caches keyed on the palette object),
// so no live read point exists — overriding them means rebuilding the
// theming layer, which is the sweep's work, and a dial that silently did
// nothing would be worse than none. DIVIDERS likewise have no shared
// primitive — each surface draws its own hairline — so their shared dials
// wait for the sweep too; the menu separators and every material hairline
// are already dialled. Both omissions are on the run report.
// ---------------------------------------------------------------------------

function chromeDialEntries(): StudioEntry[] {
  const header = (row: DialRow[]) => dialEntries('chrome', 'Screen header', row);
  const step = (row: DialRow[]) => dialEntries('chrome', 'Wizard header', row);
  return [
    ...header([
      { key: 'header.padX', label: 'Side padding', description: 'Inside the screen header, left and right.', tier: 'basic', scope: 'token', min: 0, max: 32, step: 1, inheritsFrom: 'theme.spacing.lg', defaultValue: spacing.lg },
      { key: 'header.padY', label: 'Top/bottom padding', description: 'Inside the screen header, above and below.', tier: 'basic', scope: 'token', min: 0, max: 24, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'header.minHeight', label: 'Height', description: 'A minimum header height — 0 keeps today’s content-driven height.', tier: 'advanced', scope: 'local', min: 0, max: 96, step: 2, defaultValue: 0 },
      { key: 'header.titleAlign', label: 'Title position', description: 'Auto follows each screen’s own choice; left and centre force it.', tier: 'basic', scope: 'token', kind: 'enum', options: ['auto', 'left', 'center'], defaultValue: 'auto' },
      { key: 'header.backSize', label: 'Back chevron size', description: 'The bare back chevron (labelled links keep their 20pt glyph).', tier: 'advanced', scope: 'local', min: 16, max: 36, step: 1, defaultValue: 26 },
      { key: 'header.backOffsetX', label: 'Back position', description: 'Nudges the back control sideways.', tier: 'advanced', scope: 'local', min: -16, max: 16, step: 1, defaultValue: -spacing.xs },
      { key: 'header.borderBottomWidth', label: 'Bottom hairline', description: 'A hairline under the header the app does not draw today — 0 keeps it off.', tier: 'advanced', scope: 'local', min: 0, max: 3, step: 1, defaultValue: 0 },
      {
        key: 'header.borderColor',
        label: 'Hairline colour',
        description: 'The added hairline’s ink, where a width is set.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themePalette(ctx).border ?? '',
      },
      { key: 'header.borderAlpha', label: 'Hairline opacity', description: 'The added hairline’s opacity.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 1 },
    ]),
    ...step([
      { key: 'header.stepPadX', label: 'Side padding', description: 'Inside the wizard progress header.', tier: 'advanced', scope: 'local', min: 0, max: 32, step: 1, inheritsFrom: 'layout.screenGutter', defaultValue: layout.screenGutter },
      { key: 'header.stepPadY', label: 'Top/bottom padding', description: 'Inside the wizard progress header.', tier: 'advanced', scope: 'local', min: 0, max: 24, step: 1, inheritsFrom: 'theme.spacing.md', defaultValue: spacing.md },
      { key: 'header.stepBarHeight', label: 'Progress bar height', description: 'The segmented progress bar’s thickness.', tier: 'advanced', scope: 'local', min: 1, max: 10, step: 1, defaultValue: 4 },
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Spacing (T1, C5) — the category S2 declared and honestly left empty
// ---------------------------------------------------------------------------

/**
 * THE SCALE ITSELF — ONE since fix run D8 (2026-10-03).
 *
 * Until D8 lib/theme.ts and ui/tokens.ts exported two spacing scales with the
 * same names and different numbers (`xl` 24 against 20), so the studio carried
 * two sets of dials. They are one live group now, `theme.spacing.*`, and every
 * file that imports `spacing` from either surface reads it.
 *
 * S2 left this category empty and said why: a spacing dial "would silently do
 * nothing" while every token was consumed at stylesheet-build time. C2 fixed
 * that — the tokens resolve at read time and the style caches key on the
 * metric generation — so these dials reach every consumer of the token, and
 * the fence that held the category empty now requires them.
 */
function spacingDialEntries(): StudioEntry[] {
  return [
    ...metricDials('spacing', 'App scale (most screens)', [
      { key: 'theme.spacing.xs', label: 'Extra small gap', description: 'The tightest rhythm in the app — between a glyph and the text beside it.', tier: 'advanced', scope: 'token', min: 0, max: 16, step: 1, defaultValue: THEME_SPACING_DEFAULTS.xs },
      { key: 'theme.spacing.sm', label: 'Small gap', description: 'Between the lines of a stacked label, and inside small pills.', tier: 'advanced', scope: 'token', min: 0, max: 24, step: 1, defaultValue: THEME_SPACING_DEFAULTS.sm },
      { key: 'theme.spacing.md', label: 'Medium gap', description: 'The standard gap between the rows of a card or a list.', tier: 'basic', scope: 'token', min: 0, max: 32, step: 1, defaultValue: THEME_SPACING_DEFAULTS.md },
      { key: 'theme.spacing.lg', label: 'Large gap', description: 'The most common spacing in the tree — card padding, section gaps, screen gutters.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: THEME_SPACING_DEFAULTS.lg },
      { key: 'theme.spacing.xl', label: 'Extra large gap', description: 'Between the major blocks of a screen.', tier: 'advanced', scope: 'token', min: 0, max: 48, step: 1, defaultValue: THEME_SPACING_DEFAULTS.xl },
      { key: 'theme.spacing.xxl', label: 'Section gap', description: 'The widest standing gap — above a screen’s first block and below its last.', tier: 'advanced', scope: 'token', min: 0, max: 64, step: 1, defaultValue: THEME_SPACING_DEFAULTS.xxl },
    ]),
    // Fix run D8: the §I 'Emerald scale' group is gone — it is the same live group as the app scale above.
    ...metricDials('layout', 'Screen and card metrics', [
      { key: 'layout.screenGutter', label: 'Screen gutter', description: 'The horizontal margin every template screen keeps from the edges.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: LAYOUT_METRIC_DEFAULTS.screenGutter },
      { key: 'layout.cardPadding', label: 'Card padding', description: 'The breathing room inside every card.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: LAYOUT_METRIC_DEFAULTS.cardPadding },
      { key: 'layout.cardGap', label: 'Card gap', description: 'The space between one card and the next in a list.', tier: 'basic', scope: 'token', min: 0, max: 32, step: 1, defaultValue: LAYOUT_METRIC_DEFAULTS.cardGap },
    ]),
    ...metricDials('buttons', 'Control heights', [
      { key: 'controls.buttonHeight', label: 'Button height', description: 'The standard button and its 44pt touch floor — never lower.', tier: 'basic', scope: 'token', min: 44, max: 72, step: 1, defaultValue: CONTROL_DEFAULTS.buttonHeight },
      { key: 'controls.buttonHeightSmall', label: 'Small button height', description: 'The compact button, already sitting exactly on the touch floor.', tier: 'advanced', scope: 'token', min: 44, max: 64, step: 1, defaultValue: CONTROL_DEFAULTS.buttonHeightSmall },
      { key: 'controls.iconButton', label: 'Icon button size', description: 'Square glyph-only controls, width and height together.', tier: 'advanced', scope: 'token', min: 44, max: 64, step: 1, defaultValue: CONTROL_DEFAULTS.iconButton },
    ]),
    ...metricDials('inputs', 'Control heights', [
      { key: 'controls.fieldHeight', label: 'Field height', description: 'Text inputs — matched to the button height so a form reads as one rhythm.', tier: 'basic', scope: 'token', min: 44, max: 72, step: 1, defaultValue: CONTROL_DEFAULTS.fieldHeight },
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Borders & Dividers (T1, C4/C5) — the category S2 declared and left empty
// ---------------------------------------------------------------------------

/**
 * The two radius scales, alongside the Divider's dials below. `pill` is
 * absent from both on purpose: 999 is how a CAPSULE is spelled in React
 * Native, so turning it down would not make a smaller pill, it would make a
 * rounded rectangle. It is a shape, not a size.
 */
function radiusDialEntries(): StudioEntry[] {
  return [
    ...metricDials('borders', 'App corner scale (most screens)', [
      { key: 'theme.radius.sm', label: 'Small roundness', description: 'The tightest corner in the app — small chips and inline tags.', tier: 'advanced', scope: 'token', min: 0, max: 40, step: 1, defaultValue: THEME_RADIUS_DEFAULTS.sm },
      { key: 'theme.radius.md', label: 'Medium roundness', description: 'The standard corner — most controls and inner blocks.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: THEME_RADIUS_DEFAULTS.md },
      { key: 'theme.radius.lg', label: 'Large roundness', description: 'The card corner most of the app draws.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: THEME_RADIUS_DEFAULTS.lg },
      { key: 'theme.radius.xl', label: 'Extra large roundness', description: 'The softest corner — sheets and hero surfaces.', tier: 'advanced', scope: 'token', min: 0, max: 48, step: 1, defaultValue: THEME_RADIUS_DEFAULTS.xl },
    ]),
    ...metricDials('borders', 'Emerald corner scale (§I tokens)', [
      { key: 'radius.xs', label: 'Extra small roundness', description: 'The Emerald scale’s tightest corner.', tier: 'advanced', scope: 'token', min: 0, max: 40, step: 1, defaultValue: RADIUS_DEFAULTS.xs },
      { key: 'radius.sm', label: 'Small roundness', description: 'Small Emerald surfaces — tags and inline blocks.', tier: 'advanced', scope: 'token', min: 0, max: 40, step: 1, defaultValue: RADIUS_DEFAULTS.sm },
      { key: 'radius.md', label: 'Medium roundness', description: 'The Emerald standard corner; the menu panel and glyph tiles read it.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: RADIUS_DEFAULTS.md },
      { key: 'radius.lg', label: 'Large roundness', description: 'The Emerald card corner — job cards, the prompt dialog, the centre [+].', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, defaultValue: RADIUS_DEFAULTS.lg },
      { key: 'radius.xl', label: 'Extra large roundness', description: 'The floating dialog’s corner.', tier: 'advanced', scope: 'token', min: 0, max: 48, step: 1, defaultValue: RADIUS_DEFAULTS.xl },
      { key: 'radius.xxl', label: 'Sheet roundness', description: 'The softest Emerald corner — the docked sheet’s top edge.', tier: 'advanced', scope: 'token', min: 0, max: 48, step: 1, defaultValue: RADIUS_DEFAULTS.xxl },
    ]),
  ];
}

/**
 * ui/primitives/Divider.tsx's three dials. Nothing renders the Divider yet —
 * repointing the four hand-drawn hairlines at it is a screen change — so
 * these move the primitive and, from the run that converts them, every rule
 * in the app at once.
 */
function dividerDialEntries(): StudioEntry[] {
  return dialEntries('borders', 'Divider', [
    {
      key: 'divider.thickness',
      label: 'Line thickness',
      description:
        'How heavy every hairline rule is. 0 is the platform hairline — the thinnest line the screen can draw, which is what the app draws today.',
      tier: 'basic',
      scope: 'token',
      min: 0,
      max: 4,
      step: 0.5,
      defaultValue: DIVIDER_DEFAULTS.thickness,
    },
    {
      key: 'divider.color',
      label: 'Line colour',
      description: 'The rule’s ink — the palette’s border hue in each theme.',
      tier: 'basic',
      scope: 'token',
      kind: 'color',
      defaultValue: (ctx) => themePalette(ctx).border ?? '',
      contrastGround: groundOf,
    },
    {
      key: 'divider.inset',
      label: 'Line indent',
      description: 'How far every rule stops short of both ends. 0 is the full-bleed rule.',
      tier: 'advanced',
      scope: 'token',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: DIVIDER_DEFAULTS.inset,
    },
  ]);
}

function layoutDialEntries(): StudioEntry[] {
  return dialEntries('layout', 'Template screens', [
    { key: 'layout.pagePadding', label: 'Page side padding', description: 'The horizontal gutter on every template screen (17 screens read it live).', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'layout.screenGutter', defaultValue: layout.screenGutter },
    { key: 'layout.contentTopPad', label: 'Content top spacing', description: 'Between the header and the first content block on template screens.', tier: 'basic', scope: 'token', min: 0, max: 48, step: 1, inheritsFrom: 'layout.screenGutter', defaultValue: layout.screenGutter },
    { key: 'layout.formSectionGap', label: 'Form section gap', description: 'Between the sections of every form template screen.', tier: 'basic', scope: 'token', min: 0, max: 40, step: 1, inheritsFrom: 'theme.spacing.lg', defaultValue: spacing.lg },
    // Fix run D8: the detail gap is 20, which is lg + xs on the one scale — no single step is 20, so it has no parent.
    { key: 'layout.detailSectionGap', label: 'Detail section gap', description: 'Between the sections of every detail template screen.', tier: 'basic', scope: 'token', min: 0, max: 48, step: 1, defaultValue: spacing.lg + spacing.xs },
  ]);
}

// ---------------------------------------------------------------------------
// Shadows & Glows (C10). The Blur & Material category is already complete
// (intensity, tint/scrim colour, scrim alpha, hairline colour+alpha and the
// no-blur fallback per material — C1 and C7); what lands here is the
// per-surface depth set and glow-on-selection. No `spread` dial anywhere —
// React Native does not render shadow spread.
// ---------------------------------------------------------------------------

function shadowDialEntries(): StudioEntry[] {
  return [
    ...dialEntries('shadows', 'Cards', [
      {
        key: 'card.shadowColor',
        label: 'Shadow colour',
        description: 'The card shadow’s ink — §I’s deep green in light, GROUND1’s black in dark.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => {
          const spec = ctx.isDark ? tokenShadows.cardDark : tokenShadows.card;
          return typeof spec.shadowColor === 'string' ? spec.shadowColor : '';
        },
      },
      { key: 'card.elevation', label: 'Elevation', description: 'The card’s Android elevation (inert on iOS and web).', tier: 'advanced', scope: 'local', min: 0, max: 16, step: 1, defaultValue: (ctx) => (ctx.isDark ? 6 : 3) },
    ]),
    ...dialEntries('shadows', 'Primary CTA', [
      { key: 'button.primary.shadowOpacity', label: 'Shadow opacity', description: 'A drop shadow the hero button does not carry today — 0 keeps it off.', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 0 },
      { key: 'button.primary.shadowRadius', label: 'Shadow blur', description: 'How soft the hero shadow spreads, when its opacity is on.', tier: 'advanced', scope: 'local', min: 0, max: 40, step: 1, defaultValue: 12 },
      { key: 'button.primary.shadowOffsetY', label: 'Shadow Y offset', description: 'Moves the hero shadow down, when its opacity is on.', tier: 'advanced', scope: 'local', min: -20, max: 20, step: 1, defaultValue: 4 },
      {
        key: 'button.primary.shadowColor',
        label: 'Shadow colour',
        description: 'The hero shadow’s ink, when its opacity is on.',
        tier: 'advanced',
        scope: 'local',
        kind: 'color',
        defaultValue: (ctx) => themePalette(ctx).black ?? '',
      },
    ]),
    ...dialEntries('shadows', 'Sheets', [
      { key: 'sheet.shadowOpacity', label: 'Dialog shadow opacity', description: 'The floating dialog cards’ lift (the raised shadow ships at 0.14).', tier: 'advanced', scope: 'local', kind: 'decimal', min: 0, max: 1, step: 0.02, defaultValue: 0.14 },
    ]),
    ...dialEntries('shadows', 'Selection', [
      {
        key: 'glow.chipSelection',
        label: 'Selected chips glow',
        description:
          'Glow follows selection: the chosen chip lights (dark theme), the rest stay dark; the global glow strength sets the intensity. Off today.',
        tier: 'basic',
        scope: 'token',
        kind: 'boolean',
        defaultValue: false,
      },
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Screens (RUN T2) — THE VALUES THAT LIVE IN ONE SCREEN'S OWN STYLESHEET.
//
// Every dial above this line moves a TOKEN or a shared primitive: turning it
// moves every surface that reads it, which is exactly right for "the app's
// card corner" and exactly wrong for "this screen's promo card". Twelve
// screens carry furniture no shared dial can reach, because the number is
// spelled in that screen's own `StyleSheet.create` and nowhere else. These
// entries give the operator that reach, one screen at a time.
//
// FOUR RULES HOLD THE CATEGORY TOGETHER.
//
//  1. `scope: 'local'` — always. A screen dial is one surface's own value by
//     definition; nothing else reads it.
//  2. It INHERITS from the scale ITS OWN FILE imports, and the two scales are
//     deliberately not aliased. A screen importing `spacing`/`radius` from
//     lib/theme takes `theme.spacing.*` / `theme.radius.*` as its parent; a
//     screen importing them from ui/tokens takes `spacing.*` / `radius.*`.
//     `theme.spacing.xl` is 24 and `spacing.xl` is 20; `theme.radius.sm` is 8
//     and `radius.sm` is 13. Pointing a child at the wrong one moves it the
//     moment the operator turns the parent, and moves it by the difference.
//     A value that matches no token in its file's scale is a plain dial with
//     the literal as its default and no parent at all.
//  3. The DEFAULT is the value the screen drew before the dial existed — so
//     the studio launches every one of these at today's pixel and "reset"
//     lands back on it. tests/screenDials.test.mjs quotes each of those
//     values and re-reads the screen to prove nothing moved.
//  4. TYPOGRAPHY IS NOT HERE. No size, weight, leading, tracking or family:
//     the type is the operator's own and no dial in this category may reach
//     it. The fence enumerates the forbidden property words and fails on any
//     key carrying one.
//
// The ceiling is TWELVE per screen, and it is a ceiling rather than a target:
// the panel is browsed by a human on a phone, and a screen with four values
// worth tuning gets four.
// ---------------------------------------------------------------------------

function screenDialEntries(): StudioEntry[] {
  return [
    // C1 — screens/HomeScreen.tsx. Imports `spacing`/`radius` from lib/theme,
    // so its parents are the `theme.*` scale. Left undialled on purpose: the
    // search pill, the CTA's height and roundness, the screen padding, the
    // section gap and the job card's corner (lib/homeDesignStudio.tsx already
    // dials every one of those, and a second dial for the same pixel is worse
    // than none); the service tile row (components/ServiceTileRow.tsx, ONE
    // component both Homes render — tests/workerHome.test.mjs holds it shared,
    // so a per-screen dial would break the invariant it exists to protect, and
    // 2026-09-17 ruled no dials for the tiles at all).
    ...dialEntries('screens', 'Customer Home', [
      // 2026-09-18: the promo card became the TASK CARD — the title, the
      // search field and the Post-a-job pill in one card under the hero — and
      // this dial is its corner now. The KEY keeps its name on purpose: a
      // stored override is keyed on it, and the screen's read
      // (`useDialNumber('home.promoCard.radius') ?? 22`) is what
      // tests/screenDials.test.mjs pins. Only the label and description moved.
      {
        key: 'home.promoCard.radius',
        label: 'Task card — corner roundness',
        description: 'The “What do you need done?” card’s corners — the search field and the Post-a-job pill sit inside it. Home’s alone — the job cards below it keep their own.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 22,
      },
      // 2026-09-18: the `home.modeSwitch.paddingX` row is GONE with the
      // customer Home's "Switch to Worker" pill — the switch lives in the
      // [+] create sheet now (components/CreateSheet.tsx), which draws no
      // pill and reads no dial. Same rule as the jobCard rows below: a dial
      // its wearer no longer reads is a control that lies. Worker Home's own
      // pill and its `workerHome.modeSwitch.paddingX` row were untouched —
      // until 2026-09-28 (LUX-LIST-64 #61), when that pill left too.
      // 2026-09-17: the four `home.jobCard.*` rows are GONE — inner padding,
      // photo-to-text gap, photo size and the demand strip's height. Every one
      // of them dialled `OpenJobCard`, the card the Nearby list drew, and
      // Nearby left the customer Home; the card went with it. A registry row
      // whose wearer no longer reads it is a dead control — it renders in the
      // panel, moves nothing, and is worse than an absent dial because it
      // lies — so they are deleted rather than left pointing at nothing. The
      // customer's own postings draw components/HubCard.tsx, which My Jobs
      // already draws them with and which carries no screen dial of Home's.
      // (Notes sit OUTSIDE a row: the rows in this function are parsed as
      // TEXT, in a fixed field order, by tests/screenDials.test.mjs, and a
      // comment between fields breaks the parser.)
    ]),
    // C2 — screens/WorkerHomeScreen.tsx. Also on the `theme.*` scale. Left
    // undialled on purpose: the search field (its shape, height and roundness
    // are the operator's standing rejection), the hero crop (same), the count
    // pills and the summary divider (tests/workerHome.test.mjs prices the
    // 4D-6 card term by term, and lifting those would cost the fence its
    // arithmetic rather than one regex), and the service tile row (the same
    // shared component Customer Home renders, held so by the same file).
    ...dialEntries('screens', 'Worker Home', [
      {
        key: 'workerHome.summaryCard.radius',
        label: 'Availability card — corner roundness',
        description: 'The gold-ringed card holding the Online toggle and the potential earnings.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.radius.lg',
        defaultValue: THEME_RADIUS_DEFAULTS.lg,
      },
      {
        key: 'workerHome.summaryCard.gap',
        label: 'Availability card — row gap',
        description: 'Between the card’s two halves and the count pills below them.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 32,
        step: 1,
        defaultValue: 14,
      },
      {
        key: 'workerHome.content.paddingX',
        label: 'Screen gutter',
        description: 'How far Worker Home’s whole column keeps from the left and right edges.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'workerHome.content.gap',
        label: 'Section gap',
        description: 'Between every block down the screen — hero, search, service tiles, card, feed.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      // 2026-09-28 (LUX-LIST-64 #61): the `workerHome.modeSwitch.paddingX` row
      // is GONE with Worker Home's "Switch to Customer" pill — switching lives
      // in Profile now. A dial its wearer no longer reads is a control that lies.
    ]),
    // C3 — screens/PostJobScreen.tsx. `theme.*` scale. Left undialled: the
    // step header, the fields and the footer buttons (ScreenHeader, Input and
    // Button already dial every one of those, and this screen only configures
    // them); the pinned footer's bottom padding, which is derived from the nav
    // geometry and follows its own dial; and the success overlay, which a
    // customer sees for two seconds after publishing and no one would tune.
    ...dialEntries('screens', 'Post a Job', [
      {
        key: 'postJob.progress.height',
        label: 'Step bar — thickness',
        description: 'How heavy the four progress segments across the top of the wizard are.',
        tier: 'basic',
        scope: 'local',
        min: 1,
        max: 16,
        step: 1,
        defaultValue: 6,
      },
      // N3: 20, dialled — and the theme.spacing.xl chain GOES, because an
      // inheriting dial has to ship at its parent's value and that step is 24.
      // NOT re-pointed at ui/tokens' spacing.xl, which happens to be 20:
      // PostJobScreen imports the theme scale, so a parent off the Emerald one
      // would sit right until the operator turned it and then jump by four.
      {
        key: 'postJob.content.paddingX',
        label: 'Screen gutter',
        description: 'How far the whole wizard column keeps from the left and right edges.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 20,
      },
      // N3: 21, dialled — off every scale, and no longer theme.spacing.xl's
      // child. The gutter above left the same parent for 20, which is the
      // point: the two were one number and are now two.
      {
        key: 'postJob.content.gap',
        label: 'Section gap',
        description: 'Between the wizard’s blocks — the intro, the step bar and the fields.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        defaultValue: 21,
      },
      // N3: 20, dialled; theme.spacing.lg ships at 16, so the chain goes.
      {
        key: 'postJob.stepFields.gap',
        label: 'Field gap',
        description: 'Between one question and the next inside a step.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 20,
      },
      {
        key: 'postJob.description.height',
        label: 'Description box — height',
        description: 'How tall the “Describe what you need done” box stands before it scrolls.',
        tier: 'advanced',
        scope: 'local',
        min: 60,
        max: 260,
        step: 2,
        defaultValue: 120,
      },
      {
        key: 'postJob.reviewCard.radius',
        label: 'Review card — corner roundness',
        description: 'The last step’s summary card, where the job is read back before it is posted.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.radius.xl',
        defaultValue: THEME_RADIUS_DEFAULTS.xl,
      },
    ]),
    // C4 — screens/MyJobsHubScreen.tsx. `theme.*` scale. Left undialled: the
    // job cards themselves (JobCard's own dials reach every one of them), the
    // status pills (StatusPill's), and the selected tab's 44pt minimum, which
    // is CLAUDE.md's touch floor rather than a styling choice.
    // 2026-09-27 (the operator's review): the bar is the shared Lux segment —
    // 52 tall, and the pill corner is 26, half of it.
    ...dialEntries('screens', 'My Jobs', [
      {
        key: 'myJobs.tabs.height',
        label: 'Active/Review/Closed bar — height',
        description: 'How tall the segmented filter bar stands under the header.',
        tier: 'basic',
        scope: 'local',
        min: 44,
        max: 72,
        step: 1,
        defaultValue: 52,
      },
      {
        key: 'myJobs.tabs.radius',
        label: 'Active/Review/Closed bar — corner roundness',
        description: 'The filter bar’s outer corners; the selected tab inside it keeps its own.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 26,
      },
      {
        key: 'myJobs.content.gap',
        label: 'Section gap',
        description: 'Between one titled group of jobs and the next.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.spacing.xl',
        defaultValue: THEME_SPACING_DEFAULTS.xl,
      },
      {
        key: 'myJobs.empty.paddingY',
        label: 'Empty state — height',
        description: 'Above and below the “nothing here yet” panel, which is what sets how tall it stands.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 64,
        step: 1,
        inheritsFrom: 'theme.spacing.xxl',
        defaultValue: THEME_SPACING_DEFAULTS.xxl,
      },
      // 2026-09-27 (the operator's review): the header mark is gone from
      // My jobs, and its dial with it.
    ]),
    // C5 — screens/ProfileScreen.tsx. `theme.*` scale: `radius`/`spacing` come
    // from lib/theme here, and `emeraldRadius` — the one name in this file that
    // reaches the other scale — dresses the account popover, which is not
    // dialled. Left undialled: the avatar and its camera badge (the badge's
    // corner is half its own size, so a size dial would need a derivation this
    // run does not make), every field and button (Input's and Button's dials
    // reach those), and the delete row's 44pt minimum, which is the touch floor.
    ...dialEntries('screens', 'Profile', [
      {
        key: 'profile.settingsRow.height',
        label: 'Settings row — height',
        description: 'How tall each row down the settings list stands — the whole list’s rhythm.',
        tier: 'basic',
        scope: 'local',
        min: 44,
        max: 96,
        step: 1,
        defaultValue: 64,
      },
      // 2026-09-29 (LUX-LIST-2 #7): your card rounds at 22 like every #6
      // card, which theme.radius.xl (24) is not — so the chain is dropped,
      // as RUN N3 did for the rows that stopped matching their parent.
      {
        key: 'profile.hubCard.radius',
        label: 'Hub card — corner roundness',
        description: 'Your own card at the top of Profile: photo, name, rating and Edit.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        defaultValue: 22,
      },
      {
        key: 'profile.hubCard.padding',
        label: 'Hub card — inner padding',
        description: 'The breathing room inside that card, on all four sides.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      // 2026-09-29 (LUX-LIST-2 #7): the tile is gone — each row leads with a
      // plain 22pt icon (#47's colours), and this dial sizes it.
      {
        key: 'profile.settingsGlyph.size',
        label: 'Settings row — icon size',
        description: 'The plain icon at the left of each row down Profile.',
        tier: 'advanced',
        scope: 'local',
        min: 16,
        max: 32,
        step: 1,
        defaultValue: 22,
      },
      {
        key: 'profile.content.gap',
        label: 'Section gap',
        description: 'Between the blocks down Profile: your card and mode, each section, Sign out.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
    ]),
    // C6 — screens/MessagesInboxScreen.tsx. `theme.*` scale. Left undialled:
    // the conversation rows themselves, which are a shared component with its
    // own dials; the sparse-list padding, which is a DIFFERENT set of numbers
    // deliberately chosen for a list of three or fewer and would need its own
    // four dials to be honest; and the empty-state medallion, whose corner is
    // half its own size.
    ...dialEntries('screens', 'Inbox', [
      // 2026-09-28 (LUX-LIST-64 #55): 34, the approved clean list's chip.
      {
        key: 'messages.filterPill.height',
        label: 'Filter pill — height',
        description: 'How tall the All/Unread/Requests pills above the list stand.',
        tier: 'basic',
        scope: 'local',
        min: 24,
        max: 56,
        step: 1,
        defaultValue: 34,
      },
      // 2026-09-28 (LUX-LIST-64 #54): the conversation-gap dial is gone — the
      // clean list's rows carry no gap; a hairline parts them.
      {
        key: 'messages.list.paddingX',
        label: 'List gutter',
        description: 'How far the conversation list keeps from the left and right edges.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      // N3: 10, dialled, off the chain. 2026-09-28 (LUX-LIST-64 #55): the
      // reference's 8 — theme.spacing.sm — so the chain comes back.
      {
        key: 'messages.filterRow.gap',
        label: 'Filter pill gap',
        description: 'Between one filter pill and the next along the row.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 24,
        step: 1,
        inheritsFrom: 'theme.spacing.sm',
        defaultValue: THEME_SPACING_DEFAULTS.sm,
      },
    ]),
    // C7 — screens/ClientJobDetailScreen.tsx. `theme.*` scale. Left undialled:
    // every card below the hero (scope, timing, media and bids all draw the
    // same radius.xl / mint2 box, so one dial each would be five dials saying
    // the same thing, and the hero is the one the eye lands on); the status
    // badge and the offer buttons, which are shared primitives with their own
    // dials; and the extra bottom clearance, which exists so Submit clears an
    // open keyboard rather than for looks.
    ...dialEntries('screens', 'Job & Bids', [
      {
        key: 'clientJobDetail.jobHero.radius',
        label: 'Job hero — corner roundness',
        description: 'The card at the top carrying the title, the budget and the bid count.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.radius.xl',
        defaultValue: THEME_RADIUS_DEFAULTS.xl,
      },
      {
        key: 'clientJobDetail.jobHero.padding',
        label: 'Job hero — inner padding',
        description: 'The breathing room inside that card, on all four sides.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.spacing.xl',
        defaultValue: THEME_SPACING_DEFAULTS.xl,
      },
      {
        key: 'clientJobDetail.content.paddingX',
        label: 'Screen gutter',
        description: 'How far the whole column keeps from the left and right edges.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'clientJobDetail.content.gap',
        label: 'Section gap',
        description: 'Between the hero and each card below it — scope, timing, media, bids.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'clientJobDetail.iconCircle.size',
        label: 'Category tile — size',
        description: 'The square glyph tile beside the job’s category line, width and height together.',
        tier: 'advanced',
        scope: 'local',
        min: 24,
        max: 64,
        step: 2,
        defaultValue: 36,
      },
    ]),
    // C8 — screens/JobDetailScreen.tsx. `theme.*` scale. Left undialled: the
    // hero photo, whose height is computed from the viewport at render rather
    // than declared; the back control and the photo counter over it, both held
    // at the 44pt touch floor or sized to their own glyph; and the bid
    // composer, which is a shared surface with its own dials. Four dials is
    // what this screen honestly has.
    ...dialEntries('screens', 'Job Details', [
      {
        key: 'jobDetail.detailSurface.paddingX',
        label: 'Detail gutter',
        description: 'How far the text under the photo keeps from the left and right edges.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.spacing.xl',
        defaultValue: THEME_SPACING_DEFAULTS.xl,
      },
      {
        key: 'jobDetail.detailContent.gap',
        label: 'Section gap',
        description: 'Between one block of job detail and the next down the page.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'jobDetail.detailSurface.paddingY',
        label: 'Detail top/bottom padding',
        description: 'Above and below the detail block, between it and the photo over it.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'jobDetail.iconCircle.size',
        label: 'Category tile — size',
        description: 'The square glyph tile beside the job’s category line, width and height together.',
        tier: 'advanced',
        scope: 'local',
        min: 32,
        max: 80,
        step: 2,
        defaultValue: 54,
      },
    ]),
    // C9 — screens/CompareBidsScreen.tsx. `theme.*` scale. Left undialled: the
    // header and "what this protects you from" cards, which draw the same
    // radius.xl / mint2 box as the bid row and would be the same lever named
    // twice; the "HIGHEST RATED" tag and the protected pill, both capsules
    // sized by their own label; and the worker avatars, which are a shared
    // component.
    ...dialEntries('screens', 'Compare Bids', [
      {
        key: 'compareBids.row.radius',
        label: 'Bid row — corner roundness',
        description: 'Each worker’s bid, as a card in the list you are choosing from.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        inheritsFrom: 'theme.radius.xl',
        defaultValue: THEME_RADIUS_DEFAULTS.xl,
      },
      {
        key: 'compareBids.rowHighest.borderWidth',
        label: 'Best-rated bid — ring weight',
        description: 'How heavily the highest-rated bid is ringed against the others. This is the whole comparison.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 6,
        step: 1,
        defaultValue: 2,
      },
      {
        key: 'compareBids.row.padding',
        label: 'Bid row — inner padding',
        description: 'The breathing room inside each bid card.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'compareBids.list.gap',
        label: 'Bid gap',
        description: 'Between one bid and the next down the list.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 32,
        step: 1,
        inheritsFrom: 'theme.spacing.md',
        defaultValue: THEME_SPACING_DEFAULTS.md,
      },
      {
        key: 'compareBids.protectsGlyph.size',
        label: 'Protection tile — size',
        description: 'The three round glyphs on the “what this protects you from” card.',
        tier: 'advanced',
        scope: 'local',
        min: 24,
        max: 64,
        step: 2,
        defaultValue: 34,
      },
    ]),
    // C10 — screens/WorkerSearchScreen.tsx. `theme.*` scale. Left undialled:
    // the search row and its round submit control — the search pill's shape,
    // height and roundness are the operator's standing rejection and no dial
    // in this run may offer to move them; the worker result cards, which are a
    // shared component; and the selected tile's two-point ring, which reads
    // against the one-point resting ring and is a state, not a size.
    ...dialEntries('screens', 'Discover', [
      {
        key: 'workerSearch.serviceTile.width',
        label: 'Category tile — width',
        description: 'How wide each tile in the scrolling row of services is, and so how many you see at once.',
        tier: 'basic',
        scope: 'local',
        min: 72,
        max: 200,
        step: 2,
        defaultValue: 108,
      },
      {
        key: 'workerSearch.serviceTile.height',
        label: 'Category tile — height',
        description: 'How tall those tiles stand before their label wraps them taller.',
        tier: 'basic',
        scope: 'local',
        min: 64,
        max: 180,
        step: 2,
        defaultValue: 96,
      },
      {
        key: 'workerSearch.serviceTile.radius',
        label: 'Category tile — corner roundness',
        description: 'The tiles’ corners.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.radius.lg',
        defaultValue: THEME_RADIUS_DEFAULTS.lg,
      },
      {
        key: 'workerSearch.chipRow.gap',
        label: 'Category tile gap',
        description: 'Between one tile and the next along the row.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 24,
        step: 1,
        inheritsFrom: 'theme.spacing.sm',
        defaultValue: THEME_SPACING_DEFAULTS.sm,
      },
    ]),
    // C11 — screens/MapScreen.tsx, redrawn 2026-09-19 to the approved Map
    // design: one glass search pill, one chip, and the floating jobs sheet
    // the thumb pulls up. `theme.*` scale. Left undialled: the search field
    // inside the pill (the standing rejection), the panes' translucency,
    // which is the `pane` material's own dials, the chip, whose size is the
    // design's, and the map itself, which draws no styled box at all.
    ...dialEntries('screens', 'Map', [
      {
        key: 'map.searchPill.radius',
        label: 'Search pill — corner roundness',
        description: 'The glass search pill over the map; 31 is the capsule the design draws at 62 tall.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        defaultValue: 31,
      },
      {
        key: 'map.sheet.radius',
        label: 'Jobs sheet — corner roundness',
        description: 'The floating jobs sheet at the bottom, peeking and pulled up alike.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 48,
        step: 1,
        defaultValue: 30,
      },
      {
        key: 'map.sheet.paddingX',
        label: 'Jobs sheet — side padding',
        description: 'Inside the jobs sheet, left and right of the count, the View link and the rows.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.xl',
        defaultValue: THEME_SPACING_DEFAULTS.xl,
      },
      {
        key: 'map.sheet.inset',
        label: 'Jobs sheet — inset',
        description: 'The gap between the jobs sheet and the screen sides, and above the nav bar.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 32,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
    ]),
    // C12 — screens/WorkerJobScreen.tsx. `theme.*` scale. Left undialled: the
    // stage cards and their buttons, which are shared surfaces with their own
    // dials; the dashed "add a photo" tile, which is sized by its own padding
    // and reads as a control rather than as furniture; and the photo REMOVE
    // badge, whose corner is half its own size. `workerJob.photo.height` is
    // read by both photo boxes — the one just picked and the ones already
    // sent — because they are the same proof at two moments and the stylesheet
    // already says they must match.
    ...dialEntries('screens', 'Active Job', [
      {
        key: 'workerJob.content.padding',
        label: 'Screen padding',
        description: 'How far the whole column keeps from every edge of the screen.',
        tier: 'basic',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'workerJob.photo.height',
        label: 'Completion photo — height',
        description: 'How tall the proof-of-work photos stand, both the one just picked and the ones already sent.',
        tier: 'basic',
        scope: 'local',
        min: 100,
        max: 320,
        step: 2,
        defaultValue: 180,
      },
      {
        key: 'workerJob.content.gap',
        label: 'Section gap',
        description: 'Between the job header, the payment card and each stage below them.',
        tier: 'advanced',
        scope: 'local',
        min: 0,
        max: 40,
        step: 1,
        inheritsFrom: 'theme.spacing.lg',
        defaultValue: THEME_SPACING_DEFAULTS.lg,
      },
      {
        key: 'workerJob.iconCircle.size',
        label: 'Category tile — size',
        description: 'The square glyph tile beside the job title, width and height together.',
        tier: 'advanced',
        scope: 'local',
        min: 28,
        max: 72,
        step: 2,
        defaultValue: 44,
      },
    ]),
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
  ...materialDials('clear'),
  ...materialDials('pane'),
  ...sheetDialEntries(),
  ...menuDialEntries(),
  ...cardDialEntries(),
  ...buttonDialEntries(),
  ...inputDialEntries(),
  ...chromeDialEntries(),
  ...spacingDialEntries(),
  ...radiusDialEntries(),
  ...dividerDialEntries(),
  ...layoutDialEntries(),
  ...shadowDialEntries(),
  ...screenDialEntries(),
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
    key: 'color.gold',
    plainLabel: 'Gold accent (both themes)',
    technicalKey: 'gold',
    description:
      'The metal line-work — eyebrows, hairlines, icons, rings — replaced in BOTH themes at once.',
    category: 'colors',
    subcategory: 'Accents',
    tier: 'basic',
    kind: 'color',
    scope: 'token',
    defaultValue: (ctx) => (ctx.isDark ? ctx.appDark.gold : ctx.appLight.gold),
    overrideValue: (ctx) => ctx.overrides.gold,
    write: (value) => patchDesignOverrides({ gold: value as string | undefined }),
    contrastGround: (ctx) => ({
      label: 'background',
      hex: ctx.isDark ? ctx.appDark.background : ctx.appLight.background,
    }),
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
    contrastGround: (ctx) => ({ label: 'text', hex: ctx.appDark.text }),
  },
];

// ---------------------------------------------------------------------------
// The Colors category (C5): the palette tokens, ENUMERATED AT RUNTIME from
// the palettes the panel passes in — a token added to either surface appears
// in the studio with no edit to any file. One entry per token per theme; the
// panel's Light/Dark toggle chooses which theme's set renders.
// ---------------------------------------------------------------------------

/** Roles that read as GROUNDS — their contrast partner is the ink. */
const GROUND_ROLES = new Set([
  'background',
  'surface',
  'homeBackground',
  'bg',
  'primarySoft',
  'goldSoft',
  'mint',
  'mint2',
  'successBg',
  'warningBg',
  'dangerBg',
  'infoBg',
  'neutralBg',
  'dangerSurface',
  'cardFill',
]);

/** Content-on-fill roles pair with their own fill, not the page ground. */
const ON_FILL_GROUND: Record<string, string> = {
  onPrimary: 'primary',
  onForest: 'forest',
};

/** The high-impact roles Simple mode shows; the rest are Advanced. */
const BASIC_COLOR_ROLES = new Set([
  'text',
  'textMuted',
  'background',
  'surface',
  'primary',
  'gold',
  'emerald',
  'forest',
  'danger',
  'border',
  'homeBackground',
  'bg',
  'ink',
  'muted',
  'line',
]);

function paletteBankOf(
  ctx: StudioContext,
  theme: PaletteThemeKey,
  namespace: PaletteNamespace,
): Record<string, string> {
  if (namespace === 'app') return theme === 'dark' ? ctx.appDark : ctx.appLight;
  return theme === 'dark' ? ctx.emeraldDark : ctx.emeraldLight;
}

/** A role's live value: the bank override when set, else the palette's own. */
function resolvedRole(
  ctx: StudioContext,
  theme: PaletteThemeKey,
  namespace: PaletteNamespace,
  role: string,
): string | undefined {
  return (
    ctx.overrides.palette?.[theme]?.[`${namespace}.${role}`] ??
    paletteBankOf(ctx, theme, namespace)[role]
  );
}

function groundRoleFor(namespace: PaletteNamespace, role: string): string {
  const onFill = ON_FILL_GROUND[role];
  if (onFill) return onFill;
  if (GROUND_ROLES.has(role)) return namespace === 'app' ? 'text' : 'ink';
  return namespace === 'app' ? 'background' : 'bg';
}

/** "textMuted" → "Text muted" — plain enough to read beside the category. */
function labelForRole(role: string): string {
  const spaced = role.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function colorTokenEntries(ctx: StudioContext, theme: PaletteThemeKey): StudioEntry[] {
  const entries: StudioEntry[] = [];
  const themeWord = theme === 'dark' ? 'dark' : 'light';
  const build = (
    namespace: PaletteNamespace,
    subcategory: string,
    surfaceName: string,
    roles: Record<string, string>,
  ) => {
    for (const role of Object.keys(roles)) {
      const bankKey = `${namespace}.${role}`;
      const key = `palette.${theme}.${bankKey}`;
      entries.push({
        key,
        plainLabel: labelForRole(role),
        technicalKey: key,
        description: `The ${themeWord} value of ${surfaceName}'s “${role}” — every surface reading that token repaints live.`,
        category: 'colors',
        subcategory,
        tier: BASIC_COLOR_ROLES.has(role) ? 'basic' : 'advanced',
        kind: 'color',
        scope: 'token',
        defaultValue: (c) => paletteBankOf(c, theme, namespace)[role] ?? '',
        overrideValue: (c) => c.overrides.palette?.[theme]?.[bankKey],
        write: (value) => setPaletteTokenOverride(theme, bankKey, value as string | undefined),
        contrastGround: (c) => {
          const ground = groundRoleFor(namespace, role);
          const hex = resolvedRole(c, theme, namespace, ground);
          return hex ? { label: ground, hex } : null;
        },
      });
    }
  };
  build('app', 'App palette', 'lib/theme', ctx.appLight);
  build('emerald', 'Emerald tokens', 'ui/tokens', ctx.emeraldLight);
  return entries;
}

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

// ---------------------------------------------------------------------------
// Inheritance (T1, C1 — `inheritsFrom` stops being a declaration and starts
// being a mechanism)
// ---------------------------------------------------------------------------

/**
 * The declared chains, handed to the store so the live read hooks
 * (`useDialNumber` / `useDialString`) can walk them without importing this
 * module — which imports THEM, so the other direction would be a cycle. This
 * module stays the one place inheritance is declared; lib/designOverrides.ts
 * is only where it is kept.
 */
export const DIAL_INHERITANCE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    STUDIO_REGISTRY.filter((entry) => entry.inheritsFrom).map((entry) => [
      entry.key,
      entry.inheritsFrom as string,
    ]),
  ),
);

setDialInheritance(DIAL_INHERITANCE);

/**
 * A key's EFFECTIVE value: its own override if set, else its parent's
 * effective value, else its own token default.
 *
 * Two guards, because a registry typo can make two different malformations:
 * a visited set catches an actual ring (a → b → a), and the depth cap catches
 * a chain that is merely absurd. Either way the walk stops and answers with
 * the starting entry's own default rather than throwing — a broken
 * declaration must degrade to "no inheritance", never to a blank panel.
 */
export function resolveDialValue(key: string, ctx: StudioContext): StudioValue | undefined {
  const start = REGISTRY_BY_KEY.get(key);
  if (!start) return undefined;
  const seen = new Set<string>();
  let current: StudioEntry | undefined = start;
  for (let depth = 0; current && depth < DIAL_INHERITANCE_DEPTH_CAP; depth += 1) {
    if (seen.has(current.key)) break;
    seen.add(current.key);
    const own = current.overrideValue(ctx);
    if (own !== undefined) return own;
    if (!current.inheritsFrom) return current.defaultValue(ctx);
    const parent: StudioEntry | undefined = REGISTRY_BY_KEY.get(current.inheritsFrom);
    if (!parent) return current.defaultValue(ctx);
    current = parent;
  }
  return start.defaultValue(ctx);
}

/**
 * The parent an entry is CURRENTLY taking its value from, or null. Null both
 * when the entry declares no parent and when it has its own override — an
 * entry that has been touched is no longer inheriting, which is exactly what
 * the panel's quiet "inherits …" line has to mean, and what its per-token
 * reset returns it to.
 */
export function inheritedFrom(entry: StudioEntry, ctx: StudioContext): StudioEntry | null {
  if (!entry.inheritsFrom) return null;
  if (entry.overrideValue(ctx) !== undefined) return null;
  return REGISTRY_BY_KEY.get(entry.inheritsFrom) ?? null;
}

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
