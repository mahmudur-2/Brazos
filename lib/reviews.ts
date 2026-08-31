import { supabase } from './supabase';
import { track } from './observability/analytics';

export type Review = {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  /** Photos the reviewer attached (phase37). Empty on every earlier review. */
  photos: string[];
  created_at: string;
};

export type NewReviewInput = {
  jobId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  photos?: string[];
};

/** Cap enforced by create_review() server-side; mirrored here so the picker
 *  stops offering a sixth rather than having the write refuse it. */
export const MAX_REVIEW_PHOTOS = 5;

function toPhotoArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Insert a review through create_review(), which derives reviewer_id and
 * validates the completed job parties and rating before the aggregate trigger.
 */
export async function createReview(_reviewerId: string, input: NewReviewInput) {
  const { data, error } = await supabase
    .rpc('create_review', {
      p_job_id: input.jobId,
      p_reviewee_id: input.revieweeId,
      p_rating: input.rating,
      p_comment: input.comment.trim() || null,
      p_photos: input.photos ?? [],
    })
    .single();

  // The one review write in the app — create_review() is the only path, and
  // every other reviews query in this file reads. The rating and nothing else:
  // the comment the reviewer typed is prose, and prose does not leave the
  // device (tests/analyticsPrivacy.test.mjs rule 2).
  if (!error && data) track({ name: 'review_left', stars: input.rating });

  return {
    data: data ? ({ ...data, photos: toPhotoArray((data as any).photos) } as Review) : null,
    error,
  };
}

/** One review as the reputation page shows it. */
export type ProfileReview = {
  id: string;
  rating: number;
  comment: string | null;
  photos: string[];
  created_at: string;
  reviewer_id: string;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  /** The related job's category. Its title is deliberately never returned —
   *  see phase37 for why a private job's title stays private. */
  job_category: string | null;
};

export type ReviewSummary = {
  total: number;
  average: number | null;
  /** Star -> count, 5 down to 1. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

/**
 * One page of reviews written ABOUT `userId`.
 *
 * phase6's RLS only lets someone read reviews they wrote or received, so this
 * goes through the narrow profile_reviews() function rather than the table —
 * the policy is not widened for it.
 */
export async function fetchProfileReviews(
  userId: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
) {
  const { data, error } = await supabase.rpc('profile_reviews', {
    p_user: userId,
    p_limit: limit,
    p_offset: offset,
  });

  const rows = (data ?? []) as any[];
  return {
    data: rows.map((r) => ({ ...r, photos: toPhotoArray(r.photos) }) as ProfileReview),
    error,
  };
}

/**
 * The rating header for the same page. Counted from the review rows rather
 * than read off profiles.rating_avg/rating_count, so the header can never
 * disagree with the list below it.
 */
export async function fetchProfileReviewSummary(userId: string) {
  const { data, error } = await supabase
    .rpc('profile_review_summary', { p_user: userId })
    .single();

  const row = data as
    | {
        total: number;
        average: number | string | null;
        five: number;
        four: number;
        three: number;
        two: number;
        one: number;
      }
    | null;

  if (!row) return { data: null as ReviewSummary | null, error };

  return {
    data: {
      total: row.total ?? 0,
      // numeric comes back as a string over PostgREST.
      average: row.average == null ? null : Number(row.average),
      distribution: {
        5: row.five ?? 0,
        4: row.four ?? 0,
        3: row.three ?? 0,
        2: row.two ?? 0,
        1: row.one ?? 0,
      },
    } as ReviewSummary,
    error,
  };
}

/**
 * Which of these jobs the viewer has already reviewed, in one query — the My
 * Jobs hub's "Leave a review" next-action check for Closed cards. phase6's
 * RLS already scopes the read to reviews the viewer wrote or received, and
 * the reviewer_id filter narrows it to their own.
 */
export async function fetchMyReviewedJobIds(reviewerId: string, jobIds: string[]) {
  if (jobIds.length === 0) return { data: new Set<string>(), error: null };

  const { data, error } = await supabase
    .from('reviews')
    .select('job_id')
    .eq('reviewer_id', reviewerId)
    .in('job_id', jobIds);

  return {
    data: new Set(((data ?? []) as { job_id: string }[]).map((row) => row.job_id)),
    error,
  };
}

/** The review this reviewer already left on this job, if any. */
export async function fetchMyReviewForJob(reviewerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, job_id, reviewer_id, reviewee_id, rating, comment, photos, created_at')
    .eq('reviewer_id', reviewerId)
    .eq('job_id', jobId)
    .maybeSingle();

  return {
    data: data ? ({ ...data, photos: toPhotoArray((data as any).photos) } as Review) : null,
    error,
  };
}
