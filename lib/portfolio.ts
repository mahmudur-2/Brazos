import { supabase } from './supabase';
import type { JobCategory } from './jobs';

/** Hard cap on featured photos. Mirrored by a DB trigger (phase17) so the
 *  limit holds even outside this client. */
export const MAX_PORTFOLIO_ITEMS = 20;
export const MAX_CAPTION_LENGTH = 140;

export type PortfolioItem = {
  id: string;
  worker_id: string;
  source_job_id: string | null;
  photo_url: string;
  category: JobCategory;
  caption: string | null;
  display_order: number;
  created_at: string;
};

/** One completed job's worth of photos the worker can choose to feature. */
export type PortfolioCandidate = {
  jobId: string;
  jobTitle: string;
  category: JobCategory;
  completedAt: string;
  photoUrl: string;
};

export type CategoryStat = { category: JobCategory; count: number };

/**
 * A worker's featured gallery. Readable for ANY worker id — portfolio_items
 * has a permissive SELECT policy precisely so a visitor can see it (phase17).
 */
export async function fetchPortfolio(workerId: string) {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select('*')
    .eq('worker_id', workerId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  return { data: (data ?? []) as PortfolioItem[], error };
}

/**
 * Completed-jobs-by-category for the "12 Handyman, 6 Dog walking" line.
 *
 * Goes through the worker_job_stats() RPC rather than querying `jobs`: a
 * visitor can't read another user's completed job rows under RLS, so a direct
 * count would silently return zero for exactly the case this is for.
 */
export async function fetchWorkerJobStats(workerId: string) {
  const { data, error } = await supabase.rpc('worker_job_stats', {
    p_worker: workerId,
  });

  const stats = ((data ?? []) as { category: string; job_count: number }[]).map(
    (row) => ({ category: row.category as JobCategory, count: row.job_count })
  );
  return { data: stats, error };
}

/**
 * The worker's own completion photos across all their completed jobs, newest
 * first — the pool they curate from. This one IS a direct `jobs` query: the
 * worker can read jobs they were assigned (jobs_select_assigned_worker), so
 * no RPC is needed for their own history.
 */
export async function fetchPortfolioCandidates(workerId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, category, completion_photos, completion_photo_url, created_at')
    .eq('assigned_worker_id', workerId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  const candidates: PortfolioCandidate[] = [];
  for (const row of (data ?? []) as any[]) {
    const photos: string[] = Array.isArray(row.completion_photos)
      ? row.completion_photos.filter((p: unknown): p is string => typeof p === 'string')
      : [];
    // Fold in the pre-phase17 single photo so older jobs are still offerable.
    const all =
      photos.length > 0
        ? photos
        : row.completion_photo_url
        ? [row.completion_photo_url]
        : [];

    for (const photoUrl of all) {
      candidates.push({
        jobId: row.id,
        jobTitle: row.title,
        category: row.category,
        completedAt: row.created_at,
        photoUrl,
      });
    }
  }

  return { data: candidates, error };
}

export type NewPortfolioItem = {
  workerId: string;
  sourceJobId: string | null;
  photoUrl: string;
  category: JobCategory;
  caption?: string | null;
};

export async function addPortfolioItem(input: NewPortfolioItem, displayOrder: number) {
  const { data, error } = await supabase
    .from('portfolio_items')
    .insert({
      worker_id: input.workerId,
      source_job_id: input.sourceJobId,
      photo_url: input.photoUrl,
      category: input.category,
      caption: input.caption?.trim() || null,
      display_order: displayOrder,
    })
    .select()
    .single();

  return { data: data as PortfolioItem | null, error };
}

export async function updatePortfolioCaption(itemId: string, caption: string) {
  const { error } = await supabase
    .from('portfolio_items')
    .update({ caption: caption.trim() || null })
    .eq('id', itemId);

  return { error };
}

export async function removePortfolioItem(itemId: string) {
  const { error } = await supabase.from('portfolio_items').delete().eq('id', itemId);
  return { error };
}

/** Categories present in a gallery, in gallery order — drives the filter tabs. */
export function categoriesInPortfolio(items: PortfolioItem[]): JobCategory[] {
  const seen: JobCategory[] = [];
  for (const item of items) {
    if (!seen.includes(item.category)) seen.push(item.category);
  }
  return seen;
}

/** "12 Handyman · 6 Dog walking · 3 Moving" */
export function formatCategoryStats(
  stats: CategoryStat[],
  labels: Record<string, string>
): string {
  return stats
    .map((s) => `${s.count} ${labels[s.category] ?? s.category}`)
    .join(' · ');
}
