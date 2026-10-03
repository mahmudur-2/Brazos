import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'job-photos';
const AVATAR_BUCKET = 'avatars';
const CHAT_BUCKET = 'chat-photos';
const CHAT_AUDIO_BUCKET = 'chat-audio';
const CHAT_DOCUMENT_BUCKET = 'chat-documents';
const STORAGE_REFERENCE_PREFIX = 'storage://';
const CHAT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Recovers the storage path from a Supabase public URL, so a file that was
 * only ever handed back to the caller as a URL (never as its own path) can
 * still be deleted later. Returns null if the URL doesn't look like one of
 * this project's public storage URLs — callers treat that as "nothing to
 * delete" rather than an error, since it just means the photo was never
 * actually uploaded to Supabase in the first place.
 */
function pathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

function storageReference(bucket: string, path: string): string {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

function pathFromStorageValue(bucket: string, value: string): string | null {
  const referencePrefix = `${STORAGE_REFERENCE_PREFIX}${bucket}/`;
  if (value.startsWith(referencePrefix)) {
    return value.slice(referencePrefix.length);
  }
  return pathFromPublicUrl(bucket, value);
}

export type ChatMediaBucket = 'chat-photos' | 'chat-audio' | 'chat-documents';

/**
 * F5 (fix run) — ONE SIGNED URL PER OBJECT PER SESSION. A signed URL carries a
 * fresh token every time it is minted, so re-signing on every load made
 * every photo a new URL: expo-image missed its cache each time, and a chat
 * of 300 messages made up to 900 signing calls. Each object's URL is kept
 * for this long — well inside its 6-hour TTL, so a kept URL is never stale
 * when it is drawn — and reused.
 */
const SIGNED_URL_REUSE_MS = 5 * 60 * 60 * 1000;
const signedUrls = new Map<string, { url: string; signedAt: number }>();

function keptSignedUrl(bucket: ChatMediaBucket, path: string): string | null {
  const kept = signedUrls.get(`${bucket}/${path}`);
  if (!kept) return null;
  if (Date.now() - kept.signedAt > SIGNED_URL_REUSE_MS) {
    signedUrls.delete(`${bucket}/${path}`);
    return null;
  }
  return kept.url;
}

function keepSignedUrl(bucket: ChatMediaBucket, path: string, url: string): void {
  signedUrls.set(`${bucket}/${path}`, { url, signedAt: Date.now() });
}

/**
 * Before phase29, the old public bucket may still serve its legacy URL.
 * Never fall back for a new storage:// reference: that has no public URL.
 */
function legacyFallback(value: string): string | null {
  return value.startsWith('http://') || value.startsWith('https://') ? value : null;
}

/**
 * Resolve a private chat-media reference for display. Legacy public URLs are
 * converted to the same object path and signed too, so making the bucket
 * private does not strand messages sent before phase29.
 */
export async function resolveChatMediaUrl(
  bucket: 'chat-photos' | 'chat-audio' | 'chat-documents',
  value: string | null
): Promise<string | null> {
  if (!value) return null;
  const path = pathFromStorageValue(bucket, value);
  if (!path) return null;

  const kept = keptSignedUrl(bucket, path);
  if (kept) return kept;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, CHAT_SIGNED_URL_TTL_SECONDS);

  if (!error && data?.signedUrl) {
    keepSignedUrl(bucket, path, data.signedUrl);
    return data.signedUrl;
  }

  return legacyFallback(value);
}

/**
 * F5 — many references, ONE signing call for the bucket (createSignedUrls).
 * The answer lines up with `values`: a display URL, or null where there is
 * nothing to show — never the raw storage:// reference. A kept URL is reused
 * and never re-signed.
 */
