import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchReactionsForJob, type Reaction } from '../lib/reactions';
import { supabase } from '../lib/supabase';

/**
 * Loads every reaction on a job's messages and keeps them live via realtime.
 * Reactions per job are a small dataset (at most one per person per message),
 * so on any realtime change we just refetch the whole set rather than
 * patching individual rows — simpler and cheap at this scale.
 */
export function useReactions(jobId: string) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const refresh = useCallback(async () => {
    const { data } = await fetchReactionsForJob(jobId);
    setReactions(data);
  }, [jobId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`reactions:job:${jobId}`)
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
