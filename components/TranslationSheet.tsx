import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../ui/primitives/Sheet';
import { translateFailureMessage, type TranslateResult } from '../lib/translateRules';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * What a translation looks like when it comes back.
 *
 * PRESENTATION ONLY. It is handed a `TranslateResult` and renders it; it does
 * not call the function, own the loading state, or decide what "unavailable"
 * means. That keeps it renderable from a fixture — which is how it is tested,
 * since the Edge Function behind it is a DRAFT and cannot answer.
 *
 * IT SHOWS THE SOURCE LANGUAGE the service DETECTED, and only when the service
 * detected one. There is no client-side language guessing anywhere in this
 * path: a wrong "Translated from Spanish" over Portuguese text is a worse
 * failure than no label at all, and it is the kind of wrong that reads as
 * confident.
 *
 * COPY IS OPTIONAL, and absent today. Nothing in this project can write the
 * clipboard: `Clipboard` left React Native core, and expo-clipboard is not a
 * dependency (adding one is an operator step — see HANDOFF.md). The control
 * renders only when a handler is passed, which is the same
 * never-a-dead-control rule the composer's dictation mic follows.
 */

type TranslationSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Null while the request is in flight. */
  result: TranslateResult | null;
  /** Present only when this build can actually write the clipboard. */
  onCopy?: (text: string) => void;
};

export function TranslationSheet({ visible, onClose, result, onCopy }: TranslationSheetProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);

  const joined =
    result?.ok === true ? result.items.map((item) => item.translated).join('\n\n') : '';

  return (
    <Sheet visible={visible} onClose={onClose} title="Translation">
      {result === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.emerald} />
        </View>
      ) : result.ok ? (
        <View style={styles.body}>
          {result.detectedLanguage ? (
            <View style={styles.detected}>
              <Ionicons name="language-outline" size={14} color={colors.emerald} />
              <Text style={styles.detectedText}>
                Detected {result.detectedLanguage.toUpperCase()}
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {result.items.map((item, index) => (
              <View key={index} style={styles.item}>
                <Text style={styles.translated}>{item.translated}</Text>
                {/* The original stays visible. A translation that replaces
                    what someone actually wrote takes away the ability to
                    check it — and machine translation is exactly the thing
                    people check. */}
                <Text style={styles.original} numberOfLines={3}>
                  {item.source}
                </Text>
              </View>
            ))}
          </ScrollView>

          {onCopy ? (
            <Pressable
              onPress={() => onCopy(joined)}
              style={({ pressed }) => [styles.copy, pressed && styles.copyPressed]}
              accessibilityRole="button"
              accessibilityLabel="Copy translation"
            >
              <Ionicons name="copy-outline" size={18} color={colors.emerald} />
              <Text style={styles.copyLabel}>Copy</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.failure}>{translateFailureMessage(result.reason)}</Text>
        </View>
      )}
    </Sheet>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    center: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    body: {
      gap: spacing.lg,
    },
    detected: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.emerald, 0.12),
    },
    detectedText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: colors.emerald,
    },
    scroll: {
      maxHeight: 320,
    },
    scrollContent: {
      gap: spacing.lg,
    },
    item: {
      gap: spacing.sm,
    },
    translated: {
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
    original: {
      fontSize: 13,
      lineHeight: 18,
      fontStyle: 'italic',
      color: colors.textMuted,
    },
    copy: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 46,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.emerald,
    },
    copyPressed: {
      opacity: 0.7,
    },
    copyLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.emerald,
    },
    failure: {
      fontSize: 15,
      lineHeight: 21,
      color: colors.textMuted,
    },
  })
);
