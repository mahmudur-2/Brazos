import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, type Message } from '../lib/messages';
import { supabase } from '../lib/supabase';

/**
 * Loads a job's chat thread and keeps it live via Supabase realtime, so new
 * messages from either party appear instantly without a refresh. Realtime
 * requires the `messages` table to be in the supabase_realtime publication
 * (see phase8 SQL); without it, the initial fetch still works.
 */
export function useChat(jobId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchMessages(jobId);
    if (error) setError(error.message);
    else setMessages(data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const message = payload.new as Message;
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
        (payload) => {
          const message = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  /** Append a just-sent message locally so the sender sees it immediately. */
  const addLocal = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message]
    );
  }, []);

  return { messages, loading, error, refresh, addLocal };
}
