import type { ComponentType } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

/**
 * RUN MOTION1 (C4) — EVERY REMOTE PHOTO, THROUGH ONE BOUNDARY.
 *
 * A photo fetched over the network has a LOAD STATE, and react-native's
 * `<Image>` has no opinion about it: the box is whatever colour is behind it
 * until the bytes arrive, and then the photo appears in one frame. Across a
 * grid of job media or a list of avatars that reads as grey boxes popping.
 * expo-image has both halves — a placeholder while it loads and a cross-fade
 * when it lands — so every remote photo in the app is routed through here.
 *
 * LOCAL ART IS NOT ROUTED THROUGH IT AND MUST NOT BE. The hero crops, the gold
 * B drape and the atmosphere raster are `require`d, bundled, and have no load
 * state at all; giving them a placeholder and a transition would fade in
 * something that was never absent.
 *
 * SAME BOUNDARY SHAPE AS lib/haptics.ts AND lib/blur.tsx: one lazy, caught
 * `require`, resolved once. expo-image entered package.json in the run that
 * installed expo-blur and expo-haptics, so the operator's current dev build
 * has no ExpoImage native module and a static import would take the whole
 * screen down rather than one photo. With no handle, this renders react
 * native's own `<Image>` — the exact node every call site had before — so the
 * degraded case is today's app, not a hole.
 *
 * THE PLACEHOLDER IS A COLOUR THE CALLER PASSES, never one written here:
 * CLAUDE.md's literal ban covers this directory, and a placeholder that did
 * not come from the palette would be the one hardcoded colour in the tree.
 * Callers that pass none get expo-image's own transparent placeholder, which
 * is what react-native's Image gives them today.
 */

type ExpoImageProps = {
  source: { uri: string; cacheKey?: string };
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
  transition?: number;
  placeholderContentFit?: 'cover' | 'contain';
  placeholder?: { blurhash: string } | string | null;
  onError?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
};

function load(): ComponentType<ExpoImageProps> | null {
  try {
    const vendor = require('expo-image') as { Image?: unknown } | null;
    return typeof vendor?.Image === 'function'
      ? (vendor.Image as ComponentType<ExpoImageProps>)
      : null;
  } catch {
    return null;
  }
}

/** Resolved once per process; a native module cannot appear mid-session. */
const ExpoImage: ComponentType<ExpoImageProps> | null = load();

/** Whether this binary can cross-fade. Recorded, not branched on by callers. */
export const canTransitionImages = ExpoImage != null;

/**
 * The cross-fade, in ms. Long enough to read as an arrival and short enough
 * that a scrolling list is never mid-fade by the time a row settles.
 */
const IMAGE_TRANSITION_MS = 220;

export type RemoteImageProps = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  /** Defaults to `cover`, which is what all but one call site asked for. */
  contentFit?: 'cover' | 'contain';
  /** A palette colour to hold the box while the photo loads. */
  placeholder?: string | null;
  onError?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  /**
   * F5: the image cache's key when the URL itself is not stable — a signed
   * chat-media URL carries a fresh token each time it is minted. expo-image
   * only; core Image has no such key and keys by the URL.
   */
  cacheKey?: string;
};

export function RemoteImage({
  uri,
  style,
  contentFit = 'cover',
  placeholder = null,
  onError,
  accessible,
  accessibilityLabel,
  cacheKey,
}: RemoteImageProps) {
  if (!ExpoImage) {
    return (
      <Image
        source={{ uri }}
        style={style}
        resizeMode={contentFit}
        onError={onError}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  return (
    <ExpoImage
      source={cacheKey ? { uri, cacheKey } : { uri }}
      style={style}
      contentFit={contentFit}
      transition={IMAGE_TRANSITION_MS}
      placeholder={placeholder}
      placeholderContentFit="cover"
      onError={onError}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
