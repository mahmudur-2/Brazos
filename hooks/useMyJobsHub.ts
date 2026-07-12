import { useCallback, useEffect, useState } from 'react';
import { fetchJobsAssignedToWorker, fetchJobsByClient, type Job } from '../lib/jobs';
import { fetchPendingBidsByWorker, type PendingBid } from '../lib/bids';
import { fetchProfilesByIds } from '../lib/profiles';
import { useAuth } from './useAuth';

/**
 * Aggregates everything for the My Jobs hub:
 *  - posted: jobs the user posted as a client
 *  - working: jobs the user is the assigned worker on
 *  - pendingBids: the user's bids that are still pending
 * Plus a name map (userId -> full_name) for showing counterparty names.
 */
export function useMyJobsHub() {
  const { user } = useAuth();
  const [posted, setPosted] = useState<Job[]>([]);
  const [working, setWorking] = useState<Job[]>([]);
  const [pendingBids, setPendingBids] = useState<PendingBid[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setPosted([]);
      setWorking([]);
      setPendingBids([]);
      setLoading(false);
      return;
    }
    setError(null);

    const [postedRes, workingRes, bidsRes] = await Promise.all([
      fetchJobsByClient(user.id),
      fetchJobsAssignedToWorker(user.id),
      fetchPendingBidsByWorker(user.id),
    ]);

    const firstError = postedRes.error || workingRes.error || bidsRes.error;
    if (firstError) setError(firstError.message);

    setPosted(postedRes.data);
    setWorking(workingRes.data);
    setPendingBids(bidsRes.data);

    // Resolve counterparty names: assigned workers on posted jobs, clients on
    // working jobs and pending-bid jobs.
    const ids = [
      ...postedRes.data.map((j) => j.assigned_worker_id),
      ...workingRes.data.map((j) => j.client_id),
      ...bidsRes.data.map((b) => b.job?.client_id),
    ].filter((id): id is string => !!id);

    const { data: profiles } = await fetchProfilesByIds(ids);
    const map: Record<string, string | null> = {};
    for (const p of profiles) map[p.id] = p.full_name;
    setNames(map);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { posted, working, pendingBids, names, loading, error, refresh };
}
