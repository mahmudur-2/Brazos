import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

/**
 * DOCUMENTS (phase77, S-6) — a document attachment on a message.
 *
 * The schema landed on 2026-08-24 and this run wired it. What is pinned here
 * is the half a later edit could plausibly undo while believing it was
 * simplifying:
 *
 *   1. A DOCUMENT IS PRIVATE-BUCKET MEDIA, exactly like a voice note. The
 *      upload returns a `storage://chat-documents/…` REFERENCE and never a
 *      URL, and display exchanges it for a short-lived signed URL. A public
 *      URL for a party-scoped bucket is the phase29 regression in a new
 *      bucket.
 *   2. THE PICKED FILENAME NEVER SHAPES THE PATH. Only its extension is read,
 *      through an allow-list.
 *   3. THE PREVIEW ORDER. The document branch sits ahead of the audio branch,
 *      because one insert writes every attachment kind and whichever branch
 *      comes first decides what the inbox and a quote chip say.
 *   4. BOTH THREAD KINDS. phase77's policies take a job id OR a direct thread
 *      id in folder one, which is one branch more than chat-photos/chat-audio
 *      carry — so the composer's Document row is NOT behind allowAttachments.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// ---------------------------------------------------------------------------
// lib/storage.ts EXECUTED against a recording stub of the supabase storage
// client. A test process has no credentials and must reach no bucket, so the
// live exchange cannot be performed — the continue-path this run took is to
// assert the REFERENCE SHAPE and the CALL ARGUMENTS instead, which is where
// every property above actually lives. `fetch` is stubbed too: the uploader
// reads the local file through it.
// ---------------------------------------------------------------------------
const storageModule = async (signedUrlFor) => {
  const calls = { uploads: [], signed: [] };
  const js = stripTypeScriptTypes(await read('lib/storage.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{ supabase \} from '\.\/supabase';/,
      `const supabase = { storage: { from: (bucket) => ({
         upload: async (path, body, options) => {
           globalThis.__calls.uploads.push({ bucket, path, body, options });
           return { error: null };
         },
         createSignedUrl: async (path, ttl) => {
           globalThis.__calls.signed.push({ bucket, path, ttl });
           return globalThis.__signed(bucket, path);
         },
         getPublicUrl: (path) => ({ data: { publicUrl: 'https://public.invalid/' + path } }),
         remove: async () => ({ error: null }),
       }) } };`
    )
    .replace(/import type \{ ImagePickerAsset \} from 'expo-image-picker';\n/, '');
  assert.match(stubbed, /const supabase = \{ storage:/, 'the supabase import must be stubbed');

  globalThis.__calls = calls;
  globalThis.__signed = signedUrlFor;
  return { mod: await import(toDataUrl(stubbed)), calls };
};

// The uploader reads the local file through fetch(). `node --test` runs each
// test FILE in its own process, so replacing it here is scoped to this file
// and reaches nothing else — and nothing in it may touch a network: a test
// process has no credentials and no bucket to reach.
globalThis.fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });

// lib/messages.ts executed for its pure helpers, the arrangement
// tests/messagingLock.test.mjs already uses.
const messagesModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/messages.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
    .replace(
      /import \{ resolveChatMediaUrl \} from '\.\/storage';/,
      'const resolveChatMediaUrl = async (_b, v) => v;'
    );
  return import(toDataUrl(stubbed));
})();

/** A Message with every field null but the ones a case is about. */
const message = (fields) => ({
  id: 'm1',
  job_id: null,
  direct_thread_id: null,
  sender_id: 'u1',
  content: '',
  image_url: null,
  audio_url: null,
  audio_duration_ms: null,
  document_url: null,
  document_name: null,
  document_size_bytes: null,
  reply_to_id: null,
  job_request_id: null,
  job_offer_id: null,
  request_event: null,
  request_amount_cents: null,
  unsent_at: null,
  created_at: '2026-08-25T12:00:00.000Z',
  ...fields,
});

// ---------------------------------------------------------------------------
// 1 — THE PATH SHAPE
// ---------------------------------------------------------------------------

test('[executed] a document uploads to <thread>/<uid>/<ts>.<ext> and returns a reference', async () => {
  const { mod, calls } = await storageModule(() => ({ data: null, error: new Error('no') }));

  const before = Date.now();
  const { url, error } = await mod.uploadChatDocument(
    'job-1111',
    'user-2222',
    'file:///var/cache/Quote%20final.pdf',
    'Quote final.pdf',
    'application/pdf'
  );
  const after = Date.now();

  assert.equal(error, null);
  assert.equal(calls.uploads.length, 1);
  const [upload] = calls.uploads;
  assert.equal(upload.bucket, 'chat-documents');
  assert.equal(upload.options.contentType, 'application/pdf');

  // <thread-id>/<uploader-uid>/<ts>.<ext> — the contract phase77's
  // chat_documents_insert_party authorises on. Folder two IS the uploader, or
  // the policy refuses the insert.
  const segments = upload.path.split('/');
  assert.equal(segments.length, 3, `path must be three segments, saw ${upload.path}`);
  assert.equal(segments[0], 'job-1111');
  assert.equal(segments[1], 'user-2222');
  const [stamp, ext] = segments[2].split('.');
  assert.equal(ext, 'pdf');
  const stampMs = Number(stamp);
  assert.ok(
    Number.isInteger(stampMs) && stampMs >= before && stampMs <= after,
    'the object name is a millisecond timestamp'
  );

  // A REFERENCE, never a URL. Signing is display's job, and a stored signed
  // URL would expire inside the row.
  assert.equal(url, `storage://chat-documents/${upload.path}`);
  assert.doesNotMatch(url, /^https?:/);
});

