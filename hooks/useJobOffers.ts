import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { userMessage } from '../lib/errorMessage';
import { supabase } from '../lib/supabase';
import {
  fetchOffersByIds,
  fetchOffersForJob,
  offerIdOf,
  type OfferWithJob,
  type OfferWithWorker,
} from '../lib/offers';
import type { Message } from '../lib/messages';

/** Loads every offer on a job (with each offering worker's profile). */
export function useJobOffers(jobId: string) {
  const [offers, setOffers] = useState<OfferWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const runId = ++runRef.current;
    setError(null);
    const { data, error } = await fetchOffersForJob(jobId);
    if (runId !== runRef.current) return;
    if (error) setError(userMessage(error));
    else setOffers(data);
    setLoading(false);
  }, [jobId]);

  // A navigation route can be reused with a different job id. Never leave the
  // previous job's offers visible while the replacement read is in flight.
  useEffect(() => {
    runRef.current += 1;
    setOffers([]);
    setError(null);
    setLoading(true);
    return () => {
      runRef.current += 1;
    };
  }, [jobId]);

  // Re-read whenever the customer returns to Job & Offers. Submissions can
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

  return { offers, loading, error, refresh };
}

/**
 * Live offer state for one conversation thread.
 *
 * The negotiation cards are message rows, but their ACTIONS depend on the
 * offer's current state — whose turn it is, how many counters are left,
 * whether it has settled. Threads link to offers through `messages`, so the
 * ids come from there; fetching the whole set also yields the complete chain,
 * which is what countersRemaining() counts.
 *
 * Successor to useJobRequests(). The realtime subscription carries no filter
 * because job_offers has no thread column and RLS already limits delivery to
 * this user's own offers — a small volume — so an unfiltered channel is
 * cheaper than keeping a synthetic filter key in sync.
 */
export function useThreadOffers(messages: Message[]) {
  const [offers, setOffers] = useState<OfferWithJob[]>([]);

  // Effects compare by identity and `messages` is rebuilt on every render;
  // keying on the ids themselves stops the fetch re-running constantly.
  const idKey = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      const id = offerIdOf(message);
      if (id) ids.add(id);
    }
    return [...ids].sort().join(',');
  }, [messages]);

  // See hooks/useOpenJobs.ts for why the channel topic needs both a
  // per-instance id and a per-effect-run counter.
  const instanceId = useId();
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const ids = idKey ? idKey.split(',') : [];
    if (ids.length === 0) {
      setOffers([]);
      return;
    }
    const { data } = await fetchOffersByIds(ids);
    setOffers(data);
  }, [idKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The counterparty's accept/decline/counter lands as an UPDATE (and, for a
  // counter, an INSERT) on job_offers; without this the card would keep
  // showing the old turn until the screen was reopened.
  useEffect(() => {
    if (!idKey) return;
    const channel = supabase
      .channel(`job-offers:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_offers' },
        () => void refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idKey, instanceId, refresh]);

  const byId = useMemo(() => {
    const map: Record<string, OfferWithJob> = {};
    for (const offer of offers) map[offer.id] = offer;
    return map;
  }, [offers]);

  return { offers, byId, refresh };
}
