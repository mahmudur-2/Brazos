import { Children, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { ChipCheck } from './ChipCheck';
import {
  PickerPopover,
  POPOVER_ROW_HEIGHT,
  POPOVER_VISIBLE_ROWS,
  POPOVER_WIDTH,
  type PickerOption,
  type PopoverAnchor,
} from './PickerPopover';
import { useMaterials } from '../lib/designOverrides';
import type { WorkerSkillsState } from '../lib/workerSkills';
import { Sheet } from '../ui/primitives/Sheet';
import {
  BUDGET_CUSTOM_VALUES_CENTS,
  BUDGET_FILTER_PRESETS_CENTS,
  DEFAULT_JOB_FILTERS,
  JOB_SORTS,
  customDateKeys,
  dateWindowPreset,
  isDefaultJobFilters,
  type JobFilterModel,
  type JobSort,
} from '../lib/jobFilters';
import {
  DISTANCE_CUSTOM_VALUES,
  DISTANCE_FILTER_OPTIONS,
  distanceChipLabel,
  type DistanceFilterMiles,
} from '../lib/discoveryFilter';
import {
  JOB_CATEGORY_CHIP_LABELS,
  JOB_CATEGORY_CHIP_ORDER,
  formatBudget,
  type JobCategory,
} from '../lib/jobs';
import {
  EYEBROW_TYPE,
  paneEdges,
  paneFills,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  textLine,
  touchSlop,
} from '../lib/theme';
import { PalettePinContext } from '../hooks/useThemeColors';

/** The design's sheet: 28pt top corners, and its sage hairline in dark (the
 *  pane rim's own mint) where every other sheet draws `line` — 0.20 since
 *  recipe "D" (2026-09-20, sitting 2). The rim rings the TOP EDGE ONLY: the
 *  operator read the side rims and the bottom rim as excess on a docked
 *  sheet (docs/DECISIONS.md that date, (2)). */
const SHEET_TOP_RADIUS = 28;
const SHEET_HAIRLINE_ALPHA = 0.2;
const SHEET_EDGE = 'top' as const;
/** A filter pill's drawn height; fix run E3 lifts its touch area to 44 with touchSlop. */
const PILL_HEIGHT = 34;

/**
 * THE FILTERS SHEET — the approved design (docs/mockups/html/map-explore-
 * filters-{dark,light}.html, fifteen moments the operator walked on
 * 2026-09-19), over the app's ONE filter vocabulary (lib/jobFilters.ts).
 *
 * FIVE ROWS, each a row of pills: Distance (Any · 2 · 5 · 10 · 25 mi ·
 * Custom), Minimum budget (Any · $25 · $50 · $100 · $250 · Custom), When
 * (Any · Today · Tomorrow · This week · Custom), Categories (My skills and
 * the eleven real categories under their short names), and Sort — one pill,
 * "Sort by <rule>", opening the five rules with the sentence each one
 * follows. A Custom pill opens a checkmark list (components/PickerPopover)
 * over the ruled values — never typed, generated in lib — and then WEARS the
 * value it picked ("35 mi", "$175", "Sep 27"), as ruled. ONE popup, rendered
 * into the Sheet's overlay and fed the list of whichever pill opened it —
 * four popups in four nested Modals was the 2026-09-19 build, and the phone
 * walk found the first one's list under every pill (see PickerPopover).
 *
 * THE DRAFT IS LOCAL until the sheet closes. Done and "Show N jobs" apply
 * it; Reset clears the draft in place. 2026-09-28 (LUX-LIST-64 #64, audit
 * M-25) — THE ONE BEND of the 2026-09-19 "every close applies" ruling, the
 * operator's: a CANCEL on the header's left throws the draft away, so a look
 * can be backed out of; with it, the backdrop and Android's back mean Cancel
 * (the one sheet header, ui/primitives/SheetHeader.tsx). The distance is
 * separate state on both surfaces that carry it (the one storage path,
 * lib/discoveryFilterStorage), so it arrives and leaves through its own
 * prop rather than joining the model.
 *
 * SELECTION HERE IS EMERALD, NOT GOLD — the one surface where the operator's
 * own mockup draws a chosen pill as an emerald tint under an emerald rim, in
 * both themes, and approved it that way; docs/DECISIONS.md 2026-09-19
 * records it as this sheet's exception to emerald D6. Only colours fork
 * between the themes; every number is shared. 2026-09-21: the chosen green
 * is `emeraldBright` — the mockup's #84dfaa in dark, the emerald in light —
 * where `emerald` (#5FAE81 in dark) read "very dim" at the same alphas.
 *
 * THE SHEET'S TINT IS THE MOCKUP'S GRADIENT (2026-09-21): `paneFills.filters`,
 * drawn by Surface as the tint itself in place of the pane's flat ink and
 * its near-white sheen — the sheen is what lifted the sheet grey-olive on
 * the phone. This sheet alone; the map's panes keep recipe D.
 */

export type JobFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: JobFilterModel;
  onApply: (model: JobFilterModel) => void;
  /** The Distance row. Absent on a surface with no radius to set. */
  distance?: {
    value: DistanceFilterMiles | null;
    onChange: (next: DistanceFilterMiles | null) => void;
    /** False when there is no position to measure from — the row still
     *  sets the radius (it persists), and a note says it waits on location. */
    available: boolean;
  };
  /** Whether the rows this sheet filters carry a distance — the Distance
   *  SORT is offered inert, with its reason, when they do not. */
  distanceAvailable: boolean;
  /** The worker's advertised categories — the My skills pill. */
  skills?: ReadonlySet<JobCategory>;
  /**
   * 2026-09-20 (sitting 2) — WHY the skills may be empty, so the Categories
   * note can say so: still loading, the profile read failed, or genuinely
   * nothing picked. Absent: treated as ready (the sheet's older callers).
   */
  skillsState?: WorkerSkillsState;
  /** How many jobs the draft would show, for the button; null when that
   *  cannot be known without a new read (a changed radius, say). */
  countFor?: (draft: JobFilterModel, distance: DistanceFilterMiles | null) => number | null;
};

