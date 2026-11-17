import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
import { draftStorageKey, LEGACY_DRAFT_STORAGE_KEY, setDraftWriter } from './postJobDraft';
import { unregisterPushToken } from './pushNotifications';
import { SHARE_DIR_NAME } from './sharing';
import { clearSignedUrls } from './storage';
import { supabase } from './supabase';

/**
 * R7-a and R7-d (A4-M2) — SIGN-OUT IS PROVEN, AND THE PHONE FORGETS.
 *
 * The order, and what a person sees when a step fails:
 *   1. endSession: detach this phone from push, bounded at
 *      LOGOUT_PUSH_UNREGISTER_MS. Failure: nothing is shown; the server token
 *      is reassigned at the next sign-in on this phone (register_push_token).
 *   2. supabase.auth.signOut(): the server ends the session and auth-js
 *      removes it from the keychain. lib/secureSessionStorageCore.ts reads
 *      every removed entry back, so a removal iOS only claimed throws.
 *   3. signOutLocally: when step 2 fails (no network, or the keychain kept a
 *      piece), the session is removed on this phone alone, proven the same
 *      way. Failure: the person stays signed in and sees 'Sign out failed'
 *      with SIGN_OUT_UNFINISHED_MESSAGE; they can try again.
 *   4. forgetDevice, run by AuthContext whenever the signed-in person changes
 *      (sign-out included) and at every launch: other people's job drafts,
 *      and, when the person changed, the photo caches. Failure: nothing is
 *      shown (no sentence promises a removal, choice 6); the next launch runs
 *      it again.
 */

/** A6: the most sign-out waits for this device to detach from push. */
export const LOGOUT_PUSH_UNREGISTER_MS = 5000;

/** What a person sees under 'Sign out failed' when the session could not be removed from this phone. */
export const SIGN_OUT_UNFINISHED_MESSAGE = 'Brazos could not finish signing you out on this phone. Try again.';

/** True only when a read of the stored session finds none (a failed read is no proof). */
async function sessionIsGone(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && data.session === null;
  } catch {
    return false;
  }
}

/**
 * Ends the session on this device without the network (B6). The public
 * `signOut({ scope: 'local' })` still posts to /logout and keeps the session
 * when that fails, so after it the client's own session removal (auth-js
 * `_removeSession`: clears the stored session, then emits SIGNED_OUT)
 * finishes the job. True only when the stored session is proven gone; false
 * when any removal failed, or a future auth-js lacks the method.
 */
export async function signOutLocally(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) return sessionIsGone();
  } catch {
    // Fall through to the device-only removal.
  }
  const auth = supabase.auth as unknown as { _removeSession?: () => Promise<void> };
  if (typeof auth._removeSession !== 'function') return false;
  try {
    await auth._removeSession();
  } catch {
    return false;
  }
  return sessionIsGone();
}

/** A person's sign-out (and the ban path's): steps 1 to 3 above. True when the session is proven gone. */
export async function endSession(): Promise<boolean> {
  // Detach this device BEFORE the session goes away — the update is RLS-scoped
  // to the signed-in user, so it would be rejected after sign-out.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    unregisterPushToken().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LOGOUT_PUSH_UNREGISTER_MS);
    }),
  ]);
  clearTimeout(timer);
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return sessionIsGone();
  } catch {
    // Fall through: end it on this device.
  }
  // FIX-RUN B6: sign-out never fails offline. auth-js keeps the session
  // whenever the logout request itself fails (only a 401/403/404 answer
  // clears it). They asked to leave THIS device: end it here.
  return signOutLocally();
}

/** R7-d: whose photo caches this phone holds ('' = nobody signed in). Only an id. */
export const DEVICE_OWNER_KEY = 'brazos.deviceOwner.v1';

/** Files the photo picker writes at the top of the cache folder when its own folder is not used. */
const PICKER_FILE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\.(jpe?g|png|heic|heif|webp|gif|tiff?|bmp|mov|mp4|m4v)$/i;

