import { useEffect, useId, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * FIX-RUN B14 — tells a job screen when its one job changed elsewhere.
 *
 * A realtime UPDATE on this job (jobs is in supabase_realtime; RLS delivers it
 * only to the owner and the hired worker) or the app returning to the
 * foreground calls `onChange`; a DELETE of this job calls `onDelete`. DELETE
 * events cannot be filtered server-side, so that one is matched on the old
 * row's id here.
 *
 * The topic is unique per mount AND per effect run — the useOpenJobs rule
 * (tests/hardening.test.mjs): a remount must never be handed a still-tearing-
 * down channel of the same topic.
 */
export function useJobLive(jobId: string, onChange: () => void, onDelete: () => void): void {
  const instanceId = useId();
  const runRef = useRef(0);
  const handlers = useRef({ onChange, onDelete });
  handlers.current = { onChange, onDelete };

  useEffect(() => {
    const channel = supabase
      .channel(`public:jobs:detail:${jobId}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        () => handlers.current.onChange()
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'jobs' }, (payload) => {
        if ((payload.old as { id?: string } | null)?.id === jobId) handlers.current.onDelete();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, instanceId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') handlers.current.onChange();
    });
    return () => subscription.remove();
  }, []);
}
