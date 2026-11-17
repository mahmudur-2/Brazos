import type { ComponentProps, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { pillBottomOffset } from '../lib/meltBarGeometry';
import { meltBar, metricStyles, spacing } from '../lib/theme';
import { useHideTabBar } from '../ui/primitives';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Both buttons are the built `Button` at its default size, 52 tall (components/Button.tsx `md`). */
export const POST_BAR_BUTTON = 52;

/** Where the bar's buttons stand: the tab bar's own offset from the screen's edge, the safe area
 *  kept (ui/primitives/FloatingAction). The screen reads it to float its note above the pair. */
export function usePostBarFoot(): number {
  const insets = useSafeAreaInsets();
  return pillBottomOffset(insets.bottom, meltBar.bottomTuck, meltBar.bottomMin);
}

type Action = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * 2026-09-28 (LUX-LIST-64 #41, #42) — THE POSTING BAR, right above the tab bar
 * (refs/bottom-bar.html): no space above or below the buttons, 16 at the sides.
 * The quiet left button ("Save Draft" on the review step, "Back to Home" on the
 * live page) and the commitment on the right ("Publish" with its rocket, "View
 * Job" with its arrow).
 *
 * G1a (2026-11-16): both are the built `Button` — the quiet well beside the main
 * mint (dark green in light), one width each and one height, the labels allowed
 * their two lines rather than cut. A waiting commitment is the Button's own
 * disabled look. `primaryRef` hands the screen the commitment's box, which the
 * Seal transition measures to shrink it where it stands (#42).
 *
 * G1a RESTRUCTURE (2026-11-16, the bottom rule: one floating thing at the foot): the bar takes the
 * tab bar's place, as ui/primitives/FloatingAction does. It hides the tab bar while its screen is
 * focused and floats the pair where the pill sat, with no plate behind it.
 */
export function PostJobBar({
  secondary,
  secondaryIcon,
  primary,
  primaryIcon,
  primaryTrailingIcon,
  primaryDisabled,
  primaryRef,
  hidePrimary,
  hideSecondary,
}: {
  secondary?: Action;
  secondaryIcon?: IoniconName;
  primary: Action;
  primaryIcon?: IoniconName;
  primaryTrailingIcon?: IoniconName;
  primaryDisabled?: boolean;
  primaryRef?: Ref<View>;
  /** The Seal takes the commitment's place while it runs. */
  hidePrimary?: boolean;
  hideSecondary?: boolean;
}) {
  useHideTabBar();
  const foot = usePostBarFoot();
  const styles = stylesFor();

  return (
    <View style={[styles.bar, { paddingBottom: foot }]}>
      {secondary ? (
        <View style={styles.share}>
          <Button
            title={secondary.label}
            onPress={secondary.onPress}
            variant="quiet"
            icon={secondaryIcon}
            iconPosition="leading"
            disabled={hideSecondary}
            accessibilityLabel={secondary.accessibilityLabel ?? secondary.label}
            style={[styles.share, hideSecondary && styles.hidden]}
          />
        </View>
      ) : null}
      <View ref={primaryRef} collapsable={false} style={styles.share}>
        <Button
          title={primary.label}
          onPress={primary.onPress}
          icon={primaryIcon ?? primaryTrailingIcon}
          iconPosition={primaryIcon ? 'leading' : 'trailing'}
          disabled={primaryDisabled || hidePrimary}
          accessibilityLabel={primary.accessibilityLabel ?? primary.label}
          style={[styles.share, hidePrimary && styles.hidden]}
        />
      </View>
    </View>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      // The floating foot's breathing room under the scroller's end (ui/primitives/FloatingAction).
      paddingTop: spacing.sm,
    },
    // One plain slot each, so the pair is one width whatever its labels; the Button fills its slot,
    // so the pair is one height too.
    share: {
      flex: 1,
    },
    hidden: {
      opacity: 0,
    },
  })
);
