import { useCallback, useEffect, useState } from 'react';
import { fetchBidsForJob, type BidWithWorker } from '../lib/bids';

/** Loads all bids on a job (with each bidding worker's profile). */
export function useJobBids(jobId: string) {
  const [bids, setBids] = useState<BidWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchBidsForJob(jobId);
    if (error) setError(error.message);
    else setBids(data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { bids, loading, error, refresh };
}
