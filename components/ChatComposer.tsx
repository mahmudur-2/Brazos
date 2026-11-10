import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlowTextInput } from '../components/GlowTextInput';
import { DropMenu, type DropMenuItem } from './DropMenu';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * THE COMPOSER IS THREE ZONES — 2026-08-23.
 *
 *   [ + ]        the attachment drop-up. Camera and Photos.
 *   [ field ]    the message itself.
 *   [ send ]     the send arrow, which fades in the moment there is something
 *                to send.
 *
 * WHAT IT REPLACES. Naked controls in a row — camera, photo library and a
 * filled send disc — which crowded the field and offered every attachment
 * path at once whether or not the thread could take one. Collapsing them into
 * the [ + ] gives the field its width back.
 *
 * NO DICTATION MIC (lean D3a): the iOS keyboard has its own dictation key.
 *
 * NO CIRCLES ON THE GLYPHS. The [ + ] and the send arrow are bare marks with
 * no disc or ring behind them — the ring the send button used to carry is what
 * made the row read as a toolbar rather than a text field.
 *
 * NEVER A DEAD CONTROL: the [ + ] renders only if the menu would have at least
 * one entry — a direct thread with no job has nowhere to store media, so on
 * those threads the button is absent rather than opening an empty panel.
 */

/**
 * Every control (the [ + ], the send slot) shares this size, and the text
 * input matches it too, so the row reads as one strip rather than a text box
 * with buttons stuck on the side.
 */
const COMPOSER_CONTROL_SIZE = 46;
const ICON_GLYPH_SIZE = 26;
const SEND_GLYPH_SIZE = 22;
/** A10: the longest chat message, and where the counter starts to show. */
export const CHAT_MESSAGE_MAX = 2000;
const CHAT_MESSAGE_WARN_AT = 1800;

/** The send arrow's fade. Short on purpose: it tracks typing, and anything
 *  slower lags behind the first character. */
const MORPH_MS = 140;

type ChatComposerProps = {
  /**
   * F3 (fix run): the composer owns the draft, so a keystroke re-renders this
   * row and nothing above it. Sends the trimmed text; resolves false on a
   * failed send, and the composer puts the words back (unless the person has
   * already started typing something new).
   */
  onSend: (content: string) => Promise<boolean>;
  /**
   * The screen's slot for an unsent draft: read when the composer mounts and
   * written when it unmounts, so a draft survives the row going away (the
   * messaging lock flipping) and coming back.
   */
  draft?: { current: string };
  sending: boolean;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  /** The camera entry; on by default, a prop so a harness can hide it. (The
   *  name predates the voice recorder's removal in lean D3a.) */
  showCameraAndMic?: boolean;
  /**
   * Whether CAMERA and PHOTOS are possible in this thread. Their media is
   * stored under `{jobId}/{userId}/…` and the chat-photos policies authorise
   * on that JOB, so a direct thread (phase36 — a conversation with no job) has
   * no path to key an upload on. Text and offer cards work there; those two
   * are hidden rather than offered and then failing.
   */
  allowAttachments?: boolean;
  /**
   * THE [ + ] MENU IS CONTROLLED, and deliberately owns none of its own state.
   *
   * It used to hold a `menuOpen` boolean here while the chat header held a
   * second one for its overflow dropdown. Two booleans have a state that says
   * both menus are open, and a device walk found exactly that on screen. The
   * single owner is `openMenu` in screens/ChatScreen.tsx (lib/chatMenus.ts);
   * this component reads it and asks for changes, so "B opening closes A" is
   * one assignment there rather than two handlers here remembering each other.
   */
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
};

