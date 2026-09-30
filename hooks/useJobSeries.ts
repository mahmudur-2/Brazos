import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchJobSeries, type JobSeries } from '../lib/jobSeries';

/**
 * 2026-09-30 (idea 14) — the series a visit belongs to, re-read on every focus (a stop, a drop or the
 * schedule may have moved it while another screen was up). Null when the job is not a visit of a
 * series, or the reader is neither its customer nor its worker (RLS answers with no row).
 */
export function useJobSeries(seriesId: string | null | undefined) {
  const [series, setSeries] = useState<JobSeries | null>(null);
  const [readFor, setReadFor] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!seriesId) {
        setSeries(null);
        setReadFor(null);
        return;
      }
      fetchJobSeries(seriesId).then(({ data, error }) => {
        if (!active || error) return;
        setSeries(data);
        setReadFor(seriesId);
      });
      return () => {
        active = false;
      };
    }, [seriesId])
  );

  // Never another job's series: a row read for a different id is not this visit's.
  return { series: series && readFor === seriesId ? series : null, setSeries };
}
