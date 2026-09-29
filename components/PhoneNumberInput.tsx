import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, metricStyles, useThemeColors, withAlpha } from '../lib/theme';
import { flagEmoji, type Country } from '../lib/countries';
import {
  clampNational,
  digitsOf,
  formatNational,
  isNanp,
  splitInternational,
} from '../lib/phoneNumber';
import { CountryPicker } from './CountryPicker';
import { FocusRing } from './FocusRing';
import type { PopoverAnchor } from './PickerPopover';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { MENU_MOTION_MS } from '../lib/motion120';

type PhoneNumberInputProps = {
  label?: string;
  country: Country;
  onChangeCountry: (country: Country) => void;
  /** National digits only — no calling code, no separators. */
  value: string;
  onChangeValue: (digits: string) => void;
  error?: string | null;
  /**
   * Opt in to the Prestige mapping (masters 3/4 only). Absent, the row is
   * byte-identical to the Heritage ivory control every other auth screen has.
   */
  themed?: boolean;
} & Pick<TextInputProps, 'onSubmitEditing' | 'returnKeyType' | 'editable' | 'autoFocus'>;

/**
 * The auth flow's international phone field: a country control, the selected
 * calling code, and the national number. Shared, so the normalisation rules
 * only have to be right in one place.
 *
 * Displaying and storing the calling code separately from the national digits
 * is what makes a duplicated '+1' structurally impossible — the national field
 * never holds a calling code at all. When a value arrives that does (a paste of
 * '+1 347 320 0610', say), splitInternational peels the code off, moves the
 * country control to match, and keeps only the national part.
 */
