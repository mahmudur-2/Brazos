import { useModalPresence } from '../hooks/useModalPresence';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { RemoteImage } from './RemoteImage';
import { spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

export type ViewerItem = { kind: 'photo' | 'video'; url: string };

/**
 * One page of a clip: its own player, paused whenever it is not the page in
 * view, played only from its native controls — sound never starts on its own
 * (components/JobVideo.tsx's rule).
 */
function VideoPage({ url, active, width, height }: { url: string; active: boolean; width: number; height: number }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  return <VideoView player={player} style={{ width, height }} nativeControls contentFit="contain" />;
}

/**
 * 2026-09-28 (LUX-LIST-64 #38) — THE POSTING'S MEDIA, FULL SCREEN: the review
 * summary's tiles open here (refs/job-summary.html `.viewer`). A swipe between
 * pages, "2 / 3" and the kind at the top, a round close, and dots under the
 * media; a clip plays from its native controls. Always on the media chrome —
 * the near-black every photo viewer in the app sits on — in either theme.
 */
export function MediaViewer({
  visible,
  items,
  index,
  onClose,
}: {
  visible: boolean;
  items: readonly ViewerItem[];
  index: number;
  onClose: () => void;
}) {
  const { palette: colors } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const styles = stylesFor(colors);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(index);
  const listRef = useRef<FlatList<ViewerItem>>(null);

  useEffect(() => {
    if (visible) setPage(index);
  }, [visible, index]);

  const mediaHeight = Math.round(height * 0.62);
  const current = items[page];

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(Math.max(0, Math.min(items.length - 1, next)));
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <View>
            <Text style={styles.count}>
              {items.length > 0 ? `${page + 1} / ${items.length}` : ''}
            </Text>
            <Text style={styles.kind}>{current?.kind === 'video' ? 'Video' : 'Photo'}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
        </View>
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(index, Math.max(0, items.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(item) => item.url}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.list}
          renderItem={({ item, index: i }) => (
            <View style={[styles.page, { width }]}>
              {item.kind === 'photo' ? (
                <RemoteImage uri={item.url} style={{ width, height: mediaHeight }} contentFit="contain" />
              ) : (
                <VideoPage url={item.url} active={i === page} width={width} height={mediaHeight} />
              )}
            </View>
          )}
        />
        {items.length > 1 ? (
          <View style={styles.dots}>
            {items.map((item, i) => (
              <View key={item.url} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.mediaChrome,
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    count: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.white,
    },
    kind: {
      marginTop: 2,
      fontSize: 12,
      color: withAlpha(colors.white, 0.62),
    },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.white, 0.08),
    },
    closePressed: {
      transform: [{ scale: 0.94 }],
    },
    list: {
      flexGrow: 0,
      marginTop: 'auto',
      marginBottom: 'auto',
    },
    page: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(colors.white, 0.25),
    },
    dotOn: {
      width: 18,
      backgroundColor: colors.white,
    },
  })
);
