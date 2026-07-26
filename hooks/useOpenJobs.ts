import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchOpenJobs, toOpenJob, type OpenJob } from '../lib/jobs';
import { supabase } from '../lib/supabase';

/**
 * Live feed of open jobs (newest first). Does an initial fetch, then keeps the
 * list in sync via Supabase realtime so new jobs appear without a refresh.
 * Realtime requires the `jobs` table to be in the supabase_realtime publication;
 * if it isn't, the initial fetch + pull-to-refresh still work.
 */
export function useOpenJobs() {
  // Multiple screens can have this hook mounted at once (e.g. Home's preview
  // list alongside a pushed browse screen — React Navigation doesn't unmount
  // prior screens by default), so each instance needs its own channel name.
  //
  // That alone isn't enough, though: supabase.channel(topic) dedupes against
  // the client's existing channels by topic string, and removeChannel() is
  // async (it awaits channel.unsubscribe() before the old channel is spliced
  // out). If this same instance unmounts and remounts quickly (tab switch,
  // screen freeze/unfreeze), the new effect's .channel(sameTopic) call can
  // land before the old channel finishes tearing down — supabase then hands
  // back the OLD, already-subscribed channel object instead of a fresh one,
  // and .on() on it throws "cannot add postgres_changes callbacks... after
  // subscribe()". A per-instance id doesn't protect against that because
  // it's the same instance both times. Suffixing with a per-effect-run
  // counter guarantees every mount gets a brand-new topic, so the dedupe can
  // never resurrect a still-tearing-down channel.
  const instanceId = useId();
  const runRef = useRef(0);
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchOpenJobs();
    if (error) setError(error.message);
    else setJobs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`public:jobs:open:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload) => {
          const job = toOpenJob(payload.new);
          if (job.status !== 'open') return;
          setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const job = toOpenJob(payload.new);
          setJobs((prev) => {
            const without = prev.filter((j) => j.id !== job.id);
            if (job.status !== 'open') return without;
            return [job, ...without].sort((a, b) =>
              b.created_at.localeCompare(a.created_at)
            );
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'jobs' },
        (payload) => {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) setJobs((prev) => prev.filter((j) => j.id !== oldId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId]);

  return { jobs, loading, error, refresh };
}
