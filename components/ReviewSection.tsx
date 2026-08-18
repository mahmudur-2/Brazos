import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView as ScrollViewRN,
  StyleSheet,
  Text,
  View,
  type ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from './Button';
import { Card } from './Card';
import { StarRating } from './StarRating';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  createReview,
  fetchMyReviewForJob,
  MAX_REVIEW_PHOTOS,
  type Review,
} from '../lib/reviews';
import { deleteJobPhoto, uploadReviewPhoto } from '../lib/storage';
import { colors, radius, spacing, withAlpha, type ColorPalette } from '../lib/theme';

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
  /**
   * The ScrollView this card is rendered inside. Given one, focusing the
   * comment field scrolls the card up out from under the keyboard — see
   * revealAboveKeyboard() for why this is the host's scroller rather than
   * something the card owns itself.
   */
  scrollRef?: RefObject<ScrollView | null>;
  palette?: ColorPalette;
};

export function ReviewSection({
  jobId,
  reviewerId,
  revieweeId,
  revieweeName,
  prompt,
  onSubmitted,
  scrollRef,
  palette = colors,
}: ReviewSectionProps) {
  const [existing, setExisting] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);
  // Uploaded review photos, held as public URLs so the preview and the final
  // write use the same values. Upload happens on pick, so only something
  // actually in storage can ever be referenced by the review.
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photosRef = useRef<string[]>([]);
  const uploadingPhotoRef = useRef(false);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const uploadsCommittedRef = useRef(false);
  // Every review-photo upload made by this mounted form stays here until the
  // review is committed, even if the user removes it from the visible draft.
  const draftPhotosRef = useRef<Set<string>>(new Set());

  function cleanupDraftPhotos() {
    for (const url of draftPhotosRef.current) {
      deleteJobPhoto(url).then(({ error }) => {
        if (error) console.error('[ReviewSection] orphan photo cleanup failed', error);
      });
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // If a review write is still running, its result owns cleanup: deleting
      // first could leave a successful review pointing at missing files.
      if (!uploadsCommittedRef.current && !submittingRef.current) cleanupDraftPhotos();
    };
  }, []);

  /**
   * On both screens that host it, this card is the LAST thing in the scroll
   * content — so "scroll to the end" is exactly "put the comment field and
   * the Submit button above the keyboard", with no measuring needed.
   *
   * The KeyboardAvoidingView those screens wrap the scroller in only shrinks
   * the viewport; it never scrolls, which is why the field and the button
   * ended up underneath the keyboard on a small iPhone. This supplies the
   * missing half.
   */
  useEffect(() => {
    if (!commentFocused || !scrollRef) return;

    // keyboardDidShow fires after the KeyboardAvoidingView has already
    // applied its padding, so the content height this scrolls against is the
    // final one — no guessing at the keyboard's animation duration.
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    // Covers the case where the keyboard is already up (so no new
    // keyboardDidShow arrives) and focus merely moved into this field.
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    return () => {
      shown.remove();
      cancelAnimationFrame(frame);
    };
  }, [commentFocused, scrollRef]);

  useEffect(() => {
    let active = true;
    setExisting(null);
    setLoadError(null);
    setLoading(true);
    fetchMyReviewForJob(reviewerId, jobId).then(({ data, error }) => {
      if (active) {
        if (error) setLoadError(userMessage(error));
        else setExisting(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [reviewerId, jobId, loadAttempt]);

  async function pickPhotos() {
    if (submittingRef.current || uploadingPhotoRef.current) return;
    const remaining = MAX_REVIEW_PHOTOS - photosRef.current.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!mountedRef.current || result.canceled || result.assets.length === 0) return;

    uploadingPhotoRef.current = true;
    setUploadingPhoto(true);
    const uploaded: string[] = [];
    let failures = 0;
    for (const asset of result.assets.slice(0, remaining)) {
      const { url, error } = await uploadReviewPhoto(reviewerId, asset);
      if (error || !url) failures++;
      else if (!mountedRef.current) {
        // The picker/upload can finish after navigation removed this form.
        // This URL was never rendered or committed, so delete it immediately.
        deleteJobPhoto(url).then(({ error: cleanupError }) => {
          if (cleanupError) {
            console.error('[ReviewSection] late upload cleanup failed', cleanupError);
          }
        });
      } else {
        draftPhotosRef.current.add(url);
        uploaded.push(url);
      }
    }
    uploadingPhotoRef.current = false;
    if (!mountedRef.current) return;
    setUploadingPhoto(false);

    if (uploaded.length > 0) {
      const next = [...photosRef.current, ...uploaded].slice(0, MAX_REVIEW_PHOTOS);
      photosRef.current = next;
      setPhotos(next);
    }
    if (failures > 0) {
      await alertAsync(
        'Some photos didn’t upload',
        `${failures} of ${result.assets.length} couldn’t be uploaded. You can try again, or submit without them.`
      );
    }
  }

  /** Nothing staged here is referenced by a review yet, so removing it is
   *  always safe to clean up from storage immediately. */
  function removePhoto(url: string) {
    if (submittingRef.current) return;
    const next = photosRef.current.filter((photo) => photo !== url);
    photosRef.current = next;
    setPhotos(next);
    deleteJobPhoto(url).then(({ error }) => {
      if (error) console.error('[ReviewSection] deleteJobPhoto failed', error);
      else draftPhotosRef.current.delete(url);
    });
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    if (rating < 1) {
      await alertAsync('Add a rating', 'Please tap a star rating from 1 to 5.');
      return;
    }
    // A photo still uploading would be dropped by the write below.
    if (uploadingPhotoRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    const submittedPhotos = [...photosRef.current];
    const { data, error } = await createReview(reviewerId, {
      jobId,
      revieweeId,
      rating,
      comment,
      photos: submittedPhotos,
    });
    if (!error) {
      uploadsCommittedRef.current = true;
      const committed = new Set(submittedPhotos);
      // A photo removed from the draft may have had a failed first delete.
      // Retry any such unreferenced upload once the review is safely stored.
      for (const url of draftPhotosRef.current) {
        if (committed.has(url)) continue;
        deleteJobPhoto(url).then(({ error: cleanupError }) => {
          if (cleanupError) {
            console.error('[ReviewSection] removed photo cleanup failed', cleanupError);
          } else {
            draftPhotosRef.current.delete(url);
          }
        });
      }
    }
    submittingRef.current = false;
    if (!mountedRef.current) {
      if (error) cleanupDraftPhotos();
      return;
    }
    setSubmitting(false);

    if (error) {
      await alertAsync('Could not submit review', userMessage(error));
      return;
    }
    setExisting(data);
    onSubmitted?.();
  }

  if (loading) {
    return (
      <Card palette={palette}>
        <ActivityIndicator color={palette.primary} />
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card palette={palette} style={styles.errorCard}>
        <Ionicons name="alert-circle-outline" size={24} color={palette.danger} />
        <Text style={[styles.errorTitle, { color: palette.text }]}>
          Couldn’t load your review
        </Text>
        <Text style={[styles.errorText, { color: palette.textMuted }]}>{loadError}</Text>
        <Button
          title="Try again"
          variant="secondary"
          palette={palette}
          onPress={() => setLoadAttempt((attempt) => attempt + 1)}
          style={styles.errorAction}
        />
      </Card>
    );
  }

  if (existing) {
    return (
      <Card palette={palette}>
        <View style={styles.doneHeader}>
          <Ionicons name="checkmark-circle" size={20} color={palette.success} />
          <Text style={[styles.doneTitle, { color: palette.text }]}>Your review</Text>
        </View>
        <StarRating value={existing.rating} size={22} />
        {existing.comment ? (
          <Text style={[styles.doneComment, { color: palette.textMuted }]}>
            “{existing.comment}”
          </Text>
        ) : null}
        {existing.photos.length > 0 && (
          <ScrollViewRN
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
            style={styles.photoScroll}
          >
            {existing.photos.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.photo} />
            ))}
          </ScrollViewRN>
        )}
        <Text style={[styles.doneNote, { color: palette.textSubtle }]}>
          Thanks for rating {revieweeName}.
        </Text>
      </Card>
    );
  }

  return (
    <Card palette={palette}>
      <Text style={[styles.title, { color: palette.text }]}>{prompt}</Text>
      <View style={styles.stars}>
        <StarRating value={rating} onChange={submitting ? undefined : setRating} />
      </View>
      <TextField
        palette={palette}
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        hint={`${comment.length}/${MAX_COMMENT_LENGTH}`}
        maxLength={MAX_COMMENT_LENGTH}
        editable={!submitting}
        placeholder={`Share how it went with ${revieweeName}…`}
        autoCapitalize="sentences"
        multiline
        numberOfLines={3}
        style={styles.multiline}
        onFocus={() => setCommentFocused(true)}
        onBlur={() => setCommentFocused(false)}
      />

      {photos.length > 0 && (
        <ScrollViewRN
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
          style={styles.photoScroll}
        >
          {photos.map((url) => (
            <View key={url} style={styles.photoWrap}>
              <Image source={{ uri: url }} style={styles.photo} />
              <Pressable
                style={styles.photoRemove}
                onPress={() => removePhoto(url)}
                disabled={submitting}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Ionicons name="close" size={14} color={colors.onPrimary} />
              </Pressable>
            </View>
          ))}
        </ScrollViewRN>
      )}

      {photos.length < MAX_REVIEW_PHOTOS && (
        <Button
          title={
            uploadingPhoto
              ? 'Uploading…'
              : photos.length === 0
              ? 'Add photos'
              : `Add another (${photos.length}/${MAX_REVIEW_PHOTOS})`
          }
          variant="secondary"
          palette={palette}
          icon="images-outline"
          onPress={pickPhotos}
          loading={uploadingPhoto}
          disabled={uploadingPhoto || submitting}
          style={styles.addPhotos}
        />
      )}

      <Button
        title="Submit review"
        onPress={handleSubmit}
        palette={palette}
        loading={submitting}
        disabled={uploadingPhoto || submitting}
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
  addPhotos: {
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing.md,
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorAction: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  photoScroll: {
    marginTop: spacing.md,
  },
  photoRow: {
    gap: spacing.sm,
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(colors.text, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
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
