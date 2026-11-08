import { useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from './PressScale';
import {
  discs,
  fonts,
  metricStyles,
  spacing,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { backLandsOnHome } from '../lib/navigationRef';

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
   *  counterparty avatar is the first user. A header with a `leading` view is
   *  a conversation's identity row, not a screen title: it keeps the title
   *  beside the face rather than centring it. */
  leading?: ReactNode;
  /** Bumps the title's own size (the conversation row only). */
  titleSize?: number;
  /**
   * The name of where Back goes — "Home", "Media" — beside the round back
   * button. Omitted, the header names "Home" by itself whenever Back lands on
   * a Home root (#60); anywhere else the disc stands alone.
   */
  backLabel?: string;
  /**
   * The mirror of `backLabel` at the far edge: the next step's name and a
   * round forward button, for a header that OWNS a flow's forward step
   * instead of leaving it to a footer button. Muted and inert while
   * `rightDisabled`.
   */
  rightLabel?: string;
  onPressRight?: () => void;
  rightDisabled?: boolean;
  /** Kept for the callers that asked for it; every titled header centres now. */
  centerTitle?: boolean;
  /**
   * 2026-09-28 (LUX-LIST-64 #27) — a TAB ROOT's big title: Inbox, Discover and
   * Profile carry one large title on the left at 34, the rest of the app a
   * centred 17. With a back button (Discover pushed from Home) the back row
   * sits above the big title.
   */
  largeTitle?: boolean;
};

/**
 * 2026-09-28 (LUX-LIST-64 #60) — does Back land on a Home root? The screen's
 * own stack is read here; everything above it through lib/navigationRef.ts's
 * backLandsOnHome(), a read that never dispatches. Outside a navigator (a
 * harness, a sheet) there is no answer, so no label.
 */
function useBackLandsOnHome(enabled: boolean): boolean {
  const navigation = useContext(NavigationContext);
  if (!enabled || !navigation) return false;
  try {
    return backLandsOnHome(navigation.getState());
  } catch {
    return false;
  }
}

/**
 * The centred title's inset before the edge groups are measured. RUN T1 (D7) —
 * A FUNCTION, NOT A CONST: `spacing.xxl` is a live getter, and a module-scope
 * product would freeze it and defeat the spacing dial in silence.
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
  backLabel: backLabelProp,
  rightLabel,
  onPressRight,
  rightDisabled = false,
  largeTitle = false,
}: ScreenHeaderProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  // Every dark master draws the back chevron in gold — it is the one piece of
  // chrome the whole set agrees on. Light keeps the ink chevron.
  const backColor = isDark ? palette.gold : palette.text;
  const landsHome = useBackLandsOnHome(!!onBack && backLabelProp === undefined);
  const backLabel = backLabelProp ?? (landsHome ? 'Home' : undefined);

  // The edge groups are measured so a long centred title truncates into the
  // space BETWEEN them instead of running under a labelled link.
  const [edgeWidth, setEdgeWidth] = useState({ left: 0, right: 0 });
  const measure = (side: 'left' | 'right') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setEdgeWidth((prev) => (prev[side] === width ? prev : { ...prev, [side]: width }));
  };

  // 2026-09-28 (LUX-LIST-64 #22) — THE ROUND HEADER BUTTON: one disc for Back
  // and for a flow's forward step, the chevron optically centred in it. Dark
  // wears the glass card's ink inside the card rim (ui/tokens.ts `discs`);
  // light keeps its faint ink disc.
  const discStyle = isDark
    ? {
        backgroundColor: withAlpha(discs.header.ink, discs.header.inkAlpha),
        borderColor: withAlpha(discs.header.rim, discs.header.rimAlpha),
      }
    : { backgroundColor: withAlpha(palette.text, 0.08), borderColor: withAlpha(palette.text, 0.1) };

  const titleText = (
    // Fix run E4: the screen's title is VoiceOver's first heading (the rotor jumps by these).
    <Text
      accessibilityRole="header"
      style={[
        leading ? styles.titleConversation : largeTitle ? styles.titleLarge : styles.title,
        { color: palette.text },
        // flexShrink (not flex:1) so a long title truncates instead of
        // shoving titleIcon off the row — the icon stays adjacent either way.
        titleIcon ? styles.titleShrinkable : null,
        leading && titleSize ? { fontSize: titleSize } : null,
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
          style={[
            leading ? styles.subtitleConversation : largeTitle ? styles.subtitleLarge : styles.subtitle,
            { color: palette.textMuted },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  // The disc and its label are ONE control — same press, same colour, same
  // hit slop, and (n5, 2026-09-04) a role with a name either way, so
  // VoiceOver says "Back" for the bare disc too.
  const backControl = onBack ? (
    <PressScale
      onPress={onBack}
      hitSlop={10}
      style={styles.link}
      accessibilityRole="button"
      accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Back'}
    >
      <View style={[styles.disc, discStyle]}>
        <Ionicons
          name="chevron-back"
          size={20}
          color={backColor}
          style={styles.chevronBack}
        />
      </View>
      {backLabel ? (
        <Text style={[styles.linkLabel, { color: backColor }]} numberOfLines={1}>
          {backLabel}
        </Text>
      ) : null}
    </PressScale>
  ) : null;

  // Disabled is a MUTED link, never a hidden one: the step you cannot reach
  // yet has to stay visible or the header loses a control between renders.
  const rightControl =
    rightLabel && onPressRight ? (
      <PressScale
        onPress={onPressRight}
        disabled={rightDisabled}
        hitSlop={10}
        style={styles.link}
        accessibilityRole="button"
        accessibilityLabel={`Continue to ${rightLabel}`}
        accessibilityState={{ disabled: rightDisabled }}
      >
        <Text style={[styles.linkLabel, { color: rightDisabled ? palette.textSubtle : backColor }]} numberOfLines={1}>
          {rightLabel}
        </Text>
        <View style={[styles.disc, discStyle]}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={rightDisabled ? palette.textSubtle : backColor}
            style={styles.chevronForward}
          />
        </View>
      </PressScale>
    ) : right ? (
      right
    ) : null;

  // A conversation's identity row: the face and the name beside Back.
  if (leading) {
    return (
      <View style={[styles.container, styles.containerRow]}>
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

  // A tab root: one big title on the left; Back (when pushed) on its own row above.
  if (largeTitle) {
    return (
      <View style={[styles.container, styles.containerLarge]}>
        {backControl ? <View style={styles.largeBackRow}>{backControl}</View> : null}
        <View style={styles.containerRow}>
          <View style={styles.titles}>{titles}</View>
          {rightControl ? <View style={styles.right}>{rightControl}</View> : null}
        </View>
      </View>
    );
  }

  // Before the edges are measured the title keeps the old inset on each side;
  // after, the wider edge group plus a breath, so it stays truly centred.
  const measured =
    edgeWidth.left || edgeWidth.right ? Math.max(edgeWidth.left, edgeWidth.right) + spacing.sm : null;
  const leftInset = measured ?? centeredTitleInset();
  const rightInset = measured ?? centeredTitleInset();
  const titleBlock = onPressTitle ? (
    <Pressable onPress={onPressTitle} style={styles.titlePress}>
      {titles}
    </Pressable>
  ) : (
    titles
  );
  return (
    <View style={[styles.container, styles.containerRow, styles.containerCentered]}>
      {/* First, so both edge slots paint above it — a long title truncates
          into its inset instead of covering a link. */}
      <View
        style={[
          styles.centerTitles,
          { left: spacing.lg + leftInset, right: spacing.lg + rightInset, alignItems: 'center' },
        ]}
        pointerEvents={onPressTitle ? 'box-none' : 'none'}
      >
        {titleBlock}
      </View>
      <View style={styles.edge} onLayout={measure('left')}>
        {backControl}
      </View>
      <View style={[styles.edge, styles.edgeEnd]} onLayout={measure('right')}>
        {rightControl}
      </View>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  // 2026-09-28 (LUX-LIST-64 #29): the header sits just under the status bar —
  // 4pt above the 44pt row, no empty band — and 8pt above the content.
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  containerCentered: {
    justifyContent: 'space-between',
  },
  containerLarge: {
    gap: spacing.xs,
  },
  largeBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  // The Lux page's round button: 36, a 1pt rim, the chevron centred; its
  // colours are set at render from the palette.
  disc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Measured in the render: the chevron's ink box AND its centre of mass sit
  // on the disc's centre with no nudge (the old bare chevron read left of
  // centre — #22's complaint), so neither carries one.
  chevronBack: { marginLeft: 0 },
  chevronForward: { marginLeft: 0 },
  // Both edge links. >= 44pt tall because they are the ONLY way through the
  // flow once the footer buttons are gone (CLAUDE.md's touch floor).
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  // A press settles the control a touch — a scale, never a fade (a muted control is a colour, so
  // a dim would read as disabled): FIX-RUN F12 made it the shared press spring (PressScale).
  // 2026-09-28 (#30): the side labels speak at the title's own 17/700.
  linkLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  edge: {
    flexShrink: 1,
    zIndex: 1,
  },
  edgeEnd: {
    alignItems: 'flex-end',
  },
  centerTitles: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.sm,
    justifyContent: 'center',
  },
  titlePress: {
    alignItems: 'center',
  },
  titles: {
    flex: 1,
  },
  // 2026-09-28 (LUX-LIST-64 #22, #27): ONE TITLE SYSTEM — a screen with a back
  // button carries its title centred on that row at 17/700 (the size "Setup"
  // always used); the tab roots carry the big left title below.
  title: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleLarge: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  // The conversation row's name, beside the face — its size as it always was.
  titleConversation: {
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
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  subtitleConversation: {
    fontSize: 14,
    marginTop: 2,
  },
  subtitleLarge: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
}));
