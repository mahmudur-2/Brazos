import { supabase } from './supabase';

type TransitionStatus = 'in_progress' | 'completed';

type TransitionParams = {
  jobId: string;
  status: TransitionStatus;
  photoUrls?: string[] | null;
};

type JobTransitionError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

type TransitionJobRow = {
  id: string;
  assigned_worker_id: string;
  status: string;
};

function transitionError(code: string, message: string): JobTransitionError {
  return { code, details: '', hint: '', message };
}

/**
 * Compatibility path for deployments where transition_job_status() has not
 * reached PostgREST yet. It is called only for PGRST202 (missing RPC).
 *
 * The authenticated worker, current assignee, and expected prior status are
 * checked before the update and repeated as conditional update filters. RLS
 * remains the final authority on legacy databases. Phase31 restores the
 * transactional server function and makes this path unnecessary.
 */
export async function transitionJobStatusWithoutRpc(
  params: TransitionParams
): Promise<{ error: JobTransitionError | null }> {
  const photos = params.photoUrls ?? [];
  if (
    photos.length > 5 ||
    photos.some((photo) => typeof photo !== 'string' || photo.length > 2048)
  ) {
    return {
      error: transitionError(
        'BRAZOS_INVALID_COMPLETION_PHOTOS',
        'Completion photos must contain at most five valid uploads.'
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) return { error: authError };
  if (!user) {
    return {
      error: transitionError(
        'BRAZOS_AUTH_REQUIRED',
        'Please sign in again before updating this job.'
      ),
    };
  }

  const expectedStatus = params.status === 'in_progress' ? 'assigned' : 'in_progress';
  const { data: jobData, error: readError } = await supabase
    .from('jobs')
    .select('id, assigned_worker_id, status')
    .eq('id', params.jobId)
    .eq('assigned_worker_id', user.id)
    .maybeSingle();

  if (readError) return { error: readError };
  const job = jobData as TransitionJobRow | null;
  if (!job || job.status !== expectedStatus) {
    return {
      error: transitionError(
        'BRAZOS_INVALID_JOB_TRANSITION',
        'This job has already changed. Refresh it and try again.'
      ),
    };
  }

  const patch: {
    status: TransitionStatus;
    completion_photos?: string[];
    completion_photo_url?: string;
  } = { status: params.status };

  if (params.status === 'completed' && params.photoUrls != null) {
    patch.completion_photos = photos;
    if (photos.length > 0) patch.completion_photo_url = photos[0];
  }

  const { data: updatedJob, error: updateError } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', params.jobId)
    .eq('assigned_worker_id', user.id)
    .eq('status', expectedStatus)
    .select('id, status')
    .maybeSingle();

  if (updateError) return { error: updateError };
  if (!updatedJob) {
    return {
      error: transitionError(
        'BRAZOS_JOB_TRANSITION_CONFLICT',
        'This job changed while you were updating it. Refresh and try again.'
      ),
    };
  }

  return { error: null };
}
