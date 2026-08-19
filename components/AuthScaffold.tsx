import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, fonts, useThemeColors } from '../lib/theme';
import { AuthBackdrop, type AuthBackdropVariant } from './AuthBackdrop';

type AuthScaffoldProps = PropsWithChildren<{
  /** Small centred navigation title, as in the reference's .topbar. */
  title?: string;
  /**
   * `large` is one step up the scale, for a screen where the bar title is the
   * only thing naming the step rather than a label above a form.
   */
  titleVariant?: 'default' | 'large';
  onBack?: () => void;
  /**
   * Decorative contour art behind the content. Off by default so a screen has
   * to opt in — `full` is Welcome's, `soft` is the corner-only version the
   * form screens use to stay part of the same surface without adding noise
   * behind their inputs.
   */
  backdrop?: AuthBackdropVariant;
  /**
   * Opt in to the Prestige mapping (masters 2/3/4 only). Absent, the shell
   * renders exactly the Heritage ivory it always has — which is what every
   * other auth screen still gets.
   */
  themed?: boolean;
}>;

/**
 * Shared shell for the ivory auth screens (Welcome, Sign in, Create account).
 *
 * Owns the four things every one of them needs and none of them should
 * re-derive: the safe area on all four edges (these screens are outside
 * MainTabs, so nothing else reserves the bottom inset), keyboard avoidance,
 * a scroll fallback for short screens, and the max-width container that keeps
 * the mobile composition centred instead of stretched on a wide web window.
 *
 * contentContainer grows to fill, so a child can push itself to the bottom
 * with `marginTop: 'auto'` and still scroll when the viewport is too short.
 */
export function AuthScaffold({
  title,
  titleVariant = 'default',
  onBack,
  backdrop,
  themed = false,
  children,
}: AuthScaffoldProps) {
  const showTopBar = Boolean(title || onBack);
  const { palette, isDark } = useThemeColors();
  const surface = authSurface(palette, isDark);
  // Masters 3 and 4 draw the back chevron gold and the bar title in the serif;
  // untouched screens keep the ink chevron and the sans title.
  const chevronColor = themed ? surface.accent : authColors.ink;

  return (
    // The ivory fill and the artwork live outside the safe area, so the art
    // runs to the physical edges of the screen rather than stopping at the
    // status bar inset.
    <View style={[styles.root, themed && { backgroundColor: surface.bg }]}>
      {backdrop ? <AuthBackdrop variant={backdrop} themed={themed} /> : null}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {showTopBar ? (
            <View style={styles.topBarOuter}>
              <View style={styles.topBar}>
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconButton,
                      pressed && styles.iconButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                  >
                    <Ionicons name="chevron-back" size={22} color={chevronColor} />
                  </Pressable>
                ) : (
                  <View style={styles.iconButton} />
                )}
                <Text
                  style={[
                    styles.topTitle,
                    titleVariant === 'large' && styles.topTitleLarge,
                    themed && styles.topTitleSerif,
                    themed && { color: surface.ink },
                  ]}
                  numberOfLines={1}
                >
                  {title ?? ''}
                </Text>
                {/* Mirrors the back button's width so the title stays optically
                    centred whether or not there's a trailing control. */}
                <View style={styles.iconButton} />
              </View>
            </View>
          ) : null}

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // The composition is designed to fit; scrolling is the short-screen
            // fallback, so it shouldn't rubber-band when there's nothing to see.
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.content}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authColors.bg,
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBarOuter: {
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    maxWidth: authSizes.maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: authSpacing.lg,
    paddingTop: authSpacing.xs,
    paddingBottom: authSpacing.sm,
  },
  iconButton: {
    width: authSizes.iconButton,
    height: authSizes.iconButton,
    borderRadius: authRadius.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    backgroundColor: authColors.mint,
  },
  topTitle: {
    ...authType.navTitle,
    color: authColors.ink,
    flex: 1,
    textAlign: 'center',
  },
  topTitleLarge: {
    ...authType.navTitleLarge,
  },
  topTitleSerif: {
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '600',
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    // flexGrow, not flex — the block fills a tall viewport (so a child can
    // pin itself with marginTop:'auto') but is still allowed to exceed a
    // short one, which is what lets the ScrollView actually scroll.
    flexGrow: 1,
    width: '100%',
    maxWidth: authSizes.maxContentWidth,
    paddingHorizontal: authSpacing.gutter,
  },
});