export function ChatComposer({
  onSend,
  draft,
  sending,
  onPickCamera,
  onPickLibrary,
  showCameraAndMic = true,
  allowAttachments = true,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
}: ChatComposerProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();

  // Master 19 draws every composer glyph in gold; light keeps the Heritage
  // primary. The [ + ] is the exception and takes `ink` — the palette's
  // strongest content colour, which is the cream that reads as WHITE in dark
  // and the near-black that reads as its opposite number in light. One token,
  // both themes, no fork.
  const glyph = isDark ? colors.gold : colors.primary;

  // --- the draft (F3) ------------------------------------------------------
  const [text, setText] = useState(() => draft?.current ?? '');
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);
  useEffect(() => {
    return () => {
      if (draft) draft.current = latestText.current;
    };
  }, [draft]);

  async function handleSend() {
    const content = text.trim();
    if (!content) return;
    // Cleared at once, so the row answers the tap before the network does.
    setText('');
    const sent = await onSend(content);
    if (!sent) setText((current) => (current.trim() ? current : content));
  }

  // --- the send fade -------------------------------------------------------
  const showSend = text.trim().length > 0;
  const morph = useRef(new Animated.Value(showSend ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(morph, {
      toValue: showSend ? 1 : 0,
      duration: reducedMotion ? 0 : MORPH_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [morph, reducedMotion, showSend]);

  const sendLayer = {
    opacity: morph,
    transform: [{ scale: morph.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
  };

  const sendDisabled = !text.trim() || sending;

  // --- the [ + ] menu ------------------------------------------------------
  const menuItems: DropMenuItem[] = [];
  if (allowAttachments && showCameraAndMic) {
    menuItems.push({ key: 'camera', label: 'Camera', icon: 'camera-outline', onPress: onPickCamera });
  }
  if (allowAttachments) {
    menuItems.push({ key: 'photos', label: 'Photos', icon: 'images-outline', onPress: onPickLibrary });
  }

  return (
    // The anchor. DropMenu positions itself against this box's edges, so the
    // drop-up grows out of the [ + ] without anything being measured.
    <View style={styles.anchor}>
      <DropMenu
        visible={menuOpen}
        onClose={onCloseMenu}
        items={menuItems}
        direction="up"
        align="left"
        closeLabel="Close attachment menu"
      />

      {/* The counter shows only near the cap (the pitch field's pattern: a hint, not a gauge). */}
      {text.length >= CHAT_MESSAGE_WARN_AT ? (
        <Text style={styles.counter}>
          {text.length}/{CHAT_MESSAGE_MAX}
        </Text>
      ) : null}

      <View style={styles.row}>
        {menuItems.length > 0 && (
          <Pressable
            onPress={onToggleMenu}
            style={styles.iconBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Attach"
            // Read off the menu that will actually open rather than a fixed
            // sentence, so the hint never announces rows nobody is about to
            // be shown (a harness can hide Camera).
            accessibilityHint={menuItems.map((item) => item.label).join(', ')}
            accessibilityState={{ expanded: menuOpen }}
          >
            <Ionicons name="add" size={ICON_GLYPH_SIZE + 4} color={colors.ink} />
          </Pressable>
        )}

        <GlowTextInput
          glowRadius={radius.pill}
          wrapStyle={styles.inputWrap}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={colors.textSubtle}
          multiline
          // A10: a hard cap so one message cannot be a megabyte (the database CHECK follows in batch B).
          maxLength={CHAT_MESSAGE_MAX}
        />

        {/* Always laid out so the row's width never changes as the text
            does; the arrow takes touches only while it is visible. */}
        <View style={styles.morphSlot}>
          <Animated.View
            style={[styles.morphLayer, sendLayer]}
            pointerEvents={showSend ? 'auto' : 'none'}
          >
            <Pressable
              onPress={() => void handleSend()}
              disabled={sendDisabled}
              style={[styles.iconBtn, sendDisabled && styles.iconBtnDisabled]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={SEND_GLYPH_SIZE} color={glyph} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  anchor: {
    position: 'relative',
  },
  counter: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    // Every control shares COMPOSER_CONTROL_SIZE, so centring aligns them all
    // on one axis regardless of how tall the input grows with more text.
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // No safe-area inset added here, deliberately. ChatComposer is only ever
    // rendered inside ChatScreen, which is only ever reached nested inside
    // the app's bottom Tab.Navigator — its tab bar is always visible below
    // this screen and already pads itself for the home indicator. Adding the
    // device's bottom inset again here double-padded the space between the
    // composer and the tab bar, which is exactly the persistent empty-gap bug
    // reported before. If a screen ever hosts this composer WITHOUT a tab bar
    // beneath it, that screen's own SafeAreaView should own the inset instead
    // of this component guessing at it.
    paddingBottom: spacing.sm,
    // 2026-08-23 — NO BAND. This was `colors.surface`, which is #FFFFFF in
    // light against a #F4F1E8 thread and #0A1813 in dark against a #02110D
    // one: a full-width white bar under the composer in one theme and a step
    // too small to see in the other. Same token, two different designs, which
    // is the thing light-mode parity exists to catch.
    //
    // The band is not load-bearing. Everything in this row draws its own edge
    // — the input is an outlined pill (colors.border) — so the row can sit on
    // the thread ground in BOTH themes.
    backgroundColor: 'transparent',
  },
  iconBtn: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  morphSlot: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
  },
  morphLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 2026-09-28 (#8): the input's place in the row, so its glow sits on its edge.
  // The explicit nudge asked for: shifts the input down relative to the round
  // controls beside it, which share this row's centred baseline.
  inputWrap: {
    flex: 1,
    marginTop: spacing.xs,
  },
  input: {
    minHeight: COMPOSER_CONTROL_SIZE,
    maxHeight: 100,
    borderWidth: 1,
    // The palette's hairline is the gold one in dark — master 19 rings the
    // message pill exactly that way.
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    lineHeight: 19,
    color: colors.text,
    backgroundColor: colors.background,
  },
  }),
);
