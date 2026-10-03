import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * F13 — A FOCUS THAT HONOURS THE CACHE. Each screen that shows cached rows used
 * to re-read them on every focus. Now a focus asks the cache: `refreshIfStale`
 * fetches only when the rows are older than their freshness window (React
 * Query's prefetchQuery rule), so coming back within it makes no read at all.
 * The first focus is the mount, which the query already covers.
 */
export function useRefreshOnFocus(refreshIfStale: () => void): void {
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      refreshIfStale();
    }, [refreshIfStale])
  );
}
