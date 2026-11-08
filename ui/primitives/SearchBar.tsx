import { useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FocusRing } from '../../components/FocusRing';
import {
  controls,
  radius,
  spacing,
  wells,
  withAlpha,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { themedStyles, touchSlop, useThemeColors } from '../../lib/theme';
import { usePressFeedback } from '../../hooks/usePressFeedback';

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
 *
 * Lean D5 removed the voice-search mic; voice input lives only in Post a
 * job's DictationMic (lib/voiceSearch).
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
  /** Typing posture. The defaults are the terse keyword posture this field
   *  always had; sentence-style surfaces (worker search) pass 'sentences'
   *  plus autoCorrect so conversion changes nothing about their keyboards. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  /** Suppress the clear control — for a field whose design (the locked 48
   *  mirror) never rendered one. */
  disableClear?: boolean;
  /** Rendered inside the field after the clear control — the submit-arrow
   *  slot the converted screens keep. Absent by default. */
  trailing?: ReactNode;
  /** Omit the leading search glyph — for a field whose submit control draws
   *  the magnifier at its trailing end (customer Home's task card, 2026-09-18),
   *  where a second one in front of the input would be two. Default false:
   *  every other caller keeps the glyph exactly as it was. */
  disableLeadingIcon?: boolean;
  /**
   * 2026-09-20 — 'ink': the glyphs and the placeholder in the ink rather
   * than the muted greys — the approved Map design's field (its placeholder
   * at 0.94, a 24pt magnifier at 0.92), which the phone walk found too dim
   * against the map. Home keeps the default.
   */
  emphasis?: 'muted' | 'ink';
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
  autoCapitalize = 'none',
  autoCorrect = false,
  disableClear = false,
  trailing,
  disableLeadingIcon = false,
  emphasis = 'muted',
}: SearchBarProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // MOTION1 (C1): two controls live in this one primitive — the whole field
  // when it is a button, and the clear glyph — so two instances of the one
  // shared hook, never two copies of a spring.
  const press = usePressFeedback();
  const clearPress = usePressFeedback();

  // Focus drives the typing glow (the FocusRing below).
  const [inputFocused, setInputFocused] = useState(false);

  const ink = emphasis === 'ink';
  // The ink emphasis (the map's pill) draws its glyphs one point larger
  // since the pill grew to 62 (2026-09-20, sitting 2, (6)): 25 and 23.
  // 2026-09-28 (LUX-LIST-64 #15): every search field but the map's pill is the
  // Lux Home field — 22pt mint glyphs, 16pt text, 54 tall, 18 in, 12 between.
  const iconGlyphSize = ink ? 25 : 22;
  // 2026-09-27 (the operator's review, the Lux `.field svg{color:var(--acc)}`):
  // the magnifier is the mint in both themes; only the map's ink pill differs.
  const leadingInk = ink ? withAlpha(colors.ink, 0.92) : colors.emerald;
  // The Lux well under the field in dark (ui/tokens.ts `wells.field`); the
  // map's ink pill and light keep their own fill.
  const well = isDark && !ink ? styles.fieldDark : null;
  const placeholderInk = ink ? withAlpha(colors.ink, 0.94) : colors.muted;
  if (onPress) {
    return (
      <Animated.View style={press.style}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.field, !ink && styles.fieldLux, well, pressed && styles.pressed, style]}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
      >
        {/* Masters 43 and 44 draw the search glyph cream, not gold (master 1's
            gold glyph is that screen's own gold-heavy treatment); light keeps
            its Heritage emerald. */}
        {disableLeadingIcon ? null : (
          <Ionicons
            name="search"
            size={iconGlyphSize}
            color={leadingInk}
          />
        )}
        {/* Plain Text, not a disabled TextInput: a disabled input stays
            focusable on some platforms and reads as broken rather than as a
            button. */}
        <Text
          style={[styles.value, !ink && styles.textLux, !value && styles.placeholder, !value && { color: placeholderInk }]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.field, !ink && styles.fieldLux, well, style]}>
      {disableLeadingIcon ? null : (
        <Ionicons
          name="search"
          size={iconGlyphSize}
          color={leadingInk}
        />
      )}
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={[styles.input, !ink && styles.textLux]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderInk}
        onSubmitEditing={onSubmit}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 && !disableClear ? (
        // The wrapper carries the slop too: on the New Architecture a view its
        // child does not overflow hit-tests as clipped (components/PressScale.shared.tsx).
        <Animated.View style={clearPress.style} hitSlop={touchSlop(18, 18)}>
          <Pressable
            onPress={() => onChangeText('')}
            onPressIn={clearPress.onPressIn}
            onPressOut={clearPress.onPressOut}
            // The glyph is small; the hit area is not.
            hitSlop={touchSlop(18, 18)}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.navInactive} />
          </Pressable>
        </Animated.View>
      ) : null}
      {trailing}
      {/* #8: the glow while typing — never on the map's pill (pinned). */}
      {ink ? null : <FocusRing focused={inputFocused} color={colors.emerald} radius={radius.pill} />}
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
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
  // 2026-09-28 (LUX-LIST-64 #15): the Lux `.field` — height 54, radius 27 (the
  // pill), padding 0 18, gap 12.
  fieldLux: {
    minHeight: 54,
    paddingHorizontal: 18,
    gap: 12,
  },
  textLux: {
    fontSize: 16,
  },
  // 2026-09-27 (the operator's review): the Lux `.field` well in dark — the
  // deep ink under the light rim (ui/tokens.ts `wells.field`).
  fieldDark: {
    backgroundColor: withAlpha(wells.field.ink, wells.field.inkAlpha),
    borderColor: withAlpha(wells.field.rim, wells.field.rimAlpha),
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
  }),
);
