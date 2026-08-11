import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { userMessage } from '../lib/errorMessage';
import { fetchHotspots, type HotspotCell } from '../lib/hotspots';
import { supabase } from '../lib/supabase';

const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Loads aggregated hotspot cells and keeps them fresh via Supabase realtime on
 * the `jobs` table. Job posts/assigns/completes all change which jobs are
 * 'open', so any jobs change triggers a recompute — debounced so a burst of
 * changes only recomputes once.
 *
 * Note: this subscribes for the *signal* that jobs changed and then re-calls
 * the aggregation RPC; it never reads coordinates out of the realtime payload.
 */
export function useHotspots() {
  const [cells, setCells] = useState<HotspotCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // See useOpenJobs.ts for why the channel topic needs both a per-instance id
  // and a per-effect-run counter: supabase.channel() dedupes by topic string,
  // and removeChannel() tears down asynchronously, so a fast remount can
  // otherwise hand back a still-subscribing channel and throw on .on().
  const instanceId = useId();
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const { data, error } = await fetchHotspots();
    if (error) setError(userMessage(error));
    else {
      setError(null);
      setCells(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`hotspots:jobs:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [refresh, instanceId]);

  return { cells, loading, error, refresh };
}
