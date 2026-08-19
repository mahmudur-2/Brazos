import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
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
  /** A receipt, a summary card — anything between the copy and the actions. */
  details?: ReactNode;
  actions: readonly SuccessAction[];
  insideTabs?: boolean;
};

export function SuccessScreen({
  title,
  body,
  icon = 'checkmark-circle',
  details,
  actions,
  insideTabs = true,
}: SuccessScreenProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navClearance = useFloatingNavClearance();
  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          insideTabs && { paddingBottom: navClearance },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* The check circle was a deep-green glyph on the deep-green mint
            disc — two dark greens, so in dark the mark all but vanished. It
            keeps the disc and gains the masters' gold ring, with the glyph in
            the live-state emerald (the "green check circle" of 15/19/40). */}
        <View style={[styles.glyph, isDark && styles.glyphDark]}>
          <Ionicons name={icon} size={44} color={isDark ? colors.emerald : colors.forest} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>

        {details ? <View style={styles.details}>{details}</View> : null}

        <View style={styles.actions}>
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
        </View>
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
  },
  glyphDark: {
    borderWidth: 1,
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
