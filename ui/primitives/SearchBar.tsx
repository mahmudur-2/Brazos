import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
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
import { glow, themedStyles, useThemeColors } from '../../lib/theme';
import { useOverrideNumber, useOverrideString } from '../../lib/designOverrides';
import { voiceSearch, type VoiceSession } from '../../lib/voiceSearch';
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
 * Voice search (4D-4 Block 2, tap-to-talk since 4D-4 device pass): a mic
 * rendered ONLY when lib/voiceSearch reports the on-device recognizer
 * available — on any other binary or platform it is simply absent (no error
 * state, no disabled ghost). The recognized phrase arrives through the SAME
 * `onChangeText` contract as typed text, so consumers need no change and
 * there is no second write path. One tap starts a bounded session; it ends on
 * silence, the boundary's 30s ceiling, a second tap, the screen blurring, the
 * app backgrounding, or unmount — the shape the iOS permission string
 * promises ("stops listening when you finish speaking"), enforced by the
 * boundary's session. `disableVoiceSearch` opts a call site out.
 *
 * While a session is live the field DISPLAYS the boundary's interim
 * transcript (4D-6) — presentation only, styled as provisional. Interims
 * never cross `onChangeText`: committing them would fire the consumer's
 * debounced query once per interim, so a three-second utterance would issue
 * a burst of searches. The parent's value is untouched until the one final
 * result commits, and a session that ends without one (cancel, ceiling)
 * snaps the field straight back to whatever the parent holds.
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
  /** Opt out of the tap-to-talk mic. Present by default when available. */
  disableVoiceSearch?: boolean;
  /** Typing posture. The defaults are the terse keyword posture this field
   *  always had; sentence-style surfaces (worker search) pass 'sentences'
   *  plus autoCorrect so conversion changes nothing about their keyboards. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  /** Suppress the clear control — for a field whose design (the locked 48
   *  mirror) never rendered one. */
  disableClear?: boolean;
  /** Rendered inside the field after the mic — the submit-arrow slot the
   *  converted screens keep. Absent by default. */
  trailing?: ReactNode;
  /** Omit the leading search glyph — for a field whose submit control draws
   *  the magnifier at its trailing end (customer Home's task card, 2026-09-18),
   *  where a second one in front of the input would be two. Default false:
   *  every other caller keeps the glyph exactly as it was. */
  disableLeadingIcon?: boolean;
  /**
   * 2026-09-20 — 'ink': the glyphs and the placeholder in the ink rather
   * than the muted greys — the approved Map design's field (its placeholder
   * at 0.94, the mic at 0.85, a 24pt magnifier at 0.92), which the phone
   * walk found too dim against the map. Home keeps the default.
   */
  emphasis?: 'muted' | 'ink';
  /**
   * 2026-09-21 — ONE trailing control (the customer Home's field): the mic
   * while the field is empty, the magnifier once it has text — and no voice
   * session is listening, so a dictation can still be stopped by its own
   * tap — whose tap runs `onSubmit`. Replaces that field's mic | divider |
   * magnifier pair (DECISIONS 2026-09-20 sitting 3, (8): "remove the
   * magnifying button... the voice icon changes to magnifying as soon as I
   * start typing"). Default false: every other caller keeps its mic and its
   * own `trailing`, as before.
   */
  micBecomesSearch?: boolean;
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
  disableVoiceSearch = false,
  autoCapitalize = 'none',
  autoCorrect = false,
  disableClear = false,
  trailing,
  micBecomesSearch = false,
  disableLeadingIcon = false,
  emphasis = 'muted',
}: SearchBarProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // MOTION1 (C1): three controls live in this one primitive — the whole field
  // when it is a button, the clear glyph and the mic — so three instances of
  // the one shared hook, never three copies of a spring.
  const press = usePressFeedback();
  const clearPress = usePressFeedback();
  const micPress = usePressFeedback();

  // False until the boundary affirms on-device recognition on THIS binary;
  // every degraded case leaves the mic unrendered rather than disabled.
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  // RUN S2 (C8) — focus is tracked only so the focus-border/glow dials have
  // a state to attach to; with both at their defaults nothing changes.
  const [inputFocused, setInputFocused] = useState(false);

  // The search-field dials, each defaulting to today's shipped value.
  const heightDial = useOverrideNumber('search.height');
  const radiusDial = useOverrideNumber('search.radius');
  const padXDial = useOverrideNumber('search.paddingX');
  const gapDial = useOverrideNumber('search.gap');
  const fillDial = useOverrideString('search.fill');
  const borderDial = useOverrideString('search.border');
  const borderAlphaDial = useOverrideNumber('search.borderAlpha');
  const focusBorderDial = useOverrideString('search.focusBorder');
  const focusGlowDial = useOverrideNumber('search.focusGlow');
  const placeholderColorDial = useOverrideString('search.placeholderColor');
  const placeholderAlphaDial = useOverrideNumber('search.placeholderAlpha');
  const iconSizeDial = useOverrideNumber('search.iconSize');
  const iconOffsetX = useOverrideNumber('search.iconOffsetX') ?? 0;
  const iconOffsetY = useOverrideNumber('search.iconOffsetY') ?? 0;
  const fieldDial = {
    ...(heightDial != null ? { minHeight: heightDial } : null),
    ...(radiusDial != null ? { borderRadius: radiusDial } : null),
    ...(padXDial != null ? { paddingHorizontal: padXDial } : null),
    ...(gapDial != null ? { gap: gapDial } : null),
    ...(fillDial != null ? { backgroundColor: fillDial } : null),
    ...(borderDial != null || borderAlphaDial != null
      ? { borderColor: withAlpha(borderDial ?? colors.line, borderAlphaDial ?? 1) }
      : null),
  };
  const focusDial = inputFocused
    ? {
        ...(focusBorderDial != null ? { borderColor: focusBorderDial } : null),
        ...(focusGlowDial != null && focusGlowDial > 0
          ? glow.halo(withAlpha(colors.emerald, focusGlowDial))
          : null),
      }
    : null;
  const ink = emphasis === 'ink';
  // The ink emphasis (the map's pill) draws its glyphs one point larger
  // since the pill grew to 62 (2026-09-20, sitting 2, (6)): 25 and 23.
  // 2026-09-28 (LUX-LIST-64 #15): every search field but the map's pill is the
  // Lux Home field — 22pt mint glyphs, 16pt text, 54 tall, 18 in, 12 between.
  const iconGlyphSize = iconSizeDial ?? (ink ? 25 : 22);
  // 2026-09-27 (the operator's review, the Lux `.field svg{color:var(--acc)}`):
  // the magnifier is the mint in both themes; only the map's ink pill differs.
  const leadingInk = ink ? withAlpha(colors.ink, 0.92) : colors.emerald;
  // The Lux well under the field in dark (ui/tokens.ts `wells.field`); the
  // map's ink pill and light keep their own fill.
  const well = isDark && !ink ? styles.fieldDark : null;
  const iconDialStyle =
    iconOffsetX || iconOffsetY
      ? { transform: [{ translateX: iconOffsetX }, { translateY: iconOffsetY }] }
      : undefined;
  const placeholderInk =
    placeholderColorDial != null || placeholderAlphaDial != null
      ? withAlpha(placeholderColorDial ?? colors.muted, placeholderAlphaDial ?? 1)
      : ink
        ? withAlpha(colors.ink, 0.94)
        : colors.muted;
  // The live session's provisional phrase — never query state. It paints the
  // field while listening and is cleared the moment the session ends, so the
  // field reverts to the parent-controlled value with nothing committed.
  const [interimTranscript, setInterimTranscript] = useState<string | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const isButton = onPress != null;
  // Read via the raw context, not useNavigation(): a primitive must render
  // outside a navigator too, where this is simply undefined.
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (disableVoiceSearch || isButton) return;
    let alive = true;
    void voiceSearch.getAvailability().then((availability) => {
      if (alive) setVoiceReady(availability.status === 'available');
    });
    return () => {
      alive = false;
    };
  }, [disableVoiceSearch, isButton]);

  // An unmount mid-session tears it down without committing.
  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
    };
  }, []);

  // The screen blurring behind a push (it stays mounted) ends the session the
  // same way: the user walked away, so nothing commits behind their back.
  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener('blur', () => {
      sessionRef.current?.cancel();
    });
  }, [navigation]);

  // Backgrounding the app closes the microphone; inactive counts too (the
  // app switcher, an incoming call sheet).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') sessionRef.current?.cancel();
    });
    return () => subscription.remove();
  }, []);

  const toggleVoiceSession = () => {
    if (sessionRef.current) {
      // Second tap: stop listening and commit what was heard.
      sessionRef.current.stop();
      return;
    }
    setListening(true);
    sessionRef.current = voiceSearch.beginSession({
      // The transcript's one egress: the exact path typed text takes.
      onTranscript: onChangeText,
      // Interims are display-only (see the docblock): they paint the field
      // below and never reach onChangeText.
      onInterimTranscript: setInterimTranscript,
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
        setInterimTranscript(null);
      },
    });
  };
  // Presentation only: while listening the field shows the provisional
  // phrase; the parent's value is what every other consumer of `value` sees.
  const showingInterim = listening && interimTranscript != null;
  const displayValue = showingInterim ? interimTranscript : value;
  if (onPress) {
    return (
      <Animated.View style={press.style}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.field, !ink && styles.fieldLux, well, fieldDial, pressed && styles.pressed, style]}
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
            style={iconDialStyle}
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
    <View style={[styles.field, !ink && styles.fieldLux, well, fieldDial, focusDial, style]}>
      {disableLeadingIcon ? null : (
        <Ionicons
          name="search"
          size={iconGlyphSize}
          color={leadingInk}
          style={iconDialStyle}
        />
      )}
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={[styles.input, !ink && styles.textLux, showingInterim && styles.inputInterim]}
        value={displayValue}
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
        <Animated.View style={clearPress.style}>
          <Pressable
            onPress={() => onChangeText('')}
            onPressIn={clearPress.onPressIn}
            onPressOut={clearPress.onPressOut}
            // The glyph is small; the hit area is not.
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.navInactive} />
          </Pressable>
        </Animated.View>
      ) : null}
      {micBecomesSearch && value.length > 0 && !listening ? (
        // The mic's slot, the mic's size and colour: the field reads as one
        // quiet control whichever glyph it shows.
        <Pressable
          onPress={onSubmit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
          style={styles.mic}
        >
          <Ionicons name="search" size={22} color={isDark ? colors.emerald : colors.navInactive} />
        </Pressable>
      ) : voiceReady && !disableVoiceSearch ? (
        <Animated.View style={micPress.style}>
          <Pressable
            // Tap-to-talk: one tap starts the bounded session, a second stops
            // it. The session cannot outlive the boundary's silence detector or
            // its 30s ceiling, which is what keeps the permission string true.
            onPress={toggleVoiceSession}
            onPressIn={micPress.onPressIn}
            onPressOut={micPress.onPressOut}
            // 20pt glyph + 4pt padding + 8pt slop lands on the 44pt floor.
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'}
            accessibilityState={{ selected: listening }}
            style={[styles.mic, listening && styles.micListening]}
          >
            <Ionicons
              name={listening ? 'mic' : 'mic-outline'}
              size={ink ? 23 : 22}
              color={
                listening || (isDark && !ink)
                  ? colors.emerald
                  : ink
                    ? withAlpha(colors.ink, 0.85)
                    : colors.navInactive
              }
            />
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
  inputInterim: {
    // Provisional: the placeholder's treatment until the final commits.
    color: colors.muted,
  },
  value: {
    flex: 1,
    ...typeScale.body,
    color: colors.ink,
  },
  placeholder: {
    color: colors.muted,
  },
  mic: {
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  micListening: {
    // A quiet emerald wash marks "listening now" in both palettes; the
    // colour is a palette read, the alpha a per-surface opacity.
    backgroundColor: withAlpha(colors.emerald, 0.15),
  },
  }),
);
