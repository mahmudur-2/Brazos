import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Phase 4 DoD: "draft persistence across app kill". Previously PostJobScreen's
// draft state was in-memory only (BUILD_STATE's named gap) — these assertions
// guard the AsyncStorage-backed replacement so it can't silently regress back
// to memory-only, and so the fresh-post-only + clear-on-publish/abandon rules
// stay intact.

test('a fresh post survives in AsyncStorage, editing and hiring never touch it', async () => {
  const source = codeOnly(await read('screens/PostJobScreen.tsx'));
  // The persistence itself moved to lib/postJobDraft.ts in Phase 4 so the
  // My Jobs hub can surface the same draft without duplicating the storage
  // key — the invariants are unchanged, just asserted against both files.
  const draftLib = codeOnly(await read('lib/postJobDraft.ts'));

  assert.match(draftLib, /from '@react-native-async-storage\/async-storage'/);
  assert.match(draftLib, /DRAFT_STORAGE_KEY = 'brazos:postJobDraft:v1'/);
  assert.match(source, /from '\.\.\/lib\/postJobDraft'/);

  // Fresh post only — never editing (reloads from the saved job) or hiring
  // (a single quick action with nothing worth resuming).
  assert.match(source, /const isFreshPost = !isEditing && !isHiring;/);

  // Restore is gated behind isFreshPost, and an explicit route seed (Home's
  // search box / category chips) wins over a stale draft rather than being
  // silently overridden by it.
  assert.match(source, /await loadPostJobDraft\(\)/);
  assert.match(
    source,
    /const hasRouteSeed = !!\(\s*params\?\.initialTitle \|\|\s*params\?\.initialDescription \|\|\s*params\?\.initialCategory\s*\)/
  );

  // Autosave only fires once restore has resolved, so it can never clobber a
  // draft it hasn't read yet with the screen's still-blank initial state.
  assert.match(source, /if \(!isFreshPost \|\| !draftReady\) return;/);
  assert.match(source, /void savePostJobDraft\(/);

  // Restored media is treated as owned by this session (nothing published
  // references it yet), so it is deletable on removal or re-abandonment the
  // same way a freshly-picked photo is.
  assert.match(source, /for \(const url of draft\.photos\) sessionUploadsRef\.current\.add\(url\);/);
  assert.match(source, /for \(const url of draft\.videos\) sessionUploadsRef\.current\.add\(url\);/);
});

test('the draft is cleared exactly on publish and on a graceful abandon, never on app kill', async () => {
  const source = codeOnly(await read('screens/PostJobScreen.tsx'));

  // Cleared after a successful fresh publish (stale record, nothing left to
  // resume) — inside the same `!isEditing` branch createJob's success path
  // already uses, so it can't fire for edit or (via the separate sendOffer
  // path) for a hire request.
  assert.match(
    source,
    /if \(!isEditing\) \{\s*maybePromptForPush\('Get told the moment a worker bids on your job\.'\);\s*if \(savedJob\) setPublishedJob\(savedJob\);\s*void clearPostJobDraft\(\);/
  );

  // Cleared on a graceful unmount (Back out of the wizard) in the same branch
  // that already deletes that session's uploaded media on abandonment — so a
  // later "Post a job" can never restore text pointing at photos that were
  // just deleted from storage.
  assert.match(
    source,
    /if \(!uploadsCommittedRef\.current && !submittingRef\.current\) \{\s*cleanupSessionUploads\(\);[\s\S]{0,400}if \(isFreshPost\) void clearPostJobDraft\(\);/
  );

  // The unmount cleanup this piggybacks on only ever runs on a real component
  // unmount — an app kill terminates the process first, so this file contains
  // no separate "on kill" handler. That absence is intentional, not a gap:
  // it's what leaves the persisted draft (and its media) in place to restore.
  assert.doesNotMatch(source, /AppState\.addEventListener\('change'/);
});
