import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { fonts, metricStyles, spacing, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { useOverrideNumber, useOverrideString } from '../lib/designOverrides';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Makes the title/subtitle block tappable — e.g. chat's title opening the
   *  counterparty's profile. Omitted, the block renders inert as before. */
  onPressTitle?: () => void;
  /** Overrides title/subtitle/back-icon colors, e.g. for the Map tab's dark mode. */
  palette?: ColorPalette;
  /** Small glyph rendered inline immediately after the title text. Distinct
   *  from `right`, which pins its content to the far edge of the header. */
  titleIcon?: ReactNode;
  /** Rendered between the back control and the title block — chat's
   *  counterparty avatar is the first user. Distinct from `titleIcon`, which
   *  sits AFTER the title text and scrolls with it, and from `right`, which
   *  pins to the far edge. */
  leading?: ReactNode;
  /** Bumps the title's own size. Defaults to the standard 24. */
  titleSize?: number;
  /**
   * Turns the bare back chevron into a LABELLED link — "‹ Home", "‹ Media" —
   * in the same treatment the chevron already carries. Requires `onBack`;
   * without it the header renders the chevron alone, exactly as before.
   */
  backLabel?: string;
  /**
   * The mirror of `backLabel` at the far edge: a labelled link with a trailing
   * chevron, for a header that OWNS a flow's forward step instead of leaving
   * it to a footer button. Muted and inert while `rightDisabled`.
   *
   * Distinct from `right`, which takes arbitrary content and is what every
   * pre-existing caller uses; a header may carry either, and passing neither
   * leaves that edge empty as it always was.
   */
  rightLabel?: string;
  onPressRight?: () => void;
  rightDisabled?: boolean;
  /**
   * Centres the title between the two edges rather than letting it sit next
   * to the back control. For a header whose two edges are both navigation:
   * the title has to stay put across the steps or it reads as a fifth control
   * shuffling around.
   */
  centerTitle?: boolean;
};

/**
 * How much room the centred title leaves for the edge links on either side.
 * The title truncates into it rather than sliding off centre, which is the
 * whole point of centring it — a title that recentres itself around a longer
 * link is exactly the wandering this avoids.
 *
 * RUN T1 (D7) — A FUNCTION, NOT A CONST. `spacing.xxl` is a live getter now,
 * and `const X = spacing.xxl * 3` READS IT ONCE at import and freezes the
 * answer, which is precisely the shape that would defeat the spacing dial in
 * silence. Reading it at use time is the fix; the arithmetic is unchanged.
 */
