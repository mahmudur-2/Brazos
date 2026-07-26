import { useEffect, useId, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { deleteJob } from '../lib/jobs';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { useAuth } from './useAuth';

/**
 * Whether the current user may edit/delete a given job, plus the actions to
 * do it — the single shared source of truth for the "is this my job, does it
 * have zero bids, and is it still open" rule, used by every job-detail
 * screen (the worker-facing JobDetailScreen reached from Browse/Map/a
 * hotspot zone, the poster's ClientJobDetailScreen, and any future entry
 * point) instead of being reimplemented per screen.
 *
 * `status` must be checked directly rather than inferred from bid count:
 * a Hire Again job starts life already `assigned` with zero bids (bidding is
 * skipped entirely for a direct hire), so "zero bids" alone would wrongly
 * treat it as editable/deletable.
 *
 * Deliberately keeps its own live bid count rather than trusting whatever
 * `job` shape the calling screen already has — OpenJob (what JobDetailScreen
 * gets) doesn't carry a bid count at all, and a screen-supplied count could
 * be stale relative to what's actually in the database. A lightweight
 * COUNT-only query plus a realtime subscription means Edit/Delete disappear
 * the instant a bid lands, no matter which screen is open when it happens.
 */
export function useJobOwnerActions(jobId: string, posterId: string, status: string) {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [bidCount, setBidCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!user && user.id === posterId;

  // See hooks/useOpenJobs.ts for why the channel topic needs both a
  // per-instance id and a per-effect-run counter.
  const instanceId = useId();
  const runRef = useRef(0);

  useEffect(() => {
    if (!isOwner) {
      setBidCount(null);
      return;
    }

    let active = true;

    async function loadCount() {
      const { count, error } = await supabase
        .from('bids')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId);
      if (active && !error) setBidCount(count ?? 0);
    }
    loadCount();

    const channel = supabase
      .channel(`job-owner-actions:${jobId}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `job_id=eq.${jobId}` },
        loadCount
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bids', filter: `job_id=eq.${jobId}` },
        loadCount
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isOwner, jobId, instanceId]);

  // null (still loading) reads as "not manageable yet" so the buttons never
  // flash on before we actually know the bid count is zero.
  const canManage = isOwner && status === 'open' && bidCount === 0;

  function onEdit() {
    // navigation here is intentionally untyped (this hook is shared across
    // several differently-typed stacks), so the two-argument navigate
    // overload doesn't resolve cleanly — cast rather than fight the types.
    (navigation.navigate as (name: string, params?: object) => void)('PostJob', {
      editJobId: jobId,
    });
  }

  async function onDelete() {
    const ok = await confirmAsync({
      title: 'Delete this job?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setDeleting(true);
    const { error } = await deleteJob(jobId);
    setDeleting(false);

    if (error) {
      await alertAsync('Could not delete job', error.message);
      return;
    }

    // Pop this detail screen off whichever stack it was reached from, then
    // switch to the My Jobs tab — works the same regardless of entry point
    // (Home browse, a Map/zone drill-down, or My Jobs itself).
    navigation.goBack();
    navigation.getParent()?.navigate('MyJobs' as never);
  }

  return { canManage, deleting, onEdit, onDelete };
}
