import { Pressable } from 'react-native';
import { Avatar } from './Avatar';

type AvatarPressableProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
  initialsSize?: number;
  /** Opens the photo full-screen — wire this to a PhotoViewer with
   *  allowShare={false} (a profile picture isn't something to hand
   *  save/forward on, just look at). */
  onLongPress?: () => void;
};

/**
 * Avatar with long-press-to-view-full-screen.
 *
 * Renders a bare Avatar (no Pressable at all) when there's no photo to view
 * or no handler was supplied — an initials-fallback avatar has nothing to
 * show full-screen, and this keeps every call site safe to use unconditionally.
 *
 * Deliberately a separate Pressable rather than folding the long-press into
 * whatever gesture the surrounding row already has (accept a bid, open a
 * profile, a conversation's moderation menu, the profile screen's
 * tap-to-change-photo). Nested Pressables each resolve their own gesture
 * independently — the same pattern already proven for tap-vs-long-press on a
 * chat photo (ChatBubble) — so this never competes with the outer control.
 */
export function AvatarPressable({ name, uri, size = 44, initialsSize, onLongPress }: AvatarPressableProps) {
  if (!uri || !onLongPress) {
    return <Avatar name={name} uri={uri} size={size} initialsSize={initialsSize} />;
  }
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={8}
      accessibilityRole="imagebutton"
      accessibilityLabel={name ? `Photo of ${name}` : 'Profile photo'}
      accessibilityHint="Touch and hold to see it full screen"
    >
      <Avatar name={name} uri={uri} size={size} initialsSize={initialsSize} />
    </Pressable>
  );
}
