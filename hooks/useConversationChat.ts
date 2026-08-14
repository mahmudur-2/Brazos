import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ErrorLike } from '../lib/errorMessage';
import {
  chatTargetFilter,
  chatTargetKey,
  fetchMessages,
  resolveMessageMedia,
  type ChatTarget,
  type Message,
} from '../lib/messages';
import { supabase } from '../lib/supabase';

/**
 * One conversation, however many threads it is made of.
 *
 * A customer and a worker have exactly ONE conversation; the job threads and
 * the pair thread underneath it are plumbing. This loads every one of them and
 * hands back a single chronological timeline, live.
 *
 * WHY THE STORE IS KEYED BY THREAD AND NEVER ASSIGNED WHOLESALE — this is the
 * failure fixed in 16511c9, one subject over. There, two overlapping reads
 * with different id sets were each written with `setOffers(data)`, so whichever
 * answered last won outright and an older, smaller answer erased a
 * just-arrived row. The same shape is available here the moment more than one
 * thread is in play: N reads and N realtime channels writing one array. So
 * every write lands in ITS OWN thread slice (`{ ...prev, [key]: … }`), the
 * initial load fetches all threads together under one sequence counter, and a
 * thread whose read FAILED keeps the messages it already had rather than
 * blanking. No path can overwrite another thread's messages.
 *
 * Realtime is one filtered channel per thread because `messages` has no single
 * column expressing "either of these two threads" — the filter is `job_id=eq.`
 * or `direct_thread_id=eq.` and nothing else (lib/messages.ts). Multiple
 * channels are therefore unavoidable; the merged store is what makes them
 * safe.
 */
export function useConversationChat(targets: ChatTarget[]) {
  // Effects compare by identity and `targets` is rebuilt on every render, so
  // the subscription and the load key on the stable STRING instead — the
  // useThreadOffers idKey pattern.
  const targetKey = useMemo(() => targets.map(chatTargetKey).join('|'), [targets]);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  // See hooks/useOpenJobs.ts for why the channel topic needs both a
  // per-instance id and a per-effect-run counter.
  const instanceId = useId();
  const runRef = useRef(0);
  const loadRef = useRef(0);

  const [byThread, setByThread] = useState<Record<string, Message[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorLike>(null);

  const refresh = useCallback(async () => {
    const load = ++loadRef.current;
    const list = targetsRef.current;
    setError(null);

    if (list.length === 0) {
      setByThread({});
      setLoading(false);
      return;
    }

    const results = await Promise.all(
      list.map(async (target) => ({
        key: chatTargetKey(target),
        result: await fetchMessages(target),
      }))
    );
    if (load !== loadRef.current) return;

    setByThread((previous) => {
      const next: Record<string, Message[]> = {};
      for (const { key, result } of results) {
        // A FAILED read is not "no messages" — keep what is already on screen,
        // the rule mergeThreadOffers() follows for the negotiation cards.
        next[key] = result.error ? previous[key] ?? [] : result.data;
      }
      return next;
    });
    setError(results.find(({ result }) => result.error)?.result.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
    return () => {
      loadRef.current++;
    };
    // targetKey, not targets: a re-render with the same threads must not
    // restart the load. `refresh` reads the current targets through the ref.
  }, [targetKey, refresh]);

  useEffect(() => {
    const list = targetsRef.current;
    if (list.length === 0) return;
    let active = true;

    const channels = list.map((target) => {
      const key = chatTargetKey(target);
      const filter = chatTargetFilter(target);
      return supabase
        .channel(`conversation:${key}:${instanceId}:${runRef.current++}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter },
          async (payload) => {
            const message = await resolveMessageMedia(payload.new as Message);
            if (!active) return;
            setByThread((previous) => {
              const existing = previous[key] ?? [];
              if (existing.some((m) => m.id === message.id)) return previous;
              return { ...previous, [key]: [...existing, message] };
            });
          }
        )
        // Unsend (phase25) is an UPDATE, not a delete — this is what makes it
        // show as "This message was unsent" on the OTHER party's screen live.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter },
          async (payload) => {
            const message = await resolveMessageMedia(payload.new as Message);
            if (!active) return;
            setByThread((previous) => {
              const existing = previous[key];
              if (!existing) return previous;
              return {
                ...previous,
                [key]: existing.map((m) => (m.id === message.id ? message : m)),
              };
            });
          }
        )
        .subscribe();
    });

    return () => {
      active = false;
      for (const channel of channels) supabase.removeChannel(channel);
    };
  }, [instanceId, targetKey]);

  /**
   * The one timeline. Chronology always wins — messages are never regrouped or
   * reordered by job — with the id breaking an exact timestamp tie so the
   * order is stable across renders and devices.
   */
  const messages = useMemo(() => {
    const merged: Message[] = [];
    for (const slice of Object.values(byThread)) merged.push(...slice);
    return merged.sort((a, b) => {
      const difference = Date.parse(a.created_at) - Date.parse(b.created_at);
      if (difference) return difference;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [byThread]);

  /** Append a just-sent message locally so the sender sees it immediately. */
  const addLocal = useCallback((message: Message) => {
    const key = chatTargetKey(
      message.job_id
        ? { jobId: message.job_id }
        : { directThreadId: message.direct_thread_id as string }
    );
    setByThread((previous) => {
      const existing = previous[key] ?? [];
      if (existing.some((m) => m.id === message.id)) return previous;
      return { ...previous, [key]: [...existing, message] };
    });
  }, []);

  return { messages, loading, error, refresh, addLocal };
}
