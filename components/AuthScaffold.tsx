import { useRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoid } from './KeyboardAvoid';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { authSurface, fonts, useThemeColors, withAlpha } from '../lib/theme';
import { backgroundImageStyle } from '../ui/primitives/LitSurface';
import type { AuthBackdropVariant } from './AuthBackdrop';
import { KeyboardRisingColumn } from './KeyboardRisingColumn';
import { COLUMN_BOTTOM_PADDING } from './KeyboardRisingColumn.shared';

/**
 * 2026-09-21 — THE KEYBOARD, on the sign-in pages (DECISIONS 21, 22).
 *
 * `lift` is spent over the keyboard's first LIFT_OVER points of travel, so the
 * column has finished moving before the keyboard has — the keyboard's own
 * curve eases out, and a lift that tracked it to the end would still be
 * creeping while the keys were already still. Every real keyboard rises past
 * this (the shortest, a number pad on a small phone, about 260 clear of the
 * inset), so the lift always completes.
 *
 * The footer rests FOOTER_REST_GAP above the safe inset plus the column's own
 * COLUMN_BOTTOM_PADDING — 12 + 12, the 24 the body's padding once gave the
 * scroll content. Risen, its LEAD control's bottom edge sits ON the keyboard
 * (DECISIONS 22: "don't add space between keyboard and the continue
 * button"): the rise is the keyboard's height less the inset, both gaps, and
 * `footerBelowLead` — whatever the footer stacks under its lead, which goes
 * under the keyboard.
 */
const LIFT_OVER = 200;
const FOOTER_REST_GAP = authSpacing.md;

/**
 * The back control's press: the iOS circular button's dip — a quick scale in,
 * a springy return, on the native driver. The fill's darkening is the
 * Pressable's own pressed state (a colour, so not animated).
 */
const BACK_PRESS_SCALE = 0.88;
const BACK_PRESS_IN_MS = 90;
const BACK_FILL_ALPHA = 0.08;
const BACK_FILL_PRESSED_ALPHA = 0.16;

