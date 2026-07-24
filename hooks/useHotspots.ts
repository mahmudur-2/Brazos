import { useCallback, useEffect, useRef, useState } from 'react';
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

  const refresh = useCallback(async () => {
    const { data, error } = await fetchHotspots();
    if (error) setError(error.message);
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
      .channel('hotspots:jobs')
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
  }, [refresh]);

  return { cells, loading, error, refresh };
}
