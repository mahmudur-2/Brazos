/**
 * B10 / T3 (A4-M3) — the limits every photo and video upload obeys, and the ONE
 * place an upload failure becomes the sentence a person reads.
 *
 * A pure module (no imports), so the node tests run it as it ships.
 */

/**
 * The bucket's own limit: avatars, job-photos and chat-photos all allow
 * 26214400 bytes (20261108010000_lean_v1_grants.sql, section 2; a test ties the
 * two together). The "25" in every sentence below is computed from it.
 */
export const MAX_UPLOAD_BYTES = 26_214_400;

/** 25: MAX_UPLOAD_BYTES in whole megabytes (1 MB = 1048576 bytes), as the sentences say it. */
export const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * Choice 4 (accepted): a clip is at most 30 seconds. At the picker's
 * 960x540 export (lib/pickerOptions.ts) a 30 s clip is far below
 * MAX_UPLOAD_BYTES; at the phone's own 1080p or 4K it is not, which is why
 * every picker transcodes.
 */
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_DURATION_MS = MAX_VIDEO_SECONDS * 1000;

export const PHOTO_TOO_LARGE_MESSAGE = `Photos must be under ${MAX_UPLOAD_MB} MB.`;
export const VIDEO_TOO_LARGE_MESSAGE = `Videos must be under ${MAX_UPLOAD_MB} MB. Trim it and try again.`;
export const PHOTO_KIND_MESSAGE = 'Brazos can upload JPEG, PNG or WebP photos only. Choose another photo.';
/** The sentence rejectionForPickedVideo already shows for a format it refuses (kept word for word). */
export const VIDEO_KIND_MESSAGE =
  'Please choose an MP4 or MOV video. Other formats can’t be played back reliably in the app.';
export const PHOTO_LOCATION_MESSAGE =
  'Brazos could not remove this photo’s location, so it was not uploaded. Try another photo.';
export const VIDEO_LOCATION_MESSAGE =
  'Brazos could not remove this video’s location, so it was not uploaded. Try another video.';
export const UPLOAD_UNFINISHED_MESSAGE = 'The upload did not finish. Check your connection and try again.';
/** T1: what deleteJobPhoto returns when nothing was removed (logged by its callers, never shown today). */
export const DELETE_UNFINISHED_MESSAGE = 'Brazos could not remove that file. Try again.';

/**
 * A refusal Brazos made itself, before a byte left the phone. Its message IS
 * the sentence to show, so a screen that still passes the error through
 * userMessage() shows the same words (each one passes its isSafeToShow).
 */
export class UploadRefused extends Error {
  constructor(sentence: string) {
    super(sentence);
    this.name = 'UploadRefused';
  }
}

/**
 * T3 — THE function from an upload error to its sentence. A refusal keeps its
 * own sentence; anything else (no connection, a server answer) is the one
 * calm "did not finish" sentence, never the raw text.
 */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'UploadRefused') return error.message;
  return UPLOAD_UNFINISHED_MESSAGE;
}
