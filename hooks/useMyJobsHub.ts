import { useCallback, useEffect, useRef, useState } from 'react';
import { userMessage } from '../lib/errorMessage';
import { fetchJobsAssignedToWorker, fetchJobsByClient, type Job } from '../lib/jobs';
import { fetchPendingOffersByWorker, type PendingOffer } from '../lib/offers';
import { fetchProfilesByIds } from '../lib/profiles';
import { useAuth } from './useAuth';

/**
 * Aggregates everything for the My Jobs hub:
 *  - posted: jobs the user posted as a client
 *  - working: jobs the user is the assigned worker on
 *  - pendingBids: the user's offers that are still live
 * Plus a name map (userId -> full_name) for showing counterparty names.
 */
export function useMyJobsHub() {
  const { user } = useAuth();
  const [posted, setPosted] = useState<Job[]>([]);
  const [working, setWorking] = useState<Job[]>([]);
  const [pendingBids, setPendingBids] = useState<PendingOffer[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Focus, pull-to-refresh, and retry may overlap. Only the newest request is
  // allowed to publish its result into the hub.
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      runRef.current += 1;
      setPosted([]);
      setWorking([]);
      setPendingBids([]);
      setNames({});
      setError(null);
      setLoading(false);
      return;
    }
    const runId = ++runRef.current;

    const [postedRes, workingRes, bidsRes] = await Promise.all([
      fetchJobsByClient(user.id),
      fetchJobsAssignedToWorker(user.id),
      fetchPendingOffersByWorker(user.id),
    ]);

    if (runId !== runRef.current) return;

    // A failed category returns an empty fallback array. Keep the last-known
    // successful rows for only that category instead of erasing valid data.
    if (!postedRes.error) setPosted(postedRes.data);
    if (!workingRes.error) setWorking(workingRes.data);
    if (!bidsRes.error) setPendingBids(bidsRes.data);

    // Resolve counterparty names: assigned workers on posted jobs, clients on
    // working jobs and live-offer jobs.
    const ids = [
      ...postedRes.data.map((j) => j.assigned_worker_id),
      ...workingRes.data.map((j) => j.client_id),
      ...bidsRes.data.map((b) => b.job?.client_id),
    ].filter((id): id is string => !!id);

    const { data: profiles, error: profilesError } = await fetchProfilesByIds(ids);
    if (runId !== runRef.current) return;
    const map: Record<string, string | null> = {};
    for (const p of profiles) map[p.id] = p.full_name;
    if (!profilesError) {
      // Merge so names belonging to a temporarily failed job category remain
      // available beside its preserved last-known cards.
      setNames((current) => ({ ...current, ...map }));
    }

    const firstError = postedRes.error || workingRes.error || bidsRes.error || profilesError;
    setError(firstError ? userMessage(firstError) : null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
    };
  }, []);

  return { posted, working, pendingBids, names, loading, error, refresh };
}