export async function resolveChatMediaUrls(
  bucket: ChatMediaBucket,
  values: (string | null | undefined)[]
): Promise<(string | null)[]> {
  const resolved: (string | null)[] = values.map(() => null);
  const pending: { index: number; path: string; value: string }[] = [];
  values.forEach((value, index) => {
    if (!value) return;
    const path = pathFromStorageValue(bucket, value);
    if (!path) return;
    const kept = keptSignedUrl(bucket, path);
    if (kept) resolved[index] = kept;
    else pending.push({ index, path, value });
  });
  if (pending.length === 0) return resolved;

  const paths = [...new Set(pending.map((entry) => entry.path))];
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, CHAT_SIGNED_URL_TTL_SECONDS);
  const byPath = new Map<string, string>();
  if (!error && data) {
    for (const row of data) {
      if (!row.error && row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
    }
  }
  for (const { index, path, value } of pending) {
    const url = byPath.get(path);
    if (url) {
      keepSignedUrl(bucket, path, url);
      resolved[index] = url;
    } else {
      resolved[index] = legacyFallback(value);
    }
  }
  return resolved;
}

/**
 * F5 — the image cache key for a SIGNED storage URL: the URL without its
 * token, so the same object is the same cache entry however many times it is
 * re-signed. Only signed object URLs qualify; anything else (an avatar, which
 * may carry a cache-busting query) returns undefined and keys by its own URL.
 */
export function signedUrlCacheKey(url: string | null | undefined): string | undefined {
  if (!url || !url.includes('/storage/v1/object/sign/')) return undefined;
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

async function uploadAsset(
  bucket: string,
  path: string,
  asset: ImagePickerAsset,
  privateReference = false
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = asset.mimeType ?? 'image/jpeg';

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, { contentType, upsert: true });
    if (error) return { url: null, error };

    if (privateReference) {
      return { url: storageReference(bucket, path), error: null };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e as Error };
  }
}

/** Upload a user's avatar and return its public URL. Requires the `avatars` bucket. */
export async function uploadAvatar(userId: string, asset: ImagePickerAsset) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  // Stable path per user so a new avatar overwrites the old one (upsert).
  return uploadAsset(AVATAR_BUCKET, `${userId}/avatar.${ext}`, asset);
}

/**
 * Upload a worker's "done" photo to Supabase Storage and return its public URL.
 * Reads the picked asset as an ArrayBuffer (works on web and native). Requires
 * the public `job-photos` bucket + storage policies (see phase6 SQL).
 */
export async function uploadJobPhoto(jobId: string, asset: ImagePickerAsset) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  return uploadAsset(BUCKET, `${jobId}/${Date.now()}.${ext}`, asset);
}

/**
 * Delete a job-photos file (a posting attachment, a worker completion photo,
 * or a completion video — they all live in this bucket) given the public URL
 * it was uploaded as. Used when media is removed from the picker before
 * submit, so it doesn't sit orphaned in storage forever with nothing pointing
 * at it. Requires the phase26 SQL (job-photos never had a DELETE policy
 * before).
 */
export async function deleteJobPhoto(url: string) {
  const path = pathFromPublicUrl(BUCKET, url);
  if (!path) return { error: null };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error };
}

/**
 * Upload a private chat photo and return a stable storage:// reference.
 * Display code exchanges the reference for a short-lived signed URL.
 */
export async function uploadChatPhoto(
  jobId: string,
  userId: string,
  asset: ImagePickerAsset
) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  return uploadAsset(
    CHAT_BUCKET,
    `${jobId}/${userId}/${Date.now()}.${ext}`,
    asset,
    true
  );
}

/**
 * Upload a recorded voice note to the private chat-audio bucket and return a
 * stable storage:// reference.
 *
 * Takes a local file URI (from expo-audio's recorder) rather than an
 * ImagePickerAsset, so it can't reuse uploadAsset above — but the
 * fetch-to-ArrayBuffer approach is the same, and is what works across both
 * native and web.
 */
export async function uploadChatAudio(
  jobId: string,
  userId: string,
  fileUri: string,
  extension = 'm4a'
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    const safeExtension = /^[a-z0-9]{1,5}$/i.test(extension) ? extension.toLowerCase() : 'm4a';
    const path = `${jobId}/${userId}/${Date.now()}.${safeExtension}`;

    const { error } = await supabase.storage
      .from(CHAT_AUDIO_BUCKET)
      .upload(path, arrayBuffer, {
        contentType: safeExtension === 'm4a' ? 'audio/m4a' : `audio/${safeExtension}`,
        upsert: true,
      });
    if (error) return { url: null, error };

    return { url: storageReference(CHAT_AUDIO_BUCKET, path), error: null };
  } catch (e) {
    return { url: null, error: e as Error };
  }
}

