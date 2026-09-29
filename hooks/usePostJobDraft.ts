import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './useAuth';
import { draftHasContent, loadPostJobDraft, type PostJobDraft } from '../lib/postJobDraft';

/**
 * 2026-09-28 (LUX-LIST-64 #17) — THIS ACCOUNT'S UNPUBLISHED DRAFT, read on focus.
 *
 * The one reader both surfaces use — My Jobs' Draft section and the customer
 * Home's NEEDS YOUR ATTENTION — so the two cannot disagree about whether a
 * draft exists (P3-31). The slot is per account (AUD-P1-07): no signed-in user,
 * no draft — never another account's leftovers; an empty autosave is not a draft.
 */
export function usePostJobDraft(): { draft: PostJobDraft | null; setDraft: (draft: PostJobDraft | null) => void } {
  const { user } = useAuth();
  const [draft, setDraft] = useState<PostJobDraft | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const userId = user?.id;
      if (userId) {
        loadPostJobDraft(userId).then((loaded) => {
          if (active) setDraft(loaded && draftHasContent(loaded) ? loaded : null);
        });
      } else {
        setDraft(null);
      }
      return () => {
        active = false;
      };
    }, [user?.id])
  );
  return { draft, setDraft };
}