type ExpoImageCaches = { clearDiskCache: () => Promise<boolean>; clearMemoryCache: () => Promise<boolean> };

function expoImageCaches(): ExpoImageCaches | null {
  try {
    const vendor = require('expo-image') as { Image?: Partial<ExpoImageCaches> } | null;
    const image = vendor?.Image;
    return typeof image?.clearDiskCache === 'function' && typeof image.clearMemoryCache === 'function'
      ? (image as ExpoImageCaches)
      : null;
  } catch {
    return null;
  }
}

function deleteDirectory(dir: Directory): void {
  if (dir.exists) dir.delete();
  if (dir.exists) throw new Error(`${dir.uri} is still on this device`);
}

/**
 * R7-d — WHAT THE PHONE KEEPS. Every place that can hold another person's
 * data on this phone, and what happens to it:
 *   - job drafts (`brazos.postJobDraft.v2.<id>`, exact address) and the old
 *     shared draft key: every one but the signed-in person's is removed and
 *     read back, at every call.
 *   - when the signed-in person changed since the caches were last cleared
 *     (DEVICE_OWNER_KEY): the shared-photo copies (share-cache), the photo
 *     picker's copies (Caches/ImagePicker, and its files at the top of the
 *     cache folder), expo-image's disk and memory caches, and the signed
 *     photo links kept in memory (lib/storage.ts).
 * Kept on purpose: the push keys (needed to finish a push unregister), the
 * theme, the mode and setup flags and the legal-version cache (an id and
 * flags, no personal content). The query cache is emptied by App.tsx
 * QueryAuthBridge, the keychain session by sign-out itself.
 * True when every step is proven done; false when any failed (it runs again
 * at the next launch). Never throws.
 */
export async function forgetDevice(currentUserId: string | null): Promise<boolean> {
  // A4 wiring (A2): before the sweep, so no draft save that starts later writes another person's draft back.
  setDraftWriter(currentUserId);
  const draftsGone = await proven(async () => {
    const keep = currentUserId ? draftStorageKey(currentUserId) : null;
    const prefix = draftStorageKey('');
    const doomed = (await AsyncStorage.getAllKeys()).filter(
      (key) => key === LEGACY_DRAFT_STORAGE_KEY || (key.startsWith(prefix) && key !== keep)
    );
    if (doomed.length === 0) return;
    await AsyncStorage.multiRemove(doomed);
    const left = await AsyncStorage.multiGet(doomed);
    if (left.some(([, value]) => value !== null)) throw new Error('a job draft is still on this device');
  });

  const owner = currentUserId ?? '';
  const cachesOwner = await AsyncStorage.getItem(DEVICE_OWNER_KEY).catch(() => null);
  if (cachesOwner === owner) return draftsGone;

  clearSignedUrls();
  const steps = [
    await proven(() => deleteDirectory(new Directory(Paths.cache, SHARE_DIR_NAME))),
    await proven(() => deleteDirectory(new Directory(Paths.cache, 'ImagePicker'))),
    await proven(() => {
      for (const entry of new Directory(Paths.cache).list()) {
        if (!(entry instanceof Directory) && PICKER_FILE.test(entry.name)) {
          entry.delete();
          if (entry.exists) throw new Error(`${entry.name} is still on this device`);
        }
      }
    }),
    await proven(async () => {
      const caches = expoImageCaches();
      if (!caches) return;
      if (!(await caches.clearDiskCache()) || !(await caches.clearMemoryCache())) {
        throw new Error('the image cache was not cleared');
      }
    }),
  ];
  const cachesGone = steps.every(Boolean);
  // Recorded only when every cache step is proven, so a failure runs again next time.
  const recorded = cachesGone && (await proven(() => AsyncStorage.setItem(DEVICE_OWNER_KEY, owner)));
  return draftsGone && recorded;
}

/** One step: true when it finished, false when it threw. */
async function proven(work: () => unknown): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}
