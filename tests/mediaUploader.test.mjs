import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Phase 4 DoD: "failed media upload preserves prior state" — Phase 1's one
// deferred primitive (BRAZOS_MASTER_PLAN.md §I, deferred to Phase 4 by name).
// These are source-level guards on the actual failure-safety invariant, not
// a rendering test: `items` may only grow by appending a URL a real upload
// already returned, so there is never a frame where a failed attempt can
// clobber media a previous, successful attempt already added.

test('MediaUploader only ever appends a URL a real upload returned', async () => {
  const source = codeOnly(await read('ui/primitives/MediaUploader.tsx'));

  // The upload call happens before any state mutation...
  const uploadIndex = source.indexOf('const { url, error } = await onUpload(asset);');
  const errorGuardIndex = source.indexOf('if (error || !url) {');
  const appendIndex = source.indexOf('onItemsChange([...items, url]);');
  assert.ok(uploadIndex > -1, 'upload call must exist');
  assert.ok(errorGuardIndex > uploadIndex, 'the error guard must come after the upload call');
  assert.ok(appendIndex > errorGuardIndex, 'appending must come after the error guard, not before it');

  // ...and a failed/errored upload returns without touching `items` at all —
  // no optimistic add, no rollback, nothing to clobber.
  assert.match(
    source,
    /if \(error \|\| !url\) \{\s*onUploadError\?\.\(error\?\.message \?\? 'Upload failed\. Please try again\.'\);\s*return;\s*\}/
  );

  // Removal is exclusively user-initiated (the "x" on a tile) — never
  // triggered as a side effect of an upload outcome.
  assert.doesNotMatch(source, /onUpload[\s\S]{0,120}onItemsChange\(items\.filter/);

  // A pending pick/upload is validated before any byte is sent, same pattern
  // as the existing job-photo/video pickers in lib/storage.ts.
  assert.match(source, /const rejection = validate\?\.\(asset\);/);
});

test('MediaUploader is exported from the primitives barrel, no longer deferred', async () => {
  const [index, catalog] = await Promise.all([
    read('ui/primitives/index.ts'),
    read('dev-tools/ComponentCatalog.tsx'),
  ]);

  assert.match(index, /export \{ MediaUploader \} from '\.\/MediaUploader';/);
  // The Phase 1 DEFERRED block's MediaUploader entry is gone now that it's
  // built — its bullet point must not still claim otherwise.
  assert.doesNotMatch(index, /MediaUploader\s+Phase 4, which lists it explicitly/);

  assert.match(catalog, /MediaUploader,/);
  assert.match(catalog, /<Section title="MediaUploader">/);
});
