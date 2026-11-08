import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { AvatarPressable } from './AvatarPressable';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { formatClockTime } from '../lib/time';
import { signedUrlCacheKey } from '../lib/storage';
import { messagePreviewText, type Message } from '../lib/messages';

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  /**
   * F3: the screen passes ONE stable callback for every row, given the
   * message, so memo can skip a row whose own props did not change. An
   * unsent placeholder offers nothing to reply to, so the bubble withholds
   * the long-press itself.
   */
  onLongPressMessage?: (message: Message) => void;
  onPressImage?: (url: string) => void;
  /** The quoted message, already resolved from the loaded thread. */
  replyTo?: Message | null;
  /** Display name for the quoted message's sender. */
  replyToName?: string | null;
  /** Long-press on the counterparty's avatar — opens it full-screen. Stable, given the URI (F3). */
  onLongPressAvatarUri?: (uri: string) => void;
};

/** F3: memoised — a row re-renders only when its own props change. */
export const ChatBubble = memo(function ChatBubble({
  message,
  isOwn,
  senderName,
  senderAvatarUrl,
  onLongPressMessage,
  onPressImage,
  replyTo,
  replyToName,
  onLongPressAvatarUri,
}: ChatBubbleProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const isUnsent = !!message.unsent_at;
  const onLongPress = onLongPressMessage && !isUnsent ? () => onLongPressMessage(message) : undefined;
  const onLongPressAvatar =
    onLongPressAvatarUri && senderAvatarUrl ? () => onLongPressAvatarUri(senderAvatarUrl) : undefined;

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
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
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            isUnsent && styles.unsentBubble,
          ]}
        >
          {isUnsent ? (
            <Text style={styles.unsentText}>This message was unsent</Text>
          ) : (
            <>
              {/* Quoted reply strip, WhatsApp-style: an accent rail, the
                  original sender's name, and a one-line summary of what's
                  being replied to. */}
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
                    <RemoteImage
                      uri={replyTo.image_url}
                      cacheKey={signedUrlCacheKey(replyTo.image_url)}
                      style={styles.quoteThumb}
                    />
                  ) : null}
                </View>
              )}

              {message.image_url ? (
                // onLongPress is forwarded here as well as on the wrapper:
                // this inner Pressable claims the touch, so without it a
                // long-press on a photo never reached the message menu
                // the way it does on a text message.
                <Pressable
                  onPress={() => onPressImage?.(message.image_url!)}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Photo"
                  accessibilityHint="Opens the photo"
                >
                  {/* F5: keyed by the object, not the token, so a re-signed photo is a cache hit. */}
                  <RemoteImage
                    uri={message.image_url}
                    cacheKey={signedUrlCacheKey(message.image_url)}
                    style={styles.image}
                  />
                </Pressable>
              ) : null}
              {message.content ? (
                <Text style={[styles.text, isOwn && styles.textOwn]}>{message.content}</Text>
              ) : null}
            </>
          )}
          <View style={styles.metaRow}>
            <Text style={[styles.time, isOwn && !isUnsent && styles.timeOwn]}>
              {formatClockTime(message.created_at)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // THE 82% CAP BELONGS HERE, NOT ON THE BUBBLE — and moving it is the fix for
  // the photo bubble that painted as two misaligned layers, not tidying.
  //
  // A percentage max resolves against the PARENT's inner width: Yoga's
  // constrainMaxSizeForMode takes `ownerWidth`, and ownerWidth for a child is
  // the parent's availableInnerWidth. This wrapper is the long-press target
  // and has no width of its own — it shrink-wraps the bubble. `maxWidth: '82%'` on the
  // bubble was therefore 82% of the BUBBLE'S OWN measured width: Yoga measures
  // the wrapper once, lays it out at exactly that width, and re-runs the child
  // against it, so every bubble was painted at 82% of the width it had just
  // asked for.
  //
  // Text merely re-wrapped, which is why this read as a quote bug. The photo
  // could not: styles.image is a FIXED 200pt box and RN's default flexShrink
  // is 0. 200 + 2 * spacing.md measures 224, the bubble was then painted at
  // 0.82 * 224 = 183, and the photo spilled 40pt out past the green — the
  // bubble sitting up-and-left of its own image.
  //
  // Here the parent is `row`, whose width is the list cell's. That is what
  // "82% of the row" always meant.
  bubbleWrap: {
    position: 'relative',
    maxWidth: '82%',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
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
  // Overrides bubbleOwn/bubbleOther's fill and border — an unsent message is
  // an absence, not content, so it shouldn't carry the same full-weight
  // solid-green (own) or solid-white (other) treatment as something that
  // actually sent. Outlined and dashed reads as "nothing here" at a glance
  // instead of looking like an ordinary message that happens to say so.
  unsentBubble: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
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
    backgroundColor: withAlpha(colors.onPrimary, 0.16),
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
  // THE BASIS IS WHAT MAKES THE BUBBLE WIDEN. Written as `flex: 1` this
  // resolved to flexBasis 0, and a zero basis is a zero CONTRIBUTION: Yoga
  // measures a fit-content row from the sum of its children's flex bases
  // (resolveFlexibleLength, where `availableInnerMainDim = flexLine.
  // sizeConsumed` for a row that cannot grow), so the quote strip measured to
  // its rail, its two gaps and the thumbnail and nothing else. The bubble then
  // sized to the MESSAGE text and the quote was truncated into whatever was
  // left over — a "Hello sir" bubble with "HE…" quoted above it, instead of a
  // bubble widened to fit the quote the way WhatsApp does.
  //
  // Grow and shrink are both still wanted and both still here. Grow keeps the
  // thumbnail on the row's right edge when the quote is shorter than the
  // message; shrink is what lets numberOfLines={1} ellipsize once the quote is
  // longer than the bubble's max width. Only the BASIS changed, so a bubble
  // carrying no quote never reaches this style at all.
  quoteBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
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
    color: withAlpha(colors.onPrimary, 0.8),
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
  unsentText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textSubtle,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: colors.textSubtle,
    alignSelf: 'flex-end',
  },
  timeOwn: {
    color: withAlpha(colors.onPrimary, 0.75),
  },
  }),
);
