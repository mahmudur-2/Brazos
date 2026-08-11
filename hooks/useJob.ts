import { useCallback, useEffect, useState } from 'react';
import { userMessage } from '../lib/errorMessage';
import { fetchJobById, type Job } from '../lib/jobs';

/**
 * Loads a single job by id, with a refresh for after status changes.
 *
 * `jobId` may be null for a caller that isn't always about a job — the chat
 * screen, whose thread can be a direct conversation between two people with no
 * job attached (phase36). In that case nothing is fetched and `job` stays null.
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return;
    }
    const { data, error } = await fetchJobById(jobId);
    if (error) setError(userMessage(error));
    else setJob(data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { job, loading, error, refresh };
}
