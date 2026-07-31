import { supabase } from './supabase';

type AcceptBidParams = {
  jobId: string;
  bidId: string;
};

type AcceptedBidRow = {
  id: string;
  worker_id: string;
  amount_cents: number;
  status: string;
};

type BidAcceptanceError = {
  code: string;
  details: string;
  hint: string;
  message: string;
};

/**
 * Compatibility path for projects where phase30 has not reached PostgREST's
 * schema cache yet. It is called only for PGRST202 (missing accept_bid RPC).
 *
 * The selected worker and amount are still read from the server-owned bid row,
 * never accepted from caller input. Conditional filters and compensating
 * rollback keep the legacy multi-request path as narrow as possible until the
 * transactional RPC is available.
 */
export async function acceptBidWithoutRpc(
  params: AcceptBidParams
): Promise<{ error: BidAcceptanceError | null }> {
  const { data: bidData, error: bidReadError } = await supabase
    .from('bids')
    .select('id, worker_id, amount_cents, status')
    .eq('id', params.bidId)
    .eq('job_id', params.jobId)
    .eq('status', 'pending')
    .maybeSingle();

  if (bidReadError) return { error: bidReadError };
  const bid = bidData as AcceptedBidRow | null;
  if (!bid) {
    return {
      error: {
        code: 'BRAZOS_BID_NOT_PENDING',
        details: '',
        hint: '',
        message: 'This bid is no longer pending for this job.',
      },
    };
  }

  const { data: assignedJob, error: jobError } = await supabase
    .from('jobs')
    .update({
      status: 'assigned',
      assigned_worker_id: bid.worker_id,
      accepted_bid_id: bid.id,
      final_amount_cents: bid.amount_cents,
    })
    .eq('id', params.jobId)
    .eq('status', 'open')
    .is('accepted_bid_id', null)
    .select('id')
    .maybeSingle();

  if (jobError) return { error: jobError };
  if (!assignedJob) {
    return {
      error: {
        code: 'BRAZOS_JOB_NOT_OPEN',
        details: '',
        hint: '',
        message: 'This job no longer accepts bids.',
      },
    };
  }

  const rollback = async () => {
    await Promise.all([
      supabase
        .from('jobs')
        .update({
          status: 'open',
          assigned_worker_id: null,
          accepted_bid_id: null,
          final_amount_cents: null,
        })
        .eq('id', params.jobId)
        .eq('accepted_bid_id', bid.id),
      supabase
        .from('bids')
        .update({ status: 'pending' })
        .eq('job_id', params.jobId)
        .in('status', ['accepted', 'rejected']),
    ]);
  };

  const { error: rejectError } = await supabase
    .from('bids')
    .update({ status: 'rejected' })
    .eq('job_id', params.jobId)
    .eq('status', 'pending');

  if (rejectError) {
    await rollback();
    return { error: rejectError };
  }

  const { error: acceptError } = await supabase
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bid.id)
    .eq('job_id', params.jobId)
    .eq('status', 'rejected');

  if (acceptError) {
    await rollback();
    return { error: acceptError };
  }

  return { error: null };
}
