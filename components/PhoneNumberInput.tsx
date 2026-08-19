import { forwardRef, useRef, useState } from 'react';
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
import { authSurface, useThemeColors } from '../lib/theme';
import { flagEmoji, type Country } from '../lib/countries';
import {
  clampNational,
  digitsOf,
  formatNational,
  isNanp,
  splitInternational,
} from '../lib/phoneNumber';
import { CountryPicker } from './CountryPicker';

const FOCUS_MS = 160;

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
    const [pickerOpen, setPickerOpen] = useState(false);
    const focus = useRef(new Animated.Value(0)).current;
    const { palette, isDark } = useThemeColors();
    const surface = authSurface(palette, isDark);
    // Masters 3/4: gold label, gold hairlines, gold calling code and divider,
    // cream digits on the screen's own near-black.
    const fill = themed ? (isDark ? surface.bg : surface.surface) : authColors.surface;
    const line = themed ? surface.line : authColors.line;
    const muted = themed ? surface.accent : authColors.muted;
    const ink = themed ? surface.ink : authColors.ink;

    const run = (to: number) =>
      Animated.timing(focus, {
        toValue: to,
        duration: FOCUS_MS,
        useNativeDriver: false,
      }).start();

    const borderColor = error
      ? themed
        ? surface.danger
        : authColors.danger
      : focus.interpolate({
          inputRange: [0, 1],
          outputRange: [line, themed ? palette.emerald : authColors.emerald],
        });

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
        <Text style={[styles.label, themed && { color: surface.accent }]}>{label}</Text>

        <View style={styles.row}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.country,
              themed && { backgroundColor: fill, borderColor: line },
              pressed && styles.countryPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Country: ${country.name}, plus ${country.dial}`}
            accessibilityHint="Opens the country list"
          >
            <Text style={styles.flag}>{flagEmoji(country.code)}</Text>
            <Text style={[styles.iso, themed && { color: ink }]}>{country.code}</Text>
            <Ionicons name="chevron-down" size={15} color={muted} />
          </Pressable>

          <Animated.View
            style={[styles.field, themed && { backgroundColor: fill }, { borderColor }]}
          >
            {/* Announced as part of the input's own label instead of on its
                own, so a screen reader reads one coherent field. */}
            <Text
              style={[styles.dial, themed && { color: muted }]}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              +{country.dial}
            </Text>
            <View style={[styles.divider, themed && { backgroundColor: line }]} />
            <TextInput
              ref={ref}
              style={[styles.input, themed && { color: ink }]}
              value={formatNational(country, value)}
              onChangeText={handleChangeText}
              onFocus={() => run(1)}
              onBlur={() => run(0)}
              placeholder={isNanp(country) ? '347 320 0610' : 'Phone number'}
              placeholderTextColor={themed ? surface.placeholder : authColors.placeholder}
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel-national"
              textContentType="telephoneNumber"
              accessibilityLabel={`${label}, ${country.name}, plus ${country.dial}`}
              {...inputProps}
            />
          </Animated.View>
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
          selected={country}
          onSelect={handleSelectCountry}
          onClose={() => setPickerOpen(false)}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
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
    fontSize: 16,
    color: authColors.muted,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: authSpacing.md - 2,
    backgroundColor: authColors.line,
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
});
