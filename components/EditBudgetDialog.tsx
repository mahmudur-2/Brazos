import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { validateOfferAmount } from './OfferComposer';
import { dollarsToCents } from '../lib/jobs';
import { LitSurface } from '../ui/primitives';
import { moneyCeilingError } from '../lib/validation';
import {
  controls,
  radius,
  scrimInDark,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * PUBLISH1 (C2): the sheet's wash, copied from the publish card's, which is
 * copied from Home's promo card. One alpha for the language, not three.
 */
const DIALOG_LIFT_ALPHA = 0.04;

/**
 * The posting wizard's one budget editor.
 *
 * WHAT IT IS BUILT ON. ConfirmDialog's structure and scrim: a transparent
 * fade Modal, a full-bleed scrim, a centred sheet at the xl radius, and the
 * same request-close behaviour. What it does NOT take from ConfirmDialog is
 * that dialog's opaque `surface` panel — this one is a translucent deep-green
 * sheet with a green hairline, so the review screen behind it stays present
 * as a dimmed ground rather than being replaced by a card. Flat fills only:
 * no gradient, no blur, no library.
 *
 * THE SCRIM IS DEEPENED THROUGH THE SHARED HELPER, not a new number.
 * `scrimInDark` is the one scrim expression in this app (lib/theme pins its
 * alpha to a single value in a single place precisely so the next sheet
 * cannot pick its own). Light passes it the near-black `ink` rather than
 * ConfirmDialog's lighter `text` @ 0.35, which is what deepens it; dark passes
 * the page ground exactly as every other sheet does.
 *
 * EMPTY IS LEGAL AND MEANS NO MAXIMUM. That is a real state on a job row —
 * `budget_max_cents` is nullable and the poster's own view of it reads "No
 * budget set" — so clearing the field is a save, never a validation failure.
 *
 * THE CEILING REFUSES IN WRITING BEFORE ANYTHING IS WRITTEN. The amount goes
 * through `validateOfferAmount` (the one answer to "is this a valid amount",
 * shared with bids, counters and the direct-offer step) and then
 * `moneyCeilingError` (phase75's client mirror of the database CHECK). Neither
 * rule is restated here; this composes them.
 */
export function EditBudgetDialog({
  visible,
  value,
  onSave,
  onCancel,
  palette: paletteProp,
}: {
  visible: boolean;
  /** The current maximum, in whole dollars as typed. Empty means no maximum. */
  value: string;
  /** Called with the accepted text. Empty string means "no maximum". */
  onSave: (next: string) => void;
  onCancel: () => void;
  palette?: ColorPalette;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const styles = stylesFor(colors);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);

  // Opening the dialog re-seeds it from the live value: a cancelled edit
  // discards, so the next open must not resume the discarded text.
  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setProblem(null);
  }, [visible, value]);

  function handleSave() {
    const found = problemFor(draft);
    if (found) {
      setProblem(found);
      return;
    }
    onSave(draft.trim());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.backdrop, isDark && styles.backdropDark]}>
        <View style={styles.centerWrap}>
          <LitSurface
            style={[styles.sheet, isDark && shadows.cardDark]}
            // The sheet's OWN translucent fill is the wash's far stop, so the
            // ground still reads through it exactly as it always did.
            surface={withAlpha(colors.forest, 0.92)}
            lift={colors.emerald}
            liftAlpha={DIALOG_LIFT_ALPHA}
            flat={!isDark}
          >
            <Text style={[styles.title, { color: palette.onForest }]}>Edit Budget</Text>
            <Text style={[styles.message, { color: palette.onForest }]}>
              Set the maximum amount workers can bid up to.
            </Text>

            {/* PUBLISH1 (C2) — THE LABEL IS GONE, NOT MOVED, and the field is
                drawn here rather than through components/TextField.tsx.
                "Maximum ($)" said in a caption what the message above already
                says in a sentence, and what the "$" now says in a glyph:
                three statements of one fact, stacked. TextField requires a
                label and renders one, so a labelless field with a currency
                prefix is not a configuration of it — and widening that shared
                component for one dialog would change every form in the app. */}
            <View style={styles.field}>
              <View style={[styles.amountRow, problem ? styles.amountRowError : null]}>
                <Text style={styles.amountPrefix}>$</Text>
                <TextInput
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={[styles.amountInput, { color: palette.onForest }]}
                  value={draft}
                  onChangeText={(text) => {
                    setDraft(text);
                    if (problem) setProblem(null);
                  }}
                  placeholder="e.g. 60"
                  placeholderTextColor={withAlpha(palette.onForest, 0.45)}
                  keyboardType="numeric"
                  // iOS renders no return key on a numeric keyboard other than
                  // "done", and there is no "Save" key to ask for — so the blue
                  // Done key IS the Save action rather than a second outcome.
                  // It is the KEYBOARD's own key: this dialog has never had a
                  // floating InputAccessoryView, and there is none in the tree
                  // to remove.
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  accessibilityLabel="Maximum budget in dollars"
                  autoFocus
                />
              </View>
              {problem ? <Text style={styles.amountError}>{problem}</Text> : null}
            </View>

            {/* C2: one row, Save first. Two full-width buttons stacked read as
                a list of choices; side by side they read as one decision with a
                default, which is what this is. */}
            <View style={styles.actions}>
              <Button title="Save" palette={palette} onPress={handleSave} style={styles.action} />
              <Button
                title="Cancel"
                variant="secondary"
                palette={palette}
                onPress={onCancel}
                style={styles.action}
              />
            </View>
          </LitSurface>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The written refusal for an amount, or null when it is acceptable.
 *
 * Composed, never restated: blank is a legal "no maximum"; anything else is
 * whatever `validateOfferAmount` says about its shape and then whatever
 * `moneyCeilingError` says about its size.
 */
