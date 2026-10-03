import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { subscribeOnline } from '../hooks/useOnline';

/**
 * F13 (fix run, 2026-10-03) — THE ONE CACHE. Before this, every mount of the
 * feed, the hub and the bell made its own reads on every focus. Now each is
 * one query, shared by every screen that shows it:
 *
 *   staleTime 30 s   a screen returning within it reads the cache, not the network
 *   gcTime 10 min    a query nobody reads is dropped after this
 *   retry 1          one quiet retry, then the screen's own error state
 *
 * Focus is the APP's foreground (AppState), and online is the one NetInfo
 * subscription the offline banner already reads (hooks/useOnline.ts), so a
 * stale query refetches when the app comes back or the network does.
 *
 * NOTHING IS PERSISTED this run: the hub carries names and payment state, and
 * plain device storage is not where that belongs (the persist packages stay
 * installed and unimported). App.tsx empties the cache when the account
 * changes (lib/queryKeys.ts cacheBelongsToSomeoneElse).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => subscription.remove();
});

onlineManager.setEventListener((setOnline) => subscribeOnline(setOnline));