export const PhoneNumberInput = forwardRef<TextInput, PhoneNumberInputProps>(
  function PhoneNumberInput(
    {
      label = 'Phone number',
      country,
      onChangeCountry,
      value,
      onChangeValue,
      error,
      themed = false,
      ...inputProps
    },
    ref
  ) {
    const styles = stylesFor();
    const [pickerOpen, setPickerOpen] = useState(false);
    // 2026-09-28 (LUX-LIST-64 #5): the dropdown hangs off the pill, so the pill
    // is measured in window points as it opens; its chevron points down and
    // flips while the list is open (a rotation on the native driver).
    const pillRef = useRef<View>(null);
    const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
    const reducedMotion = useReducedMotion();
    const flip = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.timing(flip, {
        toValue: pickerOpen ? 1 : 0,
        duration: reducedMotion ? 0 : MENU_MOTION_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    }, [flip, pickerOpen, reducedMotion]);
    const openPicker = () => {
      const node = pillRef.current;
      if (!node) return;
      node.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setPickerOpen(true);
      });
    };
    const [focused, setFocused] = useState(false);
    const { palette, isDark } = useThemeColors();
    const surface = authSurface(palette, isDark);
    // Masters 3/4: gold label, gold hairlines, gold calling code and divider,
    // cream digits on the screen's own near-black.
    // 2026-09-27 (the Lux remake, the operator's pic 2): the field is the Lux
    // well — white at .06 in dark — inside the lifted phone-number card; the
    // label stays gold (surface.accent) and the dial and chevron read muted.
    const fill = themed ? (isDark ? withAlpha(palette.white, 0.06) : surface.surface) : authColors.surface;
    const line = themed ? surface.line : authColors.line;
    const muted = themed ? surface.muted : authColors.muted;
    const ink = themed ? surface.ink : authColors.ink;

    const danger = themed ? surface.danger : authColors.danger;
    const borderColor = error ? danger : line;
    // #8: the glow while typing, the mint (the light token's green in light).
    const glow = error ? danger : themed ? palette.emerald : authColors.emerald;

    function handleChangeText(text: string) {
      // A pasted international number carries its own calling code. Peel it
      // off and move the country control, rather than letting it land in the
      // national digits where it would be sent as +1 1 347…
      const international = splitInternational(text);
      if (international) {
        onChangeCountry(international.country);
        onChangeValue(clampNational(international.country, international.national));
        return;
      }

      let next = digitsOf(text);
      // No NANP area code begins with 0 or 1, so a leading one is always a
      // trunk or country prefix typed out of habit — never a real digit.
      if (isNanp(country)) next = next.replace(/^[01]+/, '');
      onChangeValue(clampNational(country, next));
    }

    function handleSelectCountry(next: Country) {
      setPickerOpen(false);
      if (next.code === country.code) return;
      // Digits carry across unchanged — switching country changes which
      // calling code they hang off, not the number the user typed.
      onChangeCountry(next);
      onChangeValue(clampNational(next, value));
    }

    return (
      <View style={styles.container}>
        {/* 2026-09-28 (LUX-LIST-64 #2): "Phone number" is the mint everywhere
            it is said — the light token's green in light. */}
        <Text style={[styles.label, { color: themed ? surface.fieldLabel : palette.emerald }]}>{label}</Text>

        <View style={styles.row}>
          <Pressable
            ref={pillRef}
            onPress={openPicker}
            style={({ pressed }) => [
              styles.country,
              themed && { backgroundColor: fill, borderColor: line },
              pressed && styles.countryPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Country: ${country.name}, plus ${country.dial}`}
            accessibilityHint="Opens the country list"
            accessibilityState={{ expanded: pickerOpen }}
          >
            <Text style={[styles.flag, { color: ink }]}>{flagEmoji(country.code)}</Text>
            <Text style={[styles.iso, themed && { color: ink }]}>{country.code}</Text>
            {/* 2026-09-27 (the Lux remake, the operator's pic 2): "US +1 ›" —
                the calling code rides in the country pill, so the field holds
                the number alone. Announced as part of the input's own label
                below, so a screen reader still reads one coherent field. */}
            <Text
              style={[styles.dial, themed && { color: muted }]}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              +{country.dial}
            </Text>
            <Animated.View
              style={{
                transform: [{ rotate: flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
              }}
            >
              <Ionicons name="chevron-down" size={15} color={muted} />
            </Animated.View>
          </Pressable>

          <View style={[styles.field, themed && { backgroundColor: fill }, { borderColor }]}>
            <TextInput
              ref={ref}
              style={[styles.input, themed && { color: ink }]}
              value={formatNational(country, value)}
              onChangeText={handleChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={isNanp(country) ? '347 320 0610' : 'Phone number'}
              placeholderTextColor={themed ? surface.placeholder : authColors.placeholder}
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel-national"
              textContentType="telephoneNumber"
              accessibilityLabel={`${label}, ${country.name}, plus ${country.dial}`}
              {...inputProps}
            />
            <FocusRing focused={focused} color={glow} radius={authRadius.field} />
          </View>
        </View>

        {error ? (
          <Text
            style={[styles.error, themed && { color: surface.danger }]}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        ) : null}

        <CountryPicker
          visible={pickerOpen}
          anchor={anchor}
          selected={country}
          onSelect={handleSelectCountry}
          onClose={() => setPickerOpen(false)}
        />
      </View>
    );
  }
);

const stylesFor = metricStyles(() => StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    ...authType.fieldLabel,
    color: authColors.muted,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: authSpacing.sm,
  },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: authSizes.field,
    paddingHorizontal: authSpacing.md - 1,
    borderRadius: authRadius.field,
    borderWidth: 1,
    borderColor: authColors.line,
    backgroundColor: authColors.surface,
  },
  countryPressed: {
    backgroundColor: authColors.mint,
  },
  flag: {
    fontSize: 18,
  },
  iso: {
    fontSize: 15,
    fontWeight: '700',
    color: authColors.ink,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: authSizes.field,
    borderRadius: authRadius.field,
    borderWidth: 1,
    backgroundColor: authColors.surface,
    paddingLeft: authSpacing.md + 2,
  },
  dial: {
    fontSize: 15,
    fontWeight: '600',
    color: authColors.muted,
  },
  input: {
    flex: 1,
    // Without this the field overflows its row on a narrow screen: a web
    // <input> reports an intrinsic width of ~193pt and `min-width: auto` stops
    // a flex child shrinking below it, so at 320pt wide the number ran off the
    // right edge while the bordered wrapper shrank correctly. A no-op on
    // native, where Yoga already treats the minimum as 0.
    minWidth: 0,
    height: '100%',
    ...authType.fieldValue,
    color: authColors.ink,
    paddingRight: authSpacing.md,
  },
  error: {
    fontSize: 13,
    color: authColors.danger,
    marginLeft: 2,
    marginTop: 2,
  },
}));
