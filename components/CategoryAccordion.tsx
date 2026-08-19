import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SKILL_CATEGORIES } from '../lib/skillCategories';
import {
  disabledControl,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

type CategoryAccordionProps = {
  selected: string[];
  onToggle: (key: string) => void;
  onAddCustom: (label: string) => void;
  onRemoveCustom: (key: string) => void;
};

const KNOWN_KEYS = new Set(SKILL_CATEGORIES.map((c) => c.key));

/**
 * Multi-select category picker as an inline expandable list rather than a
 * flat chip wall — 10 fixed categories plus free-typed "Other" entries stay
 * readable instead of wrapping into a dense grid. Deliberately a plain
 * collapsible View, not a Modal — this sits inside ProfileScreen's own
 * edit form, so a nested Modal here would risk the same kind of touch/
 * stacking bug that broke PortfolioPicker's close button.
 */
export function CategoryAccordion({
  selected,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: CategoryAccordionProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [expanded, setExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const customSelected = selected.filter((c) => !KNOWN_KEYS.has(c));

  function submitCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    onAddCustom(trimmed);
    setCustomInput('');
  }

  return (
    <View>
      <Pressable
        style={styles.summaryRow}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
      >
        <Text style={styles.summaryText}>
          {selected.length > 0
            ? `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'} selected`
            : 'Select categories'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {SKILL_CATEGORIES.map((c) => {
            const isSelected = selected.includes(c.key);
            return (
              <Pressable
                key={c.key}
                style={styles.row}
                onPress={() => onToggle(c.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <Ionicons name={c.icon} size={18} color={colors.textMuted} />
                <Text style={styles.rowLabel}>{c.label}</Text>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={isSelected ? colors.primary : colors.textSubtle}
                />
              </Pressable>
            );
          })}

          {customSelected.map((key) => (
            <View key={key} style={styles.row}>
              <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
              <Text style={styles.rowLabel}>{key}</Text>
              <Pressable
                onPress={() => onRemoveCustom(key)}
                hitSlop={8}
                accessibilityLabel={`Remove ${key}`}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
              </Pressable>
            </View>
          ))}

          <View style={styles.otherRow}>
            <TextInput
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={styles.otherInput}
              value={customInput}
              onChangeText={setCustomInput}
              placeholder="Other (type a category)"
              placeholderTextColor={colors.textSubtle}
              onSubmitEditing={submitCustom}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.otherAddBtn, !customInput.trim() && styles.otherAddBtnDisabled]}
              onPress={submitCustom}
              disabled={!customInput.trim()}
              accessibilityLabel="Add custom category"
            >
              <Ionicons name="add" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  list: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  otherInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  otherAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // emerald D7: decision 3's flat neutral fill, not an opacity dim over the
  // conversion green — a dead control must not read as a paler live one.
  otherAddBtnDisabled: {
    backgroundColor: disabledControl(colors).backgroundColor,
  },
  }),
);