/** The six sorts as the sheet names them, with the rule each follows.
 *  `pill` is what the Sort pill wears once that sort is picked, when it is
 *  not the row's own label; `muted` draws the row grey — the Reset row
 *  (2026-09-20 sitting 3, DECISIONS (7)): "Sort by Latest added", asked. */
export const JOB_SORT_LABELS: Record<JobSort, { label: string; hint: string; pill?: string; muted?: boolean }> = {
  smart: { label: 'Smart Match', hint: 'Matches based on your skills' },
  newest: { label: 'Newest', hint: 'Earliest jobs first' },
  pay: { label: 'Highest budget', hint: 'Best pay first' },
  distance: { label: 'Distance', hint: 'Least travel first' },
  bids: { label: 'Fewest bids', hint: 'Least competition, then closest' },
  reset: { label: 'Reset', hint: 'Latest added first', pill: 'Latest added', muted: true },
};

/** The sort popup: wider, and taller rows for the two-line entries. */
const SORT_POPOVER_WIDTH = 262;
const SORT_ROW_HEIGHT = 52;
/** The date popup: 192 (the others 168) so "Wed, Sep 23" and its calendar
 *  sit ≥ 10pt clear of the tick when centred — measured in the reference
 *  (docs/mockups/html/map-explore-filters-*.html), 2026-09-21. */
const DATE_POPOVER_WIDTH = 192;

type PopoverKind = 'distance' | 'budget' | 'date' | 'sort';

