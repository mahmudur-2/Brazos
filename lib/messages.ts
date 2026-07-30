import { supabase } from './supabase';
import { resolveChatMediaUrl } from './storage';

export type Message = {
  id: string;
  job_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  /** Voice note (phase16). Null on text/photo messages, and on any row
   *  created before that migration ran. */
  audio_url: string | null;
  audio_duration_ms: number | null;
  /** Quoted reply target (phase18). The quoted message is resolved from the
   *  already-loaded thread rather than joined — it's always in the same one. */
  reply_to_id: string | null;
  /**
   * Hire-request event (phase18). When job_request_id is set this message is
   * a negotiation card rather than ordinary content. `request_event` and
   * `request_amount_cents` are a snapshot of what happened at that moment, so
   * the thread reads correctly as history even after the request moves on.
   */
  job_request_id: string | null;
  request_event: 'created' | 'countered' | 'accepted' | 'declined' | 'closed' | null;
  request_amount_cents: number | null;
  /**
   * Unsend (phase25). Set once the sender unsends this message — content,
   * image_url, audio_url and audio_duration_ms are wiped server-side at the
   * same time (see unsend_message() RPC), not just hidden client-side, so a
   * placeholder is all that's left to render regardless of client version.
   */
  unsent_at: string | null;
  created_at: string;
};

/** How long after sending a message can still be unsent. Mirrors the window
 *  enforced server-side in unsend_message() — this copy only controls
 *  whether the menu item is offered, not whether the action succeeds. */
export const UNSEND_WINDOW_MS = 15 * 60 * 1000;

/** Whether `userId` may still unsend `message` right now. */
export function canUnsend(message: Message, userId: string | null | undefined): boolean {
  if (!userId || message.sender_id !== userId) return false;
  if (message.unsent_at) return false;
  return Date.now() - new Date(message.created_at).getTime() < UNSEND_WINDOW_MS;
}

/** Unsend a message. Server-side re-checks ownership and the 15-minute
 *  window regardless of what canUnsend() already gated on client-side. */
export async function unsendMessage(messageId: string) {
  const { error } = await supabase.rpc('unsend_message', { p_message_id: messageId });
  return { error };
}

// One-tap templates for hands-full workers (driving, on a ladder, etc).
export const CHAT_TEMPLATES = [
  'On my way',
  'Running late',
  'Here, where do I go?',
  'Job done',
] as const;

const MESSAGE_COLUMNS =
  'id, job_id, sender_id, content, image_url, audio_url, audio_duration_ms, reply_to_id, job_request_id, request_event, request_amount_cents, unsent_at, created_at';

/** Replace stored private-media references with short-lived display URLs. */
export async function resolveMessageMedia(message: Message): Promise<Message> {
  const [imageUrl, audioUrl] = await Promise.all([
    resolveChatMediaUrl('chat-photos', message.image_url),
    resolveChatMediaUrl('chat-audio', message.audio_url),
  ]);
  return { ...message, image_url: imageUrl, audio_url: audioUrl };
}

/** All messages for a job, oldest first. */
export async function fetchMessages(jobId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) return { data: [] as Message[], error };
  const messages = await Promise.all(
    ((data ?? []) as Message[]).map((message) => resolveMessageMedia(message))
  );
  return { data: messages, error: null };
}

export type NewMessageInput = {
  jobId: string;
  senderId: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  /** Id of the message being quoted, for a WhatsApp-style reply. */
  replyToId?: string | null;
};

/** Send a text, photo, and/or voice message, optionally quoting another. */
export async function sendMessage(input: NewMessageInput) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      job_id: input.jobId,
      sender_id: input.senderId,
      content: input.content,
      image_url: input.imageUrl ?? null,
      audio_url: input.audioUrl ?? null,
      audio_duration_ms: input.audioDurationMs ?? null,
      reply_to_id: input.replyToId ?? null,
    })
    .select()
    .single();

  return {
    data: data ? await resolveMessageMedia(data as Message) : null,
    error,
  };
}

/**
 * One-line description of a message for a quoted-reply preview: the composer
 * chip and the strip inside a reply bubble both use this, so they can't drift.
 */
export function messagePreviewText(message: Message): string {
  if (message.unsent_at) return 'This message was unsent';
  if (message.job_request_id) return 'Job request';
  if (message.audio_url) return 'Voice message';
  if (message.image_url) return message.content || 'Photo';
  return message.content || '…';
}

/** "0:07" / "1:23" for a clip length in milliseconds. */
export function formatClipDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
