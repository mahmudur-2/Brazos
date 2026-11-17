import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, read } from './loadModule.mjs';
import { PLACE, find, heic, jpegWithPlace, movieWithPlace, png } from './mediaFixtures.mjs';

/**
 * B10 / T1 / T3 and the upload half of R7 (A4-M3): what lib/storage.ts sends,
 * what it refuses before a byte leaves the phone, and the one sentence each
 * failure becomes.
 */

globalThis.__DEV__ = false;
const rules = await loadModule('lib/uploadRules.ts', {});
const media = await loadModule('lib/mediaMetadata.ts', {});
const { userMessage } = await loadModule('lib/errorMessage.ts', {});

function storageWorld({ uploadError = null, removeAnswer = (paths) => ({ data: paths.map((name) => ({ name })), error: null }) } = {}) {
  const world = { uploads: [], removes: [], files: new Map() };
  world.client = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body, options) => {
          world.uploads.push({ bucket, path, body: new Uint8Array(body), options });
          return { error: uploadError };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => {
          world.removes.push({ bucket, paths });
          return removeAnswer(paths);
        },
      }),
    },
  };
  globalThis.fetch = async (uri) => {
    if (!world.files.has(uri)) throw new TypeError('Network request failed');
    const bytes = world.files.get(uri);
    return { arrayBuffer: async () => bytes.slice().buffer };
  };
  return world;
}

async function storageFor(world) {
  return loadModule('lib/storage.ts', {
    './mediaMetadata': media,
    './supabase': { supabase: world.client },
    './uploadRules': rules,
  });
}

const SENTENCES = [
  'PHOTO_TOO_LARGE_MESSAGE',
  'VIDEO_TOO_LARGE_MESSAGE',
  'PHOTO_KIND_MESSAGE',
  'VIDEO_KIND_MESSAGE',
  'PHOTO_LOCATION_MESSAGE',
  'VIDEO_LOCATION_MESSAGE',
  'UPLOAD_UNFINISHED_MESSAGE',
  'DELETE_UNFINISHED_MESSAGE',
];

test('T3: the sentences, word for word; each one survives userMessage unchanged', () => {
  assert.equal(rules.MAX_UPLOAD_BYTES, 26214400);
  assert.equal(rules.MAX_UPLOAD_MB, 25);
  assert.equal(rules.MAX_VIDEO_DURATION_MS, 30000);
  assert.equal(rules.PHOTO_TOO_LARGE_MESSAGE, 'Photos must be under 25 MB.');
  assert.equal(rules.VIDEO_TOO_LARGE_MESSAGE, 'Videos must be under 25 MB. Trim it and try again.');
  assert.equal(rules.PHOTO_KIND_MESSAGE, 'Brazos can upload JPEG, PNG or WebP photos only. Choose another photo.');
  assert.equal(rules.PHOTO_LOCATION_MESSAGE, 'Brazos could not remove this photo’s location, so it was not uploaded. Try another photo.');
  assert.equal(rules.VIDEO_LOCATION_MESSAGE, 'Brazos could not remove this video’s location, so it was not uploaded. Try another video.');
  assert.equal(rules.UPLOAD_UNFINISHED_MESSAGE, 'The upload did not finish. Check your connection and try again.');
  for (const name of SENTENCES) {
    const sentence = rules[name];
    assert.equal(userMessage(new rules.UploadRefused(sentence), 'FALLBACK'), sentence, `${name} is shown as written`);
    assert.equal(rules.uploadErrorMessage(new rules.UploadRefused(sentence)), sentence);
  }
  // Anything that is not Brazos's own refusal becomes the one calm sentence, never the raw text.
  for (const error of [new TypeError('Network request failed'), { message: 'new row violates row-level security policy' }, null, 'x']) {
    assert.equal(rules.uploadErrorMessage(error), rules.UPLOAD_UNFINISHED_MESSAGE);
  }
});

test('B10: MAX_UPLOAD_BYTES is the bucket limit, and every content type the cleaner sends is one the buckets allow', () => {
  const sql = read('supabase/migrations/20261108010000_lean_v1_grants.sql');
  const insert = sql.slice(sql.indexOf('insert into storage.buckets'), sql.indexOf('on conflict (id) do update'));
  assert.match(insert, new RegExp(`select b\\.id, b\\.id, b\\.public, ${rules.MAX_UPLOAD_BYTES},`));
  assert.match(insert, /\('avatars', true\), \('job-photos', true\), \('chat-photos', false\)/);
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']) {
    assert.ok(insert.includes(`'${type}'`), `${type} is allowed by the buckets`);
  }
});

