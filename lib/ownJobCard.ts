import type { Job } from './jobs';
import { userMessage, type ErrorLike } from './errorMessage';

/**
 * n5 (2026-09-04) — a customer's OWN Nearby card opens its job detail.
 *
 * docs/BACKLOG.md recorded the defect: every Nearby card on Customer Home,
 * the poster's own job included ("Your job" chip), ran browseOpenJobs() and
 * offered the worker-mode switch instead of opening the client job detail.
 *
 * ClientJobDetail takes the full `Job` row while the card holds the OpenJob
 * projection, so the row is fetched first and the screen is opened only on a
 * row; a failed or empty read alerts and opens nothing. The dependencies are
 * handed in so the node suite executes the decision — HomeScreen wires
 * fetchJobById, navigateAcrossTabs and alertAsync (lib/dialog.ts, never
 * Alert.alert).
 *
 * Import-free but for types and one pure module: userMessage
 * (lib/errorMessage.ts, itself import-free) is the one user-facing error
 * mapper, and this surface must not grow a second.
 */

/** The one place the own-job destination is named. */
export const OWN_JOB_ROUTE = { tab: 'MyJobs', screen: 'ClientJobDetail' } as const;

/** lib/errorMessage.ts's existing sentence for a row that is gone. */
const JOB_GONE = 'This isn’t available anymore.';

export type OwnJobDeps = {
  fetchJob: (id: string) => Promise<{ data: Job | null; error: unknown }>;
  navigate: (tab: string, screen: string, params: object) => void;
  alert: (title: string, message: string) => Promise<void>;
};

export async function openOwnJob(deps: OwnJobDeps, jobId: string): Promise<'opened' | 'failed'> {
  const { data, error } = await deps.fetchJob(jobId);
  if (error || !data) {
    await deps.alert(
      'Could not open your job',
      error ? userMessage(error as ErrorLike) : userMessage(null, JOB_GONE)
    );
    return 'failed';
  }
  deps.navigate(OWN_JOB_ROUTE.tab, OWN_JOB_ROUTE.screen, { job: data });
  return 'opened';
}
