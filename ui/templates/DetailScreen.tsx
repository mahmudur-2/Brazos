import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from '../../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { usePinnedFooterPadding, useScrollClearance } from '../primitives';
import { layout, radius, spacing, type EmeraldPalette } from '../tokens';
import { EYEBROW_TYPE, screenGround, themedStyles, useThemeColors } from '../../lib/theme';
import { useOverrideNumber } from '../../lib/designOverrides';
import { ScreenStateView, isReady, type ScreenState } from './ScreenStates';

/**
 * The detail template (§I): optional media header, stacked sections, and a
 * sticky action bar.
 *
 * The action bar sits outside the scroller on purpose — the primary decision
 * on a job or a bid should never require scrolling to find. When there is no
 * action, the scroller instead gets bottom padding that clears the floating
 * nav, so content is not hidden behind it either way.
 */

export type DetailSection = {
  /** Omit for an untitled block (a lede paragraph, a card). */
  title?: string;
  /** 2026-09-29 (LUX-LIST-2 #4): 'gold' — one of the kept-gold labels (YOUR STATUS, LEDGER). */
  titleTone?: 'gold';
  content: ReactNode;
};

type DetailScreenProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** 2026-09-29 (LUX-LIST-2 #8): the header's back label; '' draws the disc alone (the feed). */
  backLabel?: string;
  headerRight?: ReactNode;

  /** A single hero image. Rendered at a fixed aspect ratio, never a fixed
   *  pixel height, so it scales with the device width. */
  mediaUri?: string;
  /** Anything richer than one image — a MediaGrid, a map. Wins over mediaUri. */
  media?: ReactNode;

  sections: readonly DetailSection[];
  /** Pinned above the bottom edge; the screen's decision point. */
  actionBar?: ReactNode;

  state?: ScreenState;
  insideTabs?: boolean;
};

export function DetailScreen({
  title,
  subtitle,
  onBack,
  backLabel,
  headerRight,
  mediaUri,
  media,
  sections,
  actionBar,
  state,
  insideTabs = true,
}: DetailScreenProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): whichever of the two bottom elements is last on screen takes
  // the pill's real footprint — the action bar when there is one, otherwise
  // the scroller.
  const navClearance = useScrollClearance();
  const footerPad = usePinnedFooterPadding();
  // RUN S2 (C9) — the layout dials, live across every template screen.
  const pagePadDial = useOverrideNumber('layout.pagePadding');
  const topPadDial = useOverrideNumber('layout.contentTopPad');
  const sectionGapDial = useOverrideNumber('layout.detailSectionGap');
  const layoutDial = {
    ...(pagePadDial != null ? { paddingHorizontal: pagePadDial } : null),
    ...(topPadDial != null ? { paddingTop: topPadDial } : null),
    ...(sectionGapDial != null ? { gap: sectionGapDial } : null),
  };
  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} backLabel={backLabel} right={headerRight} />

      {!isReady(state) ? (
        <ScreenStateView state={state as Exclude<ScreenState, { kind: 'ready' }>} />
      ) : (
        <>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              layoutDial,
              // With an action bar, that bar handles bottom clearance; without
              // one, the scroller has to clear the floating nav itself.
              !actionBar && insideTabs && { paddingBottom: navClearance },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {media ? (
              <View style={styles.media}>{media}</View>
            ) : mediaUri ? (
              <RemoteImage uri={mediaUri} style={styles.hero} contentFit="cover" />
            ) : null}

            {sections.map((section, index) => (
              <View key={section.title ?? `section-${index}`} style={styles.section}>
                {section.title ? <Text accessibilityRole="header" style={[styles.sectionTitle, section.titleTone === 'gold' && styles.sectionTitleGold]}>{section.title}</Text> : null}
                {section.content}
              </View>
            ))}
          </ScrollView>

          {actionBar ? (
            <View
              style={[
                styles.actionBar,
                // home(7): same rule as FormScreen's footer, and the same
                // correction. A PINNED action bar does not travel under the
                // pill, so it does not reserve the pill's footprint a second
                // time; it takes its own breathing room. The scroller above
                // still clears the pill when there is no action bar at all.
                { paddingBottom: footerPad },
              ]}
            >
              {actionBar}
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.lg + spacing.xs,
  },
  media: {
    gap: spacing.sm,
  },
  hero: {
    width: '100%',
    // Ratio, not a height: scales with the device instead of assuming 390pt.
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  section: {
    gap: spacing.md,
  },
  // 2026-09-27 (the Lux remake, ruling 4): a section's heading is the Lux
  // eyebrow — gold in dark, emerald in light through the `eyebrow` role; the
  // measure is one for both.
  sectionTitle: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  sectionTitleGold: { color: colors.eyebrowGold },
  actionBar: {
    padding: layout.screenGutter,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  }),
);