test('B10: a file over the bucket limit never reaches upload(); exactly the limit does', async () => {
  const world = storageWorld();
  const storage = await storageFor(world);
  const over = new Uint8Array(rules.MAX_UPLOAD_BYTES + 1);
  over.set([0xff, 0xd8, 0xff]);
  world.files.set('file:///big.jpg', over);
  world.files.set('file:///big.mp4', over);
  const photo = await storage.uploadJobPhoto('job1', { uri: 'file:///big.jpg' });
  assert.equal(rules.uploadErrorMessage(photo.error), 'Photos must be under 25 MB.');
  const video = await storage.uploadJobVideo('u1', { uri: 'file:///big.mp4', mimeType: 'video/mp4' });
  assert.equal(rules.uploadErrorMessage(video.error), 'Videos must be under 25 MB. Trim it and try again.');
  assert.equal(world.uploads.length, 0);

  // A picture of exactly 26214400 bytes: SOI, a scan header, zero data, EOI.
  const exact = new Uint8Array(rules.MAX_UPLOAD_BYTES);
  exact.set([0xff, 0xd8, 0xff, 0xda, 0, 2]);
  exact.set([0xff, 0xd9], exact.length - 2);
  world.files.set('file:///exact.jpg', exact);
  const fits = await storage.uploadJobPhoto('job1', { uri: 'file:///exact.jpg' });
  assert.equal(fits.error, null);
  assert.equal(world.uploads.length, 1);
});

test('R7-b: a photo is uploaded without its place, named and typed by its bytes, never by the picker', async () => {
  const world = storageWorld();
  const storage = await storageFor(world);
  world.files.set('file:///IMG_0001.HEIC', jpegWithPlace().bytes);
  const result = await storage.uploadJobAttachment('u1', { uri: 'file:///IMG_0001.HEIC', mimeType: 'image/heic' });
  assert.equal(result.error, null);
  const [sent] = world.uploads;
  assert.match(sent.path, /^postings\/u1\/\d+-[a-z0-9]+\.jpg$/);
  assert.equal(sent.options.contentType, 'image/jpeg');
  assert.equal(result.url, `https://x.supabase.co/storage/v1/object/public/job-photos/${sent.path}`);
  for (const word of [PLACE.xmpLatitude, PLACE.city, PLACE.comment]) assert.equal(find(sent.body, word), -1);
  assert.equal(media.photoFacts(sent.body).mayHoldPlace, false);

  world.files.set('file:///shot.png', png());
  await storage.uploadChatPhoto('job1', 'u1', { uri: 'file:///shot.png', mimeType: 'image/jpeg' });
  assert.equal(world.uploads[1].options.contentType, 'image/png');
  assert.match(world.uploads[1].path, /^job1\/u1\/\d+\.png$/);
});

test('R7-b: HEIC and an unreadable photo are refused with their sentences and never sent', async () => {
  const world = storageWorld();
  const storage = await storageFor(world);
  world.files.set('file:///a.heic', heic());
  const cut = jpegWithPlace().bytes;
  world.files.set('file:///b.jpg', cut.slice(0, cut.length - 300));
  const kind = await storage.uploadReviewPhoto('u1', { uri: 'file:///a.heic' });
  assert.equal(rules.uploadErrorMessage(kind.error), rules.PHOTO_KIND_MESSAGE);
  const unreadable = await storage.uploadAvatar('u1', { uri: 'file:///b.jpg' });
  assert.equal(rules.uploadErrorMessage(unreadable.error), rules.PHOTO_LOCATION_MESSAGE);
  assert.equal(world.uploads.length, 0);
});

test('R7-c: a clip is uploaded without its place; an unreadable one is refused', async () => {
  const world = storageWorld();
  const storage = await storageFor(world);
  world.files.set('file:///clip.mov', movieWithPlace().bytes);
  const result = await storage.uploadCompletionVideo('job1', { uri: 'file:///clip.mov' });
  assert.equal(result.error, null);
  const [sent] = world.uploads;
  assert.match(sent.path, /^job1\/completion\/\d+-[a-z0-9]+\.mov$/);
  assert.equal(sent.options.contentType, 'video/quicktime');
  assert.equal(find(sent.body, PLACE.iso6709), -1);

  const whole = movieWithPlace().bytes;
  world.files.set('file:///cut.mov', whole.slice(0, whole.length - 10));
  const cut = await storage.uploadJobVideo('u1', { uri: 'file:///cut.mov' });
  assert.equal(rules.uploadErrorMessage(cut.error), rules.VIDEO_LOCATION_MESSAGE);
  const m4v = await storage.uploadJobVideo('u1', { uri: 'file:///clip.m4v', mimeType: 'video/x-m4v' });
  assert.equal(rules.uploadErrorMessage(m4v.error), rules.VIDEO_KIND_MESSAGE);
  assert.equal(world.uploads.length, 1);
});

