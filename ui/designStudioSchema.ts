import {
  STATIC_MATERIALS,
  getDesignOverrides,
  patchDesignOverrides,
  patchMaterialOverride,
  setOverrideValue,
  setPaletteTokenOverride,
  type DesignOverrides,
  type MaterialOverride,
  type PaletteNamespace,
  type PaletteThemeKey,
  type StudioValue,
} from '../lib/designOverrides';
import { layout, navBar, radius as tokenRadius, spacing, type MaterialName } from './tokens';

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
  /** For colour entries: the token's own ground, for the live contrast
   *  readout (warns below 4.5:1, never blocks). */
  contrastGround?: (ctx: StudioContext) => { label: string; hex: string } | null;
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
// The Navigation category (C6). The bar-container dials are read by the
// screenOptions factory (the trees subscribe through the fingerprint hook);
// the item and centre-button dials are read live inside the components. The
// bar stays SLOT-BASED FLEX: no per-item X offsets and no per-pair gaps —
// spread and centre clearance reproduce that geometry responsively.
// ---------------------------------------------------------------------------

/** The live bar content height — the dial, or the token. */
function liveNavBarHeight(ctx: StudioContext): number {
  const dial = ctx.overrides.values?.['nav.barHeight'];
  return typeof dial === 'number' ? dial : layout.floatingNavHeight;
}

/** The live centre-button size — its dial, or its share of the live bar. */
function liveCreateSize(ctx: StudioContext): number {
  const dial = ctx.overrides.values?.['create.size'];
  return typeof dial === 'number' ? dial : Math.round(liveNavBarHeight(ctx) * navBar.createSizeRatio);
}

