import { useCallback, useEffect, useState } from 'react';
import { fetchJobById, type Job } from '../lib/jobs';

/** Loads a single job by id, with a refresh for after status changes. */
export function useJob(jobId: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchJobById(jobId);
    if (error) setError(error.message);
    else setJob(data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { job, loading, error, refresh };
}
