import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { StarRating } from './StarRating';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import { createReview, fetchMyReviewForJob, type Review } from '../lib/reviews';
import { colors, spacing } from '../lib/theme';

// Reviews render as a short quoted block wherever they're shown (this same
// card once submitted, a worker's profile) — plenty of room for real
// feedback without inviting an essay.
const MAX_COMMENT_LENGTH = 300;

type ReviewSectionProps = {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  revieweeName: string;
  /** e.g. "How was working with Carlos?" prompt label. */
  prompt: string;
  onSubmitted?: () => void;
};

export function ReviewSection({
  jobId,
  reviewerId,
  revieweeId,
  revieweeName,
  prompt,
  onSubmitted,
}: ReviewSectionProps) {
  const [existing, setExisting] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMyReviewForJob(reviewerId, jobId).then(({ data }) => {
      if (active) {
        setExisting(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [reviewerId, jobId]);

  async function handleSubmit() {
    if (rating < 1) {
      await alertAsync('Add a rating', 'Please tap a star rating from 1 to 5.');
      return;
    }
    setSubmitting(true);
    const { data, error } = await createReview(reviewerId, {
      jobId,
      revieweeId,
      rating,
      comment,
    });
    setSubmitting(false);

    if (error) {
      await alertAsync('Could not submit review', error.message);
      return;
    }
    setExisting(data);
    onSubmitted?.();
  }

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  if (existing) {
    return (
      <Card>
        <View style={styles.doneHeader}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.doneTitle}>Your review</Text>
        </View>
        <StarRating value={existing.rating} size={22} />
        {existing.comment ? (
          <Text style={styles.doneComment}>“{existing.comment}”</Text>
        ) : null}
        <Text style={styles.doneNote}>Thanks for rating {revieweeName}.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.title}>{prompt}</Text>
      <View style={styles.stars}>
        <StarRating value={rating} onChange={setRating} />
      </View>
      <TextField
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        hint={`${comment.length}/${MAX_COMMENT_LENGTH}`}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={`Share how it went with ${revieweeName}…`}
        autoCapitalize="sentences"
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
      <Button
        title="Submit review"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submit}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  stars: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  multiline: {
    height: 84,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: spacing.lg,
  },
  doneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  doneTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  doneComment: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  doneNote: {
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: spacing.md,
  },
});
