import { fetchOpenDisputeJobIds } from './disputes';
import { fetchJobStageFacts } from './jobs';
import { deriveJobLifecycle, type JobLifecycleState } from './jobLifecycle';
import { fetchJobPaymentStatusesByJobIds } from './payments';

/**
 * 2026-09-28 (LUX-LIST-64 #54) — WHERE EACH JOB AN INBOX ROW NAMES STANDS, for
 * the row's job chip: the three reads the derivation takes (the job's stage
 * facts, its payment, the open-dispute read) and THE derivation itself,
 * deriveJobLifecycle() — asked here, in the data layer, so the Inbox screen
 * never states an idea of its own about where a job is.
 *
 * A failed job or payment read is the call's error, and the caller keeps what
 * it had. A failed DISPUTE read places no job on the track ('unknown'), so no
 * chip shows a stage that may be wrong — its title stands alone.
 */
export async function fetchJobLifecycleStates(jobIds: string[]) {
  const empty: Record<string, JobLifecycleState> = {};
  if (jobIds.length === 0) return { data: empty, error: null };
  const [jobsRes, paymentsRes, disputesRes] = await Promise.all([
    fetchJobStageFacts(jobIds),
    fetchJobPaymentStatusesByJobIds(jobIds),
    fetchOpenDisputeJobIds(jobIds),
  ]);
  const error = jobsRes.error ?? paymentsRes.error ?? null;
  if (error) return { data: empty, error };
  const data: Record<string, JobLifecycleState> = {};
  for (const job of jobsRes.data) {
    data[job.id] = deriveJobLifecycle({
      job,
      payment: paymentsRes.data[job.id] ?? null,
      hasOpenDispute: disputesRes.error ? 'unknown' : disputesRes.data.has(job.id),
    });
  }
  return { data, error: null };
}