const centeredTitleInset = () => spacing.xxl * 3;

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  onPressTitle,
  palette: paletteProp,
  titleIcon,
  leading,
  titleSize,
  backLabel,
  rightLabel,
  onPressRight,
  rightDisabled = false,
  centerTitle = false,
}: ScreenHeaderProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  // Every dark master draws the back chevron in gold — it is the one piece of
  // chrome the whole set agrees on. Light keeps the ink chevron.
  const backColor = isDark ? palette.gold : palette.text;

  // RUN S2 (C9) — the chrome dials. The header paints no surface of its own
  // today (the screen's ground shows through), so the border dial ADDS a
  // hairline when turned; every other default is the shipped value.
  const padXDial = useOverrideNumber('header.padX');
  const padYDial = useOverrideNumber('header.padY');
  const minHeightDial = useOverrideNumber('header.minHeight');
  const alignDial = useOverrideString('header.titleAlign');
  const backSizeDial = useOverrideNumber('header.backSize');
  const backOffsetDial = useOverrideNumber('header.backOffsetX');
  const borderWidthDial = useOverrideNumber('header.borderBottomWidth');
  const borderColorDial = useOverrideString('header.borderColor');
  const borderAlphaDial = useOverrideNumber('header.borderAlpha');
  const containerDial = {
    ...(padXDial != null ? { paddingHorizontal: padXDial } : null),
    ...(padYDial != null ? { paddingVertical: padYDial } : null),
    ...(minHeightDial != null && minHeightDial > 0 ? { minHeight: minHeightDial } : null),
    ...(borderWidthDial != null && borderWidthDial > 0
      ? {
          borderBottomWidth: borderWidthDial,
          borderBottomColor: withAlpha(borderColorDial ?? palette.border, borderAlphaDial ?? 1),
        }
      : null),
  };
  const centered = alignDial === 'center' ? true : alignDial === 'left' ? false : centerTitle;
  const titleText = (
    <Text
      style={[
        styles.title,
        { color: palette.text },
        // flexShrink (not flex:1) so a long title truncates instead of
        // shoving titleIcon off the row — the icon stays adjacent either way.
        titleIcon ? styles.titleShrinkable : null,
        titleSize ? { fontSize: titleSize } : null,
      ]}
      numberOfLines={1}
    >
      {title}
    </Text>
  );

  const titles = (
    <>
      {titleIcon ? (
        <View style={styles.titleRow}>
          {titleText}
          {titleIcon}
        </View>
      ) : (
        titleText
      )}
      {subtitle ? (
        <Text
          style={[styles.subtitle, { color: palette.textMuted }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  // The bare chevron and the labelled link are ONE control in two lengths —
  // same press, same colour, same hit slop, and (n5, 2026-09-04) the same
  // role with a name either way, so VoiceOver can say "Back" for the bare
  // chevron too — so a flow that labels its back step cannot drift into a
  // second back treatment.
  const backControl = onBack ? (
    <Pressable
      onPress={onBack}
      hitSlop={10}
      style={[
        backLabel ? styles.link : styles.back,
        backOffsetDial != null && { marginLeft: backOffsetDial },
      ]}
      accessibilityRole="button"
      accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Back'}
    >
      <Ionicons name="chevron-back" size={backLabel ? 20 : (backSizeDial ?? 26)} color={backColor} />
      {backLabel ? (
        <Text style={[styles.linkLabel, { color: backColor }]} numberOfLines={1}>
          {backLabel}
        </Text>
      ) : null}
    </Pressable>
  ) : null;

  // Disabled is a MUTED link, never a hidden one: the step you cannot reach
  // yet has to stay visible or the header loses a control between renders.
  const rightControl =
    rightLabel && onPressRight ? (
      <Pressable
        onPress={onPressRight}
        disabled={rightDisabled}
        hitSlop={10}
        style={styles.link}
        accessibilityRole="button"
        accessibilityLabel={`Continue to ${rightLabel}`}
        accessibilityState={{ disabled: rightDisabled }}
      >
        <Text
          style={[
            styles.linkLabel,
            { color: rightDisabled ? palette.textSubtle : backColor },
          ]}
          numberOfLines={1}
        >
          {rightLabel}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={rightDisabled ? palette.textSubtle : backColor}
        />
      </Pressable>
    ) : null;

  if (centered) {
    return (
      <View style={[styles.container, styles.containerCentered, containerDial]}>
        {/* First, so both edge slots paint above it — a long title truncates
            into its inset instead of covering a link. */}
        <View style={styles.centerTitles} pointerEvents="none">
          {titles}
        </View>
        <View style={styles.edge}>{backControl}</View>
        <View style={[styles.edge, styles.edgeEnd]}>{rightControl}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, containerDial]}>
      {backControl}

      {leading}

      {onPressTitle ? (
        <Pressable style={styles.titles} onPress={onPressTitle}>
          {titles}
        </Pressable>
      ) : (
        <View style={styles.titles}>{titles}</View>
      )}

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  containerCentered: {
    justifyContent: 'space-between',
  },
  back: {
    marginLeft: -spacing.xs,
  },
  // Both edge links. >= 44pt tall because they are the ONLY way through the
  // flow once the footer buttons are gone (CLAUDE.md's touch floor).
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  edge: {
    flexShrink: 1,
  },
  edgeEnd: {
    alignItems: 'flex-end',
  },
  centerTitles: {
    position: 'absolute',
    left: centeredTitleInset(),
    right: centeredTitleInset(),
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
  },
  // Decision 9: a screen title is display type. Every master draws the
  // header title in the serif, both trees and both themes.
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleShrinkable: {
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
}));
