import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchReactionsForJob, type Reaction } from '../lib/reactions';
import { supabase } from '../lib/supabase';

/**
 * Loads every reaction on a job's messages and keeps them live via realtime.
 * Reactions per job are a small dataset (at most one per person per message),
 * so on any realtime change we just refetch the whole set rather than
 * patching individual rows — simpler and cheap at this scale.
 *
 * `jobId` may be null: message_reactions is keyed by job, so a direct thread
 * (phase36) has no reactions to load and none can be added there. The hook
 * stays mounted and simply returns an empty set rather than the chat screen
 * having to branch around it.
 */
export function useReactions(jobId: string | null) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // A3 (2026-10-03): the topic was `reactions:job:${jobId}` with nothing
  // unique per mount. supabase.channel() dedupes by topic string and
  // removeChannel() tears down asynchronously, so opening the same job's
  // chat twice in quick succession (Messages → Chat → offer card → job →
  // Message) handed the second mount the first mount's already-subscribed
  // channel, `.on('postgres_changes')` threw, and AppErrorBoundary reset the
  // app. See hooks/useOpenJobs.ts for the mitigation: id + per-run counter.
  const instanceId = useId();
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!jobId) {
      setReactions([]);
      return;
    }
    const { data } = await fetchReactionsForJob(jobId);
    setReactions(data);
  }, [jobId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`reactions:job:${jobId}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `job_id=eq.${jobId}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, refresh]);

  // message_id -> that message's reactions (0-2 in a two-party chat).
  const byMessage = useMemo(() => {
    const map: Record<string, Reaction[]> = {};
    for (const r of reactions) {
      (map[r.message_id] ??= []).push(r);
    }
    return map;
  }, [reactions]);

  return { reactions, byMessage, refresh };
}