/** 'YYYY-MM-DD' → a Date in the local calendar, or null for a bad key. */
function dateOfKey(key: string): Date | null {
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
/** "Sep 27" — the Custom pill's label. */
function shortDate(key: string): string {
  return dateOfKey(key)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? key;
}
/** "Sat, Sep 27" — the popup's rows. */
function longDate(key: string): string {
  return (
    dateOfKey(key)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) ?? key
  );
}

export function JobFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  distance,
  distanceAvailable,
  skills,
  skillsState = 'ready',
  countFor,
}: JobFilterSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const paneRim = useMaterials().pane.borderColor;
  const [draft, setDraft] = useState<JobFilterModel>(value);
  const [draftDistance, setDraftDistance] = useState<DistanceFilterMiles | null>(distance?.value ?? null);
  const [popover, setPopover] = useState<{ kind: PopoverKind; anchor: PopoverAnchor } | null>(null);
  // The last kind opened, kept through the popup's exit fade so the panel
  // that is fading out still shows the list it opened with.
  const lastKindRef = useRef<PopoverKind>('distance');
  if (popover) lastKindRef.current = popover.kind;
  const distanceRef = useRef<View>(null);
  const budgetRef = useRef<View>(null);
  const dateRef = useRef<View>(null);
  const sortRef = useRef<View>(null);
  const now = new Date();

  useEffect(() => {
    if (!visible) return;
    setDraft({ ...value, categories: new Set(value.categories) });
    setDraftDistance(distance?.value ?? null);
    setPopover(null);
  }, [visible, value, distance?.value]);

  function applyAndClose() {
    setPopover(null);
    onApply(draft);
    if (distance && draftDistance !== distance.value) distance.onChange(draftDistance);
    onClose();
  }

  // #64 — Cancel: close and keep what was applied (the draft re-seeds from it on
  // the next open).
  function discardAndClose() {
    setPopover(null);
    onClose();
  }

  function reset() {
    setDraft({ ...DEFAULT_JOB_FILTERS, categories: new Set<JobCategory>() });
    setDraftDistance(null);
  }

  function openPopover(kind: PopoverKind, ref: RefObject<View | null>) {
    ref.current?.measureInWindow((x, y, width, height) => {
      setPopover({ kind, anchor: { x, y, width, height } });
    });
  }

  // --- the rows' selection facts, each read from the draft, never stored twice.
  const distanceIsPreset =
    draftDistance === null || (DISTANCE_FILTER_OPTIONS as readonly number[]).includes(draftDistance);
  const budgetIsPreset =
    draft.minBudgetCents === null || BUDGET_FILTER_PRESETS_CENTS.includes(draft.minBudgetCents);
  const windows = {
    today: dateWindowPreset('today', now),
    tomorrow: dateWindowPreset('tomorrow', now),
    week: dateWindowPreset('week', now),
  };
  const isWindow = (w: { scheduledOn: string; scheduledUntil: string | null }) =>
    draft.scheduledOn === w.scheduledOn && draft.scheduledUntil === w.scheduledUntil;
  const dateIsPreset =
    draft.scheduledOn === null || isWindow(windows.today) || isWindow(windows.tomorrow) || isWindow(windows.week);
  const dateKeys = customDateKeys(now);
  const bestMatchOn =
    !!skills &&
    skills.size > 0 &&
    draft.categories.size === skills.size &&
    [...skills].every((category) => draft.categories.has(category));

  function toggleCategory(category: JobCategory) {
    setDraft((prev) => {
      const next = new Set(prev.categories);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { ...prev, categories: next };
    });
  }

  const count = countFor ? countFor(draft, draftDistance) : null;
  const showTitle = count === null ? 'Show jobs' : `Show ${count} ${count === 1 ? 'job' : 'jobs'}`;
  const sortNow = JOB_SORT_LABELS[draft.sort];

  // --- the popups' option lists, from the ruled values in lib.
  const distanceOptions: PickerOption<number>[] = DISTANCE_CUSTOM_VALUES.map((miles) => ({
    value: miles,
    label: distanceChipLabel(miles),
  }));
  const budgetOptions: PickerOption<number>[] = BUDGET_CUSTOM_VALUES_CENTS.map((cents) => ({
    value: cents,
    label: formatBudget(cents),
  }));
  const dateOptions: PickerOption<string>[] = dateKeys.map((key) => ({
    value: key,
    label: longDate(key),
    dayNumber: dateOfKey(key)?.getDate(),
  }));
  const sortOptions: PickerOption<JobSort>[] = JOB_SORTS.map((sort) => ({
    value: sort,
    label: JOB_SORT_LABELS[sort].label,
    hint:
      sort === 'distance' && !distanceAvailable
        ? 'Needs your location to measure'
        : JOB_SORT_LABELS[sort].hint,
    disabled: sort === 'distance' && !distanceAvailable,
    muted: JOB_SORT_LABELS[sort].muted,
  }));

  // THE ONE POPUP: its list, its tick, its direction and shape all follow
  // the pill that opened it. Sort and When sit low in the sheet and open
  // upward; Distance and Budget open downward.
  const openKind = popover?.kind ?? lastKindRef.current;
  const popup =
    openKind === 'distance'
      ? {
          options: distanceOptions as PickerOption<unknown>[],
          value: (draftDistance ?? DISTANCE_FILTER_OPTIONS[1]) as unknown,
          onSelect: (v: unknown) => setDraftDistance(v as number),
          direction: 'down' as const,
          align: 'right' as const,
          width: POPOVER_WIDTH,
          rowHeight: POPOVER_ROW_HEIGHT,
          visibleRows: POPOVER_VISIBLE_ROWS,
          accessibilityLabel: 'Custom distance, in miles',
        }
      : openKind === 'budget'
        ? {
            options: budgetOptions as PickerOption<unknown>[],
            value: draft.minBudgetCents as unknown,
            onSelect: (v: unknown) => setDraft((prev) => ({ ...prev, minBudgetCents: v as number })),
            direction: 'down' as const,
            align: 'right' as const,
            width: POPOVER_WIDTH,
            rowHeight: POPOVER_ROW_HEIGHT,
            visibleRows: POPOVER_VISIBLE_ROWS,
            accessibilityLabel: 'Custom minimum budget',
          }
        : openKind === 'date'
          ? {
              options: dateOptions as PickerOption<unknown>[],
              value: (dateIsPreset ? null : draft.scheduledOn) as unknown,
              onSelect: (v: unknown) =>
                setDraft((prev) => ({ ...prev, scheduledOn: v as string, scheduledUntil: null })),
              direction: 'up' as const,
              align: 'right' as const,
              width: DATE_POPOVER_WIDTH,
              rowHeight: POPOVER_ROW_HEIGHT,
              visibleRows: POPOVER_VISIBLE_ROWS - 1,
              accessibilityLabel: 'Custom date',
            }
          : {
              options: sortOptions as PickerOption<unknown>[],
              value: draft.sort as unknown,
              onSelect: (v: unknown) => setDraft((prev) => ({ ...prev, sort: v as JobSort })),
              direction: 'up' as const,
              align: 'left' as const,
              width: SORT_POPOVER_WIDTH,
              rowHeight: SORT_ROW_HEIGHT,
              visibleRows: JOB_SORTS.length,
              // The two-line rows keep the left layout (operator, 2026-09-20 sitting 3).
              contentAlign: 'start' as const,
              accessibilityLabel: 'Sort by',
            };

  const actions = (
    <View style={styles.actions}>
      <Pressable
        onPress={reset}
        disabled={isDefaultJobFilters(draft) && draftDistance === null}
        hitSlop={touchSlop(textLine(styles.resetText))}
        style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Reset filters"
      >
        <Text
          style={[
            styles.resetText,
            isDefaultJobFilters(draft) && draftDistance === null && styles.resetTextDisabled,
          ]}
        >
          Reset
        </Text>
      </Pressable>
      {/* The mockup's capsule in the Post-a-job green (the operator's pick
          over the app's forest rectangle, 2026-09-20): the Button primitive,
          its shape and fill overridden and nothing else. */}
      <Button title={showTitle} onPress={applyAndClose} style={styles.show} />
    </View>
  );

  return (
    // 2026-09-27 (the Lux remake, ruling 2): the Filters sheet and its popups
    // keep today's colours — the whole subtree resolves the pinned palette.
    <PalettePinContext.Provider value="map">
    <Sheet
      visible={visible}
      onClose={applyAndClose}
      dismissWord="Done"
      onCancel={discardAndClose}
      title="Filters"
      material="pane"
      topRadius={SHEET_TOP_RADIUS}
      edge={SHEET_EDGE}
      rim={paneEdges.filters.rim}
      fill={paneFills.filters}
      hairline={isDark ? withAlpha(paneRim, SHEET_HAIRLINE_ALPHA) : undefined}
      footer={actions}
      overlay={
        <PickerPopover
          visible={popover !== null}
          anchor={popover?.anchor ?? null}
          onClose={() => setPopover(null)}
          {...popup}
        />
      }
    >
      <View style={styles.sections}>
        {distance ? (
          <Section label="Distance" fill note={distance.available ? undefined : 'Location is off — the distance applies once it is on.'}>
            <Pill label="Any" on={draftDistance === null} onPress={() => setDraftDistance(null)} wide />
            {DISTANCE_FILTER_OPTIONS.map((miles) => (
              <Pill
                key={miles}
                label={distanceChipLabel(miles)}
                on={draftDistance === miles}
                onPress={() => setDraftDistance(miles)}
              />
            ))}
            <View ref={distanceRef} collapsable={false}>
              <Pill
                label={distanceIsPreset ? 'Custom' : distanceChipLabel(draftDistance)}
                on={!distanceIsPreset || popover?.kind === 'distance'}
                check={!distanceIsPreset}
                onPress={() => openPopover('distance', distanceRef)}
                accessibilityLabel="Custom distance"
              />
            </View>
          </Section>
        ) : null}

        <Section label="Minimum budget" fill note="Jobs with no budget set are always shown.">
          <Pill
            label="Any"
            on={draft.minBudgetCents === null}
            onPress={() => setDraft((prev) => ({ ...prev, minBudgetCents: null }))}
            wide
          />
          {BUDGET_FILTER_PRESETS_CENTS.map((cents) => (
            <Pill
              key={cents}
              label={formatBudget(cents)}
              on={draft.minBudgetCents === cents}
              onPress={() => setDraft((prev) => ({ ...prev, minBudgetCents: cents }))}
            />
          ))}
          <View ref={budgetRef} collapsable={false}>
            <Pill
              label={budgetIsPreset ? 'Custom' : formatBudget(draft.minBudgetCents)}
              on={!budgetIsPreset || popover?.kind === 'budget'}
              check={!budgetIsPreset}
              onPress={() => openPopover('budget', budgetRef)}
              accessibilityLabel="Custom minimum budget"
            />
          </View>
        </Section>

        <Section label="When" fill>
          <Pill
            label="Any"
            on={draft.scheduledOn === null}
            onPress={() => setDraft((prev) => ({ ...prev, scheduledOn: null, scheduledUntil: null }))}
            wide
          />
          {(
            [
              ['Today', windows.today],
              ['Tomorrow', windows.tomorrow],
              ['This week', windows.week],
            ] as const
          ).map(([label, window]) => (
            <Pill
              key={label}
              label={label}
              on={isWindow(window)}
              onPress={() => setDraft((prev) => ({ ...prev, ...window }))}
            />
          ))}
          <View ref={dateRef} collapsable={false}>
            <Pill
              label={dateIsPreset || draft.scheduledOn === null ? 'Custom' : shortDate(draft.scheduledOn)}
              on={!dateIsPreset || popover?.kind === 'date'}
              check={!dateIsPreset}
              onPress={() => openPopover('date', dateRef)}
              accessibilityLabel="Custom date"
            />
          </View>
        </Section>

        <Section
          label="Categories"
          note={categoriesNote(skills, skillsState)}
          scroll
        >
          {skills && skills.size > 0 ? (
            <Pill
              // C6: "My skills", not "Best Match" — it selects your categories, and the
              // sort beside it is Smart Match; two "Match" names read as one thing.
              label="My skills"
              on={bestMatchOn}
              lead={<Ionicons name="checkmark" size={15} color={colors.emeraldBright} />}
              onPress={() =>
                setDraft((prev) => ({
                  ...prev,
                  categories: bestMatchOn ? new Set<JobCategory>() : new Set(skills),
                }))
              }
              accessibilityLabel="My skills — the categories in your skills"
            />
          ) : null}
          {JOB_CATEGORY_CHIP_ORDER.map((category) => (
            <Pill
              key={category}
              label={JOB_CATEGORY_CHIP_LABELS[category]}
              on={draft.categories.has(category)}
              onPress={() => toggleCategory(category)}
            />
          ))}
        </Section>

        <Section label="Sort">
          <View ref={sortRef} collapsable={false}>
            <Pill
              label={sortNow.pill ?? sortNow.label}
              on
              check={false}
              dimLead="Sort by"
              trailing={<Ionicons name="chevron-down" size={14} color={colors.emeraldBright} />}
              onPress={() => openPopover('sort', sortRef)}
              accessibilityLabel={`Sort by ${sortNow.label}`}
            />
          </View>
        </Section>

      </View>
    </Sheet>
    </PalettePinContext.Provider>
  );
}

