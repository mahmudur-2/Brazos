import { supabase } from './supabase';

export type Message = {
  id: string;
  job_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

// One-tap templates for hands-full workers (driving, on a ladder, etc).
export const CHAT_TEMPLATES = [
  'On my way',
  'Running late',
  'Here, where do I go?',
  'Job done',
] as const;

/** All messages for a job, oldest first. */
export async function fetchMessages(jobId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  return { data: (data ?? []) as Message[], error };
}

export type NewMessageInput = {
  jobId: string;
  senderId: string;
  content: string;
  imageUrl?: string | null;
};

/** Send a text and/or photo message. */
export async function sendMessage(input: NewMessageInput) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      job_id: input.jobId,
      sender_id: input.senderId,
      content: input.content,
      image_url: input.imageUrl ?? null,
    })
    .select()
    .single();

  return { data: data as Message | null, error };
}
