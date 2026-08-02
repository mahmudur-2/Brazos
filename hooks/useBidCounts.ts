import { useEffect, useState } from 'react';
import { fetchBidCounts } from '../lib/bids';

/**
 * Bid counts for a list of jobs, keyed by job id.
 *
 * Plural sibling of useBidCount: the same count, fetched once for a whole
 * page rather than once per card (see phase38 for why a `bids` embed cannot
 * be used here at all). Returns an empty map until the first read lands, and
 * an empty map — not zeroes — if the RPC is unavailable, so a card can tell
 * "no bids" apart from "not known yet" and simply omit the line.
 */
export function useBidCounts(jobIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Effects compare dependencies by identity, and the caller rebuilds this
  // array on every render; keying on the ids themselves stops the fetch from
  // re-running on every unrelated re-render.
  const key = jobIds.join(',');

  useEffect(() => {
    let active = true;
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setCounts({});
      return;
    }
    fetchBidCounts(ids).then(({ data, error }) => {
      if (!active) return;
      setCounts(error ? {} : data);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return counts;
}