/**
 * The Categories note. My skills present: the one line. Absent: the line
 * plus WHY — the phone walk (2026-09-20) showed "Pick job categories…" on an
 * account that had picked them, and a note that assumes the cause hides the
 * cause. Exported for the fence.
 */
export function categoriesNote(
  skills: ReadonlySet<JobCategory> | undefined,
  state: WorkerSkillsState
): string {
  const base = 'Nothing selected means every category.';
  if (skills && skills.size > 0) return base;
  if (state === 'loading') return `${base} Loading your profile…`;
  if (state === 'error') return `${base} Couldn't load your profile, so My skills is off for now.`;
  return `${base} Pick job categories on your profile to filter by your skills.`;
}

/** A row of the sheet: its eyebrow, its pills, and an optional note under them. */
function Section({
  label,
  note,
  scroll = false,
  fill = false,
  children,
}: {
  label: string;
  note?: string;
  /** One horizontal row that scrolls (the categories), rather than a wrap. */
  scroll?: boolean;
  /**
   * 2026-09-20 (sitting 2) — THE ROW FILLS ITS WIDTH: the same scrolling row,
   * whose content is at least as wide as the row, with every pill in a cell
   * that grows — each keeps its own label width and the spare room is shared
   * equally, so Distance, Minimum budget and When reach the right edge. Wider
   * than the row (a narrower phone, larger type) it scrolls sideways; it never
   * wraps and never shrinks a pill. The operator's "sized accordingly so it
   * fills up whole screen from side", one rule for the three rows.
   */
  fill?: boolean;
  children: ReactNode;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {scroll || fill ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollRow}
          contentContainerStyle={[styles.scrollRowContent, fill && styles.fillRowContent]}
        >
          {fill
            ? Children.map(children, (child) =>
                child == null ? null : <View style={styles.fillCell}>{child}</View>
              )
            : children}
        </ScrollView>
      ) : (
        <View style={styles.pillRow}>{children}</View>
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/**
 * The design's pill: 34pt, a capsule, the value in 13pt. Chosen, it takes
 * the emerald tint under the emerald rim in dark and the mint fill under the
 * sage rim in light — the one selected treatment this sheet draws.
 */
function Pill({
  label,
  on,
  onPress,
  wide = false,
  lead,
  trailing,
  dimLead,
  accessibilityLabel,
  check = true,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** The Any pills: at least as wide as "Today", centred. */
  wide?: boolean;
  lead?: ReactNode;
  trailing?: ReactNode;
  /** A muted word before the label ("Sort by"). */
  dimLead?: string;
  accessibilityLabel?: string;
  /** #35 — false where `on` is not a choice made (the Sort pill is always on;
   *  a Custom pill is lit while its list is open, before anything is picked). */
  check?: boolean;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // 2026-09-28 (LUX-LIST-64 #35): a chosen pill carries a small check at its
  // left — in place of its own lead glyph where it has one (no width change),
  // added where it has none, its slot gliding open (components/ChipCheck.tsx,
  // the motion boundary).
  const checked = on && check;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={touchSlop(PILL_HEIGHT)}
      style={({ pressed }) => [
        styles.pill,
        isDark && styles.pillDark,
        wide && styles.pillWide,
        on && (isDark ? styles.pillOnDark : styles.pillOn),
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {lead ? (
        checked ? <Ionicons name="checkmark" size={14} color={colors.emeraldBright} /> : lead
      ) : check ? (
        // The pill's own gap sits between its children and the slot carries its
        // own, so the pill's is taken back — the label never moves off its place.
        <View style={styles.checkSlot}>
          <ChipCheck shown={checked} size={14} color={colors.emeraldBright} />
        </View>
      ) : null}
      {dimLead ? <Text style={styles.pillDim}>{dimLead}</Text> : null}
      <Text style={[styles.pillText, isDark && styles.pillTextDark, on && styles.pillTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // The design's 16 between rows — one child of the sheet, so the sheet's
    // own 12 never applies between them.
    sections: {
      gap: spacing.lg,
    },
    section: {
      gap: spacing.sm + 2,
    },
    sectionLabel: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 1,
    },
    // The categories: one row, scrolling past the sheet's edge.
    scrollRow: {
      marginHorizontal: -spacing.lg,
    },
    scrollRowContent: {
      flexDirection: 'row',
      gap: spacing.xs + 1,
      paddingHorizontal: spacing.lg,
    },
    // A fill row: the content is never narrower than the row, and each cell
    // takes an equal share of what is left after every pill has its width.
    fillRowContent: {
      flexGrow: 1,
    },
    fillCell: {
      flexGrow: 1,
      flexBasis: 'auto',
    },
    note: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: -2,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      height: PILL_HEIGHT,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pillDark: {
      borderColor: colors.mint2,
      backgroundColor: withAlpha(colors.white, 0.045),
    },
    // #35 — the check's slot brings its own gap; this takes the pill's back.
    checkSlot: {
      marginRight: -(spacing.xs + 2),
    },
    pillWide: {
      minWidth: 55,
      justifyContent: 'center',
    },
    pillOn: {
      backgroundColor: colors.mint,
      borderColor: colors.secondaryBorder,
    },
    pillOnDark: {
      backgroundColor: withAlpha(colors.emeraldBright, 0.16),
      borderColor: withAlpha(colors.emeraldBright, 0.48),
    },
    pillText: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: -0.1,
      color: colors.ink,
    },
    pillTextDark: {
      color: colors.ink,
    },
    pillTextOn: {
      fontWeight: '600',
      color: colors.emeraldBright,
    },
    pillDim: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted,
    },
    pressed: {
      opacity: 0.85,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md + 2,
    },
    reset: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.xs + 2,
    },
    resetText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textMuted,
    },
    resetTextDisabled: {
      color: colors.textSubtle,
    },
    show: {
      flex: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.postPillGreen,
    },
  })
);
