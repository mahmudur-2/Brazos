import type { ImagePickerAsset } from 'expo-image-picker';
import { cleanPhoto, cleanVideo } from './mediaMetadata';
import { supabase } from './supabase';
import {
  DELETE_UNFINISHED_MESSAGE,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_DURATION_MS,
  PHOTO_KIND_MESSAGE,
  PHOTO_LOCATION_MESSAGE,
  PHOTO_TOO_LARGE_MESSAGE,
  UploadRefused,
  VIDEO_KIND_MESSAGE,
  VIDEO_LOCATION_MESSAGE,
  VIDEO_TOO_LARGE_MESSAGE,
} from './uploadRules';

const BUCKET = 'job-photos';
const AVATAR_BUCKET = 'avatars';
const CHAT_BUCKET = 'chat-photos';
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

export type ChatMediaBucket = 'chat-photos';

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

/** R7-d: forget every kept signed link (lib/signOut.ts forgetDevice, when the signed-in person changes). */
export function clearSignedUrls(): void {
  signedUrls.clear();
}

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
  bucket: ChatMediaBucket,
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

type UploadKind = 'photo' | 'video';
type UploadResult = { url: string | null; error: Error | null };

const refused = (sentence: string): UploadResult => ({ url: null, error: new UploadRefused(sentence) });

/** The bytes as one ArrayBuffer of exactly their length (no copy when they already are one). */
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return (byteOffset === 0 && byteLength === buffer.byteLength
    ? buffer
    : buffer.slice(byteOffset, byteOffset + byteLength)) as ArrayBuffer;
}

/**
 * Every upload goes through here. B10: more than the bucket's own limit is
 * refused before a byte is sent. R7-b / R7-c: the location is removed from
 * the bytes first (lib/mediaMetadata.ts), and a file that cannot be cleaned,
 * or is not a kind Brazos uploads, is never sent. The stored name's extension
 * and the content type follow the bytes, never the picker's word. A refusal's
 * error carries its sentence (uploadErrorMessage in lib/uploadRules.ts).
 */
