import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STATIC_MATERIALS,
  resetDesignOverrides,
  setDesignOverrides,
  setDesignStudioOpen,
  useDesignOverrides,
  useDesignStudioOpen,
} from '../lib/designOverrides';
import {
  redoDesignChange,
  undoDesignChange,
  useDesignHistoryCounts,
} from '../lib/designStudioHistory';
import {
  deleteDesignPreset,
  duplicateDesignPreset,
  listDesignPresets,
  loadDesignPins,
  loadDesignPreset,
  renameDesignPreset,
  saveDesignPins,
  saveDesignPreset,
  type StoredDesignPreset,
} from '../lib/designStudioPresets';
import { confirmAsync } from '../lib/dialog';
import {
  colors as appLightPalette,
  darkColors as appDarkPalette,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { dark as emeraldDarkPalette, light as emeraldLightPalette } from '../ui/tokens';
import { SURFACE_GLOW_ALPHA, useFloatingNavClearance } from '../ui/primitives';
import {
  PANEL_MARGIN,
  clampPanelRect,
  panelWidthFor,
  type PanelFrame,
  type PanelRect,
} from '../ui/designStudioLayout';
import {
  STUDIO_CATEGORIES,
  STUDIO_REGISTRY,
  colorTokenEntries,
  currentValueOf,
  exportModifiedOverrides,
  inheritedFrom,
  isModified,
  normalizeHex,
  sanitizeOverrides,
  type StudioCategory,
  type StudioContext,
  type StudioEntry,
  type StudioValue,
} from '../ui/designStudioSchema';
import { contrastRatio, formatHex, hslToHex, parseHex, rgbToHsl } from '../ui/colorMath';
import { parseDirectEntry } from '../ui/designStudioInput';

// FENCE: DESIGN STUDIO (RUN S2 C1) — PERMANENT and CHANNEL-GATED. The old "strip before TestFlight" instruction is SUPERSEDED: the panel ships in every build and lib/designStudioGate.ts decides where it may exist (Metro __DEV__, or update channel internal/development; FAIL CLOSED elsewhere). Its mount in navigation/ModeShell.tsx reads that gate.

/**
 * RUN S2 (C2/C3) — THE SCHEMA-DRIVEN DESIGN STUDIO.
 *
 * A floating tuning panel over the whole app, toggled from the Appearance
 * screen's "Design studio" row. It renders ENTIRELY from the registry in
 * ui/designStudioSchema.ts — zero hand-wired rows, no per-token literals
 * (tests/designStudio.test.mjs holds both) — and writes overrides only
 * through each entry's own `write`.
 *
 * C3 ERGONOMICS. The panel is clamped on EVERY axis through
 * ui/designStudioLayout.ts's pure `clampPanelRect`, re-applied on drag,
 * resize, collapse and every frame change: the header can never leave the
 * safe interactive area, and the bottom nav is never covered — the panel is
 * NON-MODAL and the app behind stays fully interactive. It is vertically
 * resizable by its header handle (PANEL_MIN_HEIGHT up to the full available
 * area) with the content scrolling internally at every height, and it
 * collapses — separately from resizing — to a slim "Customizing — <category>"
 * pill that restores both height and scroll position on tap. Geometry
 * persists for the session in a module-level store, so closing and reopening
 * the studio keeps the operator's arrangement; a relaunch resets it.
 *
 * DELIBERATELY NOT GLASS. The panel is a plain solid dark card in both
 * themes, so it never blurs — or repaints with — the very materials it is
 * tuning.
 */

/** The Values readout is data, so it renders in the platform's monospace. */
const STUDIO_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The session's panel arrangement — survives closing the studio, dies with
 *  the process. LIVE-tier state, exactly like the overrides it tunes. */
const panelSession = {
  rect: { x: PANEL_MARGIN, y: 72, height: 360 } as PanelRect,
  collapsed: false,
  scrollY: 0,
  category: 'All controls',
};

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
  // S3 (D8) — DIRECT ENTRY. [✎] swaps the value text for a decimal-pad field
  // in the same slot; the unit stays OUTSIDE it, so what is typed is only
  // ever a number. Committing on submit or blur runs the pure parser, and a
  // null answer REVERTS: no write, no crash, no error to dismiss.
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (direction: 1 | -1) => {
    const min = entry.min ?? Number.NEGATIVE_INFINITY;
    const max = entry.max ?? Number.POSITIVE_INFINITY;
    const next = clamp(round2(current + direction * step), min, max);
    if (!Number.isFinite(next)) return;
    entry.write(next);
  };
  const commit = () => {
    if (draft == null) return;
    const parsed = parseDirectEntry(draft, {
      min: entry.min,
      max: entry.max,
      kind: entry.kind === 'decimal' ? 'decimal' : 'number',
    });
    setDraft(null);
    if (parsed == null) return;
    entry.write(parsed);
  };
  return (
    <View style={styles.editorRow}>
      <Pressable
        onPress={() => apply(-1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${entry.plainLabel} minus`}
        hitSlop={7}
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      {draft == null ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {formatValue(entry, current)}
        </Text>
      ) : (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          autoCorrect={false}
          onBlur={commit}
          onSubmitEditing={commit}
          style={styles.directInput}
          accessibilityLabel={`${entry.plainLabel} value`}
        />
      )}
      {draft != null && entry.unit ? <Text style={styles.unit}>{entry.unit}</Text> : null}
      <Pressable
        onPress={() => apply(1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${entry.plainLabel} plus`}
        hitSlop={7}
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
      <Pressable
        onPress={() => setDraft(entry.kind === 'decimal' ? current.toFixed(2) : String(current))}
        style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Type a value for ${entry.plainLabel}`}
        hitSlop={9}
      >
        <Ionicons name="pencil-outline" size={13} style={styles.editGlyph} />
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
  // S3 (D9) — line 1 of a colour row: [swatch] [hex input] and then the row's
  // own [↺]. The input FLEXES between them, so nothing is reserved and the
  // hex never has to scroll sideways to be read.
  return (
    <View style={styles.colorEditor}>
      <View style={styles.colorEditorRow}>
        <View style={[styles.swatch, { backgroundColor: current }]} />
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
      </View>
      {invalid ? <Text style={styles.hexError}>Not a hex colour</Text> : null}
    </View>
  );
}

function MiniStepper({
  label,
  display,
  onStep,
  styles,
}: {
  label: string;
  display: string;
  onStep: (direction: 1 | -1) => void;
  styles: PanelStyles;
}) {
  return (
    <View style={styles.miniStepper}>
      <Text style={styles.miniLabel}>{label}</Text>
      {/* S3 (D9): a 28pt glyph button, taken to 36pt across by hitSlop —
          exactly the 4pt gap to its neighbour, so the hit areas TILE rather
          than overlap — and to the full 44pt floor vertically, where there
          is no neighbour to steal from. */}
      <Pressable
        onPress={() => onStep(-1)}
        style={({ pressed }) => [styles.miniStep, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} minus`}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={styles.miniGlyph}>−</Text>
      </Pressable>
      <Text style={styles.miniValue} numberOfLines={1}>
        {display}
      </Text>
      <Pressable
        onPress={() => onStep(1)}
        style={({ pressed }) => [styles.miniStep, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} plus`}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={styles.miniGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

/** C5 — HSL steppers (H ±2 wraps, S/L ±2 clamp), an alpha stepper where the
 *  value carries alpha, and the live contrast readout vs the token's own
 *  ground — danger-coloured under 4.5:1, warning only, never blocking. */
function HslBlock({
  entry,
  ctx,
  styles,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
}) {
  const current = String(currentValueOf(entry, ctx));
  const parsed = parseHex(current);
  if (!parsed) return null;
  const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const ground = entry.contrastGround?.(ctx) ?? null;
  const ratio = ground ? contrastRatio(current, ground.hex) : null;
  return (
    <View style={styles.hslBlock}>
      <View style={styles.hslRow}>
        <MiniStepper
          styles={styles}
          label="H"
          display={String(Math.round(hsl.h))}
          onStep={(direction) =>
            entry.write(hslToHex(hsl.h + direction * 2, hsl.s, hsl.l, parsed.alpha))
          }
        />
        <MiniStepper
          styles={styles}
          label="S"
          display={String(Math.round(hsl.s))}
          onStep={(direction) =>
            entry.write(hslToHex(hsl.h, clamp(hsl.s + direction * 2, 0, 100), hsl.l, parsed.alpha))
          }
        />
        <MiniStepper
          styles={styles}
          label="L"
          display={String(Math.round(hsl.l))}
          onStep={(direction) =>
            entry.write(hslToHex(hsl.h, hsl.s, clamp(hsl.l + direction * 2, 0, 100), parsed.alpha))
          }
        />
        {parsed.alpha != null ? (
          <MiniStepper
            styles={styles}
            label="A"
            display={parsed.alpha.toFixed(2)}
            onStep={(direction) =>
              entry.write(
                formatHex(
                  parsed.r,
                  parsed.g,
                  parsed.b,
                  clamp(round2((parsed.alpha ?? 1) + direction * 0.02), 0, 1),
                ),
              )
            }
          />
        ) : null}
      </View>
      {ratio != null && ground ? (
        <Text style={[styles.contrast, ratio < 4.5 && styles.contrastLow]}>
          contrast {ratio.toFixed(2)}:1 vs {ground.label}
        </Text>
      ) : null}
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
  pinned,
  chipOpen,
  onRequestPin,
  onTogglePin,
  infoOpen,
  onToggleInfo,
}: {
  entry: StudioEntry;
  ctx: StudioContext;
  styles: PanelStyles;
  colors: ColorPalette;
  pinned: boolean;
  /** S3 (D6): the long-press chip is showing on THIS row. */
  chipOpen: boolean;
  onRequestPin: () => void;
  onTogglePin: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
}) {
  const modified = isModified(entry, ctx);
  // RUN T1 (C5/D9) — WHERE AN UNTOUCHED VALUE IS COMING FROM. A dial that
  // declares a parent shows its parent's value until it is touched, and a row
  // showing a number with no explanation is how an operator concludes the
  // dial above it did nothing. Null the moment the row has its own override,
  // which is also what its reset returns it to.
  const inherits = inheritedFrom(entry, ctx);
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
        {/* S3 (D6): stars are gone. A LONG PRESS on the label block raises the
            pin chip in the reset glyph's place; a tap still opens the info. */}
        <Pressable
          onPress={onToggleInfo}
          onLongPress={onRequestPin}
          delayLongPress={400}
          style={({ pressed }) => [styles.labelBlock, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${entry.plainLabel} details`}
          accessibilityHint="Long press to pin or unpin this control"
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
        {chipOpen ? (
          <Pressable
            onPress={onTogglePin}
            style={({ pressed }) => [styles.pinChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${pinned ? 'Unpin' : 'Pin'} ${entry.plainLabel}`}
          >
            <Text style={styles.pinChipLabel} numberOfLines={1}>
              {pinned ? 'Unpin control' : 'Pin control'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => entry.write(undefined)}
            disabled={!modified}
            style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Reset ${entry.plainLabel}`}
            hitSlop={9}
          >
            <Ionicons
              name="refresh-outline"
              size={14}
              color={modified ? colors.emerald : withAlpha(colors.white, 0.18)}
            />
          </Pressable>
        )}
      </View>
      {entry.kind === 'color' ? <HslBlock entry={entry} ctx={ctx} styles={styles} /> : null}
      {modified ? (
        <Text style={styles.modifiedTrail}>
          {formatValue(entry, entry.defaultValue(ctx))} → {formatValue(entry, currentValueOf(entry, ctx))}
        </Text>
      ) : inherits ? (
        <Text style={styles.inheritTrail} numberOfLines={1}>
          inherits {inherits.plainLabel}
        </Text>
      ) : null}
      {infoOpen ? <Text style={styles.description}>{entry.description}</Text> : null}
    </View>
  );
}

/**
 * RUN S3 (C2) — THE OVERFLOW AND ITS PAGES.
 *
 * Everything that is not a dial lives behind the header's [•••]: a plain
 * list, drawn in the panel's own solid vocabulary rather than in any shared
 * popover primitive — the studio must never wear what it tunes. Four of its
 * five rows open a PAGE that replaces the list inside the same body, each
 * with a "‹ Design studio" row back to the controls; the fifth resets.
 */
type StudioPage = 'overflow' | 'presets' | 'export' | 'import' | 'raw';

const OVERFLOW_PAGES: readonly { page: StudioPage; label: string }[] = [
  { page: 'presets', label: 'Presets' },
  { page: 'export', label: 'Export' },
  { page: 'import', label: 'Import' },
  { page: 'raw', label: 'Raw JSON' },
];

export function DesignStudioPanel() {
  const open = useDesignStudioOpen();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const overrides = useDesignOverrides();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const navClearance = useFloatingNavClearance();

  // S3 (D3): search is GONE — the input, its state, its style and its
  // filtering branch. The tier toggle and the Modified filter are the two
  // narrowing controls the toolbar keeps.
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [tier, setTier] = useState<'simple' | 'advanced'>('simple');
  const [page, setPage] = useState<StudioPage | null>(null);
  // S3 (D6) — PINS replace stars, and unlike them they SURVIVE A RELAUNCH.
  const [pins, setPins] = useState<ReadonlySet<string>>(new Set());
  const [pinChip, setPinChip] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [infoKey, setInfoKey] = useState<string | null>(null);
  // C5 — which theme's colour tokens the Colors category edits.
  const [colorTheme, setColorTheme] = useState<'light' | 'dark'>(isDark ? 'dark' : 'light');

  // C3 — geometry. One rect, one collapse flag, every mutation clamped, and
  // the session store keeps the arrangement while the studio is toggled off.
  const frame: PanelFrame = useMemo(
    () => ({
      windowWidth: window.width,
      windowHeight: window.height,
      topInset: insets.top,
      bottomInset: navClearance,
    }),
    [window.width, window.height, insets.top, navClearance],
  );
  const [rect, setRect] = useState<PanelRect>(() =>
    clampPanelRect(panelSession.rect, frame, panelSession.collapsed),
  );
  const [collapsed, setCollapsed] = useState(panelSession.collapsed);
  const [lastCategory, setLastCategory] = useState(panelSession.category);

  const rectRef = useRef(rect);
  rectRef.current = rect;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  // Re-applied on every frame change — rotation, inset change, the nav bar's
  // own dials moving its footprint — never only on gestures.
  useEffect(() => {
    setRect((current) => {
      const next = clampPanelRect(current, frame, collapsed);
      return next.x === current.x && next.y === current.y && next.height === current.height
        ? current
        : next;
    });
  }, [frame, collapsed]);

  useEffect(() => {
    panelSession.rect = rect;
    panelSession.collapsed = collapsed;
    panelSession.category = lastCategory;
  }, [rect, collapsed, lastCategory]);

  const scrollRef = useRef<ScrollView | null>(null);

  // S3 (D6) — the pinned set is loaded once on mount and written on every
  // change, fail-safe: an unreadable store simply pins nothing.
  useEffect(() => {
    void loadDesignPins().then((keys) => setPins(new Set(keys)));
  }, []);

  // The long-press chip is transient: it clears itself after 3 s, on tap, or
  // when the panel unmounts — never leaving a stray timer behind.
  const pinChipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pinChipTimer.current) clearTimeout(pinChipTimer.current);
    },
    [],
  );
  const clearPinChip = () => {
    if (pinChipTimer.current) clearTimeout(pinChipTimer.current);
    pinChipTimer.current = null;
    setPinChip(null);
  };
  const requestPinChip = (key: string) => {
    if (pinChipTimer.current) clearTimeout(pinChipTimer.current);
    setPinChip(key);
    pinChipTimer.current = setTimeout(() => setPinChip(null), 3000);
  };
  const togglePin = (key: string) => {
    const next = new Set(pins);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPins(next);
    void saveDesignPins([...next]);
    clearPinChip();
  };

  const dragStart = useRef<PanelRect>(rect);
  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        dragStart.current = rectRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        // S3 (D2): VERTICAL MOVEMENT ONLY. The panel is edge-to-edge, so dx
        // has nowhere to go — the handler never reads it and the clamp
        // returns PANEL_MARGIN for x whatever arrives.
        setRect(
          clampPanelRect(
            {
              x: dragStart.current.x,
              y: dragStart.current.y + gesture.dy,
              height: dragStart.current.height,
            },
            frameRef.current,
            collapsedRef.current,
          ),
        );
      },
    }),
  ).current;

  const resizeStart = useRef<PanelRect>(rect);
  const resize = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        resizeStart.current = rectRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        setRect(
          clampPanelRect(
            {
              x: resizeStart.current.x,
              y: resizeStart.current.y,
              height: resizeStart.current.height + gesture.dy,
            },
            frameRef.current,
            false,
          ),
        );
      },
    }),
  ).current;

  const ctx: StudioContext = useMemo(
    () => ({
      overrides,
      staticMaterials: STATIC_MATERIALS,
      appLight: appLightPalette,
      appDark: appDarkPalette,
      emeraldLight: emeraldLightPalette,
      emeraldDark: emeraldDarkPalette,
      isDark,
      glowAlphaDefault: SURFACE_GLOW_ALPHA,
    }),
    [overrides, isDark, insets.bottom],
  );

  // C5 — the palette tokens, enumerated at runtime for the selected theme.
  const colorEntries = useMemo(() => colorTokenEntries(ctx, colorTheme), [ctx, colorTheme]);

  const visibleByCategory = useMemo(() => {
    const grouped = new Map<string, StudioEntry[]>();
    for (const category of STUDIO_CATEGORIES) grouped.set(category.key, []);
    for (const entry of [...STUDIO_REGISTRY, ...colorEntries]) {
      if (tier === 'simple' && entry.tier !== 'basic') continue;
      if (modifiedOnly && !isModified(entry, ctx)) continue;
      grouped.get(entry.category)?.push(entry);
    }
    return grouped;
  }, [tier, modifiedOnly, ctx, colorEntries]);

  // S3 (D6) — the Pinned section: full rows at the very top, absent when
  // nothing is pinned, and the entries STAY in their own categories too. The
  // Modified filter narrows it; the tier toggle deliberately does not, or
  // pinning an Advanced dial would hide it the moment Simple came back.
  const pinnedEntries = useMemo(() => {
    if (!pins.size) return [] as StudioEntry[];
    const list = [...STUDIO_REGISTRY, ...colorEntries].filter((entry) => pins.has(entry.key));
    return modifiedOnly ? list.filter((entry) => isModified(entry, ctx)) : list;
  }, [pins, colorEntries, modifiedOnly, ctx]);

  // C4 — history, presets, export, import and the raw editor.
  const history = useDesignHistoryCounts();
  const [presets, setPresets] = useState<StoredDesignPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importDropped, setImportDropped] = useState<string[] | null>(null);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawDropped, setRawDropped] = useState<string[] | null>(null);

  useEffect(() => {
    void listDesignPresets().then(setPresets);
  }, []);

  const exportJson = useMemo(
    () => JSON.stringify(exportModifiedOverrides(ctx), null, 2),
    [ctx],
  );
  const fullJson = useMemo(() => JSON.stringify(overrides, null, 2), [overrides]);

  if (!open) return null;

  const refreshPresets = () => {
    void listDesignPresets().then(setPresets);
  };

  /** Any live override at all — what a preset load would clobber. */
  const dirty =
    Object.keys(overrides.materials).length > 0 ||
    Object.keys(overrides).some((key) => key !== 'materials');

  /** THE one apply path: sanitise, then replace atomically. Undoable. */
  const applyOverridesObject = (input: unknown): string[] => {
    const sanitized = sanitizeOverrides(input, ctx);
    setDesignOverrides(sanitized.overrides);
    return sanitized.dropped;
  };

  const onResetEverything = async () => {
    const proceed = await confirmAsync({
      title: 'Reset everything?',
      message: 'Every live override returns to the shipped defaults. Saved presets are untouched.',
      confirmText: 'Reset',
      destructive: true,
    });
    if (proceed) resetDesignOverrides();
  };

  const onResetSection = async (label: string, entries: StudioEntry[]) => {
    const proceed = await confirmAsync({
      title: `Reset ${label}?`,
      message: 'Every change in this section returns to the shipped defaults.',
      confirmText: 'Reset',
      destructive: true,
    });
    if (!proceed) return;
    for (const entry of entries) entry.write(undefined);
  };

  const onSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    if (renameFrom) {
      const renamed = await renameDesignPreset(renameFrom, name);
      setPresetNotice(renamed ? `Renamed to “${name}”` : 'Rename failed — name in use?');
      setRenameFrom(null);
    } else {
      const saved = await saveDesignPreset(name, overrides);
      setPresetNotice(saved ? `Saved “${name}”` : 'Save failed');
    }
    setPresetName('');
    refreshPresets();
  };

  const onLoadPreset = async (preset: StoredDesignPreset) => {
    const proceed =
      !dirty ||
      (await confirmAsync({
        title: `Load “${preset.name}”?`,
        message: 'Your unsaved live changes will be replaced.',
        confirmText: 'Load',
        destructive: true,
      }));
    if (!proceed) return;
    const stored = await loadDesignPreset(preset.name);
    if (stored == null) {
      setPresetNotice(`“${preset.name}” could not be read`);
      return;
    }
    const dropped = applyOverridesObject(stored);
    setPresetNotice(
      dropped.length
        ? `Loaded “${preset.name}” — dropped ${dropped.join(', ')}`
        : `Loaded “${preset.name}”`,
    );
  };

  const onDeletePreset = async (preset: StoredDesignPreset) => {
    const proceed = await confirmAsync({
      title: `Delete “${preset.name}”?`,
      message: 'The saved preset is removed permanently. Live overrides are untouched.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!proceed) return;
    await deleteDesignPreset(preset.name);
    setPresetNotice(`Deleted “${preset.name}”`);
    refreshPresets();
  };

  const onDuplicatePreset = async (preset: StoredDesignPreset) => {
    await duplicateDesignPreset(preset.name);
    refreshPresets();
  };

  const onShareExport = () => {
    void Share.share({ message: exportJson }).catch(() => {});
  };

  const onImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importDraft);
    } catch {
      setImportError('Not valid JSON');
      return;
    }
    setImportError(null);
    const proceed = await confirmAsync({
      title: 'Import overrides?',
      message: 'The pasted set replaces every live override. Unknown keys and invalid values are dropped.',
      confirmText: 'Import',
      destructive: true,
    });
    if (!proceed) return;
    setImportDropped(applyOverridesObject(parsed));
    setImportDraft('');
  };

  const onApplyRaw = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDraft ?? fullJson);
    } catch {
      setRawError('Not valid JSON');
      return;
    }
    setRawError(null);
    const proceed = await confirmAsync({
      title: 'Apply raw overrides?',
      message: 'The edited object replaces every live override, validated through the import path.',
      confirmText: 'Apply',
      destructive: true,
    });
    if (!proceed) return;
    setRawDropped(applyOverridesObject(parsed));
    setRawDraft(null);
  };

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

  const panelWidth = panelWidthFor(frame);

  // COLLAPSE, separate from resize: a slim pill that keeps the drag handle,
  // names what was being customised, and restores height AND scroll position.
  if (collapsed) {
    return (
      <View style={styles.overlay} pointerEvents="box-none">
        <View
          style={[styles.collapsedPill, { left: rect.x, top: rect.y, maxWidth: panelWidth }]}
          {...drag.panHandlers}
        >
          <View style={styles.grip} />
          <Pressable
            onPress={() => setCollapsed(false)}
            style={({ pressed }) => [styles.collapsedBody, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Restore the design studio"
          >
            <Text style={styles.collapsedLabel} numberOfLines={1}>
              Customizing — {lastCategory}
            </Text>
            <Ionicons name="chevron-up" size={14} color={withAlpha(colors.white, 0.7)} />
          </Pressable>
        </View>
      </View>
    );
  }

  const renderCategory = (category: StudioCategory) => {
    const entries = visibleByCategory.get(category.key) ?? [];
    if (!entries.length) return null;
    const isOpen = expanded.has(category.key);
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
          onPress={() => {
            toggleSet(expanded, category.key, setExpanded);
            setLastCategory(category.label);
          }}
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
              onPress={() => void onResetSection(category.label, entries)}
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
        {isOpen && category.key === 'colors' ? (
          <View style={styles.filterRow}>
            {(['light', 'dark'] as const).map((themeKey) => (
              <Pressable
                key={themeKey}
                onPress={() => setColorTheme(themeKey)}
                style={[styles.filterChip, colorTheme === themeKey && styles.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: colorTheme === themeKey }}
              >
                <Text
                  style={[styles.filterLabel, colorTheme === themeKey && styles.filterLabelActive]}
                >
                  {themeKey === 'light' ? 'Light' : 'Dark'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {isOpen
          ? rows.map(({ subcategory, entry }) => (
              <View key={entry.key}>
                {subcategory ? <Text style={styles.subcategory}>{subcategory}</Text> : null}
                <EntryRow
                  entry={entry}
                  ctx={ctx}
                  styles={styles}
                  colors={colors}
                  pinned={pins.has(entry.key)}
                  chipOpen={pinChip === entry.key}
                  onRequestPin={() => requestPinChip(entry.key)}
                  onTogglePin={() => togglePin(entry.key)}
                  infoOpen={infoKey === entry.key}
                  onToggleInfo={() => setInfoKey(infoKey === entry.key ? null : entry.key)}
                />
              </View>
            ))
          : null}
      </View>
    );
  };

  /** S3 (D6) — the Pinned section, at the very top and absent when empty. */
  const renderPinned = () => {
    if (!pinnedEntries.length) return null;
    return (
      <View key="pinned" style={styles.category}>
        <View style={styles.categoryHeader} accessibilityRole="header">
          <Ionicons name="bookmark" size={15} color={colors.gold} />
          <Text style={styles.categoryLabel} numberOfLines={1}>
            Pinned
          </Text>
          <Text style={styles.categoryCount}>{pinnedEntries.length}</Text>
        </View>
        {pinnedEntries.map((entry) => (
          <EntryRow
            key={`pinned:${entry.key}`}
            entry={entry}
            ctx={ctx}
            styles={styles}
            colors={colors}
            pinned
            chipOpen={pinChip === entry.key}
            onRequestPin={() => requestPinChip(entry.key)}
            onTogglePin={() => togglePin(entry.key)}
            infoOpen={infoKey === entry.key}
            onToggleInfo={() => setInfoKey(infoKey === entry.key ? null : entry.key)}
          />
        ))}
      </View>
    );
  };

  /** The way back from any page to the controls list. */
  const renderBackRow = () => (
    <Pressable
      onPress={() => setPage(null)}
      style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Back to the design studio controls"
    >
      <Text style={styles.backLabel} numberOfLines={1}>
        ‹ Design studio
      </Text>
    </Pressable>
  );

  /** S3 (D5) — the [•••] list. Five rows: four open a page, the fifth resets
   *  through the existing path. Plain solid rows in the panel's own
   *  vocabulary — no shared popover primitive is worn here. */
  const renderOverflowList = () => (
    <View style={styles.overflowList}>
      {OVERFLOW_PAGES.map((item) => (
        <Pressable
          key={item.page}
          onPress={() => setPage(item.page)}
          style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <Text style={styles.overflowLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={withAlpha(colors.white, 0.5)} />
        </Pressable>
      ))}
      <Pressable
        onPress={() => void onResetEverything()}
        style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Reset all overrides"
      >
        <Text style={[styles.overflowLabel, styles.overflowDestructive]} numberOfLines={1}>
          Reset all
        </Text>
      </Pressable>
    </View>
  );

  const renderPresetsPage = () => (
    <View style={styles.page}>
      {renderBackRow()}
      <Text style={styles.sectionLabel}>Presets</Text>
      <View style={styles.presetRow}>
        <TextInput
          value={presetName}
          onChangeText={setPresetName}
          placeholder={renameFrom ? `Rename “${renameFrom}”` : 'Preset name'}
          placeholderTextColor={withAlpha(colors.white, 0.4)}
          autoCorrect={false}
          style={styles.presetInput}
          accessibilityLabel="Preset name"
        />
        <Pressable
          onPress={() => void onSavePreset()}
          style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={renameFrom ? 'Rename preset' : 'Save preset'}
        >
          <Text style={styles.filterLabel}>{renameFrom ? 'Rename' : 'Save'}</Text>
        </Pressable>
        {renameFrom ? (
          <Pressable
            onPress={() => {
              setRenameFrom(null);
              setPresetName('');
            }}
            style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cancel rename"
          >
            <Text style={styles.filterLabel}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
      {presets.map((preset) => (
        <View key={preset.name} style={styles.presetItem}>
          <Pressable
            onPress={() => void onLoadPreset(preset)}
            style={({ pressed }) => [styles.presetNameZone, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Load preset ${preset.name}`}
          >
            <Text style={styles.presetName} numberOfLines={1}>
              {preset.name}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onDuplicatePreset(preset)}
            style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Duplicate preset ${preset.name}`}
          >
            <Ionicons name="copy-outline" size={14} color={withAlpha(colors.white, 0.7)} />
          </Pressable>
          <Pressable
            onPress={() => {
              setRenameFrom(preset.name);
              setPresetName(preset.name);
            }}
            style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Rename preset ${preset.name}`}
          >
            <Ionicons name="pencil-outline" size={14} color={withAlpha(colors.white, 0.7)} />
          </Pressable>
          <Pressable
            onPress={() => void onDeletePreset(preset)}
            style={({ pressed }) => [styles.resetToken, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Delete preset ${preset.name}`}
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
          </Pressable>
        </View>
      ))}
      {presetNotice ? <Text style={styles.notice}>{presetNotice}</Text> : null}
    </View>
  );

  const renderExportPage = () => (
    <View style={styles.page}>
      {renderBackRow()}
      <Text style={styles.sectionLabel}>Export — modified values</Text>
      <View style={styles.filterRow}>
        <Pressable
          onPress={onShareExport}
          style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Share the modified values as JSON"
        >
          <Text style={styles.filterLabel}>Share</Text>
        </Pressable>
      </View>
      <Text selectable style={styles.json}>
        {exportJson}
      </Text>
    </View>
  );

  const renderImportPage = () => (
    <View style={styles.page}>
      {renderBackRow()}
      <Text style={styles.sectionLabel}>Import</Text>
      <TextInput
        value={importDraft}
        onChangeText={(text) => {
          setImportDraft(text);
          setImportError(null);
        }}
        placeholder="Paste an export or a raw override object"
        placeholderTextColor={withAlpha(colors.white, 0.4)}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.jsonInput}
        accessibilityLabel="Import JSON"
      />
      {importError ? <Text style={styles.hexError}>{importError}</Text> : null}
      {importDropped ? (
        <Text style={styles.notice}>
          {importDropped.length ? `Dropped: ${importDropped.join(', ')}` : 'Imported clean'}
        </Text>
      ) : null}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => void onImport()}
          style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Apply the pasted JSON"
        >
          <Text style={styles.filterLabel}>Apply import</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderRawPage = () => (
    <View style={styles.page}>
      {renderBackRow()}
      <Text style={styles.sectionLabel}>Raw overrides</Text>
      <TextInput
        value={rawDraft ?? fullJson}
        onChangeText={(text) => {
          setRawDraft(text);
          setRawError(null);
        }}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.jsonInput}
        accessibilityLabel="Raw override object"
      />
      {rawError ? <Text style={styles.hexError}>{rawError}</Text> : null}
      {rawDropped ? (
        <Text style={styles.notice}>
          {rawDropped.length ? `Dropped: ${rawDropped.join(', ')}` : 'Applied clean'}
        </Text>
      ) : null}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => void onApplyRaw()}
          style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Apply the raw override object"
        >
          <Text style={styles.filterLabel}>Apply raw</Text>
        </Pressable>
        {rawDraft != null ? (
          <Pressable
            onPress={() => {
              setRawDraft(null);
              setRawError(null);
            }}
            style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Discard raw edits"
          >
            <Text style={styles.filterLabel}>Discard</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderBody = () => {
    if (page === 'overflow') return renderOverflowList();
    if (page === 'presets') return renderPresetsPage();
    if (page === 'export') return renderExportPage();
    if (page === 'import') return renderImportPage();
    if (page === 'raw') return renderRawPage();
    return (
      <>
        {renderPinned()}
        {STUDIO_CATEGORIES.map(renderCategory)}
      </>
    );
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        style={[
          styles.panel,
          { left: rect.x, top: rect.y, width: panelWidth, height: rect.height },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.dragZone} {...drag.panHandlers}>
            <View style={styles.grip} />
            <Text style={styles.title}>Design studio</Text>
          </View>
          <Pressable
            onPress={() => setPage(page ? null : 'overflow')}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: page != null }}
            accessibilityLabel="More studio actions"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={16}
              color={page ? colors.gold : withAlpha(colors.white, 0.75)}
            />
          </Pressable>
          <View
            style={styles.headerAction}
            {...resize.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Resize the design studio"
          >
            <Ionicons name="resize-outline" size={16} color={withAlpha(colors.white, 0.75)} />
          </View>
          <Pressable
            onPress={() => setCollapsed(true)}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Collapse the design studio"
          >
            <Ionicons name="chevron-down" size={16} color={withAlpha(colors.white, 0.75)} />
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

        {/* S3 (D4) — ROW 2, and it holds four controls: undo, redo, the ONE
            tier toggle (tap flips it) and the Modified filter. */}
        <View style={styles.toolbar}>
          <View style={styles.filterRow}>
            <Pressable
              onPress={undoDesignChange}
              disabled={history.undo === 0}
              style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Undo, ${history.undo} steps available`}
            >
              <Ionicons
                name="arrow-undo-outline"
                size={13}
                color={history.undo ? colors.white : withAlpha(colors.white, 0.25)}
              />
            </Pressable>
            <Pressable
              onPress={redoDesignChange}
              disabled={history.redo === 0}
              style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Redo, ${history.redo} steps available`}
            >
              <Ionicons
                name="arrow-redo-outline"
                size={13}
                color={history.redo ? colors.white : withAlpha(colors.white, 0.25)}
              />
            </Pressable>
            <Pressable
              onPress={() => setTier(tier === 'simple' ? 'advanced' : 'simple')}
              style={({ pressed }) => [
                styles.filterChip,
                tier === 'advanced' && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Showing ${tier} controls — tap to switch`}
            >
              <Text
                style={[styles.filterLabel, tier === 'advanced' && styles.filterLabelActive]}
                numberOfLines={1}
              >
                {tier === 'advanced' ? 'Advanced' : 'Simple'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setModifiedOnly(!modifiedOnly)}
              style={({ pressed }) => [
                styles.filterChip,
                modifiedOnly && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: modifiedOnly }}
            >
              <Text
                style={[styles.filterLabel, modifiedOnly && styles.filterLabelActive]}
                numberOfLines={1}
              >
                Modified
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          onScroll={(event) => {
            panelSession.scrollY = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={64}
          onLayout={() => {
            // Restoring from the collapse pill: put the list back where it was.
            scrollRef.current?.scrollTo({ y: panelSession.scrollY, animated: false });
          }}
        >
          {renderBody()}
        </ScrollView>
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    // A plain solid dark card in BOTH themes — never glass, never the palette
    // surface it might itself be tuning. Position and size arrive at render
    // from the clamped rect.
    panel: {
      position: 'absolute',
      backgroundColor: colors.black,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.18),
    },
    collapsedPill: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: colors.black,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.18),
    },
    collapsedBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
    },
    collapsedLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
      flexShrink: 1,
    },
    // S3 (D4) — the header and the toolbar together must stay under 84pt, so
    // the studio spends its height on dials rather than on chrome: this box
    // is 8 + 30 + 8 = 46 and the toolbar's is 8 + 26 = 34.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.white, 0.12),
    },
    dragZone: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 30,
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
      minWidth: 34,
      minHeight: 30,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    headerActionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.75),
    },
    toolbar: {
      paddingHorizontal: 10,
      paddingTop: 8,
      gap: 6,
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
    // S3 (D5) — the overflow list and its pages, in the panel's own solid
    // vocabulary. Nothing here wears a shared popover or glass primitive.
    overflowList: {
      gap: 2,
    },
    overflowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.white, 0.1),
    },
    overflowLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
    },
    overflowDestructive: {
      color: colors.danger,
    },
    page: {
      gap: 6,
    },
    backRow: {
      minHeight: 34,
      justifyContent: 'center',
    },
    backLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.gold,
    },
    body: {
      flex: 1,
    },
    // S3 (D7/D13) — 10pt of panel side padding, so the content box at 393pt
    // is 373 and every cluster below is sized to fit inside it.
    bodyContent: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    },
    // ≤ 2pt between rows: this gap IS the row-to-row spacing, inside a
    // category and inside the Pinned section alike.
    category: {
      gap: 2,
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
    // S3 (D7) — a COMPACT row: ≤ 6pt of vertical padding, the label block
    // taking every remaining point on the left and an intrinsic-width
    // cluster on the right. No minHeight: the 30pt glyph buttons set the
    // row's height, and nothing reserves space it does not use.
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 3,
    },
    labelBlock: {
      flex: 1,
      minWidth: 0,
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
      gap: 4,
    },
    // Tabular figures, sized by their own content — no reserved column.
    rowValue: {
      textAlign: 'right',
      paddingHorizontal: 2,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.white,
    },
    // S3 (D8) — the direct-entry field, in the value's own slot. minWidth
    // rather than width: an empty TextInput has no intrinsic size in RN, and
    // this floor applies only while the field is open — the resting row still
    // reserves nothing.
    directInput: {
      minWidth: 64,
      height: 28,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.gold,
      color: colors.white,
      paddingHorizontal: 6,
      paddingVertical: 0,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    /** D8: the unit sits OUTSIDE the field, so only a number is ever typed. */
    unit: {
      fontSize: 11,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.55),
    },
    step: {
      width: 30,
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
    editGlyph: {
      color: withAlpha(colors.white, 0.7),
    },
    cycle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    cycleValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
    },
    // S3 (D9) — a colour row's line 1. The cluster flexes so the hex input
    // between the swatch and the row's [↺] can too.
    colorEditor: {
      flex: 1,
      minWidth: 0,
    },
    colorEditorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    swatch: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.4),
    },
    hexInput: {
      flex: 1,
      minWidth: 0,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      color: colors.white,
      paddingHorizontal: 6,
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
    hslBlock: {
      gap: 2,
    },
    // S3 (D9) — line 2: H / S / L (and A where alpha exists) on ONE tight
    // line, 4pt between steppers, NO WRAP. Each stepper shrinks before the
    // line could ever overflow the 373pt content box.
    hslRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    miniStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flexShrink: 1,
      minWidth: 0,
    },
    miniLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: withAlpha(colors.white, 0.55),
    },
    miniStep: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    miniGlyph: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    miniValue: {
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.white,
      flexShrink: 1,
    },
    contrast: {
      fontSize: 10,
      color: withAlpha(colors.white, 0.6),
    },
    contrastLow: {
      color: colors.danger,
    },
    resetToken: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // S3 (D6) — the long-press pin chip, drawn where the reset glyph sits.
    pinChip: {
      height: 26,
      paddingHorizontal: 8,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinChipLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.gold,
    },
    // The two lines a row IS allowed to wrap on (D7/D13) — kept indented
    // just enough to read as belonging to the row above them.
    modifiedTrail: {
      fontSize: 10,
      color: colors.emerald,
      marginLeft: 4,
    },
    /** Quiet by design: it says where an untouched value came from, and must
     *  never compete with the emerald trail that says one was changed. */
    inheritTrail: {
      fontSize: 10,
      color: withAlpha(colors.white, 0.38),
      marginLeft: 4,
    },
    description: {
      fontSize: 11,
      lineHeight: 15,
      color: withAlpha(colors.white, 0.7),
      marginLeft: 4,
    },
    presetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    presetInput: {
      flex: 1,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      color: colors.white,
      paddingHorizontal: 8,
      paddingVertical: 0,
      fontSize: 12,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 32,
    },
    presetNameZone: {
      flex: 1,
    },
    presetName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
    },
    notice: {
      fontSize: 10,
      color: colors.emerald,
    },
    jsonInput: {
      minHeight: 72,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
      color: colors.white,
      padding: 8,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: STUDIO_MONO,
      textAlignVertical: 'top',
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
