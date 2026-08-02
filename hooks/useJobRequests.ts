import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchThreadRequests, type JobRequest } from '../lib/jobRequests';
import { chatTargetKey, type ChatTarget } from '../lib/messages';

/**
 * Live hire-request state for one conversation thread.
 *
 * The negotiation cards are message rows, but their ACTIONS depend on the
 * request's current state (whose turn, how many counters are left, whether
 * it's been settled), which lives on job_requests. This keeps that state in
 * sync so a card can't offer a button the server would reject.
 */
export function useJobRequests(jobId: string | null, directThreadId: string | null) {
  const [requests, setRequests] = useState<JobRequest[]>([]);

  const target = useMemo<ChatTarget>(
    () => (jobId ? { jobId } : { directThreadId: directThreadId as string }),
    [jobId, directThreadId]
  );
  const targetKey = chatTargetKey(target);
  // job_requests names its thread columns differently from messages, so the
  // realtime filter is built here rather than reusing chatTargetFilter().
  const targetFilter = jobId
    ? `thread_job_id=eq.${jobId}`
    : `direct_thread_id=eq.${directThreadId}`;

  // See hooks/useOpenJobs.ts for why the channel topic needs both a
  // per-instance id and a per-effect-run counter.
  const instanceId = useId();
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const { data } = await fetchThreadRequests(target);
    setRequests(data);
  }, [target]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The counterparty's accept/decline/counter lands as an UPDATE on
  // job_requests; without this the card would keep showing the old turn until
  // the screen was reopened.
  useEffect(() => {
    const channel = supabase
      .channel(`job-requests:${targetKey}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_requests',
          filter: targetFilter,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetKey, targetFilter, instanceId, refresh]);

  const byId = useMemo(() => {
    const map: Record<string, JobRequest> = {};
    for (const r of requests) map[r.id] = r;
    return map;
  }, [requests]);

  return { requests, byId, refresh };
}
