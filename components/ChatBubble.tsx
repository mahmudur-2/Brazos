import { Pressable, Image, StyleSheet, Text, View } from 'react-native';
import { AvatarPressable } from './AvatarPressable';
import { VoiceNote } from './VoiceNote';
import { colors, radius, shadows, spacing } from '../lib/theme';
import { formatClockTime } from '../lib/time';
import { messagePreviewText, type Message } from '../lib/messages';
import type { Reaction } from '../lib/reactions';

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  reactions?: Reaction[];
  onLongPress?: () => void;
  onPressImage?: (url: string) => void;
  /** The quoted message, already resolved from the loaded thread. */
  replyTo?: Message | null;
  /** Display name for the quoted message's sender. */
  replyToName?: string | null;
  /** Long-press on the counterparty's avatar — opens it full-screen. */
  onLongPressAvatar?: () => void;
};

export function ChatBubble({
  message,
  isOwn,
  senderName,
  senderAvatarUrl,
  reactions = [],
  onLongPress,
  onPressImage,
  replyTo,
  replyToName,
  onLongPressAvatar,
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
        <AvatarPressable
          name={senderName}
          uri={senderAvatarUrl}
          size={28}
          onLongPress={onLongPressAvatar}
        />
      )}

      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        style={styles.bubbleWrap}
      >
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {/* Quoted reply strip, WhatsApp-style: an accent rail, the original
              sender's name, and a one-line summary of what's being replied to. */}
          {replyTo && (
            <View style={[styles.quote, isOwn ? styles.quoteOwn : styles.quoteOther]}>
              <View
                style={[styles.quoteBar, isOwn ? styles.quoteBarOwn : styles.quoteBarOther]}
              />
              <View style={styles.quoteBody}>
                <Text
                  style={[styles.quoteName, isOwn && styles.quoteNameOwn]}
                  numberOfLines={1}
                >
                  {replyToName ?? 'Message'}
                </Text>
                <Text
                  style={[styles.quoteText, isOwn && styles.quoteTextOwn]}
                  numberOfLines={1}
                >
                  {messagePreviewText(replyTo)}
                </Text>
              </View>
              {replyTo.image_url ? (
                <Image source={{ uri: replyTo.image_url }} style={styles.quoteThumb} />
              ) : null}
            </View>
          )}

          {message.image_url ? (
            // onLongPress is forwarded here as well as on the wrapper: this
            // inner Pressable claims the touch, so without it a long-press on
            // a photo never reached the reaction picker the way it does on a
            // text message.
            <Pressable
              onPress={() => onPressImage?.(message.image_url!)}
              onLongPress={onLongPress}
              delayLongPress={350}
            >
              <Image source={{ uri: message.image_url }} style={styles.image} />
            </Pressable>
          ) : null}
          {message.audio_url ? (
            <VoiceNote
              url={message.audio_url}
              durationMs={message.audio_duration_ms}
              isOwn={isOwn}
            />
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
  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingRight: spacing.sm,
    overflow: 'hidden',
  },
  quoteOwn: {
    backgroundColor: 'rgba(244,241,232,0.16)',
  },
  quoteOther: {
    backgroundColor: colors.primarySoft,
  },
  quoteBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  quoteBarOwn: {
    backgroundColor: colors.onPrimary,
  },
  quoteBarOther: {
    backgroundColor: colors.primary,
  },
  quoteBody: {
    flex: 1,
    gap: 1,
  },
  quoteName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  quoteNameOwn: {
    color: colors.onPrimary,
  },
  quoteText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  quoteTextOwn: {
    color: 'rgba(244,241,232,0.8)',
  },
  quoteThumb: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
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