function problemFor(text: string): string | null {
  if (!text.trim()) return null;
  const { amountCents, problem } = validateOfferAmount(text);
  if (problem || amountCents == null) return problem ?? 'Enter an amount.';
  return moneyCeilingError(dollarsToCents(text));
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // ConfirmDialog's scrim, deepened through the SAME helper: `ink` is the
    // near-black in light, where that dialog uses the lighter `text` @ 0.35.
    backdrop: {
      flex: 1,
      backgroundColor: scrimInDark(colors.ink),
    },
    backdropDark: { backgroundColor: scrimInDark(colors.background) },
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    // The translucent emerald panel. High opacity — the ground reads THROUGH
    // it, it does not read as a window — with a green hairline and the same
    // xl radius ConfirmDialog's sheet carries.
    sheet: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.emerald, 0.55),
      backgroundColor: withAlpha(colors.forest, 0.92),
      padding: spacing.xl,
      ...shadows.raised,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
    },
    message: {
      fontSize: 14,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    field: {
      marginTop: spacing.lg,
      gap: spacing.xs + 2,
    },
    // PUBLISH1 (C2) — the amount row: a currency mark and a number, on the
    // same hairline pill every field in this app wears. Its shape is
    // TextField's own (`controls.fieldHeight`-tall pill, 1pt border) so the
    // dialog does not introduce a second field geometry; what it drops is the
    // label above it.
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: controls.fieldHeight,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: withAlpha(colors.emerald, 0.55),
      backgroundColor: withAlpha(colors.background, 0.35),
    },
    amountRowError: {
      borderColor: colors.danger,
    },
    // The same emerald "$" the publish card's Budget row draws (D19): a Text,
    // not an Ionicon — there is no dollar glyph in the set that reads as a
    // currency mark rather than a badge.
    amountPrefix: {
      fontSize: 19,
      lineHeight: 22,
      fontWeight: '800',
      color: colors.emerald,
    },
    amountInput: {
      flex: 1,
      fontSize: 16,
      paddingVertical: spacing.sm,
    },
    amountError: {
      fontSize: 12,
      color: colors.danger,
    },
    // C2: SIDE BY SIDE on one row, Save first, each half of the row.
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    action: {
      flex: 1,
    },
  }),
);
