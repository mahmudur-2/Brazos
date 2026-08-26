import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { MessageTicks } from './MessageTicks';
import { VoiceNote } from './VoiceNote';
import { tickStateFor, type MessageDelivery } from '../lib/messageTicks';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { formatClockTime } from '../lib/time';
import {
  documentIconFor,
  formatDocumentSize,
  messagePreviewText,
  type Message,
} from '../lib/messages';
import type { Reaction } from '../lib/reactions';

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  /**
   * What became of this message, when that is known. Absent — which is every
   * message today — resolves to `sent`, the one state the current schema can
   * prove. See lib/messageTicks.ts and the read-model verdicts in HANDOFF.md.
   */
  delivery?: MessageDelivery;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  reactions?: Reaction[];
  onLongPress?: () => void;
  onPressImage?: (url: string) => void;
  /**
   * Open the document attachment. The bubble draws itself from the row's
   * metadata and never fetches the file, so this is the ONLY thing that
   * downloads one — absent, the bubble still renders and is simply not
   * pressable.
   */
  onPressDocument?: (message: Message) => void;
  /**
   * This document is being fetched right now. The screen owns the download and
   * therefore owns this: the bubble cannot know when one finishes.
   *
   * A document is not opened instantly — it is pulled out of the bucket before
   * the OS sees it, which on a large file over cellular is seconds of a bubble
   * that would otherwise look like it ignored the tap.
   */
  documentBusy?: boolean;
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
  delivery,
  senderName,
  senderAvatarUrl,
  reactions = [],
  onLongPress,
  onPressImage,
  onPressDocument,
  documentBusy = false,
  replyTo,
  replyToName,
  onLongPressAvatar,
}: ChatBubbleProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const isUnsent = !!message.unsent_at;

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
                    <RemoteImage uri={replyTo.image_url} style={styles.quoteThumb} />
                  ) : null}
                </View>
              )}

              {message.image_url ? (
                // onLongPress is forwarded here as well as on the wrapper:
                // this inner Pressable claims the touch, so without it a
                // long-press on a photo never reached the reaction picker
                // the way it does on a text message.
                <Pressable
                  onPress={() => onPressImage?.(message.image_url!)}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                >
                  <RemoteImage uri={message.image_url} style={styles.image} />
                </Pressable>
              ) : null}
              {message.audio_url ? (
                <VoiceNote
                  url={message.audio_url}
                  durationMs={message.audio_duration_ms}
                  isOwn={isOwn}
                />
              ) : null}
              {/* THE DOCUMENT ROW DRAWS FROM METADATA ALONE — the filename,
                  the byte count and an extension-appropriate glyph, all off
                  the message row, with nothing downloaded to paint it. A
                  photo has a thumbnail and a voice note has a duration; a
                  document has neither, and fetching each one to render its
                  own bubble would pull every attachment in a thread on open,
                  over a bucket that hands back signed URLs.

                  onLongPress is forwarded here for the same reason the image
                  branch forwards it: this inner Pressable claims the touch,
                  and without it a long-press on a document would never reach
                  the reaction/reply sheet. */}
              {message.document_url ? (
                <Pressable
                  onPress={
                    onPressDocument && !documentBusy
                      ? () => onPressDocument(message)
                      : undefined
                  }
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  // A second tap during the fetch would start a second download
                  // of the same file over the top of the first.
                  disabled={!onPressDocument || documentBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`Document, ${message.document_name ?? 'unnamed'}`}
                  accessibilityHint={documentBusy ? 'Opening' : 'Opens the file'}
                  accessibilityState={{ busy: documentBusy, disabled: documentBusy }}
                  style={[styles.document, isOwn ? styles.documentOwn : styles.documentOther]}
                >
                  {/* IN PLACE OF THE GLYPH, not beside it, and sized to it: the
                      row must not reflow while it works, or a thread of
                      documents shifts under the finger that tapped one. */}
                  {documentBusy ? (
                    <ActivityIndicator
                      size="small"
                      color={isOwn ? colors.onPrimary : colors.primary}
                      style={styles.documentSpinner}
                    />
                  ) : (
                    <Ionicons
                      name={documentIconFor(message.document_name)}
                      size={22}
                      color={isOwn ? colors.onPrimary : colors.primary}
                    />
                  )}
                  <View style={styles.documentBody}>
                    {/* The head of a long name is the useful half — a middle
                        ellipsis is not available here, and truncating the
                        tail keeps the words someone recognises. */}
                    <Text
                      style={[styles.documentName, isOwn && styles.documentNameOwn]}
                      numberOfLines={2}
                    >
                      {message.document_name || 'Document'}
                    </Text>
                    {formatDocumentSize(message.document_size_bytes) ? (
                      <Text style={[styles.documentMeta, isOwn && styles.documentMetaOwn]}>
                        {formatDocumentSize(message.document_size_bytes)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ) : null}
              {message.content ? (
                <Text style={[styles.text, isOwn && styles.textOwn]}>{message.content}</Text>
              ) : null}
            </>
          )}
          {/* The time, and — on your own message only — what became of it.
              A tick on someone else's bubble would be claiming to know what
              YOU did with THEIR message. */}
          <View style={styles.metaRow}>
            <Text style={[styles.time, isOwn && !isUnsent && styles.timeOwn]}>
              {formatClockTime(message.created_at)}
            </Text>
            {/* `delivery` is UNPASSED by every caller today, so this resolves
                to 'sent' — one tick — on every own message. That is not an
                oversight here: the two states above it are blocked on schema
                that does not exist, and READ_TICKS / DELIVERED_TICKS in
                lib/featureFlags.ts name what has to be built before anything
                can fill this prop. The prop and the derivation are ready; the
                source of the facts is not. */}
            {isOwn && !isUnsent ? <MessageTicks state={tickStateFor(delivery ?? {})} /> : null}
          </View>
        </View>

        {reactions.length > 0 && (
          <View
            style={[
              styles.reactionBadge,
              isOwn ? styles.reactionBadgeOwn : styles.reactionBadgeOther,
              // C4: the badge's card shadow cannot darken the dark ground it
              // sits on; the dark token is added beside it, light untouched.
              isDark && shadows.cardDark,
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
  rowWithReaction: {
    marginBottom: spacing.lg + spacing.xs,
  },
  // THE 82% CAP BELONGS HERE, NOT ON THE BUBBLE — and moving it is the fix for
  // the photo bubble that painted as two misaligned layers, not tidying.
  //
  // A percentage max resolves against the PARENT's inner width: Yoga's
  // constrainMaxSizeForMode takes `ownerWidth`, and ownerWidth for a child is
  // the parent's availableInnerWidth. This wrapper exists only so the
  // absolutely-positioned reaction badge has something to hang off, so it has
  // no width of its own — it shrink-wraps the bubble. `maxWidth: '82%'` on the
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
  // A ROW, NOT A FIXED BOX. styles.image above is a 200pt square and RN's
  // default flexShrink is 0, which is exactly what made the photo bubble
  // spill past its own fill — see the note on bubbleWrap. A document has no
  // intrinsic size at all, so it takes the bubble's width and its name wraps
  // to two lines inside it rather than forcing the bubble wider than the 82%
  // cap.
  document: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    // The 44pt touch floor, met by the DRAWN box: this row is the whole
    // target, and the bubble around it is not pressable for this purpose.
    minHeight: 44,
  },
  // The same two washes the quote strip uses, for the same reason: a panel
  // INSIDE a bubble has to separate from the fill it sits on in both
  // directions — a translucent cream on the own bubble's solid primary, the
  // soft primary tint on the other side's surface.
  documentOwn: {
    backgroundColor: withAlpha(colors.onPrimary, 0.16),
  },
  documentOther: {
    backgroundColor: colors.primarySoft,
  },
  // The glyph's own box. ActivityIndicator measures smaller than 22pt, and
  // without this the name and the size would slide left the moment a document
  // was tapped and back again when it opened.
  documentSpinner: {
    width: 22,
    height: 22,
  },
  documentBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    gap: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  documentNameOwn: {
    color: colors.onPrimary,
  },
  documentMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  documentMetaOwn: {
    color: withAlpha(colors.onPrimary, 0.8),
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
  }),
);
