import { supabase } from './supabase';

export type Review = {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type NewReviewInput = {
  jobId: string;
  revieweeId: string;
  rating: number;
  comment: string;
};

/**
 * Insert a review. A DB trigger recomputes the reviewee's rating_avg /
 * rating_count on their profile, so the client doesn't touch other users' rows.
 */
export async function createReview(reviewerId: string, input: NewReviewInput) {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      reviewer_id: reviewerId,
      reviewee_id: input.revieweeId,
      job_id: input.jobId,
      rating: input.rating,
      comment: input.comment.trim() || null,
    })
    .select()
    .single();

  return { data: data as Review | null, error };
}

/** The review this reviewer already left on this job, if any. */
export async function fetchMyReviewForJob(reviewerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewer_id', reviewerId)
    .eq('job_id', jobId)
    .maybeSingle();

  return { data: data as Review | null, error };
}
