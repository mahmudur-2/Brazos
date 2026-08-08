import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors, layout, radius, spacing, type as typeScale } from '../tokens';
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
  content: ReactNode;
};

type DetailScreenProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
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
  headerRight,
  mediaUri,
  media,
  sections,
  actionBar,
  state,
  insideTabs = true,
}: DetailScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} right={headerRight} />

      {!isReady(state) ? (
        <ScreenStateView state={state as Exclude<ScreenState, { kind: 'ready' }>} />
      ) : (
        <>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              // With an action bar, that bar handles bottom clearance; without
              // one, the scroller has to clear the floating nav itself.
              !actionBar && insideTabs && { paddingBottom: layout.floatingNavClearance },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {media ? (
              <View style={styles.media}>{media}</View>
            ) : mediaUri ? (
              <Image source={{ uri: mediaUri }} style={styles.hero} resizeMode="cover" />
            ) : null}

            {sections.map((section, index) => (
              <View key={section.title ?? `section-${index}`} style={styles.section}>
                {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
                {section.content}
              </View>
            ))}
          </ScrollView>

          {actionBar ? <View style={styles.actionBar}>{actionBar}</View> : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.xl,
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
  sectionTitle: {
    ...typeScale.h2,
    color: colors.ink,
  },
  actionBar: {
    padding: layout.screenGutter,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
