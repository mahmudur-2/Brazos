import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import {
  PickerPopover,
  POPOVER_VISIBLE_ROWS,
  type PickerOption,
  type PopoverAnchor,
} from './PickerPopover';
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
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * THE FILTERS SHEET — the approved design (docs/mockups/html/map-explore-
 * filters-{dark,light}.html, fifteen moments the operator walked on
 * 2026-09-19), over the app's ONE filter vocabulary (lib/jobFilters.ts).
 *
 * FIVE ROWS, each a row of pills: Distance (Any · 2 · 5 · 10 · 25 mi ·
 * Custom), Minimum budget (Any · $25 · $50 · $100 · $250 · Custom), When
 * (Any · Today · Tomorrow · This week · Custom), Categories (Best Match and
 * the eleven real categories under their short names), and Sort — one pill,
 * "Sort by <rule>", opening the five rules with the sentence each one
 * follows. A Custom pill opens a checkmark list (components/PickerPopover)
 * over the ruled values — never typed, generated in lib — and then WEARS the
 * value it picked ("35 mi", "$175", "Sep 27"), as ruled.
 *
 * THE DRAFT IS LOCAL until the sheet closes, and EVERY close applies it —
 * Done, the backdrop, "Show N jobs" — so a filter is never lost to the way
 * the sheet was dismissed; Reset clears the draft in place. The distance is
 * separate state on both surfaces that carry it (the one storage path,
 * lib/discoveryFilterStorage), so it arrives and leaves through its own
 * prop rather than joining the model.
 *
 * SELECTION HERE IS EMERALD, NOT GOLD — the one surface where the operator's
 * own mockup draws a chosen pill as an emerald tint under an emerald rim, in
 * both themes, and approved it that way; docs/DECISIONS.md 2026-09-19
 * records it as this sheet's exception to emerald D6. Only colours fork
 * between the themes; every number is shared.
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
  /** The worker's advertised categories — the Best Match pill. */
  skills?: ReadonlySet<JobCategory>;
  /** How many jobs the draft would show, for the button; null when that
   *  cannot be known without a new read (a changed radius, say). */
  countFor?: (draft: JobFilterModel, distance: DistanceFilterMiles | null) => number | null;
};

/** The five sorts as the sheet names them, with the rule each follows. */
export const JOB_SORT_LABELS: Record<JobSort, { label: string; hint: string }> = {
  smart: { label: 'Smart Match', hint: 'Matches based on your skills' },
  newest: { label: 'Newest', hint: 'Soonest job date first, then newest posted' },
  pay: { label: 'Highest budget', hint: 'Best pay first' },
  distance: { label: 'Distance', hint: 'Least travel first' },
  bids: { label: 'Fewest bids', hint: 'Least competition, then closest' },
};

