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

/** The character rule and the length guard fileNameFor applies, on their own,
 *  so the document namer can reuse both without inheriting the photo
 *  extension coercion that sits between them. */
function sanitiseFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** True when `name` carries a real extension. A name with no dot at all
 *  reports itself as its own extension; that is not one — the same rule
 *  documentIconFor() applies in lib/messages.ts. */
function hasExtension(name: string): boolean {
  const extension = name.split('.').pop() ?? '';
  return !!extension && extension !== name;
}

/**
 * Derives the filename a DOCUMENT is staged under.
 *
 * THE NAME COMES FROM THE MESSAGE ROW, NOT FROM THE URL. Documents are stored
 * at `<threadId>/<uid>/<timestamp>.<ext>`, so the URL's last segment is a
 * timestamp — staging under it would show "1756089421.pdf" in the share sheet
 * and in whatever app received the file, instead of the name the sender chose.
 *
 * THE EXTENSION IS KEPT AS IT IS. fileNameFor() coerces to `.jpg` because a
 * photo whose UTI can't be inferred loses "Save to Photos"; a document has no
 * one such target, and rewriting a `.pptx` would hand Keynote a file it
 * refuses to open. Only when the stored name can't supply an extension does
 * this fall back to the URL's, and to `.bin` when the URL has none either —
 * some extension is required or iOS can infer no type at all.
 */
function documentFileNameFor(url: string, documentName?: string | null): string {
  const named = sanitiseFileName((documentName ?? '').trim());
  let base = hasExtension(named) ? named : '';

  if (!base) {
    let fromUrl = '';
    try {
      // Strip query/fragment — Supabase signed URLs carry tokens that aren't
      // part of the filename.
      fromUrl = new URL(url).pathname.split('/').pop() ?? '';
    } catch {
      fromUrl = url.split('?')[0].split('/').pop() ?? '';
    }
    fromUrl = sanitiseFileName(fromUrl);
    const extension = hasExtension(fromUrl) ? fromUrl.split('.').pop()! : 'bin';
    base = `${named || 'document'}.${extension}`;
  }

  // The same guard fileNameFor uses, and it keeps the TAIL for the same
  // reason: the extension is the end of the string.
  return base.length > 80 ? base.slice(-80) : base;
}

export type ShareResult = { ok: true } | { ok: false; message: string };

/**
 * Pulls a remote file into the share-cache directory and returns the LOCAL
 * uri to hand the sheet.
 *
 * Extracted so the photo and document paths stage identically; they differ
 * only in the name they stage under, which is why that stays the caller's to
 * decide. sharePhoto's behaviour is unchanged by the extraction.
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

/**
 * Hands a document attachment to the OS, the way sharePhoto hands it a photo.
 *
 * WHY THIS IS NOT `Linking.openURL`. Opening the signed URL left the app and
 * handed Safari the link — putting the Supabase project ref in the address bar
 * and in the browser's history, and leaving the file in a browser tab rather
 * than in the OS. Downloading first and sharing the LOCAL FILE keeps the app
 * in the foreground, keeps the URL out of a browser entirely, and gives the
 * user Quick Look, Files, Mail and every app that claims the type — which a
 * link cannot offer.
 *
 * THE REMOTE URL NEVER LEAVES THIS FUNCTION on native. There is deliberately
 * no "share the link instead" fallback of the kind sharePhoto keeps for
 * devices without a share sheet: falling back to the link is the exact defect
 * this replaces, so an unavailable sheet is an honest failure instead.
 *
 * `fileName` is the stored `document_name`. See documentFileNameFor.
 */
export async function shareDocument(
  url: string,
  fileName?: string | null
): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, message: 'Opening files isn’t supported on this device.' };
    }

    const uri = await stageForSharing(url, documentFileNameFor(url, fileName));

    // NO mimeType AND NO UTI. iOS infers the type from the extension, which
    // documentFileNameFor preserves. A guessed MIME for an arbitrary document
    // is how a .numbers file ends up offering the wrong targets.
    //
    // Dismissing the sheet resolves normally rather than throwing, so a user
    // who changes their mind gets {ok: true} and sees nothing.
    await Sharing.shareAsync(uri, { dialogTitle: 'Open document' });
    return { ok: true };
  } catch (err) {
    console.error('[sharing] document share failed', err);
    Sentry?.captureException(err, { extra: { site: 'sharing.shareDocument', stage: 'native' } });
    return {
      ok: false,
      // The device's own reason went to Sentry above; the alert reads a plain line.
      message: 'Could not open this document. Try again.',
    };
  }
}
