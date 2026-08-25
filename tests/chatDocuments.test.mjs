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

test('[executed] the glyph is read off the filename, never off a mime type', async () => {
  const { documentIconFor } = await messagesModule;

  // A picked asset's mimeType is OPTIONAL and is not stored on the row at
  // all, so the name is the only thing that answers for a message loaded from
  // the database as well as for one just picked.
  assert.equal(documentIconFor('Quote.pdf'), 'document-text-outline');
  assert.equal(documentIconFor('notes.DOCX'), 'document-text-outline');
  assert.equal(documentIconFor('budget.xlsx'), 'grid-outline');
  assert.equal(documentIconFor('deck.key'), 'easel-outline');
  assert.equal(documentIconFor('site.heic'), 'image-outline');
  assert.equal(documentIconFor('walkthrough.mov'), 'film-outline');
  assert.equal(documentIconFor('bundle.zip'), 'archive-outline');

  // Unrecognised, unnamed and extension-less all take the generic glyph — it
  // is a hint about what is inside, never a claim, because the file is not
  // opened to draw its own bubble.
  assert.equal(documentIconFor('thing.qqq'), 'document-outline');
  assert.equal(documentIconFor('no-extension-at-all'), 'document-outline');
  assert.equal(documentIconFor(''), 'document-outline');
  assert.equal(documentIconFor(null), 'document-outline');
  assert.equal(documentIconFor(undefined), 'document-outline');
});

// ---------------------------------------------------------------------------
// 5 — THE BUBBLE DRAWS FROM METADATA, AND THE SCREEN OWNS THE DOWNLOAD
// ---------------------------------------------------------------------------

