import { supabase } from './supabase';
import { track } from './observability/analytics';

/** Which side of a job the reviewee played. Reputation is kept per role
 *  (R8a D4) so hiring well and working well never blur into one number. */
export type ReviewRole = 'worker' | 'customer';

export type Review = {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  /** Photos the reviewer attached (phase37). Empty on every earlier review. */
  photos: string[];
  /** R8a D5 — the reviewer's own answer only; profile_reviews never returns
   *  this column, so it can never render on someone else's review. */
  would_again: boolean | null;
  created_at: string;
};

export type NewReviewInput = {
  jobId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  photos?: string[];
  /** Null is a legitimate answer — the question may be skipped (R8b-c D3). */
  wouldAgain?: boolean | null;
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
      p_would_again: input.wouldAgain ?? null,
    })
    .single();

  // The one review write in the app — create_review() is the only path, and
  // every other reviews query in this file reads. The rating and nothing else:
  // the comment the reviewer typed is prose, and prose does not leave the
  // device (tests/analyticsPrivacy.test.mjs rule 2).
  if (!error && data) track({ name: 'review_left', stars: input.rating });

  return {
    data: data
      ? ({
          ...data,
          photos: toPhotoArray((data as any).photos),
          would_again: (data as any).would_again ?? null,
        } as Review)
      : null,
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
  /** The one number any surface may display (R8b-c D1): the raw mean shrunk
   *  toward the platform prior, so two revealed 5★ can't outrank a hundred. */
  shownAverage: number | null;
  /** Under three revealed reviews the surface says "New", not a number. */
  isNew: boolean;
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
  {
    limit = 20,
    offset = 0,
    role = 'worker',
  }: { limit?: number; offset?: number; role?: ReviewRole } = {}
) {
  const { data, error } = await supabase.rpc('profile_reviews', {
    p_user: userId,
    p_limit: limit,
    p_offset: offset,
    p_role: role,
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
export async function fetchProfileReviewSummary(userId: string, role: ReviewRole = 'worker') {
  const { data, error } = await supabase
    .rpc('profile_review_summary', { p_user: userId, p_role: role })
    .single();

  const row = data as
    | {
        total: number;
        average: number | string | null;
        shown_average: number | string | null;
        is_new: boolean | null;
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
      shownAverage: row.shown_average == null ? null : Number(row.shown_average),
      // An absent verdict is treated as new — the honest default is the one
      // that shows no invented number.
      isNew: row.is_new ?? true,
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
 * Both roles' summaries in one round trip — the own-profile surfaces need
 * worker AND customer to decide what to show and whether the reviews page is
 * worth linking to at all. Each side is null when its read failed or returned
 * nothing; `error` carries the first failure so callers can say UNKNOWN
 * rather than zero (F-026).
 */
export async function fetchBothRoleSummaries(userId: string) {
  const [workerRes, customerRes] = await Promise.all([
    fetchProfileReviewSummary(userId, 'worker'),
    fetchProfileReviewSummary(userId, 'customer'),
  ]);
  return {
    worker: workerRes.data,
    customer: customerRes.data,
    error: workerRes.error || customerRes.error || null,
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
    .select('id, job_id, reviewer_id, reviewee_id, rating, comment, photos, would_again, created_at')
    .eq('reviewer_id', reviewerId)
    .eq('job_id', jobId)
    .maybeSingle();

  return {
    data: data ? ({ ...data, photos: toPhotoArray((data as any).photos) } as Review) : null,
    error,
  };
}
