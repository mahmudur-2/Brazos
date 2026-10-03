import { supabase } from './supabase';
import { resolveChatMediaUrl, resolveChatMediaUrls } from './storage';

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
  /**
   * Document attachment (phase77). `document_url` is the private
   * `storage://chat-documents/…` reference, exchanged for a signed URL by
   * resolveMessageMedia() exactly as image_url and audio_url are.
   *
   * THE OTHER TWO ARE WHAT LETS THE BUBBLE DRAW BEFORE DOWNLOADING ANYTHING.
   * A document has no thumbnail and no waveform, so the name and the byte
   * count are the whole preview — the same role audio_duration_ms plays for a
   * voice note. Fetching the file to render its own bubble would download
   * every attachment in a thread on open.
   */
  document_url: string | null;
  document_name: string | null;
  document_size_bytes: number | null;
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
// else consumed the sets. (Route & arrival's own "On my way" control went with
// that screen in fix run F20; WorkerJobScreen's stepper took its place.)

const MESSAGE_COLUMNS =
  'id, job_id, direct_thread_id, sender_id, content, image_url, audio_url, audio_duration_ms, document_url, document_name, document_size_bytes, reply_to_id, job_request_id, job_offer_id, request_event, request_amount_cents, unsent_at, created_at';

/** Replace stored private-media references with short-lived display URLs. */
export async function resolveMessageMedia(message: Message): Promise<Message> {
  const [imageUrl, audioUrl, documentUrl] = await Promise.all([
    resolveChatMediaUrl('chat-photos', message.image_url),
    resolveChatMediaUrl('chat-audio', message.audio_url),
    resolveChatMediaUrl('chat-documents', message.document_url),
  ]);
  return {
    ...message,
    image_url: imageUrl,
    audio_url: audioUrl,
    document_url: documentUrl,
  };
}

/**
 * F5 — a whole page's media in one signing call per bucket, rather than up to
 * three per message. The realtime path keeps resolveMessageMedia for its one
 * message at a time.
 */
export async function resolveMessagesMedia(list: Message[]): Promise<Message[]> {
  if (list.length === 0) return list;
  const [images, audio, documents] = await Promise.all([
    resolveChatMediaUrls('chat-photos', list.map((m) => m.image_url)),
    resolveChatMediaUrls('chat-audio', list.map((m) => m.audio_url)),
    resolveChatMediaUrls('chat-documents', list.map((m) => m.document_url)),
  ]);
  return list.map((message, index) => ({
    ...message,
    image_url: images[index],
    audio_url: audio[index],
    document_url: documents[index],
  }));
}

/** F5: how many messages one thread loads at a time. */
export const MESSAGE_PAGE_SIZE = 50;

export type MessagePage = {
  /** Oldest first. */
  data: Message[];
  error: { message?: string | null; code?: string | null } | null;
  /** Whether the thread may hold older messages than this page reached. */
  hasMore: boolean;
};

/**
 * F5 — one page of a thread, oldest first: the newest `limit` messages at or
 * before `before` (the thread's newest when absent). `since` instead loads
 * every message from that instant on, unpaged — the legacy jobId entry's way
 * to reach the job's first message. At-or-before, not strictly before, so a
 * message sharing the cursor's timestamp is never skipped; the store drops
 * the repeat by id.
 */
export async function fetchMessages(
  target: ChatTarget,
  { before, since, limit = MESSAGE_PAGE_SIZE }: { before?: string; since?: string; limit?: number } = {}
): Promise<MessagePage> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq(
      target.jobId ? 'job_id' : 'direct_thread_id',
      target.jobId ?? target.directThreadId
    );
  if (since) {
    query = query.gte('created_at', since);
  } else if (before) {
    query = query.lte('created_at', before);
  }
  const ordered = query.order('created_at', { ascending: false }).order('id', { ascending: false });
  const { data, error } = await (since ? ordered : ordered.limit(limit));

  if (error) return { data: [] as Message[], error, hasMore: true };
  const newestFirst = (data ?? []) as Message[];
  const messages = await resolveMessagesMedia([...newestFirst].reverse());
  // A `since` load reached its instant, but older messages may sit before it.
  return { data: messages, error: null, hasMore: since ? true : newestFirst.length >= limit };
}

/**
 * F5 — when a job's conversation began: the legacy jobId entry jumps to that
 * job's first message, so every thread is loaded back to this instant.
 */
export async function fetchFirstMessageAt(jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { created_at: string }).created_at;
}

/** F5 — quoted messages that sit outside the loaded window, in one read. */
export async function fetchMessagesByIds(ids: string[]): Promise<Message[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).in('id', ids);
  if (error || !data) return [];
  return resolveMessagesMedia(data as Message[]);
}

/**
 * F5 — THE MERGED WINDOW HAS NO HOLES. Each thread loads newest-first, page by
 * page, so a busy thread's 50 can cover an hour while a quiet thread's cover
 * a month. Interleaving both as loaded would show the quiet thread's March
 * beside the busy one's last hour, with the busy one's March missing between
 * them. So the timeline starts at the FLOOR — the latest cursor among the
 * threads that may still hold older messages — and nothing older than it is
 * shown until those threads load further. A thread that has reached its start
 * sets no floor. Oldest first; created_at, then id, breaks a tie.
 */
