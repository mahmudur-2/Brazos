import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'job-photos';
const AVATAR_BUCKET = 'avatars';
const CHAT_BUCKET = 'chat-photos';
const CHAT_AUDIO_BUCKET = 'chat-audio';

async function uploadAsset(
  bucket: string,
  path: string,
  asset: ImagePickerAsset
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = asset.mimeType ?? 'image/jpeg';

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, { contentType, upsert: true });
    if (error) return { url: null, error };

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
 * Upload a chat photo for a job and return its public URL. Requires the
 * public `chat-photos` bucket + storage policies (see phase8 SQL).
 */
export async function uploadChatPhoto(jobId: string, asset: ImagePickerAsset) {
  const rawExt = (asset.uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const ext = rawExt.length <= 4 ? rawExt : 'jpg';
  return uploadAsset(CHAT_BUCKET, `${jobId}/${Date.now()}.${ext}`, asset);
}

/**
 * Upload a recorded voice note for a job's chat and return its public URL.
 * Requires the public `chat-audio` bucket + policies (see phase16 SQL).
 *
 * Takes a local file URI (from expo-audio's recorder) rather than an
 * ImagePickerAsset, so it can't reuse uploadAsset above — but the
 * fetch-to-ArrayBuffer approach is the same, and is what works across both
 * native and web.
 */
export async function uploadChatAudio(
  jobId: string,
  fileUri: string,
  extension = 'm4a'
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    const path = `${jobId}/${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from(CHAT_AUDIO_BUCKET)
      .upload(path, arrayBuffer, {
        contentType: extension === 'm4a' ? 'audio/m4a' : `audio/${extension}`,
        upsert: true,
      });
    if (error) return { url: null, error };

    const { data } = supabase.storage.from(CHAT_AUDIO_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
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
