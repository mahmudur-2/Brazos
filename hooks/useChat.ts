import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
 * Loads a conversation and keeps it live via Supabase realtime, so new
 * messages from either party appear instantly without a refresh. Realtime
 * requires the `messages` table to be in the supabase_realtime publication
 * (see phase8 SQL); without it, the initial fetch still works.
 *
 * Works for both kinds of thread — a job's conversation and a direct thread
 * between two people (phase36) — since the only difference is which column
 * selects the rows.
 */
export function useChat(jobId: string | null, directThreadId: string | null) {
  // Rebuilt from the two primitive ids rather than taken as an object, so a
  // caller re-rendering doesn't restart the subscription on every render.
  const target = useMemo<ChatTarget>(
    () => (jobId ? { jobId } : { directThreadId: directThreadId as string }),
    [jobId, directThreadId]
  );
  const targetKey = chatTargetKey(target);
  const targetFilter = chatTargetFilter(target);
  const instanceId = useId();
  const runRef = useRef(0);
  const loadRef = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const load = ++loadRef.current;
    setError(null);
    const { data, error } = await fetchMessages(target);
    if (load !== loadRef.current) return;
    if (error) setError(error.message);
    else setMessages(data);
    setLoading(false);
  }, [target]);

  useEffect(() => {
    setLoading(true);
    refresh();
    return () => {
      loadRef.current++;
    };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(`messages:${targetKey}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: targetFilter,
        },
        async (payload) => {
          const message = await resolveMessageMedia(payload.new as Message);
          if (!active) return;
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message]
          );
        }
      )
      // Unsend (phase25) is an UPDATE, not a delete — this is what makes it
      // show as "This message was unsent" on the OTHER party's screen live,
      // rather than only on a manual refresh.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: targetFilter,
        },
        async (payload) => {
          const message = await resolveMessageMedia(payload.new as Message);
          if (!active) return;
          setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [instanceId, targetKey, targetFilter]);

  /** Append a just-sent message locally so the sender sees it immediately. */
  const addLocal = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message]
    );
  }, []);

  return { messages, loading, error, refresh, addLocal };
}
