import { useEffect, useState } from 'react';
import { fetchOfferCounts } from '../lib/offers';

/**
 * Marketplace offer counts for a list of jobs, keyed by job id.
 *
 * One read for a whole page rather than one per card (see phase38 for why an
 * embed cannot be used here at all). Returns an empty map until the first read
 * lands, and an empty map — not zeroes — if the RPC is unavailable, so a card
 * can tell "no offers" apart from "not known yet" and simply omit the line.
 *
 * Counts distinct bidders, not offer rows: job_offer_count() counts root
 * offers only, so a negotiation that has been countered three times still
 * reads as one.
 */
export function useOfferCounts(jobIds: string[]) {
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
    fetchOfferCounts(ids).then(({ data, error }) => {
      if (!active) return;
      setCounts(error ? {} : data);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return counts;
}
