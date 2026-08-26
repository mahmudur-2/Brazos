import { Animated, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { useFloatingNavClearance } from '../primitives';
import {
  controls,
  layout,
  radius,
  spacing,
  withAlpha,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';
import { useEntrance } from '../../hooks/useEntrance';
import { confirm } from '../../lib/haptics';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The confirmation template (§I): what just happened, and what to do next.
 *
 * Deliberately has no back button and no header. A success screen is the end
 * of a flow, and offering "back" invites re-submitting the thing that just
 * succeeded. Callers give explicit next actions instead.
 *
 * It also never auto-navigates on a timer — DECISIONS.md D30 already removed
 * that from the post-a-job flow in favour of an explicit next action, and
 * baking a timed redirect into the template would quietly reintroduce it
 * everywhere.
 */

export type SuccessAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

type SuccessScreenProps = {
  title: string;
  body?: string;
  icon?: IoniconName;
  /**
   * Replaces the default glyph disc with artwork of the caller's own — the
   * published-job mark is the first. Omitted, the template draws the glyph
   * exactly as it always has, so every existing caller is untouched.
   *
   * It takes the glyph's PLACE rather than sitting beside it: two marks at
   * the top of a success screen is two claims about what just happened.
   */
  mark?: ReactNode;
  /** A receipt, a summary card — anything between the copy and the actions. */
  details?: ReactNode;
  actions: readonly SuccessAction[];
  insideTabs?: boolean;
  /**
   * RUN PUBLISH1 (C1) — TWO FACTS THAT WERE ONE PROP.
   *
   * `insideTabs` was answering two different questions at once: which SAFE-AREA
   * EDGES this surface owns, and whether its scroll content has to reserve the
   * floating pill's footprint. They are not the same question, and on the
   * published-job surface they have opposite answers.
   *
   * That surface renders inside PostJobScreen's absolutely positioned success
   * overlay, which is bounded by the tab SCENE — and on every route but the two
   * homes the bar sits in normal layout flow, so the scene already ends at the
   * pill's top edge. Reserving the pill's footprint again inside it is the
   * double count `PINNED_FOOTER_BOTTOM_PADDING` was created to stop, and it is
   * what pushed "Back to Home" off the bottom of the surface: measured on the
   * control render, the button's box ran y 751..798 against a pill whose top
   * edge is y 770, so 29 of its 48 points were not on screen.
   *
   * It still owns only the TOP edge — the home indicator lives in the pill's
   * own float margin, below this surface entirely — so `insideTabs` stays true
   * and this says the other half.
   */
  clearsFloatingNav?: boolean;
};

export function SuccessScreen({
  title,
  body,
  icon = 'checkmark-circle',
  mark,
  details,
  actions,
  insideTabs = true,
  clearsFloatingNav = true,
}: SuccessScreenProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navClearance = useFloatingNavClearance();

  // MOTION1 (C2) — THE SUCCESS SURFACE ARRIVES IN ORDER, AND CONFIRMS ONCE.
  //
  // A caller-supplied 'mark' prop brings its own entrance (components/SuccessMark
  // resolves the motion120 arrangement above this template and animates its
  // disc, rings and sparkles on mount), so this staggers only what it owns
  // itself: the default glyph, the copy, the detail slot and the actions.
  // Extending that arrangement rather than replacing it is the whole point —
  // two entrances on one mark would be two claims about the same arrival.
  const glyphEntrance = useEntrance(0);
  const copyEntrance = useEntrance(1);
  const detailsEntrance = useEntrance(2);
  const actionsEntrance = useEntrance(3);

  // The success NOTIFICATION haptic, not the light press tap — an action
  // completed. Empty deps: it fires when the surface mounts and never on a
  // re-render, and lib/haptics is a no-op on web and on any binary without
  // the native module.
  useEffect(() => {
    confirm();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          clearsFloatingNav && { paddingBottom: navClearance },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* The check circle was a deep-green glyph on the deep-green mint
            disc — two dark greens, so in dark the mark all but vanished. It
            keeps the disc and gains the masters' gold ring, with the glyph in
            the live-state emerald (the "green check circle" of 15/19/40). */}
        {mark ?? (
          <Animated.View style={[styles.glyph, isDark && styles.glyphDark, glyphEntrance]}>
            <Ionicons name={icon} size={44} color={isDark ? colors.emerald : colors.forest} />
          </Animated.View>
        )}

        <Animated.View style={[styles.copy, copyEntrance]}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </Animated.View>

        {details ? <Animated.View style={[styles.details, detailsEntrance]}>{details}</Animated.View> : null}

        <Animated.View style={[styles.actions, actionsEntrance]}>
          {actions.map((action) => {
            const secondary = action.variant === 'secondary';
            return (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.button,
                  secondary ? styles.secondary : styles.primary,
                  // Decision 3's standard control: surface fill, gold
                  // hairline, cream serif label. The Heritage pair it
                  // replaces put a forest label on a mint fill, which under
                  // dark is one deep green on another — "Keep browsing" was
                  // legible only as a shape.
                  secondary && isDark && styles.secondaryDark,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text
                  style={[
                    styles.buttonLabel,
                    secondary && styles.secondaryLabel,
                    secondary && isDark && styles.secondaryLabelDark,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.screenGutter,
    gap: spacing.xl,
  },
  glyph: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.line,
  },
  glyphDark: {
    borderColor: withAlpha(colors.gold, 0.55),
  },
  copy: {
    gap: spacing.sm,
    alignItems: 'center',
    maxWidth: layout.maxContentWidth,
  },
  title: {
    ...typeScale.h1,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    ...typeScale.body,
    color: colors.muted,
    textAlign: 'center',
  },
  details: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  actions: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    gap: spacing.md,
  },
  button: {
    minHeight: controls.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  primary: {
    backgroundColor: colors.forest,
  },
  secondary: {
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
  },
  secondaryDark: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.gold, 0.55),
  },
  buttonLabel: {
    ...typeScale.title,
    color: colors.onForest,
  },
  secondaryLabel: {
    color: colors.forest,
  },
  secondaryLabelDark: {
    color: colors.ink,
  },
  pressed: {
    opacity: 0.85,
  },
  }),
);
