import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STATIC_MATERIALS,
  resetDesignOverrides,
  setDesignStudioOpen,
  useDesignOverrides,
  useDesignStudioOpen,
} from '../lib/designOverrides';
import { navBottomPadFor } from '../hooks/useNavInset';
import {
  colors as appLightPalette,
  darkColors as appDarkPalette,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { dark as emeraldDarkPalette, light as emeraldLightPalette } from '../ui/tokens';
import { SURFACE_GLOW_ALPHA } from '../ui/primitives';
import {
  STUDIO_CATEGORIES,
  STUDIO_REGISTRY,
  currentValueOf,
  isModified,
  type StudioCategory,
  type StudioContext,
  type StudioEntry,
  type StudioValue,
} from '../ui/designStudioSchema';

// FENCE: DESIGN STUDIO (RUN S2 C1) — PERMANENT and CHANNEL-GATED. The old "strip before TestFlight" instruction is SUPERSEDED: the panel ships in every build and lib/designStudioGate.ts decides where it may exist (Metro __DEV__, or update channel internal/development; FAIL CLOSED elsewhere). Its mount in navigation/ModeShell.tsx reads that gate.

/**
 * RUN S2 (C2) — THE SCHEMA-DRIVEN DESIGN STUDIO.
 *
 * A floating tuning panel over the whole app, toggled from the Appearance
 * screen's "Design studio" row. It renders ENTIRELY from the registry in
 * ui/designStudioSchema.ts — zero hand-wired rows, no per-token literals
 * (tests/designStudio.test.mjs holds both) — and writes overrides only
 * through each entry's own `write`. Categories collapse, carry their
 * Ionicons glyph and live counts; rows show the plain label over the
 * technical key, a modified indicator ("24 → 18"), a star, an info
 * affordance surfacing the one-line description, and a per-token reset.
 * The toolbar filters live: search over label/key/category, favourites,
 * modified-only, and the Simple/Advanced tier toggle (Simple default).
 *
 * DELIBERATELY NOT GLASS. The panel is a plain solid dark card in both
 * themes, so it never blurs — or repaints with — the very materials it is
 * tuning. Dragging and clamping are C3's work; this commit keeps G1's
 * vertical header drag.
 */

/** The Values readout is data, so it renders in the platform's monospace. */
const STUDIO_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** #RGB, #RRGGBB or #RRGGBBAA, '#' optional, case-insensitive → #UPPER. */
function normalizeHex(raw: string): string | null {
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

type PanelStyles = ReturnType<typeof stylesFor>;

function formatValue(entry: StudioEntry, value: StudioValue): string {
  if (typeof value === 'number') {
    const text = entry.kind === 'decimal' ? value.toFixed(2) : String(value);
    return entry.unit ? `${text}${entry.unit}` : text;
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return String(value);
}

function StepperEditor({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const current = Number(currentValueOf(entry, ctx));
  const step = entry.step ?? 1;
  const apply = (direction: 1 | -1) => {
    const min = entry.min ?? Number.NEGATIVE_INFINITY;
    const max = entry.max ?? Number.POSITIVE_INFINITY;
    const next = clamp(round2(current + direction * step), min, max);
    if (!Number.isFinite(next)) return;
    entry.write(next);
  };
  return (
    <View style={styles.editorRow}>
      <Pressable
        onPress={() => apply(-1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${entry.plainLabel} minus`}
        hitSlop={6}
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      <Text style={styles.rowValue}>{formatValue(entry, current)}</Text>
      <Pressable
        onPress={() => apply(1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${entry.plainLabel} plus`}
        hitSlop={6}
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

function ColorEditor({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const current = String(currentValueOf(entry, ctx));
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft == null) return;
    const normalized = normalizeHex(draft);
    if (normalized == null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    entry.write(normalized);
  };
  return (
    <View style={styles.editorRow}>
      <View style={[styles.swatch, { backgroundColor: current }]} />
      <View>
        <TextInput
          value={draft ?? current}
          onChangeText={(text) => {
            setDraft(text);
            setInvalid(false);
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.hexInput, invalid && styles.hexInputInvalid]}
          accessibilityLabel={`${entry.plainLabel} hex value`}
        />
        {invalid ? <Text style={styles.hexError}>Not a hex colour</Text> : null}
      </View>
    </View>
  );
}

function BooleanEditor({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const current = currentValueOf(entry, ctx) === true;
  return (
    <Pressable
      onPress={() => entry.write(!current)}
      style={({ pressed }) => [styles.cycle, pressed && styles.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: current }}
      accessibilityLabel={entry.plainLabel}
    >
      <Text style={styles.cycleValue}>{current ? 'On' : 'Off'}</Text>
    </Pressable>
  );
}

function EnumEditor({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const options = entry.options ?? [];
  const current = String(currentValueOf(entry, ctx));
  const advance = () => {
    if (!options.length) return;
    const at = options.indexOf(current);
    entry.write(options[(at + 1) % options.length]);
  };
  return (
    <Pressable
      onPress={advance}
      style={({ pressed }) => [styles.cycle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${entry.plainLabel}: ${current}`}
    >
      <Text style={styles.cycleValue}>{current}</Text>
    </Pressable>
  );
}

function TextEditor({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const current = String(currentValueOf(entry, ctx));
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    setDraft(null);
    entry.write(draft);
  };
  return (
    <TextInput
      value={draft ?? current}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      autoCorrect={false}
      style={styles.hexInput}
      accessibilityLabel={entry.plainLabel}
    />
  );
}

function EntryRow({
  entry,
  ctx,
  styles,
  colors,
  favourite,
  onToggleFavourite,
  infoOpen,
  onToggleInfo,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
  colors: ColorPalette;
  favourite: boolean;
  onToggleFavourite: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
}) {
  const modified = isModified(entry, ctx);
  const editor =
    entry.kind === 'color' ? (
      <ColorEditor entry={entry} ctx={ctx} styles={styles} />
    ) : entry.kind === 'boolean' ? (
      <BooleanEditor entry={entry} ctx={ctx} styles={styles} />
    ) : entry.kind === 'enum' ? (
      <EnumEditor entry={entry} ctx={ctx} styles={styles} />
    ) : entry.kind === 'text' ? (
      <TextEditor entry={entry} ctx={ctx} styles={styles} />
    ) : (
      <StepperEditor entry={entry} ctx={ctx} styles={styles} />
    );

  return (
    <View style={styles.entry}>
      <View style={styles.entryRow}>
        <Pressable
          onPress={onToggleFavourite}
          accessibilityRole="button"
          accessibilityLabel={
            favourite ? `Unstar ${entry.plainLabel}` : `Star ${entry.plainLabel}`
          }
          hitSlop={6}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons
            name={favourite ? 'star' : 'star-outline'}
            size={14}
            color={favourite ? colors.gold : withAlpha(colors.white, 0.4)}
          />
        </Pressable>
        <Pressable
          onPress={onToggleInfo}
          style={({ pressed }) => [styles.labelBlock, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${entry.plainLabel} details`}
        >
          <Text style={styles.rowLabel} numberOfLines={1}>
            {entry.plainLabel}
            {modified ? <Text style={styles.modifiedDot}> ●</Text> : null}
          </Text>
          <Text style={styles.technicalKey} numberOfLines={1}>
            {entry.technicalKey}
          </Text>
        </Pressable>
        {editor}
        <Pressable
          onPress={() => entry.write(undefined)}
          disabled={!modified}
          style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${entry.plainLabel}`}
        >
          <Ionicons
            name="refresh-outline"
            size={14}
            color={modified ? colors.emerald : withAlpha(colors.white, 0.18)}
          />
        </Pressable>
      </View>
      {modified ? (
        <Text style={styles.modifiedTrail}>
          {formatValue(entry, entry.defaultValue(ctx))} → {formatValue(entry, currentValueOf(entry, ctx))}
        </Text>
      ) : null}
      {infoOpen ? <Text style={styles.description}>{entry.description}</Text> : null}
    </View>
  );
}

type StudioFilter = 'all' | 'favourites' | 'modified';

export function DesignStudioPanel() {
  const open = useDesignStudioOpen();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const overrides = useDesignOverrides();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StudioFilter>('all');
  const [tier, setTier] = useState<'simple' | 'advanced'>('simple');
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [infoKey, setInfoKey] = useState<string | null>(null);

  const ctx: StudioContext = useMemo(
    () => ({
      overrides,
      staticMaterials: STATIC_MATERIALS,
      appLight: appLightPalette,
      appDark: appDarkPalette,
      emeraldLight: emeraldLightPalette,
      emeraldDark: emeraldDarkPalette,
      isDark,
      navBottomPadAuto: navBottomPadFor(insets.bottom),
      glowAlphaDefault: SURFACE_GLOW_ALPHA,
    }),
    [overrides, isDark, insets.bottom],
  );

  // Vertical drag by the header — position state only, never an animation.
  const translateY = useRef(new Animated.Value(0)).current;
  const restingY = useRef(0);
  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(restingY.current + gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        restingY.current += gesture.dy;
      },
      onPanResponderTerminate: (_event, gesture) => {
        restingY.current += gesture.dy;
      },
    }),
  ).current;

  const query = search.trim().toLowerCase();

  const visibleByCategory = useMemo(() => {
    const grouped = new Map<string, StudioEntry[]>();
    for (const category of STUDIO_CATEGORIES) grouped.set(category.key, []);
    for (const entry of STUDIO_REGISTRY) {
      if (tier === 'simple' && entry.tier !== 'basic') continue;
      if (filter === 'favourites' && !favourites.has(entry.key)) continue;
      if (filter === 'modified' && !isModified(entry, ctx)) continue;
      if (query) {
        const category = STUDIO_CATEGORIES.find((c) => c.key === entry.category);
        const haystack = `${entry.plainLabel} ${entry.technicalKey} ${category?.label ?? ''} ${
          entry.subcategory ?? ''
        }`.toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      grouped.get(entry.category)?.push(entry);
    }
    return grouped;
  }, [tier, filter, favourites, query, ctx]);

  if (!open) return null;

  const toggleSet = (
    set: ReadonlySet<string>,
    key: string,
    write: (next: ReadonlySet<string>) => void,
  ) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    write(next);
  };

  const modifiedCountOf = (entries: StudioEntry[]) =>
    entries.reduce((count, entry) => count + (isModified(entry, ctx) ? 1 : 0), 0);

  const renderCategory = (category: StudioCategory) => {
    const entries = visibleByCategory.get(category.key) ?? [];
    if (!entries.length) return null;
    const isOpen = query.length > 0 || expanded.has(category.key);
    const modifiedCount = modifiedCountOf(entries);
    const rows: Array<{ subcategory: string | null; entry: StudioEntry }> = [];
    let lastSub: string | null = null;
    for (const entry of entries) {
      const sub = entry.subcategory ?? null;
      rows.push({ subcategory: sub !== lastSub ? sub : null, entry });
      lastSub = sub;
    }
    return (
      <View key={category.key} style={styles.category}>
        <Pressable
          onPress={() => toggleSet(expanded, category.key, setExpanded)}
          style={({ pressed }) => [styles.categoryHeader, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={`${category.label}, ${entries.length} controls`}
        >
          <Ionicons name={category.icon as never} size={15} color={colors.gold} />
          <Text style={styles.categoryLabel} numberOfLines={1}>
            {category.label}
          </Text>
          <Text style={styles.categoryCount}>
            {modifiedCount ? `${modifiedCount} changed · ` : ''}
            {entries.length}
          </Text>
          {modifiedCount ? (
            <Pressable
              onPress={() => {
                for (const entry of entries) entry.write(undefined);
              }}
              style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Reset ${category.label}`}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.emerald} />
            </Pressable>
          ) : null}
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={withAlpha(colors.white, 0.55)}
          />
        </Pressable>
        {isOpen
          ? rows.map(({ subcategory, entry }) => (
              <View key={entry.key}>
                {subcategory ? <Text style={styles.subcategory}>{subcategory}</Text> : null}
                <EntryRow
                  entry={entry}
                  ctx={ctx}
                  styles={styles}
                  colors={colors}
                  favourite={favourites.has(entry.key)}
                  onToggleFavourite={() => toggleSet(favourites, entry.key, setFavourites)}
                  infoOpen={infoKey === entry.key}
                  onToggleInfo={() => setInfoKey(infoKey === entry.key ? null : entry.key)}
                />
              </View>
            ))
          : null}
      </View>
    );
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
        <View style={styles.header} {...drag.panHandlers}>
          <View style={styles.grip} />
          <Text style={styles.title}>Design studio</Text>
          <Pressable
            onPress={resetDesignOverrides}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Reset all overrides"
          >
            <Text style={styles.headerActionLabel}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={() => setDesignStudioOpen(false)}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close the design studio"
          >
            <Text style={styles.headerActionLabel}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.toolbar}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search controls"
            placeholderTextColor={withAlpha(colors.white, 0.4)}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.search}
            accessibilityLabel="Search controls"
          />
          <View style={styles.filterRow}>
            {(
              [
                ['all', 'All'],
                ['favourites', 'Starred'],
                ['modified', 'Modified'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[styles.filterChip, filter === key && styles.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === key }}
              >
                <Text
                  style={[styles.filterLabel, filter === key && styles.filterLabelActive]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
            <View style={styles.filterSpacer} />
            {(
              [
                ['simple', 'Simple'],
                ['advanced', 'Advanced'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setTier(key)}
                style={[styles.filterChip, tier === key && styles.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: tier === key }}
              >
                <Text style={[styles.filterLabel, tier === key && styles.filterLabelActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {STUDIO_CATEGORIES.map(renderCategory)}

          <Text style={styles.sectionLabel}>Values</Text>
          <Text selectable style={styles.json}>
            {JSON.stringify(overrides, null, 2)}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    // A plain solid dark card in BOTH themes — never glass, never the palette
    // surface it might itself be tuning.
    panel: {
      position: 'absolute',
      top: 72,
      left: 12,
      right: 12,
      maxHeight: 460,
      backgroundColor: colors.black,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.18),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.white, 0.12),
    },
    grip: {
      width: 24,
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(colors.white, 0.35),
    },
    title: {
      flex: 1,
      fontSize: 13,
      fontWeight: '800',
      color: colors.white,
    },
    headerAction: {
      minWidth: 44,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerActionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.75),
    },
    toolbar: {
      paddingHorizontal: 12,
      paddingTop: 8,
      gap: 6,
    },
    search: {
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      color: colors.white,
      paddingHorizontal: 10,
      paddingVertical: 0,
      fontSize: 12,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    filterChip: {
      paddingHorizontal: 10,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: {
      borderColor: colors.gold,
    },
    filterLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.7),
    },
    filterLabelActive: {
      color: colors.gold,
    },
    filterSpacer: {
      flex: 1,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      padding: 12,
      gap: 8,
    },
    category: {
      gap: 4,
    },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 34,
    },
    categoryLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: '800',
      color: colors.white,
    },
    categoryCount: {
      fontSize: 11,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.55),
    },
    subcategory: {
      marginTop: 2,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: withAlpha(colors.white, 0.45),
    },
    entry: {
      gap: 2,
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
    },
    labelBlock: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 13,
      color: colors.white,
    },
    modifiedDot: {
      color: colors.emerald,
      fontSize: 10,
    },
    technicalKey: {
      fontSize: 10,
      color: withAlpha(colors.white, 0.45),
    },
    editorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rowValue: {
      minWidth: 56,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
    },
    step: {
      width: 32,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    stepGlyph: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.white,
    },
    cycle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    cycleValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
    },
    swatch: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.4),
    },
    hexInput: {
      minWidth: 92,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      color: colors.white,
      paddingHorizontal: 8,
      paddingVertical: 0,
      fontSize: 12,
      fontFamily: STUDIO_MONO,
    },
    hexInputInvalid: {
      borderColor: colors.danger,
    },
    hexError: {
      fontSize: 10,
      color: colors.danger,
    },
    resetToken: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modifiedTrail: {
      fontSize: 10,
      color: colors.emerald,
      marginLeft: 22,
    },
    description: {
      fontSize: 11,
      lineHeight: 15,
      color: withAlpha(colors.white, 0.7),
      marginLeft: 22,
    },
    sectionLabel: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: withAlpha(colors.white, 0.55),
    },
    json: {
      fontFamily: STUDIO_MONO,
      fontSize: 11,
      lineHeight: 16,
      color: withAlpha(colors.white, 0.85),
    },
    pressed: {
      opacity: 0.7,
    },
  }),
);
