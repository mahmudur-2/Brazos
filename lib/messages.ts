import { supabase } from './supabase';
import { resolveChatMediaUrl } from './storage';

/**
 * Which conversation a chat screen, message or read receipt belongs to.
 *
 * A thread is either a job's conversation (every conversation before phase36)
 * or a direct thread between two people that exists without any job — the
 * thing a first-time private offer needs, since there is no shared job to hang
 * it on yet. Exactly one of the two is ever set; the shape makes the other
 * impossible to pass by accident.
 */
export type ChatTarget =
  | { jobId: string; directThreadId?: undefined }
  | { jobId?: undefined; directThreadId: string };

/** A stable string for the target, for realtime channel names and React keys. */
export function chatTargetKey(target: ChatTarget): string {
  return target.jobId ? `job:${target.jobId}` : `direct:${target.directThreadId}`;
}

/** The `column=eq.value` realtime filter that selects this thread's rows. */
export function chatTargetFilter(target: ChatTarget): string {
  return target.jobId
    ? `job_id=eq.${target.jobId}`
    : `direct_thread_id=eq.${target.directThreadId}`;
}

export type Message = {
  id: string;
  /** Null on a direct-thread message — see ChatTarget. */
  job_id: string | null;
  direct_thread_id: string | null;
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
  /**
   * The offer revision this message records (phase46). Successor to
   * job_request_id, which stays populated on rows written before the
   * unification so historical threads keep rendering. Read this first and
   * fall back to job_request_id — see offerIdOf() in lib/offers.ts.
   */
  job_offer_id: string | null;
  request_event:
    | 'created'
    | 'countered'
    | 'accepted'
    | 'declined'
    | 'closed'
    | 'withdrawn'
    | 'expired'
    | 'superseded'
    | null;
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

// RETIRED 2026-08-23 — the one-tap chat templates (Phase 7's mode-specific
// WORKER_CHAT_TEMPLATES / CUSTOMER_CHAT_TEMPLATES and chatTemplatesForMode).
// The row that rendered them, components/QuickReplies.tsx, is deleted with
// them on operator instruction: the composer rebuild gives the message field
// its full width, and a fixed-height chip row above it was the one element in
// that column that refused to shrink to make room for the keyboard. Nothing
// else consumed the sets, and screens/RouteArrivalScreen.tsx's own "On my way"
// control is its own literal, unrelated to these.

const MESSAGE_COLUMNS =
  'id, job_id, direct_thread_id, sender_id, content, image_url, audio_url, audio_duration_ms, reply_to_id, job_request_id, job_offer_id, request_event, request_amount_cents, unsent_at, created_at';

/** Replace stored private-media references with short-lived display URLs. */
export async function resolveMessageMedia(message: Message): Promise<Message> {
  const [imageUrl, audioUrl] = await Promise.all([
    resolveChatMediaUrl('chat-photos', message.image_url),
    resolveChatMediaUrl('chat-audio', message.audio_url),
  ]);
  return { ...message, image_url: imageUrl, audio_url: audioUrl };
}

/** All messages in one conversation, oldest first. */
export async function fetchMessages(target: ChatTarget) {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq(
      target.jobId ? 'job_id' : 'direct_thread_id',
      target.jobId ?? target.directThreadId
    )
    .order('created_at', { ascending: true });

  if (error) return { data: [] as Message[], error };
  const messages = await Promise.all(
    ((data ?? []) as Message[]).map((message) => resolveMessageMedia(message))
  );
  return { data: messages, error: null };
}

export type NewMessageInput = {
  target: ChatTarget;
  senderId: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  /** Id of the message being quoted, for a WhatsApp-style reply. */
  replyToId?: string | null;
};

/**
 * Is free-form messaging open in this conversation yet?
 *
 * THE question is answered by the database (phase66 `messaging_unlocked()`),
 * not re-derived here: the same function backs the `messages` INSERT policy,
 * so the composer can never be offered for a thread the server would refuse —
 * and, just as importantly, can never be hidden on one the server would allow.
 *
 * Before the pair share a job that reached assignment, the structured
 * negotiation cards are the whole conversation. After it, normal messaging
 * opens and stays open.
 *
 * A failed read returns `false` WITH the error, so the caller can keep the
 * conversation closed and say why rather than silently opening it.
 */
export async function fetchMessagingUnlocked(target: ChatTarget) {
  const { data, error } = await supabase.rpc('messaging_unlocked', {
    p_job_id: target.jobId ?? null,
    p_direct_thread_id: target.directThreadId ?? null,
  });
  return { data: data === true, error };
}

/**
 * Did this failure come from the pre-confirmation lock rather than something
 * the user can fix by retrying?
 *
 * A refused insert surfaces as Postgres 42501 / PostgREST's row-level-security
 * text. Callers map it to the application's own sentence — the raw database
 * message never reaches a user (lib/errorMessage.ts is the general path; this
 * only decides WHICH friendly sentence applies).
 */
export function isMessagingLockedError(
  error: { message?: string | null; code?: string | null } | null
): boolean {
  if (!error) return false;
  if (error.code === '42501') return true;
  return (error.message ?? '').toLowerCase().includes('row-level security');
}

/** What to tell someone whose conversation has not opened yet. */
export const MESSAGING_LOCKED_MESSAGE =
  'You can send messages once this job is confirmed. Until then, use the offer actions above to agree on a price.';

/** Send a text, photo, and/or voice message, optionally quoting another. */
export async function sendMessage(input: NewMessageInput) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      job_id: input.target.jobId ?? null,
      direct_thread_id: input.target.directThreadId ?? null,
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
