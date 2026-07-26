import { useEffect, useState } from 'react';
import { fetchBidCount } from '../lib/bids';

/**
 * Bid count for one job, for viewers who don't already have accurate bid
 * data on hand (e.g. a worker browsing a job that isn't theirs). Returns
 * null while loading so callers can distinguish "not fetched yet" from
 * "zero bids" — same convention as useJobOwnerActions' bid count.
 */
export function useBidCount(jobId: string) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setCount(null);
    fetchBidCount(jobId).then(({ data }) => {
      if (active) setCount(data);
    });
    return () => {
      active = false;
    };
  }, [jobId]);

  return count;
}
