import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chip } from './Chip';
import { DropdownBody } from './DropdownReveal';
import { EntranceView } from './EntranceView';
import { JOB_CATEGORY_LABELS, type JobCategory } from '../lib/jobs';
import { POST_QUESTIONS, type PostAnswers } from '../lib/postQuestions';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type PostQuestionsProps = {
  category: JobCategory | null;
  open: boolean;
  answers: PostAnswers;
  /** A chip's tap: the question and the option's index — the screen writes the description. */
  onAnswer: (questionId: string, index: number) => void;
  onSkip: () => void;
  /** Once each time the questions have opened and laid out, so the page can bring them into view. */
  onShown?: () => void;
};

/**
 * 2026-09-30 (the build run, idea 23) — THE USUAL QUESTIONS, opening IN THE PAGE under the category
 * tiles: the operator's look 2, "plain rows with hairlines, the way the Profile hub's rows open in
 * place" — no card, no sheet. The body opens as the Profile rows do (components/DropdownReveal.tsx),
 * its rows lift in one after another (components/EntranceView.tsx), and each question's answers are
 * the app's own choice chips. Skip closes it; the category stays chosen.
 */
export function PostQuestions({ category, open, answers, onAnswer, onSkip, onShown }: PostQuestionsProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const questions = category ? POST_QUESTIONS[category] : [];
  const shown = useRef(false);
  useEffect(() => {
    if (!open) shown.current = false;
  }, [open]);

  if (!category || questions.length === 0) return null;
  return (
    <DropdownBody open={open} style={styles.drop}>
      <View
        onLayout={() => {
          if (shown.current) return;
          shown.current = true;
          onShown?.();
        }}
      >
        <View style={styles.head}>
          <Text style={styles.headText} numberOfLines={1}>
            {JOB_CATEGORY_LABELS[category]} · the usual questions
          </Text>
          <Pressable
            onPress={onSkip}
            hitSlop={spacing.sm}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Skip the questions"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
        {questions.map((question, index) => (
          <EntranceView key={`${category}-${question.id}`} index={index + 1} style={styles.question}>
            <Text style={styles.ask}>{question.ask}</Text>
            <View style={styles.options}>
              {question.options.map((option, optionIndex) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  variant="filter"
                  selected={answers[question.id] === optionIndex}
                  onPress={() => onAnswer(question.id, optionIndex)}
                  accessibilityLabel={`${question.ask} ${option.label}`}
                />
              ))}
            </View>
          </EntranceView>
        ))}
      </View>
    </DropdownBody>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // Plain rows on the page: a hairline over the header and one over each question.
    drop: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: 44,
    },
    headText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
    },
    skip: {
      minHeight: 44,
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    // The one small text action in the section, in the eyebrow's colour — gold in dark.
    skipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.eyebrow,
    },
    question: {
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    ask: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
  })
);