/** The sort popup: wider, and taller rows for the two-line entries. */
const SORT_POPOVER_WIDTH = 262;
const SORT_ROW_HEIGHT = 52;

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
  countFor,
}: JobFilterSheetProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [draft, setDraft] = useState<JobFilterModel>(value);
  const [draftDistance, setDraftDistance] = useState<DistanceFilterMiles | null>(distance?.value ?? null);
  const [popover, setPopover] = useState<{ kind: PopoverKind; anchor: PopoverAnchor } | null>(null);
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
  }));

  return (
    <Sheet visible={visible} onClose={applyAndClose} title="Filters" material="pane">
      {distance ? (
        <Section label="Distance" note={distance.available ? undefined : 'Location is off — the distance applies once it is on.'}>
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
              onPress={() => openPopover('distance', distanceRef)}
              accessibilityLabel="Custom distance"
            />
          </View>
        </Section>
      ) : null}

      <Section label="Minimum budget" note="Jobs with no budget set are always shown.">
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
            onPress={() => openPopover('budget', budgetRef)}
            accessibilityLabel="Custom minimum budget"
          />
        </View>
      </Section>

      <Section label="When">
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
            onPress={() => openPopover('date', dateRef)}
            accessibilityLabel="Custom date"
          />
        </View>
      </Section>

      <Section label="Categories" note="Nothing selected means every category." scroll>
        {skills && skills.size > 0 ? (
          <Pill
            label="Best Match"
            on={bestMatchOn}
            lead={<Ionicons name="checkmark" size={15} color={colors.emerald} />}
            onPress={() =>
              setDraft((prev) => ({
                ...prev,
                categories: bestMatchOn ? new Set<JobCategory>() : new Set(skills),
              }))
            }
            accessibilityLabel="Best Match — the categories in your skills"
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
            label={sortNow.label}
            on
            dimLead="Sort by"
            trailing={<Ionicons name="chevron-down" size={14} color={colors.emerald} />}
            onPress={() => openPopover('sort', sortRef)}
            accessibilityLabel={`Sort by ${sortNow.label}`}
          />
        </View>
      </Section>

      <View style={styles.actions}>
        <Pressable
          onPress={reset}
          disabled={isDefaultJobFilters(draft) && draftDistance === null}
          hitSlop={8}
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
        <Button title={showTitle} onPress={applyAndClose} style={styles.show} />
      </View>

      {/* The four popups — one at a time, over the sheet, anchored to the pill
          that opened them. Distance and Budget open downward; When and Sort
          sit low in the sheet and open upward, as the design draws them. */}
      <PickerPopover
        visible={popover?.kind === 'distance'}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
        options={distanceOptions}
        value={draftDistance ?? DISTANCE_FILTER_OPTIONS[1]}
        onSelect={setDraftDistance}
        accessibilityLabel="Custom distance, in miles"
      />
      <PickerPopover
        visible={popover?.kind === 'budget'}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
        options={budgetOptions}
        value={draft.minBudgetCents}
        onSelect={(cents) => setDraft((prev) => ({ ...prev, minBudgetCents: cents }))}
        accessibilityLabel="Custom minimum budget"
      />
      <PickerPopover
        visible={popover?.kind === 'date'}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
        options={dateOptions}
        value={dateIsPreset ? null : draft.scheduledOn}
        onSelect={(key) => setDraft((prev) => ({ ...prev, scheduledOn: key, scheduledUntil: null }))}
        direction="up"
        visibleRows={POPOVER_VISIBLE_ROWS - 1}
        accessibilityLabel="Custom date"
      />
      <PickerPopover
        visible={popover?.kind === 'sort'}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
        options={sortOptions}
        value={draft.sort}
        onSelect={(sort) => setDraft((prev) => ({ ...prev, sort }))}
        direction="up"
        align="left"
        width={SORT_POPOVER_WIDTH}
        rowHeight={SORT_ROW_HEIGHT}
        visibleRows={JOB_SORTS.length}
        accessibilityLabel="Sort by"
      />
    </Sheet>
  );
}

/** A row of the sheet: its eyebrow, its pills, and an optional note under them. */
function Section({
  label,
  note,
  scroll = false,
  children,
}: {
  label: string;
  note?: string;
  /** One horizontal row that scrolls (the categories), rather than a wrap. */
  scroll?: boolean;
  children: ReactNode;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollRow}
          contentContainerStyle={styles.scrollRowContent}
        >
          {children}
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
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Pressable
      onPress={onPress}
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
      {lead}
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
    section: {
      gap: spacing.sm + 2,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: colors.textMuted,
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
    note: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: -2,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      height: 34,
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
    pillWide: {
      minWidth: 55,
      justifyContent: 'center',
    },
    pillOn: {
      backgroundColor: colors.mint,
      borderColor: colors.secondaryBorder,
    },
    pillOnDark: {
      backgroundColor: withAlpha(colors.emerald, 0.16),
      borderColor: withAlpha(colors.emerald, 0.48),
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
      color: colors.emerald,
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
      gap: spacing.md,
      paddingTop: spacing.sm,
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
    },
  })
);
