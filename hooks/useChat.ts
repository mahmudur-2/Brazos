import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchMessages, resolveMessageMedia, type Message } from '../lib/messages';
import { supabase } from '../lib/supabase';

/**
 * Loads a job's chat thread and keeps it live via Supabase realtime, so new
 * messages from either party appear instantly without a refresh. Realtime
 * requires the `messages` table to be in the supabase_realtime publication
 * (see phase8 SQL); without it, the initial fetch still works.
 */
export function useChat(jobId: string) {
  const instanceId = useId();
  const runRef = useRef(0);
  const loadRef = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const load = ++loadRef.current;
    setError(null);
    const { data, error } = await fetchMessages(jobId);
    if (load !== loadRef.current) return;
    if (error) setError(error.message);
    else setMessages(data);
    setLoading(false);
  }, [jobId]);

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
      .channel(`messages:job:${jobId}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `job_id=eq.${jobId}`,
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
          filter: `job_id=eq.${jobId}`,
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
  }, [instanceId, jobId]);

  /** Append a just-sent message locally so the sender sees it immediately. */
  const addLocal = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message]
    );
  }, []);

  return { messages, loading, error, refresh, addLocal };
}