test('T3: a failed send or a server refusal becomes the one "did not finish" sentence', async () => {
  const world = storageWorld({ uploadError: { message: 'new row violates row-level security policy', statusCode: '403' } });
  const storage = await storageFor(world);
  world.files.set('file:///a.jpg', jpegWithPlace().bytes);
  const server = await storage.uploadJobPhoto('job1', { uri: 'file:///a.jpg' });
  assert.equal(rules.uploadErrorMessage(server.error), rules.UPLOAD_UNFINISHED_MESSAGE);
  const offline = await storage.uploadJobPhoto('job1', { uri: 'file:///missing.jpg' });
  assert.equal(rules.uploadErrorMessage(offline.error), rules.UPLOAD_UNFINISHED_MESSAGE);
});

test('B10: rejectionForPickedVideo never allows more than 30 s or 25 MB, whatever the caller passes', async () => {
  const storage = await storageFor(storageWorld());
  const wide = { maxDurationMs: 120_000, maxBytes: 100 * 1024 * 1024 };
  assert.deepEqual(storage.rejectionForPickedVideo({ uri: 'a.mp4', duration: 31_000, fileSize: 1 }, wide), {
    title: 'Video is too long',
    message: 'Videos must be under 30 seconds. Trim it and try again.',
  });
  assert.deepEqual(storage.rejectionForPickedVideo({ uri: 'a.mov', duration: 1_000, fileSize: 30 * 1024 * 1024 }, wide), {
    title: 'Video is too large',
    message: 'Videos must be under 25 MB. Trim it and try again.',
  });
  assert.deepEqual(storage.rejectionForPickedVideo({ uri: 'a.m4v', mimeType: 'video/x-m4v' }), {
    title: 'Unsupported video',
    message: rules.VIDEO_KIND_MESSAGE,
  });
  assert.equal(storage.rejectionForPickedVideo({ uri: 'a.mp4', duration: 30_000, fileSize: rules.MAX_UPLOAD_BYTES }), null);
  assert.equal(storage.rejectionForPickedVideo({ uri: 'a.mp4', duration: 30_001 }).title, 'Video is too long');
  // A tighter caller limit still applies.
  assert.equal(
    storage.rejectionForPickedVideo({ uri: 'a.mp4', duration: 1, fileSize: 11 * 1024 * 1024 }, { maxDurationMs: 30_000, maxBytes: 10 * 1024 * 1024 }).message,
    'Videos must be under 10 MB. Trim it and try again.'
  );
});

test('T1: deleteJobPhoto resolves storage:// references, and "nothing removed" is an error, not success', async () => {
  let answer = (paths) => ({ data: paths.map((name) => ({ name })), error: null });
  const world = storageWorld({ removeAnswer: (paths) => answer(paths) });
  const storage = await storageFor(world);

  assert.deepEqual(await storage.deleteJobPhoto('storage://job-photos/postings/u1/1.jpg'), { error: null });
  assert.deepEqual(world.removes[0], { bucket: 'job-photos', paths: ['postings/u1/1.jpg'] });
  assert.deepEqual(await storage.deleteJobPhoto('https://x.supabase.co/storage/v1/object/public/job-photos/job1/a.jpg'), { error: null });
  assert.deepEqual(world.removes[1].paths, ['job1/a.jpg']);

  const otherBucket = await storage.deleteJobPhoto('storage://chat-photos/job1/u1/1.jpg');
  assert.equal(otherBucket.error?.message, rules.DELETE_UNFINISHED_MESSAGE);
  assert.equal(world.removes.length, 2, 'nothing is sent for another bucket');

  answer = () => ({ data: [], error: null });
  const refused = await storage.deleteJobPhoto('storage://job-photos/postings/u1/2.jpg');
  assert.equal(refused.error?.message, rules.DELETE_UNFINISHED_MESSAGE, 'a policy refusal removes 0 objects');

  // A URL that was never one of this project's files is still "nothing to delete".
  assert.deepEqual(await storage.deleteJobPhoto('https://example.com/a.jpg'), { error: null });
});
