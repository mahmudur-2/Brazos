import type { ComponentProps } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../ui/primitives';
import {
  controls,
  layout,
  metricStyles,
  radius,
  screenGround,
  spacing,
  textScale,
  useThemeColors,
  wellStyle,
} from '../lib/theme';
import {
  APP_STORE_URL,
  POSTING_PAUSED_ACTION,
  POSTING_PAUSED_MESSAGE,
  POSTING_PAUSED_TITLE,
  UPDATE_STOP_ACTION,
  UPDATE_STOP_BODY,
  UPDATE_STOP_TITLE,
} from '../lib/remoteConfig';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * U1 / U3 (A4-M5) — THE SERVER'S STOP: a calm notice that something the server
 * decided is in the way, and the one thing to do about it. Built only from the
 * foundation (UI-DIRECTION §3-§5, §7): a lit card holding a mark sunk in a well,
 * the title and the sentence, and under the card ONE main button in Title
 * Case. Nothing moves on its own; the button is the only control.
 *
 * Two uses, one shape:
 * - UpdateStopScreen: the whole screen, before sign-in, for a build below the
 *   server's minimum version (App.tsx). No way round it but the App Store.
 * - PostingPausedNotice: the body of Post a job while posting is paused (the
 *   screen keeps its own header, so the way back stays where it always is).
 */

// Both sizes are live metrics, so they are read at use time, never captured at import:
/** The mark's disc is one button tall, so the card's mark and the action under it keep one rhythm. */
const markDisc = () => controls.buttonHeightDefault;
/** The glyph in it, at the heading's size: the mark reads with the title, never louder than it. */
const markGlyph = () => textScale.heading.fontSize;

type StopNoticeProps = {
  icon: IoniconName;
  title: string;
  body: string;
  actionTitle: string;
  onAction: () => void;
  /** The action is running: the button keeps its label and width and shows its spinner. */
  loading?: boolean;
};

export function StopNotice({ icon, title, body, actionTitle, onAction, loading = false }: StopNoticeProps) {
  const styles = stylesFor();
  const { palette, isDark } = useThemeColors();
  return (
    <View style={styles.wrap}>
      <View style={styles.column}>
        <Card style={styles.card}>
          <View style={[styles.mark, wellStyle(palette, isDark)]}>
            <Ionicons name={icon} size={markGlyph()} color={palette.primary} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: palette.textMuted }]}>{body}</Text>
        </Card>
        <Button title={actionTitle} onPress={onAction} loading={loading} />
      </View>
    </View>
  );
}

/** U1: the full-screen stop for a build the server no longer supports. */
export function UpdateStopScreen() {
  const { palette, isDark } = useThemeColors();
  const openStore = () => {
    // The page opens the App Store app on an iPhone. A refusal leaves the button where it is, to tap again.
    Linking.openURL(APP_STORE_URL).catch((error: unknown) =>
      console.warn('[update] the App Store page did not open', error instanceof Error ? error.message : error)
    );
  };
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[stylesFor().screen, { backgroundColor: palette.background }, screenGround(palette, isDark)]}
    >
      <StopNotice
        icon="arrow-up-circle-outline"
        title={UPDATE_STOP_TITLE}
        body={UPDATE_STOP_BODY}
        actionTitle={UPDATE_STOP_ACTION}
        onAction={openStore}
      />
    </SafeAreaView>
  );
}

/** U3: Post a job's body while posting is paused; 'Try Again' reads the switch again (hooks/usePostingPaused). */
export function PostingPausedNotice({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  return (
    <StopNotice
      icon="pause-circle-outline"
      title={POSTING_PAUSED_TITLE}
      body={POSTING_PAUSED_MESSAGE}
      actionTitle={POSTING_PAUSED_ACTION}
      onAction={onRetry}
      loading={checking}
    />
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    wrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: layout.screenGutter,
      paddingVertical: spacing.xxl,
    },
    // One column: the card and its button share one width, never wider than a line can be read.
    column: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      gap: spacing.lg,
    },
    card: {
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    mark: {
      width: markDisc(),
      height: markDisc(),
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...textScale.heading,
      textAlign: 'center',
    },
    body: {
      ...textScale.body,
      textAlign: 'center',
    },
  })
);
