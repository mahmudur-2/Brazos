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
    })
    .single();

  return { data: data as Review | null, error };
}

/** The review this reviewer already left on this job, if any. */
export async function fetchMyReviewForJob(reviewerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, job_id, reviewer_id, reviewee_id, rating, comment, created_at')
    .eq('reviewer_id', reviewerId)
    .eq('job_id', jobId)
    .maybeSingle();

  return { data: data as Review | null, error };
}
