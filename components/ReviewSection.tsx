import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView as ScrollViewRN,
  StyleSheet,
  Text,
  View,
  type ScrollView,
} from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from './Button';
import { Card } from './Card';
import { StarRating } from './StarRating';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import { invalidateJobs } from '../lib/queryClient';
import { userMessage } from '../lib/errorMessage';
import { Sentry } from '../lib/observability/sentry';
import {
  createReview,
  fetchMyReviewForJob,
  MAX_REVIEW_PHOTOS,
  type Review,
} from '../lib/reviews';
import { deleteJobPhoto, uploadReviewPhoto } from '../lib/storage';
import {
  fonts,
  radius,
  selectedInDark,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

// Reviews render as a short quoted block wherever they're shown (this same
// card once submitted, a worker's profile) — plenty of room for real
// feedback without inviting an essay.
const MAX_COMMENT_LENGTH = 300;

/**
 * Storage cleanup with the F-042 contract: one retry, and a false return
 * means the url is STILL in storage — callers keep such urls in
 * draftPhotosRef so the session's later sweeps try again, instead of a
 * console line being the only record of the leak.
 */
async function deletePhotoWithRetry(url: string): Promise<boolean> {
  const first = await deleteJobPhoto(url);
  if (!first.error) return true;
  const second = await deleteJobPhoto(url);
  if (second.error) {
    console.error('[ReviewSection] photo cleanup failed after retry', second.error);
    Sentry?.captureException(second.error, { extra: { site: 'ReviewSection.deletePhotoWithRetry' } });
    return false;
  }
  return true;
}

type ReviewSectionProps = {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  revieweeName: string;
  /** The role of the person BEING REVIEWED, not the reviewer — it picks both
   *  the heading ("…'s work" vs "working with …") and the would-you-again
   *  wording ("hire" vs "work for"). */
  revieweeRole: 'worker' | 'customer';
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
  revieweeRole,
  onSubmitted,
  scrollRef,
  palette: paletteProp,
}: ReviewSectionProps) {
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const styles = stylesFor(colors);
  const [existing, setExisting] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [rating, setRating] = useState(0);
  const [wouldAgain, setWouldAgain] = useState<boolean | null>(null);
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

  // The heading and the would-you-again question both address the person the
  // way a message to them would — first name, or the whole string when there
  // is only one. ONE derivation, so the two lines can never disagree about
  // what to call the same person (DECISIONS 2026-09-01). A host's fallback
  // description ("the worker") is not a name, so it is kept whole.
  const revieweeFirstName = /^the\s/.test(revieweeName)
    ? revieweeName
    : revieweeName.trim().split(/\s+/)[0] || revieweeName;

  function cleanupDraftPhotos() {
    for (const url of draftPhotosRef.current) {
      // A url that still fails after the retry STAYS in the set, so any later
      // sweep in this session (another cleanup call, the submit-time pass)
      // tries it again. At unmount the set dies with the process — that last
      // residual leak has no in-app actor left to pay it (F-042).
      deletePhotoWithRetry(url).then((deleted) => {
        if (deleted) draftPhotosRef.current.delete(url);
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
   * On the three screens that host it, this card sits at (or, on the tip
   * screen, near) the end of the scroll content — so "scroll to the end" is
   * exactly "put the comment field and the Submit button above the
   * keyboard", with no measuring needed.
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
        // This URL was never rendered or committed, so delete it immediately —
        // with the retry; a double failure here is the one leak with no later
        // sweep, since the form is already gone.
        void deletePhotoWithRetry(url);
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
    // A url whose delete still fails stays in draftPhotosRef — the
    // submit-time sweep retries it once the review is safely stored.
    deletePhotoWithRetry(url).then((deleted) => {
      if (deleted) draftPhotosRef.current.delete(url);
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
      wouldAgain,
    });
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
    if (!error) {
      uploadsCommittedRef.current = true;
      const committed = new Set(submittedPhotos);
      // A photo removed from the draft may have had a failed first delete.
      // Retry any such unreferenced upload once the review is safely stored;
      // what still fails stays in the set for cleanupDraftPhotos at unmount.
      for (const url of draftPhotosRef.current) {
        if (committed.has(url)) continue;
        deletePhotoWithRetry(url).then((deleted) => {
          if (deleted) draftPhotosRef.current.delete(url);
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
        {/* The reviewer's OWN answer only — profile_reviews never returns
            would_again (R8a D5), and a skipped question renders nothing. */}
        {existing.would_again != null ? (
          <Text style={[styles.doneWouldAgain, { color: palette.textMuted }]}>
            {revieweeRole === 'worker'
              ? existing.would_again
                ? 'You’d hire them again.'
                : 'You wouldn’t hire them again.'
              : existing.would_again
                ? 'You’d work for them again.'
                : 'You wouldn’t work for them again.'}
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
              <RemoteImage key={url} uri={url} style={styles.photo} />
            ))}
          </ScrollViewRN>
        )}
        <Text style={[styles.doneNote, { color: palette.textSubtle }]}>
          Thanks for rating {revieweeFirstName}.
        </Text>
      </Card>
    );
  }

  return (
    <Card palette={palette}>
      {/* Each role keeps the wording its hosts already used; only the name
          form moves (DECISIONS 2026-09-01). */}
      <Text style={[styles.title, { color: palette.text }]}>
        {revieweeRole === 'worker'
          ? `How was ${revieweeFirstName}’s work?`
          : `How was working with ${revieweeFirstName}?`}
      </Text>
      <View style={styles.stars}>
        <StarRating value={rating} onChange={submitting ? undefined : setRating} />
      </View>
      {/* R8a D5's question, finally asked. Skipping is a legitimate answer
          (null, R8b-c D3), so there is no validation and no Skip control —
          and tapping the active option clears it back to null, because an
          accidental tap must not become a permanent claim about a real
          person. */}
      <Text style={[styles.wouldAgainLabel, { color: palette.text }]}>
        {revieweeRole === 'worker'
          ? `Would you hire ${revieweeFirstName} again?`
          : `Would you work for ${revieweeFirstName} again?`}
      </Text>
      <View style={styles.presetRow}>
        {([true, false] as const).map((answer) => {
          const selected = wouldAgain === answer;
          return (
            <Pressable
              key={answer ? 'yes' : 'no'}
              style={[
                styles.preset,
                selected && (isDark ? styles.presetActiveDark : styles.presetActive),
              ]}
              onPress={() => setWouldAgain(selected ? null : answer)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.presetText,
                  selected && (isDark ? styles.presetTextActiveDark : styles.presetTextActive),
                ]}
              >
                {answer ? 'Yes' : 'No'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        palette={palette}
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        hint={`${comment.length}/${MAX_COMMENT_LENGTH}`}
        maxLength={MAX_COMMENT_LENGTH}
        editable={!submitting}
        placeholder={`Share how it went with ${revieweeFirstName}…`}
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
              <RemoteImage uri={url} style={styles.photo} />
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // Decision 9: a card heading is display type (master 15's "Your review").
  title: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  stars: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  wouldAgainLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // The Yes/No pair copies ReviewAndTipScreen's tip preset row locally (R8b-c
  // D6: no new shared component) so the two choices on one submit flow read
  // as one control family.
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  preset: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  // emerald D6: one selection treatment — gold line, gold label, no fill.
  presetActiveDark: {
    borderColor: selectedInDark(colors).line,
    backgroundColor: selectedInDark(colors).fill,
  },
  presetText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTextActive: {
    color: colors.emerald,
  },
  presetTextActiveDark: {
    color: selectedInDark(colors).line,
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
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  doneComment: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  doneWouldAgain: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  doneNote: {
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: spacing.md,
  },
  }),
);
