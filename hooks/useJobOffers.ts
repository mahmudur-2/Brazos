import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { userMessage } from '../lib/errorMessage';
import { supabase } from '../lib/supabase';
import {
  fetchOffersByIds,
  fetchOffersForJob,
  mergeThreadOffers,
  offerIdOf,
  type OfferWithJob,
  type OfferWithWorker,
} from '../lib/offers';
import type { Message } from '../lib/messages';
import { fetchProfileReviewSummaries, type ProfileReviewSummaryRow } from '../lib/reviews';

/**
 * Loads every offer on a job (with each offering worker's profile).
 *
 * `summaries: true` (n7) adds the list surfaces' reputation read: ONE
 * profile_review_summaries() call over the offers' distinct worker ids —
 * worker role, revealed reviews only — re-run only when that id set changes.
 * The map is null until the batch answers (or when it failed): UNKNOWN, so a
 * card renders no number and the ranking treats every bid as unrated until
 * the numbers are known. Opt-in so BidDetail, which reads the single
 * summary for its one worker, issues no second request.
 */
export function useJobOffers(jobId: string, options: { summaries?: boolean } = {}) {
  const wantSummaries = options.summaries === true;
  const [offers, setOffers] = useState<OfferWithWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Map<string, ProfileReviewSummaryRow> | null>(
    null
  );
  const runRef = useRef(0);

  // Effects compare by identity and `offers` is a fresh array per read;
  // keying on the sorted distinct worker ids is what makes this ONE call per
  // id set rather than one per refresh.
  const workerKey = useMemo(
    () => [...new Set(offers.map((offer) => offer.worker_id))].sort().join(','),
    [offers]
  );

  useEffect(() => {
    if (!wantSummaries) return;
    let active = true;
    (async () => {
      const { data } = await fetchProfileReviewSummaries(
        workerKey ? workerKey.split(',') : [],
        'worker'
      );
      if (!active) return;
      // A failed read is null — UNKNOWN — never an empty map standing in
      // for "no reviews".
      setSummaries(data);
    })();
    return () => {
      active = false;
    };
  }, [wantSummaries, workerKey]);

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

  return { offers, loading, error, refresh, summaries };
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

  // The CURRENT id set, readable from inside an in-flight fetch. Two refreshes
  // overlap routinely — the realtime job_offers channel fires on the counter's
  // INSERT while the realtime messages channel is still delivering the event
  // message that adds its id here — so the request that started first can
  // answer last with a smaller id set. Merging against the live set instead of
  // the captured one is what stops the older answer from erasing the newer
  // offer (the "$X proposed" stub with no job and no actions).
  const idKeyRef = useRef(idKey);
  idKeyRef.current = idKey;

  const refresh = useCallback(async () => {
    const ids = idKey ? idKey.split(',') : [];
    if (ids.length === 0) {
      setOffers([]);
      return;
    }
    const { data, error } = await fetchOffersByIds(ids);
    // A FAILED read is not "no offers". Writing [] through would blank every
    // negotiation card in the thread — the same rule JobDetailScreen's offer
    // refresh already follows.
    if (error) {
      console.warn('[ThreadOffers] refresh failed', error.message);
      return;
    }
    setOffers((prev) =>
      mergeThreadOffers(
        prev,
        data,
        idKeyRef.current ? idKeyRef.current.split(',') : []
      )
    );
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