function navigationDialEntries(): StudioEntry[] {
  const bar = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'navigation', subcategory: 'Bar container' });
  const item = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'navigation', subcategory: 'Tab items' });
  const create = (row: Omit<StudioEntry, 'overrideValue' | 'write' | 'category' | 'subcategory'>) =>
    bagEntry({ ...row, category: 'navigation', subcategory: 'Centre [+]' });
  return [
    bar({
      key: 'nav.barHeight',
      plainLabel: 'Bar height',
      technicalKey: 'nav.barHeight',
      description:
        "The bar's content height — every screen's bottom clearance follows it live.",
      tier: 'basic',
      kind: 'number',
      scope: 'token',
      unit: 'pt',
      min: 56,
      max: 140,
      step: 2,
      defaultValue: () => layout.floatingNavHeight,
    }),
    bar({
      key: 'nav.padTop',
      plainLabel: 'Padding above the icons',
      technicalKey: 'nav.padTop',
      description: "Space between the bar's top hairline and the icon row.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 20,
      step: 1,
      defaultValue: () => 0,
    }),
    bar({
      key: 'nav.padLeft',
      plainLabel: 'Left padding',
      technicalKey: 'nav.padLeft',
      description: "Space inside the bar's left edge, before the first slot.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => 0,
    }),
    bar({
      key: 'nav.padRight',
      plainLabel: 'Right padding',
      technicalKey: 'nav.padRight',
      description: "Space inside the bar's right edge, after the last slot.",
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 1,
      defaultValue: () => 0,
    }),
    bar({
      key: 'nav.spread',
      plainLabel: 'Tab spread',
      technicalKey: 'nav.spread',
      description:
        'Pulls the tab slots toward the centre from both sides — the flex row re-lays out responsively.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 60,
      step: 2,
      defaultValue: () => 0,
    }),
    bar({
      key: 'nav.centerClearance',
      plainLabel: 'Centre-button clearance',
      technicalKey: 'nav.centerClearance',
      description: 'Extra room the neighbouring slots leave around the centre [+].',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 40,
      step: 2,
      defaultValue: () => 0,
    }),
    item({
      key: 'nav.iconSize',
      plainLabel: 'Icon size',
      technicalKey: 'nav.iconSize',
      description: 'Every tab glyph — tokenised as ui/tokens navBar.iconSize.',
      tier: 'basic',
      kind: 'number',
      scope: 'token',
      unit: 'pt',
      min: 16,
      max: 48,
      step: 1,
      defaultValue: () => navBar.iconSize,
    }),
    item({
      key: 'nav.labelSize',
      plainLabel: 'Label size',
      technicalKey: 'nav.labelSize',
      description:
        'The tab labels — THE one font value any dial may touch (the narrow typography exception).',
      tier: 'basic',
      kind: 'number',
      scope: 'token',
      unit: 'pt',
      min: 8,
      max: 20,
      step: 1,
      defaultValue: () => navBar.labelFontSize,
    }),
    item({
      key: 'nav.iconLabelGap',
      plainLabel: 'Icon-label gap',
      technicalKey: 'nav.iconLabelGap',
      description: 'The breath between each glyph and its label.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 12,
      step: 1,
      defaultValue: () => navBar.iconLabelGap,
    }),
    item({
      key: 'nav.itemOffsetX',
      plainLabel: 'Item row X offset',
      technicalKey: 'nav.itemOffsetX',
      description: 'Nudges every icon+label block sideways inside its slot — the slots themselves never move.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: -20,
      max: 20,
      step: 1,
      defaultValue: () => 0,
    }),
    item({
      key: 'nav.itemOffsetY',
      plainLabel: 'Item row Y offset',
      technicalKey: 'nav.itemOffsetY',
      description: 'Nudges every icon+label block up or down inside the bar.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: -20,
      max: 20,
      step: 1,
      defaultValue: () => 0,
    }),
    item({
      key: 'nav.activeColor',
      plainLabel: 'Active colour',
      technicalKey: 'nav.activeColor',
      description: 'The focused tab’s glyph and label tint, in whichever theme is showing.',
      tier: 'basic',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) => (ctx.isDark ? ctx.appDark : ctx.appLight).emerald ?? '',
      contrastGround: (ctx) => ({
        label: 'background',
        hex: (ctx.isDark ? ctx.appDark : ctx.appLight).background,
      }),
    }),
    item({
      key: 'nav.inactiveColor',
      plainLabel: 'Inactive colour',
      technicalKey: 'nav.inactiveColor',
      description: 'The resting tabs’ glyph and label tint, in whichever theme is showing.',
      tier: 'basic',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) => (ctx.isDark ? ctx.appDark : ctx.appLight).navInactive ?? '',
      contrastGround: (ctx) => ({
        label: 'background',
        hex: (ctx.isDark ? ctx.appDark : ctx.appLight).background,
      }),
    }),
    item({
      key: 'nav.activeOpacity',
      plainLabel: 'Active opacity',
      technicalKey: 'nav.activeOpacity',
      description: 'How solid the focused tab’s icon+label block renders.',
      tier: 'advanced',
      kind: 'decimal',
      scope: 'local',
      min: 0,
      max: 1,
      step: 0.02,
      defaultValue: () => 1,
    }),
    item({
      key: 'nav.inactiveOpacity',
      plainLabel: 'Inactive opacity',
      technicalKey: 'nav.inactiveOpacity',
      description: 'How solid the resting tabs’ icon+label blocks render.',
      tier: 'advanced',
      kind: 'decimal',
      scope: 'local',
      min: 0,
      max: 1,
      step: 0.02,
      defaultValue: () => 1,
    }),
    item({
      key: 'nav.activeScale',
      plainLabel: 'Active scale',
      technicalKey: 'nav.activeScale',
      description: 'Grows or shrinks the focused tab’s icon+label block.',
      tier: 'advanced',
      kind: 'decimal',
      scope: 'local',
      min: 0.8,
      max: 1.5,
      step: 0.02,
      defaultValue: () => 1,
    }),
    create({
      key: 'create.size',
      plainLabel: 'Button size',
      technicalKey: 'create.size',
      description:
        'The centre [+] tile’s square — by default its home(18) share of the live bar height. Never below the 44pt touch floor.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 44,
      max: 96,
      step: 1,
      defaultValue: (ctx) => Math.round(liveNavBarHeight(ctx) * navBar.createSizeRatio),
    }),
    create({
      key: 'create.radius',
      plainLabel: 'Corner roundness',
      technicalKey: 'create.radius',
      description: 'The centre [+] tile’s corner radius.',
      tier: 'basic',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 0,
      max: 48,
      step: 1,
      defaultValue: () => tokenRadius.lg,
    }),
    create({
      key: 'create.fill',
      plainLabel: 'Fill',
      technicalKey: 'create.fill',
      description: 'The centre [+] tile’s own fill — it inherits nothing from the tab items.',
      tier: 'basic',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) =>
        ctx.isDark ? (ctx.appDark.gold ?? '') : (ctx.appLight.postPillGreen ?? ''),
      contrastGround: (ctx) => ({
        label: 'background',
        hex: (ctx.isDark ? ctx.appDark : ctx.appLight).background,
      }),
    }),
    create({
      key: 'create.border',
      plainLabel: 'Ring',
      technicalKey: 'create.border',
      description: 'The centre [+] tile’s outline.',
      tier: 'advanced',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) =>
        ctx.isDark ? (ctx.appDark.greetingSlate ?? '') : (ctx.appLight.goldDeep ?? ''),
    }),
    create({
      key: 'create.glowAlpha',
      plainLabel: 'Glow strength',
      technicalKey: 'create.glowAlpha',
      description: 'The gold halo under the centre [+] (dark ground) — RUN H2’s operator dial.',
      tier: 'advanced',
      kind: 'decimal',
      scope: 'local',
      min: 0,
      max: 1,
      step: 0.02,
      defaultValue: () => navBar.createGlowAlpha,
    }),
    create({
      key: 'create.glyphSize',
      plainLabel: 'Glyph size',
      technicalKey: 'create.glyphSize',
      description: 'The + glyph — by default its shipped share of the live button size.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: 16,
      max: 64,
      step: 1,
      defaultValue: (ctx) => Math.round(liveCreateSize(ctx) * navBar.createGlyphRatio),
    }),
    create({
      key: 'create.glyphColor',
      plainLabel: 'Glyph colour',
      technicalKey: 'create.glyphColor',
      description: 'The + glyph’s ink, in whichever theme is showing.',
      tier: 'advanced',
      kind: 'color',
      scope: 'local',
      defaultValue: (ctx) =>
        ctx.isDark ? (ctx.appDark.postPillGreen ?? '') : (ctx.appLight.gold ?? ''),
    }),
    create({
      key: 'create.glyphOffsetX',
      plainLabel: 'Glyph X offset',
      technicalKey: 'create.glyphOffsetX',
      description: 'Nudges the + glyph sideways inside the tile.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: -16,
      max: 16,
      step: 1,
      defaultValue: () => 0,
    }),
    create({
      key: 'create.glyphOffsetY',
      plainLabel: 'Glyph Y offset',
      technicalKey: 'create.glyphOffsetY',
      description: 'Nudges the + glyph up or down inside the tile.',
      tier: 'advanced',
      kind: 'number',
      scope: 'local',
      unit: 'pt',
      min: -16,
      max: 16,
      step: 1,
      defaultValue: () => 0,
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
// The registry. C1 seeds it with every dial the G1 studio already offered;
// C5–C10 grow the categories. Order inside a category is display order.
// ---------------------------------------------------------------------------

export const STUDIO_REGISTRY: readonly StudioEntry[] = [
  ...materialDials('chrome'),
  ...materialDials('sheet'),
  ...materialDials('menu'),
  ...navigationDialEntries(),
  ...sheetDialEntries(),
  ...menuDialEntries(),
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
