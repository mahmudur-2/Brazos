import { Pressable, Image, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { colors, radius, shadows, spacing } from '../lib/theme';
import { formatClockTime } from '../lib/time';
import type { Message } from '../lib/messages';
import type { Reaction } from '../lib/reactions';

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  reactions?: Reaction[];
  onLongPress?: () => void;
};

export function ChatBubble({
  message,
  isOwn,
  senderName,
  senderAvatarUrl,
  reactions = [],
  onLongPress,
}: ChatBubbleProps) {
  return (
    <View
      style={[
        styles.row,
        isOwn ? styles.rowOwn : styles.rowOther,
        reactions.length > 0 && styles.rowWithReaction,
      ]}
    >
      {!isOwn && (
        <Avatar name={senderName} uri={senderAvatarUrl} size={28} />
      )}

      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        style={styles.bubbleWrap}
      >
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {message.image_url ? (
            <Image source={{ uri: message.image_url }} style={styles.image} />
          ) : null}
          {message.content ? (
            <Text style={[styles.text, isOwn && styles.textOwn]}>{message.content}</Text>
          ) : null}
          <Text style={[styles.time, isOwn && styles.timeOwn]}>
            {formatClockTime(message.created_at)}
          </Text>
        </View>

        {reactions.length > 0 && (
          <View
            style={[
              styles.reactionBadge,
              isOwn ? styles.reactionBadgeOwn : styles.reactionBadgeOther,
            ]}
          >
            {reactions.map((r) => (
              <Text key={r.id} style={styles.reactionEmoji}>
                {r.emoji}
              </Text>
            ))}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
    maxWidth: '100%',
  },
  rowOwn: {
    justifyContent: 'flex-end',
    paddingLeft: 40,
  },
  rowOther: {
    justifyContent: 'flex-start',
    paddingRight: 40,
  },
  rowWithReaction: {
    marginBottom: spacing.lg + spacing.xs,
  },
  bubbleWrap: {
    position: 'relative',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
    maxWidth: '82%',
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  textOwn: {
    color: colors.onPrimary,
  },
  time: {
    fontSize: 11,
    color: colors.textSubtle,
    alignSelf: 'flex-end',
  },
  timeOwn: {
    color: 'rgba(244,241,232,0.75)',
  },
  reactionBadge: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    ...shadows.card,
  },
  reactionBadgeOwn: {
    right: 8,
  },
  reactionBadgeOther: {
    left: 8,
  },
  reactionEmoji: {
    fontSize: 13,
  },
});
