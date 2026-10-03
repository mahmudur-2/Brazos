import { useModalPresence } from '../hooks/useModalPresence';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sharePhoto } from '../lib/sharing';
import { alertAsync } from '../lib/dialog';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { ZoomableImage } from './ZoomableImage';

type PhotoViewerProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  /**
   * Whether the OS share sheet is offered (button + long-press). Off for
   * profile pictures: saving or forwarding someone else's photo of themselves
   * isn't an affordance this app should hand out, so those get view-only.
   */
  allowShare?: boolean;
  /**
   * FIX-RUN B3 (Apple 1.2): when set, a "Report photo" control sits in the
   * chrome. The viewer closes first and the host opens its ReportDialog once
   * this modal has settled — iOS never stacks the two.
   */
  onReport?: () => void;
};

/**
 * Full-screen, pinch-to-zoom photo viewer — tap a chat photo or a
 * job-completion photo and it opens here instead of sitting at thumbnail
 * size. Dismiss by swiping down, tapping the close button, or (Android)
 * the hardware back button.
 *
 * FIX-RUN F10: the pinch, pan, double tap, swipe-away and long-press share
 * are components/ZoomableImage — on the UI thread where the binary has
 * gesture-handler and Reanimated, on the PanResponder this viewer always had
 * where it does not. The chrome rides the layer that fades as the photo is
 * pulled away, as before.
 */
export function PhotoViewer({
  visible,
  uri,
  onClose,
  allowShare = true,
  onReport,
}: PhotoViewerProps) {
  const { palette: colors } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const styles = stylesFor(colors);
  const { width, height } = useWindowDimensions();
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (!uri || sharing || !allowShare) return;
    setSharing(true);
    const result = await sharePhoto(uri);
    setSharing(false);
    if (!result.ok) await alertAsync('Could not share', result.message);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ZoomableImage
        width={width}
        height={height}
        layerStyle={styles.backdrop}
        resetKey={visible ? uri : null}
        onDismiss={onClose}
        onLongPress={allowShare ? () => void handleShare() : undefined}
        overlay={
          <>
            <Pressable
              onPress={onClose}
              style={[styles.chromeBtn, styles.closeBtn, { top: 48 }]}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={colors.onPrimary} />
            </Pressable>

            {allowShare && (
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                style={[styles.chromeBtn, styles.shareBtn, { top: 48 }]}
                hitSlop={12}
                accessibilityLabel="Share photo"
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Ionicons
                    name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
                    size={24}
                    color={colors.onPrimary}
                  />
                )}
              </Pressable>
            )}

            {onReport ? (
              <Pressable
                onPress={() => {
                  onClose();
                  onReport();
                }}
                style={[styles.chromeBtn, styles.reportBtn]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Report photo"
              >
                <Ionicons name="flag-outline" size={22} color={colors.onPrimary} />
              </Pressable>
            ) : null}
          </>
        }
      >
        {uri ? (
          // RUN MOTION1 (C4) — THE ONE DELIBERATE EXCEPTION to routing remote
          // photos through components/RemoteImage.tsx.
          //
          // The full-screen viewer opens from a thumbnail that has already been
          // fetched, so the bytes are in cache and there is no grey box to
          // cross-fade out of; and the zoom (components/ZoomableImage, FIX-RUN
          // F10) scales this picture to 4x, which wants it at the resolution it
          // has rather than one decimated to its 1x box.
          <Image source={{ uri }} resizeMode="contain" style={{ width, height }} />
        ) : null}
      </ZoomableImage>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.black, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    right: 20,
  },
  shareBtn: {
    left: 20,
  },
  reportBtn: {
    left: 20,
    bottom: 48,
  },
  }),
);
