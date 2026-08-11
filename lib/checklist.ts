import { supabase } from './supabase';

/**
 * Screen 57's work checklist (phase51's job_checklist_items). The assigned
 * worker owns the rows and is the only writer — enforced by RLS, which also
 * closes writing once the job leaves assigned/in_progress. The customer
 * reads along. Direct table DML on purpose (the message_reads treatment):
 * per-job working state with no money or lifecycle authority in it.
 */

export type ChecklistItem = {
  id: string;
  job_id: string;
  position: number;
  label: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

const CHECKLIST_COLUMNS = 'id, job_id, position, label, done, done_at, created_at';

export async function fetchChecklist(jobId: string) {
  const { data, error } = await supabase
    .from('job_checklist_items')
    .select(CHECKLIST_COLUMNS)
    .eq('job_id', jobId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  return { data: (data ?? []) as ChecklistItem[], error };
}

export async function addChecklistItem(jobId: string, label: string, position: number) {
  const { data, error } = await supabase
    .from('job_checklist_items')
    .insert({ job_id: jobId, label: label.trim(), position })
    .select(CHECKLIST_COLUMNS)
    .single();

  return { data: (data ?? null) as ChecklistItem | null, error };
}

export async function setChecklistItemDone(itemId: string, done: boolean) {
  const { data, error } = await supabase
    .from('job_checklist_items')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', itemId)
    .select(CHECKLIST_COLUMNS)
    .single();

  return { data: (data ?? null) as ChecklistItem | null, error };
}

export async function removeChecklistItem(itemId: string) {
  const { error } = await supabase.from('job_checklist_items').delete().eq('id', itemId);
  return { error };
}