function BackButton({
  onPress,
  themed,
  color,
  fill,
}: {
  onPress: () => void;
  themed: boolean;
  color: string;
  fill: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // Untouched screens (not themed) keep the plain 22 chevron on a bare 44
  // hit box, byte for byte; the themed sign-in pages get the ship page's
  // circle — a 36 disc at the ink's own faint alpha — with the chevron a size
  // down, inside the same 44 target.
  if (!themed) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={color} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.timing(scale, {
          toValue: BACK_PRESS_SCALE,
          duration: BACK_PRESS_IN_MS,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          speed: 40,
          bounciness: 8,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start()
      }
      hitSlop={8}
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.backCircle,
            { backgroundColor: pressed ? withAlpha(fill, BACK_FILL_PRESSED_ALPHA) : withAlpha(fill, BACK_FILL_ALPHA) },
            { transform: [{ scale }] },
          ]}
        >
          <Ionicons name="chevron-back" size={authSizes.backChevron} color={color} />
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * 2026-09-21 — THE GROUND OF THE SHIPPED WELCOME PAGE (docs/mockups/html/lux/
 * welcome-ship.html, and -light): four layers, the page's own numbers.
 *
 *   base    dark: linear-gradient(165deg, authGroundTop 0%, authGroundMid 55%,
 *           authGroundBottom 100%); light: the three stops are the ivory bg,
 *           so nothing is drawn over the flat surface.
 *   glow    a radial ellipse 72% × 46% of the screen, centred at (50%, 36%),
 *           the accent from .18 (dark) / .07 (light) to nothing at 70 %.
 *   corner  a 300-pt circle centred on the top-right corner, the gold from
 *           .13 (dark) / .16 (light) to nothing.
 *   foot    from the 62 % mark to the bottom, the shade to .26 (dark) / .07.
 *
 * Every one is a View with a gradient — the way every lit surface here is
 * drawn — and the ellipse and the circle are sized Views with a
 * `closest-side` gradient, so no renderer has to understand an explicit
 * radial size. Both themes draw all four; only the alphas differ.
 */
const GROUND = {
  glow: { rx: 0.72, ry: 0.46, cx: 0.5, cy: 0.36, dark: 0.18, light: 0.07, fade: 70 },
  corner: { radius: 300, dark: 0.13, light: 0.16 },
  foot: { from: 62, dark: 0.26, light: 0.07 },
} as const;

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
   * 2026-09-27 (the Lux remake, ruling 7): THE CORNER RINGS ARE GONE from every
   * auth screen, both themes — "the contour arcs AuthBackdrop draws top-right
   * leave every screen". The prop is kept so no caller has to move; it draws
   * nothing. components/AuthBackdrop.tsx stays on disk, mounted by nothing.
   */
  backdrop?: AuthBackdropVariant;
  /**
   * Opt in to the Prestige mapping (masters 2/3/4 only). Absent, the shell
   * renders exactly the Heritage ivory it always has — which is what every
   * other auth screen still gets.
   */
  themed?: boolean;
  /**
   * The shipped Welcome page's ground — see GROUND above. Welcome alone
   * passes it; the form screens keep the flat surface until their own pages
   * are approved. Requires `themed`.
   */
  ground?: boolean;
  /**
   * 2026-09-21 — the sign-in pages' pinned action (DECISIONS 21). Rendered
   * OUTSIDE the scroll as the column's last sibling, resting where the body's
   * own bottom padding would put it (24 above the safe inset), and it RIDES
   * THE KEYBOARD through KeyboardRisingColumn — the seam Chat's composer
   * uses: the keyboard's live frame on the UI thread where the binary can
   * track it, the native-driver imitation with the system's own duration
   * otherwise — its lead control landing ON the keyboard. The scroll content
   * is left alone: no KeyboardAvoidingView padding runs while a footer is
   * present, so nothing re-lays out per frame; the scroll keeps iOS's own
   * keyboard inset so a field can still be reached on a phone too short for
   * all of it.
   */
  footer?: ReactNode;
  /**
   * What the footer stacks BELOW its lead control (points) — the sign-in
   * pages' 12 gap and their 58 "Instead" route. The rise stops with the
   * lead's bottom edge on the keyboard, so this much goes under it; absent,
   * the footer's padded edge lands on the keyboard instead.
   */
  footerBelowLead?: number;
  /**
   * How far the scroll column lifts (points) while the keyboard is up, so the
   * footer keeps clear of the last field — spent from the air above the
   * column's first line. Proportional to the keyboard's rise over its first
   * LIFT_OVER points, on the native driver at the system's own duration
   * (useKeyboardOffset). Absent, nothing lifts.
   */
  lift?: number;
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
  themed = false,
  ground = false,
  footer,
  footerBelowLead = 0,
  lift = 0,
  children,
}: AuthScaffoldProps) {
  const showTopBar = Boolean(title || onBack);
  const { palette, isDark } = useThemeColors();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The keyboard's rise past the safe inset, on the native driver at the
  // system's duration — the lift below is a fraction of it. Subscribed on
  // every auth screen (a hook cannot be conditional); it moves nothing unless
  // `lift` is set, and a screen without a field never sees a keyboard.
  const keyboardRise = useKeyboardOffset(insets.bottom);
  const liftStyle =
    lift > 0
      ? {
          transform: [
            {
              translateY: keyboardRise.interpolate({
                inputRange: [0, LIFT_OVER],
                outputRange: [0, -lift],
                extrapolate: 'clamp',
              }),
            },
          ],
        }
      : null;
  const surface = authSurface(palette, isDark);
  const lit = ground && themed;
  // 2026-09-27 (the Lux remake, ruling 9): the Lux diagonal is the ground of
  // EVERY themed dark screen — the auth flow included — not only Welcome's;
  // Welcome alone keeps the three light layers below (`ground`).
  const groundBase =
    themed && isDark
      ? backgroundImageStyle(
          `linear-gradient(165deg, ${palette.authGroundTop} 0%, ${palette.authGroundMid} 55%, ${palette.authGroundBottom} 100%)`
        )
      : undefined;
  const glowW = width * GROUND.glow.rx * 2;
  const glowH = height * GROUND.glow.ry * 2;
  const glowAlpha = isDark ? GROUND.glow.dark : GROUND.glow.light;
  const cornerAlpha = isDark ? GROUND.corner.dark : GROUND.corner.light;
  const footAlpha = isDark ? GROUND.foot.dark : GROUND.foot.light;
  // Masters 3 and 4 draw the back chevron gold and the bar title in the serif;
  // untouched screens keep the ink chevron and the sans title.
  const chevronColor = themed ? surface.accent : authColors.ink;

  return (
    // The ivory fill and the artwork live outside the safe area, so the art
    // runs to the physical edges of the screen rather than stopping at the
    // status bar inset.
    <View style={[styles.root, themed && { backgroundColor: surface.bg }, groundBase]}>
      {lit ? (
        <View style={styles.layer} pointerEvents="none">
          <View
            style={[
              {
                position: 'absolute',
                width: glowW,
                height: glowH,
                left: width * GROUND.glow.cx - glowW / 2,
                top: height * GROUND.glow.cy - glowH / 2,
              },
              backgroundImageStyle(
                `radial-gradient(ellipse closest-side at 50% 50%, ${withAlpha(palette.authAccent, glowAlpha)} 0%, ${withAlpha(palette.authAccent, 0)} ${GROUND.glow.fade}%)`
              ),
            ]}
          />
          <View
            style={[
              {
                position: 'absolute',
                width: GROUND.corner.radius * 2,
                height: GROUND.corner.radius * 2,
                right: -GROUND.corner.radius,
                top: -GROUND.corner.radius,
              },
              backgroundImageStyle(
                `radial-gradient(circle closest-side at 50% 50%, ${withAlpha(palette.authGold, cornerAlpha)} 0%, ${withAlpha(palette.authGold, 0)} 100%)`
              ),
            ]}
          />
        </View>
      ) : null}
      {lit ? (
        <View
          style={[
            styles.layer,
            backgroundImageStyle(
              `linear-gradient(180deg, ${withAlpha(palette.authShade, 0)} ${GROUND.foot.from}%, ${withAlpha(palette.authShade, footAlpha)} 100%)`
            ),
          ]}
          pointerEvents="none"
        />
      ) : null}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoid
          style={styles.flex}
          // A footer handles the keyboard itself (see the prop); the padding
          // path stays for the screens without one.
          behavior={Platform.OS === 'ios' && !footer ? 'padding' : undefined}
        >
          {showTopBar ? (
            <View style={styles.topBarOuter}>
              <View style={styles.topBar}>
                {onBack ? (
                  <BackButton
                    onPress={onBack}
                    themed={themed}
                    color={chevronColor}
                    fill={surface.ink}
                  />
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
            automaticallyAdjustKeyboardInsets={Boolean(footer)}
          >
            <Animated.View style={[styles.content, liftStyle]}>{children}</Animated.View>
          </ScrollView>
          {footer ? (
            <View style={styles.footerOuter}>
              <KeyboardRisingColumn
                // Everything already between the lead's bottom edge and the
                // screen's: the inset, the resting gap, the column's own
                // padding, and what the footer stacks under the lead. The
                // keyboard covers all of it once up, so the rise subtracts it
                // and the lead lands flush on the keyboard.
                insetBelow={
                  insets.bottom + FOOTER_REST_GAP + COLUMN_BOTTOM_PADDING + footerBelowLead
                }
                style={styles.footer}
              >
                {footer}
              </KeyboardRisingColumn>
            </View>
          ) : null}
        </KeyboardAvoid>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authColors.bg,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
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
  // The ship page's back control: a disc inside the 44 target.
  backCircle: {
    width: authSizes.backCircle,
    height: authSizes.backCircle,
    borderRadius: authSizes.backCircle / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pinned footer: the column's last sibling, the same width and gutters
  // as the content, resting FOOTER_REST_GAP above the safe inset (its own
  // COLUMN_BOTTOM_PADDING makes up the body's 24).
  footerOuter: {
    alignItems: 'center',
    marginBottom: FOOTER_REST_GAP,
  },
  footer: {
    width: '100%',
    maxWidth: authSizes.maxContentWidth,
    paddingHorizontal: authSpacing.gutter,
  },
  topTitle: {
    ...authType.navTitleLarge,
    color: authColors.ink,
    flex: 1,
    textAlign: 'center',
  },
  topTitleLarge: {
    ...authType.navTitleLarge,
  },
  topTitleSerif: {
    // 2026-09-28 (LUX-LIST-64 #27): the bar title is the app's one header size,
    // 17/700 — the themed 21/600 display override is gone.
    fontFamily: fonts.display,
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
