import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from '../../components/RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, withAlpha, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

/**
 * A responsive grid of media thumbnails (§I).
 *
 * Sizing is percentage-based with a flex-wrap row rather than a computed
 * pixel width from `Dimensions`, so it reflows correctly on any screen and
 * on rotation without listening for size changes — §I's "no fixed 390x844
 * assumptions" applied literally.
 *
 * Video items render a labelled poster tile rather than a real frame grab:
 * no thumbnail library is installed and DECISIONS.md D-video already settled
 * that a labelled tile beats adding a dependency for this.
 */

export type MediaItem = {
  /** Remote or local URI. */
  uri: string;
  kind?: 'photo' | 'video';
};

type MediaGridProps = {
  items: readonly MediaItem[];
  /** 2 or 3 across. Defaults to 3, the gallery density. */
  columns?: 2 | 3;
  onPressItem?: (item: MediaItem, index: number) => void;
  /** Renders a remove affordance per tile. */
  onRemoveItem?: (item: MediaItem, index: number) => void;
  emptyLabel?: string;
};

export function MediaGrid({
  items,
  columns = 3,
  onPressItem,
  onRemoveItem,
  emptyLabel,
}: MediaGridProps) {
  const { emerald: colors } = useThemeColors();
  const styles = stylesFor(colors);
  if (items.length === 0) {
    return emptyLabel ? (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={20} color={colors.muted} />
        <Text style={styles.emptyLabel}>{emptyLabel}</Text>
      </View>
    ) : null;
  }

  // Percentage width minus the gap's share, so tiles stay square-ish and the
  // row wraps cleanly at any container width.
  const basis = columns === 2 ? '48%' : '31.5%';

  return (
    <View style={styles.grid}>
      {items.map((item, index) => {
        const isVideo = item.kind === 'video';
        const tile = (
          <>
            <RemoteImage uri={item.uri} style={styles.image} contentFit="cover" />
            {isVideo ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={12} color={colors.onForest} />
                <Text style={styles.videoLabel}>Video</Text>
              </View>
            ) : null}
            {onRemoveItem ? (
              <Pressable
                style={styles.remove}
                onPress={() => onRemoveItem(item, index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${isVideo ? 'video' : 'photo'} ${index + 1}`}
              >
                <Ionicons name="close" size={14} color={colors.onForest} />
              </Pressable>
            ) : null}
          </>
        );

        return onPressItem ? (
          <Pressable
            key={`${item.uri}-${index}`}
            style={({ pressed }) => [styles.tile, { width: basis }, pressed && styles.pressed]}
            onPress={() => onPressItem(item, index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${isVideo ? 'Video' : 'Photo'} ${index + 1} of ${items.length}`}
          >
            {tile}
          </Pressable>
        ) : (
          <View key={`${item.uri}-${index}`} style={[styles.tile, { width: basis }]}>
            {tile}
          </View>
        );
      })}
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    // Square tiles at whatever the percentage resolves to.
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.mint,
  },
  pressed: {
    opacity: 0.85,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.ink, 0.72),
  },
  videoLabel: {
    ...typeScale.caption,
    color: colors.onForest,
    fontWeight: '700',
  },
  remove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.ink, 0.72),
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  emptyLabel: {
    ...typeScale.sub,
    color: colors.muted,
  },
  }),
);