async function uploadAsset(
  bucket: string,
  pickedPath: string,
  asset: ImagePickerAsset,
  privateReference = false,
  kind: UploadKind = 'photo'
): Promise<UploadResult> {
  try {
    const response = await fetch(asset.uri);
    const picked = new Uint8Array(await response.arrayBuffer());
    if (picked.byteLength > MAX_UPLOAD_BYTES) {
      return refused(kind === 'video' ? VIDEO_TOO_LARGE_MESSAGE : PHOTO_TOO_LARGE_MESSAGE);
    }
    const cleaned = kind === 'video' ? cleanVideo(picked) : cleanPhoto(picked);
    if (!cleaned.ok) {
      if (cleaned.failure === 'wrong-kind') {
        return refused(kind === 'video' ? VIDEO_KIND_MESSAGE : PHOTO_KIND_MESSAGE);
      }
      return refused(kind === 'video' ? VIDEO_LOCATION_MESSAGE : PHOTO_LOCATION_MESSAGE);
    }
    const path = `${pickedPath.replace(/\.[^./]*$/, '')}.${cleaned.extension}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, exactBuffer(cleaned.bytes), { contentType: cleaned.contentType, upsert: true });
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
  // A random suffix, as for postings and reviews: two photos picked in the same millisecond must not
  // land on one name, because the bucket has no UPDATE policy for the upsert's overwrite path.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(BUCKET, `${jobId}/${unique}.${ext}`, asset);
}

/**
 * Delete a job-photos file (a posting attachment, a worker completion photo,
 * or a completion video — they all live in this bucket) given the public URL
 * it was uploaded as. Used when media is removed from the picker before
 * submit, so it doesn't sit orphaned in storage forever with nothing pointing
 * at it. Requires the phase26 SQL (job-photos never had a DELETE policy
 * before).
 *
 * T1 (A4-M3): a storage:// reference is a real file too, so it is resolved
 * like a public URL; one that points into another bucket is an error, never
 * "nothing to delete". A remove() that answers with no removed object (a
 * policy refusal looks exactly like that) is an error too.
 */
export async function deleteJobPhoto(url: string): Promise<{ error: Error | null }> {
  const path = pathFromStorageValue(BUCKET, url);
  if (!path) {
    return { error: url.startsWith(STORAGE_REFERENCE_PREFIX) ? new Error(DELETE_UNFINISHED_MESSAGE) : null };
  }
  const { data, error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { error };
  if (!data || data.length === 0) return { error: new Error(DELETE_UNFINISHED_MESSAGE) };
  return { error: null };
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
 *  refused before upload rather than stored with a guessed type. B10: only
 *  the bucket's two video types (m4v's video/x-m4v is not one of them). */
const VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
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
 *
 * B10 (A4-M3): a caller's limits can only tighten the app's own, never widen
 * them: at most MAX_VIDEO_DURATION_MS (30 s, choice 4) and MAX_UPLOAD_BYTES
 * (the bucket's 25 MB). With no limits given, those two are used.
 */
export function rejectionForPickedVideo(
  asset: ImagePickerAsset,
  limits: { maxDurationMs: number; maxBytes: number } = {
    maxDurationMs: MAX_VIDEO_DURATION_MS,
    maxBytes: MAX_UPLOAD_BYTES,
  }
): { title: string; message: string } | null {
  const maxDurationMs = Math.min(limits.maxDurationMs, MAX_VIDEO_DURATION_MS);
  const maxBytes = Math.min(limits.maxBytes, MAX_UPLOAD_BYTES);
  if (!isSupportedVideo(asset)) {
    return { title: 'Unsupported video', message: VIDEO_KIND_MESSAGE };
  }
  if (asset.duration != null && asset.duration > maxDurationMs) {
    const seconds = Math.round(maxDurationMs / 1000);
    return {
      title: 'Video is too long',
      message:
        seconds % 60 === 0
          ? `Videos must be under ${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}. Trim it and try again.`
          : `Videos must be under ${seconds} seconds. Trim it and try again.`,
    };
  }
  if (asset.fileSize != null && asset.fileSize > maxBytes) {
    return {
      title: 'Video is too large',
      message:
        maxBytes === MAX_UPLOAD_BYTES
          ? VIDEO_TOO_LARGE_MESSAGE
          : `Videos must be under ${Math.round(maxBytes / (1024 * 1024))} MB. Trim it and try again.`,
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
 * The content type is resolved from the bytes (uploadAsset) rather than trusted
 * from the picker, so an object can never be stored under a type this app
 * would not play back.
 */
export async function uploadCompletionVideo(jobId: string, asset: ImagePickerAsset) {
  const ext =
    videoExtension(asset.uri) ??
    Object.keys(VIDEO_CONTENT_TYPES).find(
      (key) => VIDEO_CONTENT_TYPES[key] === asset.mimeType
    ) ??
    null;

  if (!ext) {
    return refused(VIDEO_KIND_MESSAGE);
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(
    BUCKET,
    `${jobId}/completion/${unique}.${ext}`,
    asset,
    false,
    'video'
  );
}

/**
 * Upload a short video attached to a job posting. Same public `job-photos`
 * bucket and same `postings/<uid>/…` prefix as the poster's photos, so it is
 * covered by the storage policies that already exist (phase29 authorises the
 * insert on the path's owner, phase26 the delete) — no new bucket and no
 * loosened policy.
 *
 * The content type is resolved from the bytes (uploadAsset) rather than trusted
 * from the picker, so an object can never be stored under a type this app
 * would not play back.
 */
export async function uploadJobVideo(userId: string, asset: ImagePickerAsset) {
  const ext =
    videoExtension(asset.uri) ??
    Object.keys(VIDEO_CONTENT_TYPES).find(
      (key) => VIDEO_CONTENT_TYPES[key] === asset.mimeType
    ) ??
    null;

  if (!ext) {
    return refused(VIDEO_KIND_MESSAGE);
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadAsset(
    BUCKET,
    `postings/${userId}/${unique}.${ext}`,
    asset,
    false,
    'video'
  );
}
