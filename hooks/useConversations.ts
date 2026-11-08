import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  conversationKey,
  fetchConversations,
  fetchMyReadStates,
  fetchUnseenStamps,
  resolveOtherId,
  threadUnread,
  type Conversation,
} from '../lib/conversations';
import { countUnseen, FULLY_UNREAD_AT, type UnseenThread } from '../lib/conversationVisibility';
import {
  fetchMyConversationStates,
  indexConversationStates,
  type ConversationState,
} from '../lib/conversationStates';
import { fetchMyModerationLists } from '../lib/moderation';
import { fetchProfilesByIds, type Profile } from '../lib/profiles';
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
 * message, the other party's profile, and whether it has unread activity.
 * Stays live via realtime so a new message anywhere bumps the list without a
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
  const [moderation, setModeration] = useState<ModerationLists>(EMPTY_MODERATION);
  // 2026-09-28 (LUX-LIST-64 #54) — the number beside the name: each unread
  // thread's unseen messages, COUNTED from the rows (countUnseen), keyed like
  // readMap and stateByKey. A thread with no entry shows the mark alone.
  const [unseenByKey, setUnseenByKey] = useState<Record<string, number>>({});
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
    const states = indexConversationStates(stateRes.data);
    setStateByKey(states);
    setConversations(convRes.data);

    // The threads with something unseen, and where each one's count starts. A
    // job thread marked unread by hand has no count (its mark is the fact), so
    // it is not asked about; the read starts at the earliest position left.
    const unseenThreads: UnseenThread[] = convRes.data
      .filter((c) => threadUnread(c, user.id, reads))
      .map((c) => ({
        key: conversationKey(c),
        readAt: (c.job_id ? reads[c.job_id] : c.my_read_at) ?? null,
        state: states[conversationKey(c)],
      }))
      .filter((thread) => thread.readAt !== FULLY_UNREAD_AT);
    // Compared as instants: the database's ISO form and JavaScript's differ.
    const since = new Date(
      unseenThreads.reduce(
        (earliest, thread) => Math.min(earliest, thread.readAt ? Date.parse(thread.readAt) : 0),
        Date.now()
      )
    ).toISOString();
    const unseenJobIds = convRes.data
      .filter((c) => c.job_id && unseenThreads.some((thread) => thread.key === conversationKey(c)))
      .map((c) => c.job_id as string);
    const unseenDirectIds = convRes.data
      .filter((c) => c.direct_thread_id && unseenThreads.some((thread) => thread.key === conversationKey(c)))
      .map((c) => c.direct_thread_id as string);

    const otherIds = convRes.data.map((c) => resolveOtherId(c, user.id));
    const [{ data: people }, moderationLists, unseenRes] =
      await Promise.all([
        fetchProfilesByIds(otherIds),
        fetchMyModerationLists(user.id),
        unseenThreads.length > 0
          ? fetchUnseenStamps(user.id, { jobIds: unseenJobIds, directIds: unseenDirectIds }, since)
          : Promise.resolve({ data: [], error: null }),
      ]);

    // A FAILED count read is no count at all — every unread row keeps its mark
    // and shows no number, rather than a number that is not true.
    setUnseenByKey(unseenRes.error ? {} : countUnseen(unseenRes.data, unseenThreads));

    setModeration(moderationLists);

    const map: Record<string, CounterpartyInfo> = {};
    for (const p of people) map[p.id] = p;
    setProfiles(map);

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
    // WHOLE inbox — conversations, read states and counterparty profiles.
    // Ten messages arriving together were ten of
    // those. The trailing debounce collapses the burst into a single read,
    // and the inbox is a summary surface, so arriving a fraction of a second
    // later costs nothing a user can perceive.
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };

    // RLS scopes delivery to messages the user can read, so this only ever
    // fires for the user's own jobs even without a per-job filter.
    const channel = supabase
      .channel(`messages:inbox:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
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
    moderation,
    unseenByKey,
    loading,
    error,
    refresh,
  };
}