/**
 * Upload a picked document to the private chat-documents bucket and return a
 * stable storage:// reference. The exact sibling of uploadChatAudio above —
 * same fetch-to-ArrayBuffer, same reference-not-URL return, same private
 * posture — with one deliberate difference in what `threadId` may be.
 *
 * THE FIRST PATH SEGMENT IS EITHER KIND OF THREAD. chat-photos and chat-audio
 * authorise their inserts against a JOB only, so a direct thread has no path
 * to key an upload on and the composer hides those entries there.
 * phase77's chat_documents_insert_party carries a second branch on
 * `direct_threads`, so a document's folder one may be a job id OR a direct
 * thread id, and documents ship on both thread kinds. That gap in the other
 * two buckets is pre-existing, reported by phase77 and deliberately not
 * widened here.
 *
 * THE PICKED FILENAME NEVER REACHES THE PATH. The object is `<ts>.<ext>` and
 * the name the user sees is carried on the message row (`document_name`), so
 * nothing a file manager can be made to produce — a slash, a traversal, a
 * 300-character name — can shape a storage key. The extension is the only
 * thing read out of it, and only after it passes the same allow-list shape
 * the audio path uses.
 */
export async function uploadChatDocument(
  threadId: string,
  userId: string,
  fileUri: string,
  fileName: string,
  mimeType?: string | null
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    const path = `${threadId}/${userId}/${Date.now()}.${documentExtension(fileName, fileUri)}`;

    const { error } = await supabase.storage
      .from(CHAT_DOCUMENT_BUCKET)
      .upload(path, arrayBuffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });
    if (error) return { url: null, error };

    return { url: storageReference(CHAT_DOCUMENT_BUCKET, path), error: null };
  } catch (e) {
    return { url: null, error: e as Error };
  }
}

/**
 * The extension to store a document under: the picked NAME's, then the local
 * URI's, then `bin`. Allow-listed to letters and digits so the value can only
 * ever be a path-safe suffix — an eight-character ceiling, because `numbers`
 * and `pages` are real extensions and `m4a`'s five would refuse them.
 */
function documentExtension(fileName: string, fileUri: string): string {
  for (const source of [fileName, fileUri.split('?')[0]]) {
    const candidate = (source.split('.').pop() ?? '').toLowerCase();
    if (candidate && candidate !== source.toLowerCase() && /^[a-z0-9]{1,8}$/.test(candidate)) {
      return candidate;
    }
  }
  return 'bin';
}

/**
 * Upload a photo attached to a job posting. Reuses the same public
 * `job-photos` bucket (and its existing policies) as the worker's completion
 * photo — these are posted before the job row exists, so they're keyed by the
 * poster's id plus a timestamp rather than by job id.
 */
export async function uploadJobAttachment(userId: string, asset: ImagePickerAsset) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(BUCKET, `postings/${userId}/${unique}.${ext}`, asset);
}

/**
 * Upload a photo attached to a review. Same public `job-photos` bucket, under
 * `reviews/<uid>/…` — a prefix phase37 adds its own narrow insert/delete
 * policies for, because a review is written by EITHER party and so matches
 * neither of phase29's existing branches (the poster's own `postings/` folder,
 * or a job's assigned worker). Writable only by the account in the path.
 */
export async function uploadReviewPhoto(userId: string, asset: ImagePickerAsset) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(BUCKET, `reviews/${userId}/${unique}.${ext}`, asset);
}

/** Container formats a picker can realistically hand back, mapped to the
 *  content type the object is stored with. Anything outside this list is
 *  refused before upload rather than stored with a guessed type. */
const VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
};

