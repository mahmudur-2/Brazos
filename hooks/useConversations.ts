import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  fetchConversations,
  fetchMyReadStates,
  resolveOtherId,
  type Conversation,
} from '../lib/conversations';
import {
  fetchMyConversationStates,
  indexConversationStates,
  type ConversationState,
} from '../lib/conversationStates';
import { fetchMyModerationLists } from '../lib/moderation';
import { fetchProfilesByIds, type Profile } from '../lib/profiles';
import { fetchReactionsForMessages, type Reaction } from '../lib/reactions';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

type CounterpartyInfo = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;

type ModerationLists = {
  blocking: Set<string>;
  blockedBy: Set<string>;
  muted: Set<string>;
};

/**
 * The trailing window a burst of realtime inserts collapses into. Shorter than
 * useHotspots' 1500ms because this list is the screen the user is looking at
 * while the messages arrive, not a background aggregation.
 */
const REFRESH_DEBOUNCE_MS = 250;

const EMPTY_MODERATION: ModerationLists = {
  blocking: new Set(),
  blockedBy: new Set(),
  muted: new Set(),
};

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
  // Per-user hidden / archived / cleared / deleted state, keyed by the SAME
  // `job:`/`direct:` conversation key readMap's rows are keyed by. The phase77
  // view deliberately does not filter these — hidden and archived rows must
  // still be DELIVERED, to the Face-ID list and the Archived pill — so the
  // client joins them exactly the way it already joins message_reads.
  const [stateByKey, setStateByKey] = useState<Record<string, ConversationState>>({});
  const [profiles, setProfiles] = useState<Record<string, CounterpartyInfo>>({});
  const [lastMessageReactions, setLastMessageReactions] = useState<
    Record<string, Reaction[]>
  >({});
  const [moderation, setModeration] = useState<ModerationLists>(EMPTY_MODERATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // See useOpenJobs.ts for why the channel topic needs both a per-instance id
  // and a per-effect-run counter: supabase.channel() dedupes by topic string,
  // and removeChannel() tears down asynchronously, so a fast remount can
  // otherwise hand back a still-subscribing channel and throw on .on().
  //
  // This hook needed it MORE than the five that already had it, and had it
  // least: it backs a tab screen, where remount is the ordinary gesture
  // rather than an edge case, and its topic was the fixed string
  // 'messages:inbox' — the same string for every instance and every mount.
  const instanceId = useId();
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setError(null);

    const [convRes, readRes, stateRes] = await Promise.all([
      fetchConversations(user.id),
      fetchMyReadStates(user.id),
      fetchMyConversationStates(user.id),
    ]);

    const firstError = convRes.error || readRes.error || stateRes.error;
    if (firstError) setError(firstError.message);

    const reads: Record<string, string> = {};
    for (const r of readRes.data) reads[r.job_id] = r.last_read_at;
    setReadMap(reads);
    // A FAILED state read is an empty index, which is exactly "no conversation
    // has any state" — the behaviour of every build before phase77. It cannot
    // hide a row, cannot clear a thread, and cannot silently archive anything.
    setStateByKey(indexConversationStates(stateRes.data));
    setConversations(convRes.data);

    const otherIds = convRes.data.map((c) => resolveOtherId(c, user.id));
    const [{ data: people }, { data: reactionRows }, moderationLists] =
      await Promise.all([
        fetchProfilesByIds(otherIds),
        fetchReactionsForMessages(convRes.data.map((c) => c.last_message_id)),
        fetchMyModerationLists(user.id),
      ]);

    setModeration(moderationLists);

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

    // A BURST OF MESSAGES IS ONE INBOX READ. Every INSERT on `messages`
    // app-wide used to call refresh() directly, and refresh() re-queries the
    // WHOLE inbox — conversations, read states, counterparty profiles and
    // last-message reactions. Ten messages arriving together were ten of
    // those. The trailing debounce collapses the burst into a single read,
    // and the inbox is a summary surface, so arriving a fraction of a second
    // later costs nothing a user can perceive.
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };

    // RLS scopes delivery to messages/reactions the user can read, so this
    // only ever fires for the user's own jobs even without a per-job filter.
    const channel = supabase
      .channel(`messages:inbox:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      // The timer first: a refresh that fires after teardown would set state
      // on an unmounted hook and re-query for a screen that is gone.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, refresh, instanceId]);

  return {
    conversations,
    readMap,
    stateByKey,
    profiles,
    lastMessageReactions,
    moderation,
    loading,
    error,
    refresh,
  };
}
