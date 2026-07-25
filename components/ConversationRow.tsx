import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { colors, spacing } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

type ConversationRowProps = {
  name: string;
  avatarUrl?: string | null;
  /** Job title, a neutral "N jobs together" summary, or omitted (self-chats). */
  subtitle?: string | null;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
  muted?: boolean;
  blocked?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

export function ConversationRow({
  name,
  avatarUrl,
  subtitle,
  preview,
  lastMessageAt,
  unread,
  muted = false,
  blocked = false,
  onPress,
  onLongPress,
}: ConversationRowProps) {
  return (
    <Card onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.row}>
        <Avatar name={name} uri={avatarUrl} size={48} />

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.name, unread && styles.emphasis]} numberOfLines={1}>
              {name}
            </Text>
            {blocked && (
              <Ionicons name="ban-outline" size={14} color={colors.danger} />
            )}
            {muted && (
              <Ionicons
                name="notifications-off-outline"
                size={14}
                color={colors.textSubtle}
              />
            )}
            <Text style={styles.time}>{formatTimeAgo(lastMessageAt)}</Text>
          </View>

          {subtitle ? (
            <Text style={styles.jobTitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}

          <View style={styles.previewRow}>
            <Text
              style={[styles.preview, unread && styles.emphasis]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {unread && <View style={styles.dot} />}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  emphasis: {
    color: colors.text,
    fontWeight: '700',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