test('[static] the document bubble renders before anything is downloaded', async () => {
  const bubble = stripComments(await read('components/ChatBubble.tsx'));

  // Every one of the three facts on the row, and NOTHING that fetches.
  assert.match(bubble, /message\.document_url \? \(/, 'the branch keys off the reference');
  assert.match(bubble, /documentIconFor\(message\.document_name\)/);
  assert.match(bubble, /\{message\.document_name \|\| 'Document'\}/);
  assert.match(bubble, /formatDocumentSize\(message\.document_size_bytes\)/);

  // The bubble may not reach the network to paint itself. A document has no
  // thumbnail and no duration, which is exactly why the name and the size are
  // stored beside the reference.
  assert.doesNotMatch(bubble, /\bfetch\(/, 'the bubble must never fetch');
  assert.doesNotMatch(bubble, /resolveChatMediaUrl/, 'signing is not this component job');

  // ALONGSIDE the audio branch, not instead of it, and not restructured
  // around it: a message may carry either and the component still renders in
  // one pass.
  assert.ok(
    bubble.indexOf('message.audio_url ?') < bubble.indexOf('message.document_url ?'),
    'the document branch sits after the audio branch, matching its structure'
  );
  assert.ok(
    bubble.indexOf('message.document_url ?') < bubble.indexOf('message.content ?'),
    'and before the text branch, so a caption still reads under the file'
  );

  // Tapping is the ONLY thing that downloads, and an absent handler leaves a
  // bubble that renders and simply is not pressable rather than a dead tap.
  assert.match(bubble, /onPress=\{onPressDocument \? \(\) => onPressDocument\(message\) : undefined\}/);
  assert.match(bubble, /disabled=\{!onPressDocument\}/);
  // The long-press must still reach the sheet — the same forwarding the image
  // branch needs, for the same reason: this inner Pressable claims the touch.
  assert.match(
    bubble.slice(bubble.indexOf('message.document_url ?')),
    /onLongPress=\{onLongPress\}/
  );
  // 44pt by the DRAWN box.
  assert.match(bubble, /minHeight: 44,/);
});

test('[static] the document bubble takes every colour from the palette', async () => {
  const bubble = stripComments(await read('components/ChatBubble.tsx'));
  const documentStyles = bubble.slice(bubble.indexOf('  document: {'));
  assert.ok(documentStyles.length > 0, 'the document styles must exist');
  assert.equal(
    documentStyles.match(/#[0-9a-fA-F]{3,8}\b/),
    null,
    'no raw hex in the document bubble'
  );
  assert.equal(documentStyles.match(/\brgba?\(/), null, 'no raw rgb/rgba in the document bubble');
});

test('[static] the send path is the resolved target, either thread kind', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // THE ONE SEND PATH ON THIS SCREEN THAT DOES NOT REQUIRE A JOB. Photo and
  // voice both guard on `!sendJobId` because their buckets authorise on a job;
  // a document's does not.
  assert.match(chat, /const threadId = sendJobId \?\? sendDirectThreadId;/);
  assert.match(chat, /if \(!user \|\| !sendTarget \|\| !threadId\) return;/);
  assert.match(chat, /uploadChatDocument\(\s*threadId,/);
  // The other two are untouched and still job-only.
  assert.match(chat, /uploadChatAudio\(\s*sendJobId,/);
  assert.match(chat, /uploadChatPhoto\(\s*sendJobId,/);

  // The picker is the installed native one, and nothing about it enters
  // package.json from here.
  assert.match(chat, /import \* as DocumentPicker from 'expo-document-picker';/);
  assert.match(chat, /DocumentPicker\.getDocumentAsync\(\{/);
  assert.match(chat, /copyToCacheDirectory: true,/, 'the returned uri must be readable by fetch');
  assert.match(chat, /multiple: false,/, 'one attachment per message');

  // The three columns are all written — a name read but never stored is a
  // bubble that renders "Document" forever.
  assert.match(chat, /documentUrl: url,/);
  assert.match(chat, /documentName: asset\.name,/);
  // An absent size stays absent rather than becoming a zero the bubble labels.
  assert.match(chat, /documentSizeBytes: asset\.size \?\? null,/);

  // Both props are wired, or the flag would produce a dead row.
  assert.match(chat, /onPickDocument=\{pickDocument\}/);
  assert.match(chat, /onPressDocument=\{openDocument\}/);
  // Opening uses the already-signed URL; the bucket is never made public.
  assert.match(chat, /await Linking\.openURL\(url\);/);
  assert.match(chat, /Could not open document/, 'a refusal is said, not swallowed');
});

test('[static] DOCUMENTS is flipped, and its docblock records what shipped', async () => {
  const flags = await read('lib/featureFlags.ts');
  assert.match(flags, /export const DOCUMENTS = true as boolean;/);

  const block = flags.slice(
    flags.lastIndexOf('/**', flags.indexOf('export const DOCUMENTS')),
    flags.indexOf('export const DOCUMENTS')
  );
  // The table's own rule: a flipped flag still records what it waited on and
  // what closed it, because this file is where a later reader looks to find
  // out why it could be.
  assert.match(block, /WAITS ON: nothing since 2026-08-25\./);
  assert.match(block, /phase77/);
  assert.doesNotMatch(block, /documents have neither/, 'the stale dependency line must be gone');
  // The two facts a later run most needs from this block.
  assert.match(block, /BOTH THREAD KINDS/);
  assert.match(block, /unsend_message\(\)/, 'the honest residue is recorded, not hidden');

  // DELIVERED_TICKS is not touched by this run.
  assert.match(flags, /export const DELIVERED_TICKS = false as boolean;/);
});

// ---------------------------------------------------------------------------
// 6 — THE INBOX PREVIEW
// ---------------------------------------------------------------------------

test('[executed] an inbox row names the document, ahead of the voice branch', async () => {
  // conversationPreviewText lives in lib/conversations.ts, which imports the
  // supabase client — so it is loaded the same way lib/messages.ts is, with
  // that import stubbed and the re-export inlined. Nothing below touches it.
  const visibility = stripTypeScriptTypes(
    await read('lib/conversationVisibility.ts'),
    { mode: 'strip' }
  );
  const conversationsJs = stripTypeScriptTypes(await read('lib/conversations.ts'), { mode: 'strip' })
    .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
    .replace(/export \{[\s\S]*?\} from '\.\/conversationVisibility';/, visibility);
  const { conversationPreviewText } = await import(toDataUrl(conversationsJs));

  const row = (fields) => ({
    last_message_unsent_at: null,
    last_message_document_url: null,
    last_message_document_name: null,
    last_message_audio_url: null,
    last_message_image_url: null,
    last_message_content: '',
    ...fields,
  });

  assert.equal(
    conversationPreviewText(row({ last_message_document_url: 's', last_message_document_name: 'Invoice.pdf' })),
    'Invoice.pdf'
  );
  assert.equal(
    conversationPreviewText(row({ last_message_document_url: 's', last_message_document_name: null })),
    'Document'
  );
  // AHEAD OF VOICE, matching messagePreviewText() exactly — an inbox row
  // reading "Voice message" over a thread whose newest bubble is a PDF is the
  // drift the shared implementation exists to prevent.
  assert.equal(
    conversationPreviewText(
      row({ last_message_document_url: 's', last_message_document_name: 'a.pdf', last_message_audio_url: 'b' })
    ),
    'a.pdf'
  );
  // Reactions still prefix it, like every other kind.
  assert.equal(
    conversationPreviewText(
      row({ last_message_document_url: 's', last_message_document_name: 'a.pdf' }),
      ['\u{1F44D}']
    ),
    '\u{1F44D} a.pdf'
  );
  // Unsent still wins outright, and carries no reactions.
  assert.equal(
    conversationPreviewText(
      row({ last_message_document_url: 's', last_message_document_name: 'a.pdf', last_message_unsent_at: 'x' }),
      ['\u{1F44D}']
    ),
    'This message was unsent'
  );
  // Nothing above changed.
  assert.equal(conversationPreviewText(row({ last_message_audio_url: 'b' })), 'Voice message');
  assert.equal(conversationPreviewText(row({ last_message_image_url: 'c' })), 'Photo sent');
  assert.equal(conversationPreviewText(row({ last_message_content: 'hi' })), 'hi');
});

test('[static] both document columns ride the projection, and nowhere else changed', async () => {
  const conversations = stripComments(await read('lib/conversations.ts'));

  // The view carries both in BOTH union branches (phase77), so the type, the
  // projection and the Previewable pick all name both — projections.test.mjs
  // then proves the list and the type are the same set.
  for (const column of ['last_message_document_url', 'last_message_document_name']) {
    assert.match(conversations, new RegExp(`${column}: string \\| null;`), `the type carries ${column}`);
    assert.match(conversations, new RegExp(`, ${column},`), `the projection selects ${column}`);
    assert.match(conversations, new RegExp(`\\| '${column}'`), `Previewable picks ${column}`);
  }
  // Added exactly where last_message_audio_url is named and nowhere else: the
  // two travel together through the type, the projection and the pick.
  assert.equal(
    (conversations.match(/last_message_audio_url/g) ?? []).length,
    (conversations.match(/last_message_document_url/g) ?? []).length,
    'the document URL is named exactly as often as the audio URL'
  );
});

test('[static] the migration this run wired is the one that is applied', async () => {
  const sql = await read('supabase/phase77_conversation_features.sql');
  // The client contract, read back off the authority. A column renamed here
  // and not there is a runtime failure with no build-time signal, because
  // there are no generated database types in this repo.
  assert.match(sql, /add column if not exists document_url text,/);
  assert.match(sql, /add column if not exists document_name text,/);
  assert.match(sql, /add column if not exists document_size_bytes integer;/);
  assert.match(sql, /values \('chat-documents', 'chat-documents', false\)/);
  assert.match(sql, /m\.document_url as last_message_document_url,/);
  assert.match(sql, /m\.document_name as last_message_document_name,/);
});

// ---------------------------------------------------------------------------
// 8 — A DOCUMENT OPENS IN THE OS, NEVER IN SAFARI (device defect, 2026-08-25)
//
// Tapping a document bubble handed `Linking.openURL` the signed URL. That left
// the app, opened Safari, and put the Supabase project ref in the address bar
// and in the browser's history. shareDocument() replaces it with the download-
// then-share dance sharePhoto has always used, so the remote URL never reaches
// a browser and the file arrives in the OS.
//
// lib/sharing.ts EXECUTED against recording stubs. The properties that matter
// here are ARGUMENTS — which name the file is staged under, and what
// shareAsync is handed — so static regex would prove none of them.
// ---------------------------------------------------------------------------

const sharingCalls = () => ({ shareAsync: [], downloads: [], deleted: [], rnShare: [], dirs: [] });

const sharingModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/sharing.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{ Platform, Share \} from 'react-native';/,
      // Getters, not snapshots: `node --test` caches a data: module by URL, so
      // every case shares one instance and must read the knobs at call time.
      `const Platform = { get OS() { return globalThis.__platform; } };
       const Share = { share: async (a) => { globalThis.__calls.rnShare.push(a); } };`
    )
    .replace(
      /import \* as Sharing from 'expo-sharing';/,
      `const Sharing = {
         isAvailableAsync: async () => globalThis.__sheetAvailable,
         shareAsync: async (uri, options) => { globalThis.__calls.shareAsync.push({ uri, options }); },
       };`
    )
    .replace(
      /import \{ Directory, File, Paths \} from 'expo-file-system';/,
      `const Paths = { cache: 'file:///cache' };
       class Directory {
         constructor(base, name) { this.uri = base + '/' + name; this.exists = true; }
         create() { globalThis.__calls.dirs.push(this.uri); }
       }
       class File {
         constructor(dir, name) {
           this.name = name;
           this.uri = dir.uri + '/' + name;
           this.exists = globalThis.__staged.has(name);
         }
         delete() { globalThis.__calls.deleted.push(this.name); }
         static async downloadFileAsync(url, destination) {
           globalThis.__calls.downloads.push({ url, name: destination.name });
           if (globalThis.__downloadError) throw globalThis.__downloadError;
           return { uri: destination.uri };
         }
       }`
    )
    .replace(
      /import \{ profileUrl \} from '\.\/appLinks';/,
      `const profileUrl = (id) => 'https://brazos.invalid/profile/' + id;`
    );

  // If any import survived the stubbing the module would reach for a real
  // native package; fail loudly rather than importing one.
  assert.doesNotMatch(stubbed, /^\s*import /m, 'every import into lib/sharing.ts must be stubbed');
  return import(toDataUrl(stubbed));
})();

/** Runs one case against fresh recorders. `staged` names files already sitting
 *  in the share cache, which is what exercises the delete-before-redownload
 *  guard. */
const withSharing = async (
  run,
  { platform = 'ios', sheet = true, staged = [], downloadError = null } = {}
) => {
  const mod = await sharingModule;
  const calls = sharingCalls();
  globalThis.__calls = calls;
  globalThis.__platform = platform;
  globalThis.__sheetAvailable = sheet;
  globalThis.__staged = new Set(staged);
  globalThis.__downloadError = downloadError;
  const result = await run(mod);
  return { result, calls };
};

const SIGNED =
  'https://avkighs.invalid/storage/v1/object/sign/chat-documents/thread-1/u1/1756089421.pdf?token=abc';

test('[executed] the staged name is document_name, not the URL timestamp', async () => {
  const { result, calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'));

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.downloads.length, 1, 'exactly one download');
  // THE WHOLE POINT: what the share sheet and the receiving app show.
  assert.equal(calls.downloads[0].name, 'Kitchen_quote.pdf');
  assert.doesNotMatch(
    calls.downloads[0].name,
    /1756089421/,
    'the URL timestamp must not become the name'
  );
  // Sanitised the way fileNameFor sanitises a photo name — same character rule.
  assert.doesNotMatch(calls.downloads[0].name, /[^a-zA-Z0-9._-]/);
  // The signed URL is still what gets FETCHED; only the name differs.
  assert.equal(calls.downloads[0].url, SIGNED);
});

test('[executed] a non-image extension survives — a .pptx is not coerced to .jpg', async () => {
  for (const [name, expected] of [
    ['Deck.pptx', 'Deck.pptx'],
    ['Q3 budget.xlsx', 'Q3_budget.xlsx'],
    ['plans.numbers', 'plans.numbers'],
    ['report.final.docx', 'report.final.docx'],
    ['bundle.zip', 'bundle.zip'],
  ]) {
    const { calls } = await withSharing((m) => m.shareDocument(SIGNED, name));
    assert.equal(calls.downloads[0].name, expected, `${name} keeps its own extension`);
    assert.doesNotMatch(
      calls.downloads[0].name,
      /\.jpg$/,
      'the photo coercion must not reach a document'
    );
  }
});

test('[executed] a missing or extensionless name falls back to the URL, then to .bin', async () => {
  // Missing entirely -> the URL's own extension.
  for (const missing of [null, undefined, '', '   ']) {
    const { calls } = await withSharing((m) => m.shareDocument(SIGNED, missing));
    assert.equal(calls.downloads[0].name, 'document.pdf');
  }
  // Present but carrying no extension -> the name is kept, the URL lends one.
  const { calls: noExt } = await withSharing((m) => m.shareDocument(SIGNED, 'Scope of work'));
  assert.equal(noExt.downloads[0].name, 'Scope_of_work.pdf');

  // Neither has one -> .bin, because iOS can infer no type without an extension.
  const bare =
    'https://avkighs.invalid/storage/v1/object/sign/chat-documents/t/u/1756089421?token=abc';
  const { calls: none } = await withSharing((m) => m.shareDocument(bare, 'Scope of work'));
  assert.equal(none.downloads[0].name, 'Scope_of_work.bin');
  const { calls: neither } = await withSharing((m) => m.shareDocument(bare, null));
  assert.equal(neither.downloads[0].name, 'document.bin');
});

test('[executed] shareAsync is handed a LOCAL uri and never an https one', async () => {
  const { calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'));

  assert.equal(calls.shareAsync.length, 1);
  const { uri, options } = calls.shareAsync[0];
  // THE FENCE THE DEFECT NEEDED. A remote URL here is Safari again.
  assert.ok(uri.startsWith('file://'), `expected a file uri, got ${uri}`);
  assert.doesNotMatch(uri, /^https?:/);
  assert.doesNotMatch(uri, /avkighs/, 'the project ref must not reach the sheet');
  assert.match(uri, /\/share-cache\/Kitchen_quote\.pdf$/, 'staged in the existing share cache');

  // D3 — no guessed type. iOS reads the extension the name preserved.
  assert.equal('mimeType' in options, false, 'a guessed MIME offers the wrong targets');
  assert.equal('UTI' in options, false);
  assert.deepEqual(options, { dialogTitle: 'Open document' });

  // The remote URL reaches NOTHING that could open a browser.
  assert.equal(calls.rnShare.length, 0, 'the link is never handed to RN Share');
});

test('[executed] an already-staged copy is dropped before the re-download', async () => {
  const { calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'), {
    staged: ['Kitchen_quote.pdf'],
  });
  // Downloading over an existing file throws, so opening the same document
  // twice in one session depends on this.
  assert.deepEqual(calls.deleted, ['Kitchen_quote.pdf']);
  assert.equal(calls.downloads.length, 1);
});

test('[executed] a failed download is a message, never a silent dead bubble', async () => {
  const { result, calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'), {
    // What an expired signature looks like from here. This run surfaces it and
    // does not refresh the URL — no refresh mechanism exists.
    downloadError: new Error('Request failed with status 400'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Request failed with status 400');
  assert.equal(calls.shareAsync.length, 0, 'nothing is shared when nothing downloaded');
});

test('[executed] no share sheet is an honest failure, NOT a fallback to the link', async () => {
  const { result, calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'), {
    sheet: false,
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /device/i);
  // sharePhoto falls back to sharing the link here. A document may not:
  // handing the signed URL to Share is the defect this replaces.
  assert.equal(calls.rnShare.length, 0);
  assert.equal(calls.downloads.length, 0);
});

test('[executed] dismissing the sheet is a cancellation, and surfaces nothing', async () => {
  // iOS resolves shareAsync when the user dismisses rather than throwing, so
  // the stub's plain resolve IS the dismissal — the native counterpart of the
  // web AbortError case, and it must not read as a failure.
  const { result } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'));
  assert.deepEqual(result, { ok: true });
});

test('[executed] web gets the Web Share API, or an honest refusal — never a no-op', async () => {
  const { result, calls } = await withSharing((m) => m.shareDocument(SIGNED, 'Kitchen quote.pdf'), {
    platform: 'web',
  });
  // node exposes a `navigator` with no share(), which is the browser case that
  // has no Web Share API. expo-file-system's web build stubs downloading, so
  // there is nothing to stage and the user is told rather than left waiting.
  assert.equal(result.ok, false);
  assert.match(result.message, /browser/i);
  assert.equal(calls.downloads.length, 0);

  // And the present-API branch exists rather than being assumed.
  const source = stripComments(await read('lib/sharing.ts'));
  const documentBranch = source.slice(source.indexOf('export async function shareDocument'));
  assert.match(documentBranch, /if \(nav\?\.share\) \{\s*await nav\.share\(\{ url \}\);/);
  assert.match(
    documentBranch,
    /if \(err instanceof Error && err\.name === 'AbortError'\) return \{ ok: true \};/
  );
});

test('[executed] sharePhoto is untouched — still coerces to .jpg, still sends its UTI', async () => {
  const { result, calls } = await withSharing((m) =>
    m.sharePhoto(
      'https://avkighs.invalid/storage/v1/object/sign/chat-photos/t/u/1756089421?token=abc'
    )
  );

  assert.deepEqual(result, { ok: true });
  // The photo path's own rule, unchanged by the extraction of stageForSharing.
  assert.match(calls.downloads[0].name, /\.jpg$/);
  assert.equal(calls.shareAsync[0].options.mimeType, 'image/jpeg');
  assert.equal(calls.shareAsync[0].options.UTI, 'public.image');
  assert.equal(calls.shareAsync[0].options.dialogTitle, 'Share photo');
  // Including the link fallback a document deliberately does not get.
  const { calls: noSheet } = await withSharing(
    (m) => m.sharePhoto('https://avkighs.invalid/p/1.jpg'),
    { sheet: false }
  );
  assert.equal(noSheet.rnShare.length, 1, 'sharePhoto keeps its link fallback');
});

test('[static] both share paths stage through ONE helper, and it is not duplicated', async () => {
  const sharing = stripComments(await read('lib/sharing.ts'));
  assert.equal(
    (sharing.match(/File\.downloadFileAsync\(/g) ?? []).length,
    1,
    'one download implementation, shared'
  );
  assert.equal((sharing.match(/new Directory\(Paths\.cache, SHARE_DIR_NAME\)/g) ?? []).length, 1);
  assert.match(
    sharing,
    /async function stageForSharing\(url: string, fileName: string\): Promise<string>/
  );
  // The sanitising character rule is one definition too — the document namer
  // reuses fileNameFor's rather than carrying a second copy that could drift.
  assert.equal(
    (sharing.match(/\[\^a-zA-Z0-9\._-\]/g) ?? []).length,
    1,
    'one character rule, shared by both namers'
  );
});
