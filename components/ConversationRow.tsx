import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Card } from './Card';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
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
  /** A hire request in this thread is waiting on this user's response. */
  awaitingRequest?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Long-press specifically on the avatar — opens it full-screen. Separate
   *  from onLongPress above (the row's own long-press opens the moderation
   *  menu); the two are independent nested Pressables. */
  onLongPressAvatar?: () => void;
  /** How this build reveals the row's actions. Passed in rather than derived
   *  here because the MECHANIC depends on the binary's gesture capability and
   *  the row must not have an opinion about that (2026-08-23). */
  accessibilityHint?: string;
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
  awaitingRequest = false,
  onPress,
  onLongPress,
  onLongPressAvatar,
  accessibilityHint,
}: ConversationRowProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint={accessibilityHint}
      style={[
        unread && !isDark && styles.unreadCard,
        awaitingRequest && styles.awaitingCard,
      ]}
    >
      {/* Master 34's row: the job context sits ABOVE the name as a green
          small-caps eyebrow, the name takes the serif, and the timestamp and
          unread mark stack in their own right column. */}
      <View style={styles.row}>
        <AvatarPressable
          name={name}
          uri={avatarUrl}
          size={48}
          onLongPress={onLongPressAvatar}
        />

        <View style={styles.content}>
          {/* A waiting request outranks the job title here — it's the one
              thing in this row that needs an answer, and with no push
              notifications the inbox is the only place it can surface. */}
          {awaitingRequest ? (
            <View style={styles.requestPill}>
              <Ionicons name="briefcase" size={11} color={colors.onPrimary} />
              <Text style={styles.requestPillText}>Job request · needs your reply</Text>
            </View>
          ) : subtitle ? (
            <Text style={styles.jobTitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}

          <Text style={[styles.name, unread && styles.emphasis]} numberOfLines={1}>
            {name}
          </Text>

          <Text style={[styles.preview, unread && styles.emphasis]} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.time}>{formatTimeAgo(lastMessageAt)}</Text>
          <View style={styles.metaMarks}>
            {blocked && <Ionicons name="ban-outline" size={14} color={colors.danger} />}
            {muted && (
              <Ionicons
                name="notifications-off-outline"
                size={14}
                color={colors.textSubtle}
              />
            )}
            {unread && <View style={styles.dot} />}
          </View>
        </View>
      </View>
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  metaMarks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 12,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '600',
    color: colors.ink,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // Master 34's context eyebrow: green small-caps above the name.
  jobTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.emerald,
  },
  preview: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emphasis: {
    color: colors.ink,
    fontWeight: '700',
  },
  // Master 34 marks unread with a green dot; the count badge it also draws
  // needs a per-thread unread COUNT, which useConversations does not carry.
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.emerald,
  },
  unreadCard: {
    backgroundColor: colors.primarySoft,
  },
  awaitingCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  requestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  requestPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  }),
);
