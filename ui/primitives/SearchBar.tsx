import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, controls, radius, spacing, type as typeScale } from '../tokens';

/**
 * The shared search field (§I).
 *
 * Deliberately state-agnostic: it takes `value`/`onChangeText` and owns no
 * query state itself, because every screen that searches already owns that
 * state (and often a debounce, or a resolved location alongside it). A search
 * bar holding its own copy would fight them.
 *
 * Passing `onPress` renders the same shape as a button instead of an input —
 * the Home-screen case, where the field is an affordance that pushes a
 * dedicated search route rather than something you type into in place.
 */

type SearchBarProps = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Fired on keyboard submit. Search-as-you-type screens can omit it. */
  onSubmit?: () => void;
  /** Render as a button that navigates, rather than an editable input. */
  onPress?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  onPress,
  autoFocus = false,
  style,
  accessibilityLabel,
}: SearchBarProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.pressed, style]}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
      >
        <Ionicons name="search" size={18} color={colors.emerald} />
        {/* Plain Text, not a disabled TextInput: a disabled input stays
            focusable on some platforms and reads as broken rather than as a
            button. */}
        <Text
          style={[styles.value, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.field, style]}>
      <Ionicons name="search" size={18} color={colors.emerald} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          // The glyph is small; the hit area is not.
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.navInactive} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: controls.fieldHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.9,
  },
  input: {
    flex: 1,
    ...typeScale.body,
    color: colors.ink,
    // Height comes from the row. Letting the input size itself makes Android
    // add its own vertical padding and the pill grow.
    paddingVertical: 0,
  },
  value: {
    flex: 1,
    ...typeScale.body,
    color: colors.ink,
  },
  placeholder: {
    color: colors.muted,
  },
});
