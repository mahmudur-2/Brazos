import { useCallback, useEffect, useState } from 'react';
import {
  fetchConversations,
  fetchMyReadStates,
  resolveOtherId,
  type Conversation,
} from '../lib/conversations';
import { fetchProfilesByIds, type Profile } from '../lib/profiles';
import { fetchReactionsForMessages, type Reaction } from '../lib/reactions';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

type CounterpartyInfo = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;

/**
 * Loads the signed-in user's conversation inbox: one row per job with a
 * message, the other party's profile, whether it has unread activity, and
 * any reactions on each conversation's latest message. Stays live via
 * realtime so a new message or reaction anywhere bumps the list without a
 * manual refresh.
 */
export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, CounterpartyInfo>>({});
  const [lastMessageReactions, setLastMessageReactions] = useState<
    Record<string, Reaction[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setError(null);

    const [convRes, readRes] = await Promise.all([
      fetchConversations(user.id),
      fetchMyReadStates(user.id),
    ]);

    const firstError = convRes.error || readRes.error;
    if (firstError) setError(firstError.message);

    const reads: Record<string, string> = {};
    for (const r of readRes.data) reads[r.job_id] = r.last_read_at;
    setReadMap(reads);
    setConversations(convRes.data);

    const otherIds = convRes.data.map((c) => resolveOtherId(c, user.id));
    const [{ data: people }, { data: reactionRows }] = await Promise.all([
      fetchProfilesByIds(otherIds),
      fetchReactionsForMessages(convRes.data.map((c) => c.last_message_id)),
    ]);

    const map: Record<string, CounterpartyInfo> = {};
    for (const p of people) map[p.id] = p;
    setProfiles(map);

    const reactionMap: Record<string, Reaction[]> = {};
    for (const r of reactionRows) {
      (reactionMap[r.message_id] ??= []).push(r);
    }
    setLastMessageReactions(reactionMap);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    // RLS scopes delivery to messages/reactions the user can read, so this
    // only ever fires for the user's own jobs even without a per-job filter.
    const channel = supabase
      .channel('messages:inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return {
    conversations,
    readMap,
    profiles,
    lastMessageReactions,
    loading,
    error,
    refresh,
  };
}
