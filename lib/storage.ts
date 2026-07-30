import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'job-photos';
const AVATAR_BUCKET = 'avatars';
const CHAT_BUCKET = 'chat-photos';
const CHAT_AUDIO_BUCKET = 'chat-audio';
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

/**
 * Resolve a private chat-media reference for display. Legacy public URLs are
 * converted to the same object path and signed too, so making the bucket
 * private does not strand messages sent before phase29.
 */
export async function resolveChatMediaUrl(
  bucket: 'chat-photos' | 'chat-audio',
  value: string | null
): Promise<string | null> {
  if (!value) return null;
  const path = pathFromStorageValue(bucket, value);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, CHAT_SIGNED_URL_TTL_SECONDS);

  if (!error && data?.signedUrl) return data.signedUrl;

  // Before phase29, the old public bucket may still serve its legacy URL.
  // Never fall back for a new storage:// reference: that has no public URL.
  return value.startsWith('http://') || value.startsWith('https://') ? value : null;
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
 * Delete a job-photos file (a posting attachment or a worker completion
 * photo — both live in this bucket) given the public URL it was uploaded
 * as. Used when a photo is removed from the picker before submit, so it
 * doesn't sit orphaned in storage forever with nothing pointing at it.
 * Requires the phase26 SQL (job-photos never had a DELETE policy before).
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
