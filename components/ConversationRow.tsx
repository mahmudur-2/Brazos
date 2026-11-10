import { type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PressScale } from './PressScale';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { toneColor } from './HomeLiveBar';
import { LiveDot } from './LiveDot';
import type { LiveTone } from '../lib/liveJobStatus';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { formatInboxStamp } from '../lib/time';

/** The photo, and the right column the time and the ••• share (refs/inbox-clean-list.html). */
const PHOTO = 58;
const RIGHT_COLUMN = 44;
/** A count this large is "99+". */
const COUNT_CAP = 99;

type ConversationRowProps = {
  name: string;
  avatarUrl?: string | null;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
  /** The unseen messages, COUNTED (hooks/useConversations `unseenByKey`). With
   *  `unread` and no count, the row shows the mark alone — never a made-up number. */
  unreadCount?: number | null;
  blocked?: boolean;
  /** The job the conversation is about — its title, and its live stage while it
   *  is hired and underway (null once it is finished: the title alone). */
  job?: { title: string; stage: { word: string; tone: LiveTone } | null } | null;
  /** A hire request in this thread is waiting on this user's response. */
  awaitingRequest?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Long-press specifically on the avatar — opens it full-screen. Separate
   *  from onLongPress above (the row's own long-press opens the menu); the two
   *  are independent nested Pressables. */
  onLongPressAvatar?: () => void;
  /** The ••• at the row's right edge: it opens the row's glass menu (#53). */
  onMore?: () => void;
  /** The ••• itself, which the menu opens under. */
  moreRef?: Ref<View>;
  /** How the row's actions are reached (the inbox's long press). */
  accessibilityHint?: string;
};

/**
 * 2026-09-28 (LUX-LIST-64 #54–#58) — AN INBOX ROW, the approved clean list
 * (docs/mockups/html/refs/inbox-clean-list.html, version 9): no card — the rows
 * sit on the page, a hairline between them (the list draws it), 13 above and
 * below. The top line is the 58 photo; the name at 16 bold with the unread count
 * beside it (or a 19pt blocked glyph); the message 2 under it at 15/20,
 * the brighter ink, full strength and bolder when unread; and a 44-wide right
 * column — the time over the ••• with their right edges lined up, the time in
 * the accent when unread. Ten under that, from the row's left edge: the job
 * chip — the live stage (a breathing dot and the word in its colour: Assigned
 * gold, In progress orange, Review work lavender), then the job's title; a
 * finished job shows the title alone.
 */
export function ConversationRow({
  name,
  avatarUrl,
  preview,
  lastMessageAt,
  unread,
  unreadCount,
  blocked = false,
  job,
  awaitingRequest = false,
  onPress,
  onLongPress,
  onLongPressAvatar,
  onMore,
  moreRef,
  accessibilityHint,
}: ConversationRowProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const count = unread && unreadCount != null && unreadCount > 0 ? unreadCount : null;
  const stamp = formatInboxStamp(lastMessageAt);

  // The one mark beside the name: the count (or, unread with none counted, the
  // plain mark), else blocked.
  const mark = unread ? (
    count != null ? (
      <View style={[styles.badge, { backgroundColor: colors.emerald }]}>
        <Text style={[styles.badgeText, { color: isDark ? colors.onPrimary : colors.white }]}>
          {count > COUNT_CAP ? `${COUNT_CAP}+` : count}
        </Text>
      </View>
    ) : (
      <View style={[styles.markDot, { backgroundColor: colors.emerald }]} />
    )
  ) : blocked ? (
    <Ionicons name="ban-outline" size={19} color={colors.textSubtle} accessibilityLabel="Blocked" />
  ) : null;

  const chipFill = withAlpha(isDark ? colors.white : colors.emerald, isDark ? 0.045 : 0.055);
  const stageColor = job?.stage ? toneColor(colors, job.stage.tone) : null;

  return (
    <PressScale
      haptic={false}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(colors.emerald, 0.06) }]}
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        count != null ? `${count} unread` : unread ? 'unread' : null,
        preview,
        // VoiceOver hears the chip that is on screen: the request when one waits, else the job.
        awaitingRequest
          ? 'Job request, needs your reply'
          : job
            ? job.stage
              ? `${job.stage.word}, ${job.title}`
              : job.title
            : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.top}>
        <AvatarPressable name={name} uri={avatarUrl} size={PHOTO} initialsSize={20} onLongPress={onLongPressAvatar} />

        <View style={styles.text}>
          <View style={styles.line}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {mark}
          </View>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        <View style={styles.right}>
          <Text style={[styles.time, unread && styles.timeUnread]} numberOfLines={1}>
            {stamp}
          </Text>
          {onMore ? (
            <Pressable
              ref={moreRef}
              onPress={onMore}
              // 44pt: the column's width, and 12 above and below the 20pt glyph row.
              hitSlop={{ top: 12, bottom: 12 }}
              style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
              accessibilityRole="button"
              accessibilityLabel={`Manage conversation with ${name}`}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </Pressable>
          ) : (
            <View style={styles.more} />
          )}
        </View>
      </View>

      {awaitingRequest ? (
        // A hire request waiting on this user outranks the job's stage: it is
        // the one thing on the row that needs an answer.
        <View style={[styles.chip, { backgroundColor: chipFill }]}>
          <View style={styles.stage}>
            <LiveDot color={colors.emerald} size={6} motion="breathe" />
            <Text style={[styles.stageWord, { color: colors.emerald }]}>Job request</Text>
          </View>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.chipTitle} numberOfLines={1}>
            needs your reply
          </Text>
        </View>
      ) : job ? (
        <View style={[styles.chip, { backgroundColor: chipFill }]}>
          {job.stage && stageColor ? (
            <>
              <View style={styles.stage}>
                <LiveDot color={stageColor} size={6} motion="breathe" />
                <Text style={[styles.stageWord, { color: stageColor }]}>{job.stage.word}</Text>
              </View>
              <Text style={styles.separator}>·</Text>
            </>
          ) : null}
          <Text style={styles.chipTitle} numberOfLines={1}>
            {job.title}
          </Text>
        </View>
      ) : null}
    </PressScale>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // `.row` — 13 above and below, 4 in from the list's left edge.
    row: {
      gap: 10,
      paddingTop: 13,
      paddingBottom: 13,
      paddingLeft: 4,
    },
    // `.top` — photo · text · the 44 column, 12 between, centred.
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    text: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      minHeight: 21,
    },
    name: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      letterSpacing: -0.1,
      color: colors.ink,
    },
    // The count: 20 tall, round, the accent under its ink.
    badge: {
      minWidth: 20,
      minHeight: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 11.5,
      lineHeight: 14,
      fontWeight: '800',
    },
    // Unread with nothing counted (a thread marked unread by hand): the mark alone.
    markDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    preview: {
      fontSize: 15,
      lineHeight: 20,
      color: colors.inboxPreview,
    },
    previewUnread: {
      fontWeight: '600',
      color: colors.ink,
    },
    right: {
      width: RIGHT_COLUMN,
      alignItems: 'flex-end',
      gap: 2,
    },
    time: {
      fontSize: 12.5,
      lineHeight: 21,
      color: colors.textSubtle,
    },
    timeUnread: {
      fontWeight: '600',
      color: colors.emerald,
    },
    more: {
      width: RIGHT_COLUMN,
      minHeight: 20,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    morePressed: { opacity: 0.6 },
    // `.jb` — the job chip, from the row's left edge.
    chip: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 24,
      paddingLeft: 8,
      paddingRight: 9,
      borderRadius: 12,
      overflow: 'hidden',
    },
    stage: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    stageWord: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    separator: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.inboxChipInk,
      opacity: 0.7,
    },
    chipTitle: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 12,
      lineHeight: 16,
      color: colors.inboxChipInk,
    },
  })
);
