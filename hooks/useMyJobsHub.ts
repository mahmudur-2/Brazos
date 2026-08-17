import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOpenDisputeJobIds } from '../lib/disputes';
import { userMessage } from '../lib/errorMessage';
import { fetchJobsAssignedToWorker, fetchJobsByClient, type Job } from '../lib/jobs';
import {
  fetchPendingOffersByWorker,
  fetchSettledOffersByWorker,
  type PendingOffer,
} from '../lib/offers';
import { fetchJobPaymentStatusesByJobIds, type Payment } from '../lib/payments';
import { fetchProfilesByIds } from '../lib/profiles';
import { fetchMyReviewedJobIds } from '../lib/reviews';
import { useAuth } from './useAuth';

/**
 * Aggregates everything for the My Jobs hub:
 *  - posted: jobs the user posted as a client
 *  - working: jobs the user is the assigned worker on
 *  - pendingBids: the user's offers that are still live
 *  - settledBids: the user's declined/expired offers (the Closed tab)
 * Plus the per-job facts the Active/Review/Closed bucketing derives from
 * (lib/jobLifecycle.ts): the active job_payment status, open issue reports,
 * and which jobs the viewer has already reviewed — each ONE batched query,
 * never one per row. And a name map (userId -> full_name) for counterparties.
 */
export function useMyJobsHub() {
  const { user } = useAuth();
  const [posted, setPosted] = useState<Job[]>([]);
  const [working, setWorking] = useState<Job[]>([]);
  const [pendingBids, setPendingBids] = useState<PendingOffer[]>([]);
  const [settledBids, setSettledBids] = useState<PendingOffer[]>([]);
  const [payments, setPayments] = useState<Record<string, Pick<Payment, 'status'>>>({});
  const [openDisputeJobIds, setOpenDisputeJobIds] = useState<Set<string>>(new Set());
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set());
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
      setSettledBids([]);
      setPayments({});
      setOpenDisputeJobIds(new Set());
      setReviewedJobIds(new Set());
      setNames({});
      setError(null);
      setLoading(false);
      return;
    }
    const runId = ++runRef.current;

    const [postedRes, workingRes, bidsRes, settledRes] = await Promise.all([
      fetchJobsByClient(user.id),
      fetchJobsAssignedToWorker(user.id),
      fetchPendingOffersByWorker(user.id),
      fetchSettledOffersByWorker(user.id),
    ]);

    if (runId !== runRef.current) return;

    // A failed category returns an empty fallback array. Keep the last-known
    // successful rows for only that category instead of erasing valid data.
    if (!postedRes.error) setPosted(postedRes.data);
    if (!workingRes.error) setWorking(workingRes.data);
    if (!bidsRes.error) setPendingBids(bidsRes.data);
    if (!settledRes.error) setSettledBids(settledRes.data);

    // The bucketing facts, one query each over the whole page of jobs.
    const jobIds = [
      ...postedRes.data.map((j) => j.id),
      ...workingRes.data.map((j) => j.id),
    ];

    // Resolve counterparty names: assigned workers on posted jobs, clients on
    // working jobs and offer jobs (live and settled alike).
    const ids = [
      ...postedRes.data.map((j) => j.assigned_worker_id),
      ...workingRes.data.map((j) => j.client_id),
      ...bidsRes.data.map((b) => b.job?.client_id),
      ...settledRes.data.map((b) => b.job?.client_id),
    ].filter((id): id is string => !!id);

    const [paymentsRes, disputesRes, reviewedRes, profilesRes] = await Promise.all([
      fetchJobPaymentStatusesByJobIds(jobIds),
      fetchOpenDisputeJobIds(jobIds),
      fetchMyReviewedJobIds(user.id, jobIds),
      fetchProfilesByIds(ids),
    ]);
    if (runId !== runRef.current) return;

    if (!paymentsRes.error) setPayments(paymentsRes.data);
    if (!disputesRes.error) setOpenDisputeJobIds(disputesRes.data);
    if (!reviewedRes.error) setReviewedJobIds(reviewedRes.data);

    const { data: profiles, error: profilesError } = profilesRes;
    const map: Record<string, string | null> = {};
    for (const p of profiles) map[p.id] = p.full_name;
    if (!profilesError) {
      // Merge so names belonging to a temporarily failed job category remain
      // available beside its preserved last-known cards.
      setNames((current) => ({ ...current, ...map }));
    }

    const firstError =
      postedRes.error ||
      workingRes.error ||
      bidsRes.error ||
      settledRes.error ||
      // A failed facts read is surfaced too: without the payment statuses a
      // finished-but-unapproved job would quietly mis-bucket into Closed.
      paymentsRes.error ||
      disputesRes.error ||
      reviewedRes.error ||
      profilesError;
    setError(firstError ? userMessage(firstError) : null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
    };
  }, []);

  return {
    posted,
    working,
    pendingBids,
    settledBids,
    payments,
    openDisputeJobIds,
    reviewedJobIds,
    names,
    loading,
    error,
    refresh,
  };
}
