import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { profileUrl } from './appLinks';
import { Sentry } from './observability/sentry';

/**
 * Hands a photo to the OS share sheet.
 *
 * Why this downloads first: sharing a remote https URL only offers link
 * targets (Messages, Mail, copy). The "Save to Photos" / "Save to Files" /
 * AirDrop / WhatsApp-as-image entries only appear when the share item is an
 * actual local image file, so the photo is pulled into the cache directory
 * first and that file URI is what gets shared. Nothing app-specific is built
 * here — whichever targets the device has installed are what the user sees.
 *
 * expo-file-system 19's File/Directory API is used (not the legacy
 * FileSystem.downloadAsync, which throws at runtime in this version).
 */

/** Cache subdirectory for share staging, kept separate so it's easy to reason
 *  about — these files are disposable and the OS may evict them at any time. */
const SHARE_DIR_NAME = 'share-cache';

/** Derives a safe, extension-bearing filename from a remote photo URL. iOS uses
 *  the extension to infer the UTI, and without one the share sheet degrades to
 *  generic-file targets and drops "Save to Photos". */
function fileNameFor(url: string): string {
  let base = '';
  try {
    // Strip query/fragment — Supabase signed URLs carry tokens that aren't
    // part of the filename.
    base = new URL(url).pathname.split('/').pop() ?? '';
  } catch {
    base = url.split('?')[0].split('/').pop() ?? '';
  }

  base = sanitiseFileName(base);
  if (!/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(base)) {
    base = `${base || 'photo'}.jpg`;
  }
  // Guard against a pathological long name from a weird URL.
  return base.length > 80 ? base.slice(-80) : base;
}

/** The character rule fileNameFor applies to a URL's last segment. */
function sanitiseFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export type ShareResult = { ok: true } | { ok: false; message: string };

/**
 * Pulls a remote file into the share-cache directory and returns the LOCAL
 * uri to hand the sheet.
 */
async function stageForSharing(url: string, fileName: string): Promise<string> {
  const dir = new Directory(Paths.cache, SHARE_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });

  const destination = new File(dir, fileName);
  // Re-downloading over an existing staged copy would throw; drop it first
  // so sharing the same file twice in a session still works.
  if (destination.exists) destination.delete();

  const downloaded = await File.downloadFileAsync(url, destination);
  return downloaded.uri;
}

/**
 * Hands someone's public profile LINK to the OS share sheet.
 *
 * A link, not a file, so this is React Native's own `Share` rather than the
 * download-then-share dance sharePhoto needs: link targets are exactly what is
 * wanted here, and staging anything locally would be work for no extra target.
 *
 * The message carries the NAME as well as the URL. A bare URL in Messages is a
 * grey rectangle its recipient has to open to understand, and — until
 * PROFILE_WEB_BASE_URL is pointed at a real host — the name is the part of the
 * share that still works.
 *
 * NOTHING PRIVATE CROSSES THIS. The only user datum in the URL is the id the
 * public profile page is keyed on, and the only other datum is the display
 * name the profile already shows to anyone who can see it.
 */
export async function shareProfileLink(userId: string, name?: string | null): Promise<ShareResult> {
  const url = profileUrl(userId);
  const message = name ? `${name} on BRAZOS: ${url}` : url;

  try {
    await Share.share({ url, message });
    return { ok: true };
  } catch (err) {
    console.error('[sharing] profile share failed', err);
    Sentry?.captureException(err, { extra: { site: 'sharing.shareProfileLink', stage: 'native' } });
    return { ok: false, message: 'Could not share this profile.' };
  }
}

export async function sharePhoto(url: string): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      // Very old/limited devices: fall back to sharing the link itself. Fewer
      // targets, but better than nothing.
      await Share.share({ url, message: url });
      return { ok: true };
    }

    const uri = await stageForSharing(url, fileNameFor(url));

    await Sharing.shareAsync(uri, {
      mimeType: 'image/jpeg',
      // iOS-only; harmless elsewhere. Lets the sheet offer image-aware targets.
      UTI: 'public.image',
      dialogTitle: 'Share photo',
    });
    return { ok: true };
  } catch (err) {
    console.error('[sharing] share failed', err);
    Sentry?.captureException(err, { extra: { site: 'sharing.sharePhoto', stage: 'native' } });
    return {
      ok: false,
      // The device's own reason went to Sentry above; the alert reads a plain line.
      message: 'Could not share this photo. Try again.',
    };
  }
}
