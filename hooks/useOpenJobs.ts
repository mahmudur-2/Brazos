import { useCallback, useEffect, useState } from 'react';
import { fetchOpenJobs, toOpenJob, type OpenJob } from '../lib/jobs';
import { supabase } from '../lib/supabase';

/**
 * Live feed of open jobs (newest first). Does an initial fetch, then keeps the
 * list in sync via Supabase realtime so new jobs appear without a refresh.
 * Realtime requires the `jobs` table to be in the supabase_realtime publication;
 * if it isn't, the initial fetch + pull-to-refresh still work.
 */
export function useOpenJobs() {
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
      .channel('public:jobs:open')
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
  }, []);

  return { jobs, loading, error, refresh };
}
