import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { authColors, authRadius, authSizes } from '../lib/authTheme';
import { OTP_LENGTH } from '../lib/phoneAuth';
import { metricStyles } from '../lib/theme';

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
 * HOW THE INPUT IS HIDDEN, and why it is not `opacity: 0`.
 *
 * It used to be. That works on the web and is completely dead on iOS: UIKit's
 * `hitTest(_:with:)` ignores any view whose alpha is below 0.01, so an
 * `opacity: 0` TextInput is not merely invisible, it is untouchable — taps
 * fall straight through it and the keyboard never opens. Nothing about that is
 * visible on Expo web, where a zero-opacity input still receives pointer
 * events, which is exactly why it survived a browser pass.
 *
 * So the input is transparent instead of invisible: alpha stays 1, and the
 * text, caret, selection and background are individually transparent. It
 * renders nothing, and it is a real, hit-testable, focusable native input.
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

// Wide enough to separate the cells, tight enough that six of them plus five
// gaps still fit inside a 320pt screen's content width without clipping.
const CELL_GAP = 10;

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChangeText, invalid = false, editable = true, onSubmitEditing },
  ref
) {
  const styles = stylesFor();
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');
  // The cell the next digit lands in. Past the end once the code is complete,
  // which is what stops a seventh cell from looking active.
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <View style={styles.container}>
      {/* A sibling of the input, not an ancestor of it: the input is declared
          last, so it sits on top and takes the touch itself (which is what
          keeps long-press-to-paste working). This responder is the fallback
          for any pixel the input does not cover, and it is what guarantees a
          tap anywhere on the row reaches focus() even if the overlay's
          geometry ever changes. */}
      <View
        style={styles.cells}
        onStartShouldSetResponder={() => editable}
        onResponderRelease={() => inputRef.current?.focus()}
      >
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
        // The active-cell outline is the cursor here, so the real one — and
        // the selection highlight behind the transparent glyphs — are hidden
        // rather than drawn over the cells.
        caretHidden
        selectionColor="transparent"
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        // iOS reads the code out of the incoming message with this; Android
        // uses the autofill hint below.
        textContentType="oneTimeCode"
        autoComplete={Platform.select({
          android: 'sms-otp',
          default: 'one-time-code',
        })}
        returnKeyType="go"
        accessibilityLabel={`Verification code, ${OTP_LENGTH} digits`}
        accessibilityHint="Enter the code sent by text message"
      />
    </View>
  );
});

const stylesFor = metricStyles(() => StyleSheet.create({
  container: {
    position: 'relative',
  },
  cells: {
    flexDirection: 'row',
    gap: CELL_GAP,
    // Once the cells hit their width cap they stop filling the row, so the
    // leftover width is split either side rather than left as a notch on the
    // right — visible from about 420pt up, and on a wide web window.
    justifyContent: 'center',
  },
  cell: {
    // flex, not a fixed width: six fixed cells plus their gaps overflow a
    // 320pt screen. They shrink instead, and stop growing at the cap so they
    // stay portrait slots rather than stretching into rounded squares.
    flex: 1,
    maxWidth: authSizes.otpCellMaxWidth,
    height: authSizes.otpCell,
    borderRadius: authRadius.otpCell,
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
    fontSize: 24,
    fontWeight: '700',
    color: authColors.ink,
  },
  cellTextInvalid: {
    color: authColors.danger,
  },
  input: {
    ...StyleSheet.absoluteFillObject,
    // Transparent, NOT `opacity: 0` — see the module comment. Every visible
    // part is individually cleared so the view still renders nothing while
    // staying hit-testable on iOS.
    color: 'transparent',
    backgroundColor: 'transparent',
    // Web only in effect: stops the browser drawing its focus ring over the
    // cells. `outlineStyle: 'none'` is not in React Native's style types;
    // zero width is the supported way to say the same thing.
    outlineWidth: 0,
  },
}));