/** Whether a picked asset is a video this app will accept. */
export function isSupportedVideo(asset: ImagePickerAsset): boolean {
  if (asset.mimeType?.startsWith('video/')) {
    return Object.values(VIDEO_CONTENT_TYPES).includes(asset.mimeType);
  }
  return videoExtension(asset.uri) !== null;
}

function videoExtension(uri: string): string | null {
  const ext = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  return ext in VIDEO_CONTENT_TYPES ? ext : null;
}

/**
 * Format, length and size checks a picked video has to pass, in one place so
 * a job posting's clip and a worker's completion clip are refused for the
 * same reasons in the same words — only the limits differ.
 *
 * Returns a `{ title, message }` ready to show, or null when the asset is
 * acceptable. Everything here is checked before a byte is uploaded, so a
 * rejected file costs nothing and the reason is specific.
 */
export function rejectionForPickedVideo(
  asset: ImagePickerAsset,
  limits: { maxDurationMs: number; maxBytes: number }
): { title: string; message: string } | null {
  if (!isSupportedVideo(asset)) {
    return {
      title: 'Unsupported video',
      message:
        'Please choose an MP4 or MOV video. Other formats can’t be played back reliably in the app.',
    };
  }
  if (asset.duration != null && asset.duration > limits.maxDurationMs) {
    const seconds = Math.round(limits.maxDurationMs / 1000);
    return {
      title: 'Video is too long',
      message:
        seconds % 60 === 0
          ? `Videos must be under ${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}. Trim it and try again.`
          : `Videos must be under ${seconds} seconds. Trim it and try again.`,
    };
  }
  if (asset.fileSize != null && asset.fileSize > limits.maxBytes) {
    return {
      title: 'Video is too large',
      message: `Videos must be under ${Math.round(limits.maxBytes / (1024 * 1024))} MB.`,
    };
  }
  return null;
}

/**
 * Upload the assigned worker's completion video. Same public `job-photos`
 * bucket as their completion photos, under `{jobId}/completion/…`.
 *
 * phase29's job_photos_insert policy authorises a non-`postings` path whose
 * FIRST folder segment is a job the caller is the assigned worker on, and
 * phase26's delete policy scopes removal by the same rule — a `completion/`
 * segment sits below that first segment, so both already cover this path
 * exactly as written. No new bucket, no new policy, and deliberately nothing
 * loosened.
 *
 * The content type is resolved from an allowlist rather than trusted from the
 * picker, so an object can never be stored under a type this app would not
 * play back.
 */
export async function uploadCompletionVideo(jobId: string, asset: ImagePickerAsset) {
  const ext =
    videoExtension(asset.uri) ??
    Object.keys(VIDEO_CONTENT_TYPES).find(
      (key) => VIDEO_CONTENT_TYPES[key] === asset.mimeType
    ) ??
    null;

  if (!ext) {
    return { url: null, error: new Error('Unsupported video format') };
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(
    BUCKET,
    `${jobId}/completion/${unique}.${ext}`,
    { ...asset, mimeType: VIDEO_CONTENT_TYPES[ext] },
  );
}

/**
 * Upload a short video attached to a job posting. Same public `job-photos`
 * bucket and same `postings/<uid>/…` prefix as the poster's photos, so it is
 * covered by the storage policies that already exist (phase29 authorises the
 * insert on the path's owner, phase26 the delete) — no new bucket and no
 * loosened policy.
 *
 * The content type is resolved from an allowlist rather than trusted from the
 * picker, so an object can never be stored under a type this app would not
 * play back.
 */
export async function uploadJobVideo(userId: string, asset: ImagePickerAsset) {
  const ext =
    videoExtension(asset.uri) ??
    Object.keys(VIDEO_CONTENT_TYPES).find(
      (key) => VIDEO_CONTENT_TYPES[key] === asset.mimeType
    ) ??
    null;

  if (!ext) {
    return { url: null, error: new Error('Unsupported video format') };
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(
    BUCKET,
    `postings/${userId}/${unique}.${ext}`,
    { ...asset, mimeType: VIDEO_CONTENT_TYPES[ext] },
  );
}
