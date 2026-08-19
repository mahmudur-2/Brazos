import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Sheet } from '../ui/primitives/Sheet';
import {
  DEFAULT_JOB_FILTERS,
  isDefaultJobFilters,
  type JobFilterModel,
  type JobSort,
} from '../lib/jobFilters';
import {
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  formatBudget,
  type JobCategory,
} from '../lib/jobs';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/** Preset budget floors — round numbers a worker actually thinks in. */
const MIN_BUDGET_PRESETS_CENTS = [2500, 5000, 10000] as const;

type JobFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The model currently applied to the list. */
  value: JobFilterModel;
  onApply: (model: JobFilterModel) => void;
  /** Offer the distance sort only when rows actually carry a distance. */
  distanceAvailable: boolean;
};

/**
 * Screen 50 — the worker job filters, as a sheet over whichever results list
 * opened it (list and map filter identically because both apply the same
 * lib/jobFilters model). Draft state is local: Cancel/dismiss changes
 * nothing, Apply hands the whole model back at once, Reset returns to the
 * defaults without closing so the effect is visible immediately on Apply.
 */
export function JobFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  distanceAvailable,
}: JobFilterSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [draft, setDraft] = useState<JobFilterModel>(value);

  // Re-seed the draft each time the sheet opens with what is actually applied.
  useEffect(() => {
    if (visible) setDraft({ ...value, categories: new Set(value.categories) });
  }, [visible, value]);

  function toggleCategory(category: JobCategory) {
    setDraft((prev) => {
      const next = new Set(prev.categories);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { ...prev, categories: next };
    });
  }

  const sortOptions: { value: JobSort; label: string }[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'pay', label: 'Highest budget' },
    ...(distanceAvailable ? [{ value: 'distance' as JobSort, label: 'Closest first' }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter jobs">
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>CATEGORIES</Text>
        <View style={styles.chipWrap}>
          {JOB_CATEGORIES.map((category) => {
            const active = draft.categories.has(category);
            return (
              <Pressable
                key={category}
                style={[styles.chip, isDark && styles.chipDark, active && styles.chipActive]}
                onPress={() => toggleCategory(category)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, isDark && styles.chipTextDark, active && styles.chipTextActive]}>
                  {JOB_CATEGORY_LABELS[category]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Nothing selected means every category.</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>MINIMUM BUDGET</Text>
        <View style={styles.chipWrap}>
          {MIN_BUDGET_PRESETS_CENTS.map((cents) => {
            const active = draft.minBudgetCents === cents;
            return (
              <Pressable
                key={cents}
                style={[styles.chip, isDark && styles.chipDark, active && styles.chipActive]}
                onPress={() =>
                  setDraft((prev) => ({
                    ...prev,
                    minBudgetCents: active ? null : cents,
                  }))
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, isDark && styles.chipTextDark, active && styles.chipTextActive]}>
                  {formatBudget(cents)}+
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Jobs with no stated budget always stay visible — that’s an open
          negotiation, not a low one.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, isDark && styles.sectionLabelDark]}>SORT</Text>
        {sortOptions.map((option) => {
          const active = draft.sort === option.value;
          return (
            <Pressable
              key={option.value}
              style={styles.sortRow}
              onPress={() => setDraft((prev) => ({ ...prev, sort: option.value }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              {/* Gold in both radio states under dark (master 11); light keeps
                  the Heritage emerald-when-chosen. */}
              <View style={[styles.radio, isDark ? styles.radioDark : active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={[styles.sortLabel, isDark && styles.sortLabelDark, active && styles.sortLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          title="Reset"
          variant="secondary"
          onPress={() =>
            setDraft({ ...DEFAULT_JOB_FILTERS, categories: new Set<JobCategory>() })
          }
          disabled={isDefaultJobFilters(draft)}
          style={styles.actionButton}
        />
        <Button
          title="Show jobs"
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          style={styles.actionButton}
        />
      </View>
    </Sheet>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  // Master 11: each section is a gold small-caps eyebrow; light keeps muted.
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  sectionLabelDark: { color: colors.gold, letterSpacing: 1.4 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  // Unselected pills are gold line-work with a cream label (master 11);
  // selected keeps the sage fill so the two states stay obviously different.
  chipDark: {
    borderColor: colors.gold,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextDark: { color: colors.ink },
  chipTextActive: {
    color: colors.emerald,
  },
  hint: {
    fontSize: 12,
    color: colors.textSubtle,
    lineHeight: 17,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Master 11's radio: a gold ring in EVERY state, gold-filled when chosen.
  // The ring is what makes the row read as a radio at all, so unlike the
  // chips it does not go dim when unselected.
  radioDark: {
    borderColor: colors.gold,
  },
  radioActive: {
    borderColor: colors.emerald,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.emerald,
  },
  sortLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sortLabelDark: { color: colors.ink },
  sortLabelActive: {
    color: colors.ink,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  }),
);