export function visibleWindow(
  byThread: Record<string, Message[]>,
  cursor: Record<string, string | null>,
  hasMore: Record<string, boolean>
): Message[] {
  let floor: string | null = null;
  for (const key of Object.keys(byThread)) {
    if (!hasMore[key]) continue;
    const at = cursor[key];
    if (at && (floor === null || Date.parse(at) > Date.parse(floor))) floor = at;
  }
  const merged: Message[] = [];
  for (const slice of Object.values(byThread)) {
    for (const message of slice) {
      if (floor === null || Date.parse(message.created_at) >= Date.parse(floor)) merged.push(message);
    }
  }
  return merged.sort((a, b) => {
    const difference = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (difference) return difference;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export type NewMessageInput = {
  target: ChatTarget;
  senderId: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  /** The `storage://chat-documents/…` reference, plus the two facts the
   *  bubble draws from before it downloads anything (phase77). */
  documentUrl?: string | null;
  documentName?: string | null;
  documentSizeBytes?: number | null;
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

/** Send a text, photo, voice or document message, optionally quoting another. */
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
      document_url: input.documentUrl ?? null,
      document_name: input.documentName ?? null,
      document_size_bytes: input.documentSizeBytes ?? null,
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
  // AHEAD OF AUDIO, and the order is the point rather than a preference. One
  // insert writes every attachment kind, so nothing at this layer stops a row
  // carrying two of them; whichever branch comes first decides what a quote
  // chip and an inbox row say. A document is the more specific fact — it has a
  // NAME, and naming it is strictly more useful than "Voice message" — so it
  // is asked about first. The filename is the user's own text and is shown as
  // they wrote it; a document that somehow has no name still previews as
  // something rather than falling through to an empty ellipsis.
  if (message.document_url) return message.document_name || 'Document';
  if (message.audio_url) return 'Voice message';
  if (message.image_url) return message.content || 'Photo';
  return message.content || '…';
}

/**
 * The Ionicon a document bubble draws, from its FILENAME alone.
 *
 * Read off the name rather than the mime type on purpose: the mime type is
 * optional on a picked asset (`DocumentPickerAsset.mimeType?`), is absent
 * often enough on iOS to matter, and is not stored on the message row at all
 * — the extension is on the name the row does carry, so this answers for a
 * message loaded from the database exactly as it does for one just picked.
 *
 * Anything unrecognised gets the generic document glyph. It is a hint about
 * what is inside, never a claim: the file is not opened to draw its own
 * bubble, which is the whole reason the name and the size are stored beside
 * the reference.
 */
export type DocumentIconName =
  | 'document-text-outline'
  | 'image-outline'
  | 'film-outline'
  | 'musical-notes-outline'
  | 'grid-outline'
  | 'easel-outline'
  | 'archive-outline'
  | 'document-outline';

const DOCUMENT_ICONS: Record<string, DocumentIconName> = {
  pdf: 'document-text-outline',
  doc: 'document-text-outline',
  docx: 'document-text-outline',
  rtf: 'document-text-outline',
  txt: 'document-text-outline',
  md: 'document-text-outline',
  pages: 'document-text-outline',
  png: 'image-outline',
  jpg: 'image-outline',
  jpeg: 'image-outline',
  gif: 'image-outline',
  heic: 'image-outline',
  webp: 'image-outline',
  mp4: 'film-outline',
  mov: 'film-outline',
  m4v: 'film-outline',
  mp3: 'musical-notes-outline',
  m4a: 'musical-notes-outline',
  wav: 'musical-notes-outline',
  csv: 'grid-outline',
  xls: 'grid-outline',
  xlsx: 'grid-outline',
  numbers: 'grid-outline',
  ppt: 'easel-outline',
  pptx: 'easel-outline',
  key: 'easel-outline',
  zip: 'archive-outline',
  rar: 'archive-outline',
  gz: 'archive-outline',
  '7z': 'archive-outline',
};

export function documentIconFor(fileName: string | null | undefined): DocumentIconName {
  if (!fileName) return 'document-outline';
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  // A name with no dot at all reports itself as its own extension; that is
  // not one, so it takes the generic glyph like anything else unrecognised.
  if (!extension || extension === fileName.toLowerCase()) return 'document-outline';
  return DOCUMENT_ICONS[extension] ?? 'document-outline';
}

/**
 * "18 KB" / "2.4 MB" for a document's byte count — the label beside a
 * filename, and the sibling of formatClipDuration() below: the one piece of
 * metadata that lets a bubble say how big the download is before anyone taps
 * it.
 *
 * KB IS 1024 BYTES HERE, matching what both mobile operating systems show a
 * user for the same file. An unknown or negative size is an empty string, not
 * "0 B" — the bubble drops the label rather than claiming an empty file.
 */
export function formatDocumentSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below ten, none above: "9.4 MB" is worth the character and
  // "247.3 MB" is not.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "0:07" / "1:23" for a clip length in milliseconds. */
export function formatClipDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
