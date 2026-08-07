import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBidsForJob, type BidWithWorker } from '../lib/bids';

/** Loads all bids on a job (with each bidding worker's profile). */
export function useJobBids(jobId: string) {
  const [bids, setBids] = useState<BidWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const runId = ++runRef.current;
    setError(null);
    const { data, error } = await fetchBidsForJob(jobId);
    if (runId !== runRef.current) return;
    if (error) setError(error.message);
    else setBids(data);
    setLoading(false);
  }, [jobId]);

  // A navigation route can be reused with a different job id. Never leave the
  // previous job's offers visible while the replacement read is in flight.
  useEffect(() => {
    runRef.current += 1;
    setBids([]);
    setError(null);
    setLoading(true);
    return () => {
      runRef.current += 1;
    };
  }, [jobId]);

  // Re-read whenever the customer returns to Job & Bids. Bid submissions can
  // arrive while this screen is covered by a worker profile or another route;
  // keeping the previous rows visible while this refresh runs avoids a full-
  // screen loading flash on every back navigation.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        runRef.current += 1;
      };
    }, [refresh])
  );

  return { bids, loading, error, refresh };
}
