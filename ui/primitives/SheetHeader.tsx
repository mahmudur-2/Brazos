import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { controls, layout, radius, spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

/** The word on a sheet's right: "Done" where closing APPLIES what the sheet
 *  holds, "Close" where closing only dismisses it. */
export type SheetDismissWord = 'Done' | 'Close';

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-31) — ONE WAY TO CLOSE A SHEET. Every
 * sheet — the generic Sheet, the ActionSheet, the [+] create sheet and the
 * service picker — wears this one header: the handle, the title (a subtitle
 * under it where the sheet has one), and ONE word on the right that closes it:
 * "Done" where closing applies (the Filters sheet's draft), "Close" where it
 * does not. Tapping outside the sheet means the same as that word. A sheet that
 * can also throw its draft away (the Filters sheet) carries "Cancel" on the
 * left — the iOS pairing — and there the backdrop means Cancel.
 *
 * The look is the generic Sheet's own, which it had first: the h2 title, the
 * word in the title weight, gold in dark and the emerald in light.
 */
export function SheetHeader({
  title,
  subtitle,
  dismissWord,
  onDismiss,
  onCancel,
  handleStyle,
  rowStyle,
  titleStyle,
  subtitleStyle,
  showHandle = true,
}: {
  title?: string;
  subtitle?: string;
  dismissWord: SheetDismissWord;
  onDismiss: () => void;
  /** A second, discarding way out: "Cancel" on the left. */
  onCancel?: () => void;
  /** The generic Sheet's studio dials (handle size, colour, header padding). */
  handleStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  /** A sheet whose title type a ruling set keeps it (#13's All services, 24/28). */
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  showHandle?: boolean;
}) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <>
      {showHandle ? <View style={[styles.handle, handleStyle]} /> : null}
      <View style={[styles.row, rowStyle]}>
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            hitSlop={12}
            style={styles.word}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          {title ? (
            <Text accessibilityRole="header" style={[styles.title, titleStyle]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, subtitleStyle]} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={styles.word}
          accessibilityRole="button"
          accessibilityLabel={dismissWord}
        >
          <Text style={[styles.dismissLabel, isDark && styles.dismissLabelDark]}>{dismissWord}</Text>
        </Pressable>
      </View>
    </>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.line,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: layout.screenGutter,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    titles: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      ...typeScale.h2,
      color: colors.ink,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    word: {
      minHeight: controls.minTouchTarget,
      justifyContent: 'center',
      flexShrink: 0,
    },
    dismissLabel: {
      ...typeScale.title,
      color: colors.emerald,
    },
    dismissLabelDark: { color: colors.gold },
    cancelLabel: {
      ...typeScale.title,
      color: colors.muted,
    },
  })
);
