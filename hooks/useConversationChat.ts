import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ErrorLike } from '../lib/errorMessage';
import {
  chatTargetFilter,
  chatTargetKey,
  fetchFirstMessageAt,
  fetchMessages,
  fetchMessagesByIds,
  resolveMessageMedia,
  visibleWindow,
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
 *
 * F5 (fix run) — FIFTY AT A TIME. Each thread loads its newest page
 * (MESSAGE_PAGE_SIZE) and `loadOlder()` reaches back a page at a time, so a
 * long conversation makes one read per thread, not one read of everything.
 * Each thread keeps a CURSOR (the oldest instant it has loaded) and whether it
 * may hold more; the timeline is visibleWindow() over them, which never shows
 * a hole. A legacy jobId entry (`anchorJobId`) loads every thread back to
 * that job's first message instead, so the jump has somewhere to land. A
 * reply whose original sits outside the window gets it in one read
 * (`quotedById`).
 */
export function useConversationChat(
  targets: ChatTarget[],
  { anchorJobId = null }: { anchorJobId?: string | null } = {}
) {
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
  const [cursor, setCursor] = useState<Record<string, string | null>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<ErrorLike>(null);
  const [quotedById, setQuotedById] = useState<Record<string, Message>>({});
  const anchorRef = useRef(anchorJobId);
  anchorRef.current = anchorJobId;
  const olderRef = useRef(false);

  const refresh = useCallback(async () => {
    const load = ++loadRef.current;
    const list = targetsRef.current;
    setError(null);

    if (list.length === 0) {
      setByThread({});
      setCursor({});
      setHasMore({});
      setLoading(false);
      return;
    }

    // The legacy jobId entry: every thread back to that job's first message.
    const since = anchorRef.current ? await fetchFirstMessageAt(anchorRef.current) : null;
    if (load !== loadRef.current) return;

    const results = await Promise.all(
      list.map(async (target) => ({
        key: chatTargetKey(target),
        result: await fetchMessages(target, since ? { since } : {}),
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
    setCursor((previous) => {
      const next: Record<string, string | null> = {};
      for (const { key, result } of results) {
        next[key] = result.error ? previous[key] ?? null : since ?? result.data[0]?.created_at ?? null;
      }
      return next;
    });
    setHasMore((previous) => {
      const next: Record<string, boolean> = {};
      for (const { key, result } of results) {
        // A since-load reached its instant, not the thread's start: older
        // messages may still sit before it, whether or not any came after.
        next[key] = result.error ? previous[key] ?? false : since ? true : result.data.length > 0 && result.hasMore;
      }
      return next;
    });
    setError(results.find(({ result }) => result.error)?.result.error ?? null);
    setLoading(false);
  }, []);

  /**
   * F5 — one page further back, for the thread that sets the window's floor
   * (the latest cursor among the threads that may hold more): loading any
   * other thread would fetch messages the window cannot show yet.
   */
  const loadOlder = useCallback(async () => {
    if (olderRef.current) return;
    const load = loadRef.current;
    let floorKey: string | null = null;
    for (const key of Object.keys(byThread)) {
      if (!hasMore[key] || !cursor[key]) continue;
      if (floorKey === null || Date.parse(cursor[key] as string) > Date.parse(cursor[floorKey] as string)) floorKey = key;
    }
    const target = floorKey ? targetsRef.current.find((t) => chatTargetKey(t) === floorKey) : null;
    if (!floorKey || !target) return;
    const key = floorKey;
    olderRef.current = true;
    setLoadingOlder(true);
    const result = await fetchMessages(target, { before: cursor[key] as string });
    olderRef.current = false;
    setLoadingOlder(false);
    if (load !== loadRef.current || result.error) return;
    setByThread((previous) => {
      const existing = previous[key] ?? [];
      const known = new Set(existing.map((m) => m.id));
      return { ...previous, [key]: [...result.data.filter((m) => !known.has(m.id)), ...existing] };
    });
    setCursor((previous) => ({ ...previous, [key]: result.data[0]?.created_at ?? previous[key] ?? null }));
    setHasMore((previous) => ({ ...previous, [key]: result.hasMore }));
  }, [byThread, cursor, hasMore]);

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
  const messages = useMemo(() => visibleWindow(byThread, cursor, hasMore), [byThread, cursor, hasMore]);
  const hasOlder = useMemo(() => Object.values(hasMore).some(Boolean), [hasMore]);

  // F5 — a reply quoting a message outside the window gets its original in
  // one read; ids already asked for are not asked again.
  const askedRef = useRef(new Set<string>());
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    const loaded = new Set(messages.map((m) => m.id));
    const missing = [
      ...new Set(
        messages
          .map((m) => m.reply_to_id)
          .filter((id): id is string => !!id && !loaded.has(id) && !askedRef.current.has(id))
      ),
    ];
    if (missing.length === 0) return;
    for (const id of missing) askedRef.current.add(id);
    // Not cancelled by the next render: each id is asked once, so its answer must land.
    void fetchMessagesByIds(missing).then((found) => {
      if (!aliveRef.current || found.length === 0) return;
      setQuotedById((previous) => {
        const next = { ...previous };
        for (const m of found) next[m.id] = m;
        return next;
      });
    });
  }, [messages]);

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

  return { messages, loading, error, refresh, addLocal, loadOlder, loadingOlder, hasOlder, quotedById };
}
