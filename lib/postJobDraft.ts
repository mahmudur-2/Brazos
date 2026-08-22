import AsyncStorage from '@react-native-async-storage/async-storage';
import { alertAsync } from './dialog';
import type { JobCategory } from './jobs';

/**
 * A fresh (not editing, not hiring) post's in-progress fields, persisted so
 * the wizard survives an app kill (Phase 4 DoD). Deliberately holds only
 * plain, already-uploaded-URL data — nothing that references a local file
 * handle, which would not survive a process restart anyway. One slot: this
 * device only ever has one job draft in flight at a time, matching the
 * screen itself (there is exactly one PostJob route, not one per attempt).
 *
 * Lives in lib/ rather than inside PostJobScreen so My Jobs can surface the
 * draft (§H's Open grouping includes drafts) without duplicating the storage
 * key or the shape — MediaUploader-style single canonical implementation.
 */
/**
 * The pre-AUD-P1-07 slot: one device-global key, shared by every account that
 * ever signed in on the device. A draft holds the exact private service
 * address, so that sharing was a cross-account leak. The key is retired, not
 * migrated — the stored value's author is unknowable (it may belong to any
 * previous account), so moving it under the current user's key would BE the
 * leak. It is deleted on the first authenticated read instead.
 */
export const LEGACY_DRAFT_STORAGE_KEY = 'brazos:postJobDraft:v1';

/**
 * Namespaced, versioned, and scoped to one authenticated user — the same
 * arrangement (and reason) as setupStorageKey / modeStorageKey: two accounts
 * on one device must never see each other's draft.
 */
export function draftStorageKey(userId: string): string {
  return `brazos.postJobDraft.v2.${userId}`;
}

export type PostJobDraft = {
  title: string;
  description: string;
  category: JobCategory | null;
  location: string;
  coords: { lat: number; lng: number } | null;
  /** Editable MIN/MAX budget range (screen 15), as typed dollar strings. */
  budgetMin: string;
  budgetMax: string;
  /** Exact service address (private — job_private_details on publish). */
  address: string;
  /** YYYY-MM-DD, or null for "flexible". */
  scheduledDate: string | null;
  arrivalStartHour: number | null;
  arrivalEndHour: number | null;
  photos: string[];
  videos: string[];
  step: number;
  /**
   * Whether this draft's "Jobs with a photo get more bids." nudge was
   * dismissed (4D-3 §3.4). Lives on the draft — not a global preference — so
   * dismissal dies with the draft and the next fresh post nudges again.
   */
  photoNudgeDismissed: boolean;
};

/** The pre-phase49 draft shape stored a single `budget` string. */
type StoredDraft = Partial<PostJobDraft> & { budget?: string };

export async function loadPostJobDraft(userId: string): Promise<PostJobDraft | null> {
  // Retire the legacy device-global slot on the first authenticated read.
  // Deleted, never migrated: its author may be a previous account on this
  // device, and adopting it would hand that account's draft — including the
  // exact private service address — to whoever signed in next (AUD-P1-07).
  try {
    await AsyncStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
  } catch {
    // Best-effort: an unremovable legacy value must not block this user's
    // own draft from loading.
  }
  try {
    const raw = await AsyncStorage.getItem(draftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return {
      title: parsed.title ?? '',
      description: parsed.description ?? '',
      category: parsed.category ?? null,
      location: parsed.location ?? '',
      coords: parsed.coords ?? null,
      budgetMin: parsed.budgetMin ?? '',
      // A draft saved before the range fields existed folds its single budget
      // into the ceiling — the same slot the server mirrors a range into.
      budgetMax: parsed.budgetMax ?? parsed.budget ?? '',
      address: parsed.address ?? '',
      scheduledDate: parsed.scheduledDate ?? null,
      arrivalStartHour: parsed.arrivalStartHour ?? null,
      arrivalEndHour: parsed.arrivalEndHour ?? null,
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      // Pre-4D-3 drafts have no flag; an undismissed nudge is the safe read.
      photoNudgeDismissed: parsed.photoNudgeDismissed === true,
    };
  } catch {
    // A corrupt or unreadable draft is treated as "no draft" rather than a
    // crash — the wizard just starts blank, same as if none existed.
    return null;
  }
}

/**
 * True while a draft-save failure streak has already been announced. The
 * autosave fires on every field change, so the warning shows ONCE per streak
 * — a later successful save re-arms it — instead of an alert per keystroke.
 */
let draftSaveFailureAnnounced = false;

export async function savePostJobDraft(userId: string, draft: PostJobDraft): Promise<void> {
  const write = () => AsyncStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
  try {
    await write();
    draftSaveFailureAnnounced = false;
  } catch {
    // One retry (F-042) — storage writes fail transiently under pressure.
    try {
      await write();
      draftSaveFailureAnnounced = false;
    } catch (e) {
      console.error('[postJobDraft] failed to persist draft', e);
      // The user is typing work this device is silently NOT keeping — that
      // must surface, once per streak, so they can finish or copy it out.
      if (!draftSaveFailureAnnounced) {
        draftSaveFailureAnnounced = true;
        await alertAsync(
          'Draft not saving',
          'Your draft could not be saved on this device, so it may be lost if the app closes. Keep the app open until you finish posting.'
        );
      }
    }
  }
}

export async function clearPostJobDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftStorageKey(userId));
  } catch (e) {
    console.error('[postJobDraft] failed to clear draft', e);
  }
}

/**
 * Whether a stored draft holds anything a person would want back. Guards the
 * My Jobs draft card so an empty autosave (opened the wizard, typed nothing,
 * killed the app) doesn't render a "resume" card with nothing to resume.
 */
export function draftHasContent(draft: PostJobDraft): boolean {
  return !!(
    draft.title.trim() ||
    draft.description.trim() ||
    draft.category ||
    draft.photos.length > 0 ||
    draft.videos.length > 0
  );
}
