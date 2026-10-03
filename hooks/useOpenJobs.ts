import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useHiddenUserIds } from './useHiddenUserIds';
import { userMessage } from '../lib/errorMessage';
import { fetchOpenJobs, toOpenJob, type OpenJob } from '../lib/jobs';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { supabase } from '../lib/supabase';

/**
 * F13 — ONE FEED, ONE CHANNEL. The feed is mounted by Worker Home, Worker
 * Results, the Map and Job Detail at once; each mount used to make its own
 * read and open its own whole-table realtime channel. Now the rows are one
 * cached query (lib/queryKeys.ts openJobs) and the channel is opened by the
 * first mount, shared, and closed when the last one leaves. Its writes land in
 * the cache, so every screen sees the same feed.
 */
let feedMounts = 0;
let feedChannel: RealtimeChannel | null = null;

/** Write one realtime change into the cached feed; nothing before the first read lands. */
function updateFeed(change: (previous: OpenJob[]) => OpenJob[]) {
  queryClient.setQueryData<OpenJob[]>(queryKeys.openJobs, (previous) => (previous ? change(previous) : previous));
}

async function readFeed(): Promise<OpenJob[]> {
  const { data, error } = await fetchOpenJobs();
  if (error) throw error;
  return data;
}

/**
 * Live feed of open jobs (newest first). Does an initial fetch, then keeps the
 * list in sync via Supabase realtime so new jobs appear without a refresh.
 * Realtime requires the `jobs` table to be in the supabase_realtime publication;
 * if it isn't, the initial fetch + pull-to-refresh still work.
 */
export function useOpenJobs() {
  // Multiple screens can have this hook mounted at once (e.g. Home's preview
  // list alongside a pushed browse screen — React Navigation doesn't unmount
  // prior screens by default), so each instance needs its own channel name.
  //
  // That alone isn't enough, though: supabase.channel(topic) dedupes against
  // the client's existing channels by topic string, and removeChannel() is
  // async (it awaits channel.unsubscribe() before the old channel is spliced
  // out). If this same instance unmounts and remounts quickly (tab switch,
  // screen freeze/unfreeze), the new effect's .channel(sameTopic) call can
  // land before the old channel finishes tearing down — supabase then hands
  // back the OLD, already-subscribed channel object instead of a fresh one,
  // and .on() on it throws "cannot add postgres_changes callbacks... after
  // subscribe()". A per-instance id doesn't protect against that because
  // it's the same instance both times. Suffixing with a per-effect-run
  // counter guarantees every mount gets a brand-new topic, so the dedupe can
  // never resurrect a still-tearing-down channel.
  const instanceId = useId();
  const runRef = useRef(0);
  const query = useQuery({ queryKey: queryKeys.openJobs, queryFn: readFeed });
  const { refetch } = query;
  // Pull-to-refresh: a forced read, whatever the cache's age.
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const jobs = query.data ?? EMPTY_FEED;
  const loading = query.isPending;
  const error = query.error ? userMessage(query.error) : null;

  // The one channel, counted: the first mount opens it, the last closes it.
  useEffect(() => {
    feedMounts += 1;
    if (feedMounts === 1) {
      feedChannel = supabase
        .channel(`public:jobs:open:${instanceId}:${runRef.current++}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'jobs' },
          (payload) => {
            const job = toOpenJob(payload.new);
            if (job.status !== 'open') return;
            updateFeed((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'jobs' },
          (payload) => {
            const job = toOpenJob(payload.new);
            updateFeed((prev) => {
              const without = prev.filter((j) => j.id !== job.id);
              if (job.status !== 'open') return without;
              return [job, ...without].sort((a, b) =>
                b.created_at.localeCompare(a.created_at)
              );
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'jobs' },
          (payload) => {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) updateFeed((prev) => prev.filter((j) => j.id !== oldId));
          }
        )
        .subscribe();
    }

    return () => {
      feedMounts -= 1;
      if (feedMounts === 0 && feedChannel) {
        supabase.removeChannel(feedChannel);
        feedChannel = null;
      }
    };
  }, [instanceId]);

  // FIX-RUN B3 (Apple 1.2): a blocked person's posts leave the feed — a block
  // either way. Same array identity while nothing is hidden.
  const hidden = useHiddenUserIds();
  const visible = useMemo(
    () => (hidden.size ? jobs.filter((job) => !hidden.has(job.client_id)) : jobs),
    [jobs, hidden]
  );

  return { jobs: visible, loading, error, refresh };
}

/** One empty feed, so a screen waiting on the first read sees a stable array. */
const EMPTY_FEED: OpenJob[] = [];
