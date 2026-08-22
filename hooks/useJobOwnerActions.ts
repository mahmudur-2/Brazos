import { useEffect, useId, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { deleteJob } from '../lib/jobs';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
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
  // A failed count read fails CLOSED (the buttons stay hidden) but not
  // silently: countError lets JobOwnerActions say the eligibility check
  // didn't load and offer a retry (F-026).
  const [countError, setCountError] = useState(false);
  const [countAttempt, setCountAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  // Owned here (not by the confirmation dialog itself) so JobOwnerActions can
  // render a BRAZOS ConfirmDialog around this hook's own delete logic without
  // the dialog component needing to know anything about jobs or RPCs.
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const isOwner = !!user && user.id === posterId;

  // See hooks/useOpenJobs.ts for why the channel topic needs both a
  // per-instance id and a per-effect-run counter.
  const instanceId = useId();
  const runRef = useRef(0);

  useEffect(() => {
    if (!isOwner) {
      setBidCount(null);
      setCountError(false);
      return;
    }

    let active = true;

    // The owner is asking "can I still edit or delete this?", which turns on
    // whether anyone has engaged with the job. job_offer_count() answers that
    // for any viewer without needing RLS to return the rows themselves, and it
    // counts root offers so a countered negotiation still reads as one.
    async function loadCount() {
      const { data, error } = await supabase.rpc('job_offer_count', { p_job_id: jobId });
      if (!active) return;
      if (error) {
        // Fail closed AND say so: bidCount stays null (never guessed to 0),
        // canManage stays false, and countError drives a visible retry.
        setCountError(true);
        return;
      }
      setCountError(false);
      setBidCount(typeof data === 'number' ? data : 0);
    }
    loadCount();

    const channel = supabase
      .channel(`job-owner-actions:${jobId}:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_offers', filter: `job_id=eq.${jobId}` },
        loadCount
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'job_offers', filter: `job_id=eq.${jobId}` },
        loadCount
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isOwner, jobId, instanceId, countAttempt]);

  // null (still loading) reads as "not manageable yet" so the buttons never
  // flash on before we actually know the bid count is zero.
  const canManage = isOwner && status === 'open' && bidCount === 0;
  // The failed check only matters where the buttons could have rendered:
  // the owner's own still-open job.
  const manageCheckFailed = isOwner && status === 'open' && bidCount === null && countError;

  function onEdit() {
    // navigation here is intentionally untyped (this hook is shared across
    // several differently-typed stacks), so the two-argument navigate
    // overload doesn't resolve cleanly — cast rather than fight the types.
    (navigation.navigate as (name: string, params?: object) => void)('PostJob', {
      editJobId: jobId,
    });
  }

  function onDelete() {
    setDeleteDialogVisible(true);
  }

  function cancelDelete() {
    setDeleteDialogVisible(false);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteJob(jobId);
    setDeleting(false);
    setDeleteDialogVisible(false);

    if (error) {
      await alertAsync('Could not delete job', userMessage(error));
      return;
    }

    // Pop this detail screen off whichever stack it was reached from, then
    // switch to the My Jobs tab — works the same regardless of entry point
    // (Home browse, a Map/zone drill-down, or My Jobs itself). Through the
    // guarded helper, not a hand-cast getParent() hop, so the dispatch is
    // checked against the tree the current mode actually mounted.
    // Guarded pop: a job detail landed on cross-tab IS its stack's root, and
    // a bare goBack there dispatches an unhandled GO_BACK before the tab
    // switch. The helper pops when it can; either way MyJobs is next.
    goBackOrHome();
    navigateAcrossTabs('MyJobs');
  }

  return {
    canManage,
    manageCheckFailed,
    retryManageCheck: () => setCountAttempt((attempt) => attempt + 1),
    deleting,
    onEdit,
    onDelete,
    deleteDialogVisible,
    confirmDelete,
    cancelDelete,
  };
}
