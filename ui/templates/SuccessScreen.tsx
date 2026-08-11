import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { colors, controls, layout, radius, spacing, type as typeScale } from '../tokens';

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
  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          insideTabs && { paddingBottom: layout.floatingNavClearance },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glyph}>
          <Ionicons name={icon} size={44} color={colors.forest} />
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
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>
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

const styles = StyleSheet.create({
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
  buttonLabel: {
    ...typeScale.title,
    color: colors.onForest,
  },
  secondaryLabel: {
    color: colors.forest,
  },
  pressed: {
    opacity: 0.85,
  },
});
