import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { authColors, authRadius, authSizes, authSpacing } from '../lib/authTheme';
import { OTP_LENGTH } from '../lib/phoneAuth';

/**
 * The six-cell code field.
 *
 * One `TextInput` holding the whole code, drawn as six cells — not six inputs.
 * Six would each need their own ref, their own backspace-into-the-previous-one
 * handling, and would be announced by a screen reader as six unlabelled boxes;
 * a paste would land entirely in the first. With one input, paste, backspace,
 * autofill and "read the code from a text message" all work because they are
 * just text editing, and assistive technology sees a single labelled field.
 *
 * The input is transparent and stretched over the cells rather than hidden
 * off-screen: it stays hit-testable and, on web, keeps its natural place in
 * the focus order.
 */

export type OtpInputHandle = { focus: () => void };

type OtpInputProps = {
  value: string;
  onChangeText: (next: string) => void;
  /** Renders every cell in the danger colour. */
  invalid?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
};

const CELL_HEIGHT = authSizes.field + 2;

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChangeText, invalid = false, editable = true, onSubmitEditing },
  ref
) {
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');
  // The cell the next digit lands in. Past the end once the code is complete,
  // which is what stops a seventh cell from looking active.
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    // A plain View, not a Pressable: the input below is an absolute fill over
    // the whole row and is the last child, so it is already what a tap on any
    // cell hits. A Pressable here would add nothing and would put a second,
    // nameless tab stop in front of the field on web (react-native-web gives
    // every Pressable tabIndex 0, and ignores `focusable`).
    <View style={styles.container}>
      <View style={styles.cells}>
        {cells.map((char, index) => (
          <View
            key={index}
            style={[
              styles.cell,
              editable && index === activeIndex && value.length < OTP_LENGTH && styles.cellActive,
              char !== '' && styles.cellFilled,
              invalid && styles.cellInvalid,
            ]}
          >
            <Text style={[styles.cellText, invalid && styles.cellTextInvalid]}>{char}</Text>
          </View>
        ))}
      </View>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={OTP_LENGTH}
        // The caret would sit under the cell glyphs; the active-cell outline is
        // the cursor here.
        caretHidden
        // Pinned to the end so typing always appends and backspace always
        // removes the last digit, however the user tapped into the field.
        selection={{ start: value.length, end: value.length }}
        textContentType="oneTimeCode"
        autoComplete={Platform.select({
          android: 'sms-otp',
          default: 'one-time-code',
        })}
        autoCorrect={false}
        returnKeyType="go"
        accessibilityLabel={`Verification code, ${OTP_LENGTH} digits`}
        accessibilityHint="Enter the code sent by text message"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  cells: {
    flexDirection: 'row',
    gap: authSpacing.sm,
    // Once the cells hit their 56pt cap they stop filling the row, so the
    // leftover width is split either side rather than left as a notch on the
    // right — visible from about 420pt up, and on a wide web window.
    justifyContent: 'center',
  },
  cell: {
    // flex, not a fixed 42pt: six fixed cells plus their gaps overflow a 320pt
    // screen's content width. They shrink instead, and stop growing at 56 so
    // they can't stretch into a row of tiles on a wide web window.
    flex: 1,
    maxWidth: 56,
    height: CELL_HEIGHT,
    borderRadius: authRadius.field,
    borderWidth: 1,
    borderColor: authColors.line,
    backgroundColor: authColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: {
    borderColor: authColors.mint2,
  },
  cellActive: {
    borderColor: authColors.emerald,
  },
  cellInvalid: {
    borderColor: authColors.danger,
  },
  cellText: {
    fontSize: 22,
    fontWeight: '700',
    color: authColors.ink,
  },
  cellTextInvalid: {
    color: authColors.danger,
  },
  input: {
    ...StyleSheet.absoluteFillObject,
    // Transparent rather than hidden: `display:none` / off-screen inputs lose
    // the software keyboard on some Android builds and drop out of the web
    // focus order entirely. Zero opacity also takes the browser's own focus
    // ring with it, so nothing is drawn over the cells.
    opacity: 0,
    color: 'transparent',
  },
});
