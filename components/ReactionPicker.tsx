import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { REACTION_EMOJIS } from '../lib/reactions';
import { colors, radius, shadows, spacing } from '../lib/theme';

type ReactionPickerProps = {
  visible: boolean;
  /** The current user's existing reaction on the target message, if any. */
  currentEmoji?: string | null;
  onSelect: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
};

export function ReactionPicker({
  visible,
  currentEmoji,
  onSelect,
  onRemove,
  onClose,
}: ReactionPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Empty onPress absorbs taps so they don't bubble to the backdrop. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>React</Text>
          <View style={styles.emojiRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onSelect(emoji)}
                style={[
                  styles.emojiBtn,
                  currentEmoji === emoji && styles.emojiBtnActive,
                ]}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {currentEmoji && (
            <Pressable onPress={onRemove} style={styles.removeBtn}>
              <Text style={styles.removeText}>Remove reaction</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,46,34,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.raised,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  emojiBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  emojiText: {
    fontSize: 28,
  },
  removeBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
});