test('[executed] a direct thread id is as valid a first segment as a job id', async () => {
  const { mod, calls } = await storageModule(() => ({ data: null, error: new Error('no') }));
  await mod.uploadChatDocument('thread-9999', 'user-2222', 'file:///a.docx', 'a.docx', null);
  assert.equal(calls.uploads[0].path.split('/')[0], 'thread-9999');
  // No mime type from the picker is not a reason to guess one.
  assert.equal(calls.uploads[0].options.contentType, 'application/octet-stream');
});

test('[executed] the picked filename never reaches the storage key', async () => {
  const { mod, calls } = await storageModule(() => ({ data: null, error: new Error('no') }));

  // Each of these is a name a file manager can really produce. None of them
  // may add a segment, escape the folder, or land in the key at all.
  const hostile = [
    ['../../secrets/key.pem', 'pem'],
    ['a/b/c.txt', 'txt'],
    ['report.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['no-extension-at-all', 'bin'],
    ['.gitignore', 'bin'],
    ['deck.numbers', 'numbers'],
    [`long.${'x'.repeat(40)}`, 'bin'],
    ['weird.p df', 'bin'],
  ];

  for (const [name, expectedExt] of hostile) {
    calls.uploads.length = 0;
    await mod.uploadChatDocument('t', 'u', 'file:///tmp/opaque', name, null);
    const { path } = calls.uploads[0];
    assert.equal(path.split('/').length, 3, `${name} must not add a path segment`);
    assert.ok(!path.includes('..'), `${name} must not produce a traversal`);
    assert.equal(path.split('/')[2].split('.').slice(1).join('.'), expectedExt, `${name}`);
  }
});

// ---------------------------------------------------------------------------
// 2 — THE SIGNED-URL EXCHANGE
// ---------------------------------------------------------------------------

test('[executed] a storage://chat-documents/ reference is exchanged for a signed URL', async () => {
  const { mod, calls } = await storageModule((bucket, path) => ({
    data: { signedUrl: `https://signed.invalid/${bucket}/${path}?token=abc` },
    error: null,
  }));

  const signed = await mod.resolveChatMediaUrl(
    'chat-documents',
    'storage://chat-documents/job-1/user-2/1756000000000.pdf'
  );

  assert.equal(calls.signed.length, 1);
  assert.equal(calls.signed[0].bucket, 'chat-documents');
  // The PATH is handed over, with the scheme and bucket prefix stripped.
  assert.equal(calls.signed[0].path, 'job-1/user-2/1756000000000.pdf');
  assert.ok(calls.signed[0].ttl > 0, 'a signed URL must be time-bounded');
  assert.equal(signed, 'https://signed.invalid/chat-documents/job-1/user-2/1756000000000.pdf?token=abc');
});

test('[executed] a failed signing of a private reference resolves to null, never the raw value', async () => {
  const { mod } = await storageModule(() => ({ data: null, error: new Error('denied') }));
  // There is no public URL behind a storage:// reference, so handing the
  // reference back would put an unloadable string into an <Image>/href.
  assert.equal(
    await mod.resolveChatMediaUrl(
      'chat-documents',
      'storage://chat-documents/job-1/user-2/1.pdf'
    ),
    null
  );
  assert.equal(await mod.resolveChatMediaUrl('chat-documents', null), null);
});

test('[static] the bucket union names chat-documents, and the reference is built once', async () => {
  const raw = await read('lib/storage.ts');
  const storage = stripComments(raw);
  assert.match(
    flatten(storage),
    /bucket: 'chat-photos' \| 'chat-audio' \| 'chat-documents',/,
    'resolveChatMediaUrl must accept the new bucket'
  );
  assert.match(storage, /const CHAT_DOCUMENT_BUCKET = 'chat-documents';/);
  // storageReference()/pathFromStorageValue() stay the one pair that knows the
  // scheme — a second literal is how the audio and document paths drift apart.
  //
  // Counted on the RAW source on purpose: this repo's stripComments() treats
  // `//` as a line comment, so it eats the scheme out of the literal it is
  // meant to be counting and every count would read zero.
  assert.equal(
    (raw.match(/'storage:\/\/'/g) ?? []).length,
    1,
    'the storage:// prefix is declared exactly once'
  );
  assert.match(storage, /return \{ url: storageReference\(CHAT_DOCUMENT_BUCKET, path\), error: null \};/);
});

// ---------------------------------------------------------------------------
// 3 — THE PREVIEW ORDER
// ---------------------------------------------------------------------------

test('[executed] messagePreviewText names a document, ahead of the audio branch', async () => {
  const { messagePreviewText } = await messagesModule;

  assert.equal(
    messagePreviewText(message({ document_url: 'storage://chat-documents/a', document_name: 'Invoice.pdf' })),
    'Invoice.pdf'
  );
  // Named, or the generic word — never the empty ellipsis a nameless row
  // would otherwise fall through to.
  assert.equal(
    messagePreviewText(message({ document_url: 'storage://chat-documents/a', document_name: null })),
    'Document'
  );

  // AHEAD OF AUDIO. One insert writes every attachment kind, so a row can
  // carry both; the document is the more specific fact because it has a name.
  assert.equal(
    messagePreviewText(
      message({
        document_url: 'storage://chat-documents/a',
        document_name: 'Invoice.pdf',
        audio_url: 'storage://chat-audio/b',
      })
    ),
    'Invoice.pdf'
  );

  // BEHIND unsent_at and job_request_id, which both still win outright.
  assert.equal(
    messagePreviewText(
      message({ document_url: 'storage://chat-documents/a', document_name: 'x.pdf', unsent_at: '2026-08-25T00:00:00Z' })
    ),
    'This message was unsent'
  );
  assert.equal(
    messagePreviewText(
      message({ document_url: 'storage://chat-documents/a', document_name: 'x.pdf', job_request_id: 'r1' })
    ),
    'Job request'
  );

  // And nothing above changed for the kinds that already worked.
  assert.equal(messagePreviewText(message({ audio_url: 'storage://chat-audio/b' })), 'Voice message');
  assert.equal(messagePreviewText(message({ image_url: 'storage://chat-photos/c' })), 'Photo');
  assert.equal(messagePreviewText(message({ content: 'hello' })), 'hello');
  assert.equal(messagePreviewText(message({})), '…');
});

test('[static] the source order matches the executed order', async () => {
  const messages = stripComments(await read('lib/messages.ts'));
  const at = (needle) => {
    const index = messages.indexOf(needle, messages.indexOf('export function messagePreviewText'));
    assert.ok(index > -1, `messagePreviewText must branch on ${needle}`);
    return index;
  };
  assert.ok(at('message.unsent_at') < at('message.job_request_id'));
  assert.ok(at('message.job_request_id') < at('message.document_url'));
  assert.ok(at('message.document_url') < at('message.audio_url'));
  assert.ok(at('message.audio_url') < at('message.image_url'));
});

// ---------------------------------------------------------------------------
// 4 — THE ROW, THE COLUMNS AND THE SIZE LABEL
// ---------------------------------------------------------------------------

test('[static] all three document columns are read, written and resolved', async () => {
  const messages = stripComments(await read('lib/messages.ts'));

  for (const column of ['document_url', 'document_name', 'document_size_bytes']) {
    assert.match(messages, new RegExp(`${column}: `), `the Message type must carry ${column}`);
    assert.ok(
      messages.includes(`, ${column},`) || messages.includes(`${column}, `),
      `MESSAGE_COLUMNS must select ${column}`
    );
  }
  // Selected AND inserted — a column read but never written ships an
  // attachment that vanishes on the next load.
  assert.match(messages, /document_url: input\.documentUrl \?\? null,/);
  assert.match(messages, /document_name: input\.documentName \?\? null,/);
  assert.match(messages, /document_size_bytes: input\.documentSizeBytes \?\? null,/);

  // Resolved through the SAME helper as the other two private kinds — the
  // reference is useless to a viewer until it is signed.
  assert.match(messages, /resolveChatMediaUrl\('chat-documents', message\.document_url\),/);
  assert.match(messages, /document_url: documentUrl,/);
});

test('[executed] the size label is honest about an unknown size', async () => {
  const { formatDocumentSize } = await messagesModule;

  assert.equal(formatDocumentSize(0), '0 B');
  assert.equal(formatDocumentSize(512), '512 B');
  assert.equal(formatDocumentSize(1024), '1.0 KB');
  assert.equal(formatDocumentSize(18 * 1024), '18 KB');
  assert.equal(formatDocumentSize(2.4 * 1024 * 1024), '2.4 MB');
  assert.equal(formatDocumentSize(247 * 1024 * 1024), '247 MB');
  assert.equal(formatDocumentSize(3 * 1024 * 1024 * 1024), '3.0 GB');

  // An absent size is an ABSENT LABEL, never "0 B" — the picker may not know,
  // and a bubble claiming an empty file is worse than one that says nothing.
  assert.equal(formatDocumentSize(null), '');
  assert.equal(formatDocumentSize(undefined), '');
  assert.equal(formatDocumentSize(-1), '');
  assert.equal(formatDocumentSize(Number.NaN), '');
});
