import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpenDisputeJobIds } from '../lib/disputes';
import { userMessage } from '../lib/errorMessage';
import { fetchJobsAssignedToWorker, fetchJobsByClient, type Job } from '../lib/jobs';
import {
  fetchPendingOffersByWorker,
  fetchSettledOffersByWorker,
  type PendingOffer,
} from '../lib/offers';
import { fetchJobPaymentStatusesByJobIds, type PaymentStatusSummary } from '../lib/payments';
import { fetchProfilesByIds } from '../lib/profiles';
import { HUB_STALE_MS, mergeKeepOnError, queryKeys } from '../lib/queryKeys';
import { fetchMyReviewedJobIds } from '../lib/reviews';
import { useAuth } from './useAuth';

/** Everything the hub shows, as one cached snapshot. */
type HubSnapshot = {
  posted: Job[];
  working: Job[];
  pendingBids: PendingOffer[];
  settledBids: PendingOffer[];
  payments: Record<string, PaymentStatusSummary>;
  openDisputeJobIds: Set<string>;
  reviewedJobIds: Set<string>;
  names: Record<string, string | null>;
  /** The first failed read, in words; null when every read answered. */
  error: string | null;
};

const EMPTY_HUB: HubSnapshot = {
  posted: [],
  working: [],
  pendingBids: [],
  settledBids: [],
  payments: {},
  openDisputeJobIds: new Set(),
  reviewedJobIds: new Set(),
  names: {},
  error: null,
};

/**
 * One read of the whole hub (eight queries, two batches), merged onto the last
 * good snapshot.
 *
 * KEEP-ON-ERROR, field by field (lib/queryKeys.ts mergeKeepOnError): a failed
 * category returns an empty fallback array, so its last-known successful rows
 * are kept instead of being erased — and so are the bucketing facts.
 *
 * NO LATE ANSWER WINS: React Query runs one read per key at a time — a forced
 * refresh cancels the one in flight and a focus refresh joins it — so an
 * older answer can never land over a newer one.
 */
async function readHub(user: { id: string }, previous: HubSnapshot | undefined): Promise<HubSnapshot> {
  const [postedRes, workingRes, bidsRes, settledRes] = await Promise.all([
    fetchJobsByClient(user.id),
    fetchJobsAssignedToWorker(user.id),
    fetchPendingOffersByWorker(user.id),
    fetchSettledOffersByWorker(user.id),
  ]);

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

  const { data: profiles, error: profilesError } = profilesRes;
  const map: Record<string, string | null> = {};
  for (const p of profiles) map[p.id] = p.full_name;

  const failed = new Set<keyof HubSnapshot>();
  if (postedRes.error) failed.add('posted');
  if (workingRes.error) failed.add('working');
  if (bidsRes.error) failed.add('pendingBids');
  if (settledRes.error) failed.add('settledBids');
  if (paymentsRes.error) failed.add('payments');
  if (disputesRes.error) failed.add('openDisputeJobIds');
  if (reviewedRes.error) failed.add('reviewedJobIds');
  if (profilesError) failed.add('names');

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

  return mergeKeepOnError(
    previous,
    {
      posted: postedRes.data,
      working: workingRes.data,
      pendingBids: bidsRes.data,
      settledBids: settledRes.data,
      payments: paymentsRes.data,
      openDisputeJobIds: disputesRes.data,
      reviewedJobIds: reviewedRes.data,
      // Merged, so names belonging to a temporarily failed job category remain
      // available beside its preserved last-known cards.
      names: { ...(previous?.names ?? {}), ...map },
      error: firstError ? userMessage(firstError) : null,
    },
    failed
  );
}

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
 *
 * F13 (fix run): ONE cached snapshot per account (queryKeys.myJobsHub),
 * shared by Home, Worker Home, My Jobs, the [+] sheet, Worker Results and the
 * Map, read on mount when there is none (F15: the Smart Match screens get the
 * worker's history without a refresh of their own). A focus calls
 * `refreshIfStale`, which reads only when the snapshot is older than
 * HUB_STALE_MS — or carries a failed read; pull-to-refresh and retry call
 * `refresh`, which always reads. Every own mutation invalidates it at its call
 * site (lib/queryClient.ts invalidateJobs).
 */
export function useMyJobsHub() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = useQueryClient();

  const queryFn = useCallback(
    () =>
      readHub(
        { id: userId as string },
        client.getQueryData<HubSnapshot>(queryKeys.myJobsHub(userId as string))
      ),
    [client, userId]
  );
  const query = useQuery({
    queryKey: queryKeys.myJobsHub(userId ?? 'signed-out'),
    queryFn,
    enabled: !!userId,
    staleTime: HUB_STALE_MS,
  });
  const { refetch } = query;

  const refresh = useCallback(async () => {
    if (userId) await refetch();
  }, [refetch, userId]);

  const refreshIfStale = useCallback(() => {
    if (!userId) return;
    const key = queryKeys.myJobsHub(userId);
    // A snapshot that carries a failed read is never fresh: the next focus tries again.
    const failedLastTime = !!client.getQueryData<HubSnapshot>(key)?.error;
    void client.prefetchQuery({ queryKey: key, queryFn, staleTime: failedLastTime ? 0 : HUB_STALE_MS });
  }, [client, userId, queryFn]);

  const hub = (userId ? query.data : undefined) ?? EMPTY_HUB;

  return {
    posted: hub.posted,
    working: hub.working,
    pendingBids: hub.pendingBids,
    settledBids: hub.settledBids,
    payments: hub.payments,
    openDisputeJobIds: hub.openDisputeJobIds,
    reviewedJobIds: hub.reviewedJobIds,
    names: hub.names,
    loading: !!userId && query.isPending,
    // A read that threw outright (not one source failing) still says so.
    error: hub.error ?? (query.error ? userMessage(query.error) : null),
    refresh,
    refreshIfStale,
  };
}
