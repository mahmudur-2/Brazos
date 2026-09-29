import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './useAuth';
import { fetchRehirableWorkerIds } from '../lib/jobs';
import { fetchProfilesByIds } from '../lib/profiles';
import { rebookStripItems, type RebookStripItem } from '../lib/rebook';
import { fetchSavedWorkers } from '../lib/savedWorkers';

/**
 * §4.4 — THE PEOPLE A CUSTOMER CAN HIRE AGAIN: Saved first (marked), then the
 * workers who have worked for them before, deduped, tombstones excluded
 * (lib/rebook.ts). Read on focus, since a hire or an unsave elsewhere changes
 * who belongs. 2026-09-28 (LUX-LIST-64 #62): lifted out of Discover so the
 * customer Home's "Hire again" row reads the SAME list (P3-31). A failed read
 * yields no one — the row and the strip are shortcuts, never a screen's
 * content, so they stay away rather than blocking anything behind a retry.
 */
export function useRebookWorkers(logTag: string): RebookStripItem[] {
  const { user } = useAuth();
  const [items, setItems] = useState<RebookStripItem[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    const [savedRes, pastIdsRes] = await Promise.all([
      fetchSavedWorkers(user.id),
      fetchRehirableWorkerIds(user.id),
    ]);
    if (savedRes.error || pastIdsRes.error) {
      console.warn(`[${logTag}] rebook read failed`, (savedRes.error ?? pastIdsRes.error)?.message);
      return;
    }
    const savedProfiles = savedRes.data.map((r) => r.profiles);
    const savedIdSet = new Set(savedProfiles.map((p) => p.id));
    const pastIds = [...pastIdsRes.data].filter((id) => !savedIdSet.has(id));
    let pastProfiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
    if (pastIds.length > 0) {
      const { data, error } = await fetchProfilesByIds(pastIds);
      if (error) {
        console.warn(`[${logTag}] rebook profiles failed`, error.message);
        return;
      }
      pastProfiles = data;
    }
    setItems(rebookStripItems(savedProfiles, pastProfiles));
  }, [user, logTag]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return items;
}
