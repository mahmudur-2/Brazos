import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchJobById, fetchOpenJobById, type Job, type OpenJob } from '../lib/jobs';

/**
 * The canonical read for a job that was reached through a navigation param.
 *
 * A route param is a snapshot of whichever list produced it, so it is both
 * stale (the poster may have edited the job since that list loaded) and, for
 * the map drill-down, historically incomplete. Every list still passes its
 * snapshot so the screen paints instantly with no spinner; this then re-reads
 * the job through the one column allowlist every other surface uses, and again
 * on every focus — which is what makes an edit made in PostJob show up the
 * moment the poster navigates back.
 *
 * `missing` is only true once a read has actually come back empty: the job was
 * deleted (or is no longer readable), so the caller should say so rather than
 * keep offering actions against a row that is gone.
 */
export function useOpenJobDetail(snapshot: OpenJob) {
  const [job, setJob] = useState<OpenJob>(snapshot);
  const [missing, setMissing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchOpenJobById(snapshot.id).then(({ data, error }) => {
        if (!active || error) return;
        if (data) setJob(data);
        else setMissing(true);
      });
      return () => {
        active = false;
      };
    }, [snapshot.id])
  );

  return { job, missing };
}

/**
 * Same contract as useOpenJobDetail, for the poster's own view of a job —
 * the wider `Job` shape (assignment, final amount, completion evidence, bid
 * count) rather than the public browse projection.
 *
 * Distinct from useJob(jobId), which is for screens navigated to by id alone
 * (WorkerJob) and therefore has a real `loading`/null phase. Here the caller
 * already holds a usable row, so there is never a spinner — only a silent
 * correction once the canonical read lands.
 */
export function useOwnedJobDetail(snapshot: Job) {
  const [job, setJob] = useState<Job>(snapshot);
  const [missing, setMissing] = useState(false);
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const runId = ++runRef.current;
    const result = await fetchJobById(snapshot.id);
    if (runId !== runRef.current) return result;

    if (!result.error) {
      if (result.data) {
        setJob(result.data);
        setMissing(false);
      } else {
        setMissing(true);
      }
    }
    return result;
  }, [snapshot.id]);

  // React Navigation may reuse this route with a new job param. Paint that
  // new snapshot immediately and clear a previous missing result while the
  // focus read below replaces it with the canonical row.
  useEffect(() => {
    runRef.current += 1;
    setJob(snapshot);
    setMissing(false);
    return () => {
      runRef.current += 1;
    };
  }, [snapshot]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        runRef.current += 1;
      };
    }, [refresh])
  );

  const isCurrentRoute = job.id === snapshot.id;
  return {
    job: isCurrentRoute ? job : snapshot,
    missing: isCurrentRoute ? missing : false,
    refresh,
  };
}
