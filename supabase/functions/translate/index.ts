// ============================================================================
// Brazos · translate  (Supabase Edge Function, Deno)
//
//                     ****  D R A F T  ****
//                     ****  N O T   D E P L O Y E D  ****
//                     ****  S E C U R I T Y   R E V I E W   P E N D I N G  ****
//
// Written 2026-08-23 as design input. It has NEVER been deployed, no Azure
// resource has been created, and no key exists. Do not `supabase functions
// deploy translate` until the review below is signed off — this function
// spends money per character on behalf of any signed-in user, which is a
// category of endpoint this project has never shipped before.
//
//   Would-be deploy:  npx supabase functions deploy translate
//   Secrets needed:   AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION
//
// ---------------------------------------------------------------------------
// WHY THE KEY IS HERE AND NOT IN THE APP
// ---------------------------------------------------------------------------
// An API key shipped to a phone is a published API key: anyone can pull it out
// of the bundle and spend the account's money. Everything about HOW text is
// translated therefore lives server-side, and lib/translate.ts knows only the
// function's name. The same reasoning covers the character cap and the rate
// limit — a limit enforced in the app is a suggestion.
//
// ---------------------------------------------------------------------------
// WHY PLAIN fetch RATHER THAN supabase-js
// ---------------------------------------------------------------------------
// Same reason send-push gives: this talks to one external API and needs no
// database client, so staying dependency-free avoids import-map pinning and
// version drift.
//
// ---------------------------------------------------------------------------
// SECURITY REVIEW — OPEN ITEMS, none of them optional before deploy
// ---------------------------------------------------------------------------
// 1. AUTHENTICATION. This function relies on the platform's own JWT
//    verification, which Supabase applies by DEFAULT to every Edge Function
//    unless it is deployed with --no-verify-jwt. THAT FLAG MUST NEVER BE USED
//    HERE. The check below is a second line of defence and is deliberately
//    NOT the only one — it reads the header, it does not validate a signature,
//    and it must not be mistaken for validation.
//
// 2. RATE LIMITING IS NOT IMPLEMENTED, and this is the blocking item. The
//    character cap bounds ONE call; nothing here bounds a thousand calls a
//    minute from one account. Cost amplification is the realistic attack:
//    2,000 characters per call is cheap, and 2,000 characters per call
//    forever is not. Before deploy this needs a per-user budget the function
//    can actually check — a small table with a rolling window, or a bucket
//    keyed on the caller's id — and the decision about what happens when it is
//    exhausted (429 and a flat refusal, most likely; never a silent partial).
//
// 3. NO VENDOR TEXT CROSSES THIS BOUNDARY. Azure's error bodies can carry the
//    request, the region, and enough of the account's configuration to be
//    worth having; they are logged server-side and NEVER returned. The client
//    receives a status code and a fixed message. lib/translate.ts maps a
//    failure to one of four closed reasons and cannot render vendor prose even
//    if some arrived.
//
// 4. INPUT IS BOUNDED THREE WAYS — total characters, item count, and per-item
//    length — because one bound is not enough. A single 2,000-character
//    string, 2,000 one-character strings, and one 1,999-character string plus
//    a unicode bomb are three different shapes of the same abuse, and the
//    character count is measured in CODE POINTS rather than UTF-16 units so a
//    string of astral-plane characters cannot cost twice what it counts.
//
// 5. WHAT IS NOT LOGGED. Message text is the user's private correspondence.
//    Nothing here logs the texts, the translations, or the caller's id
//    alongside either. Failures log the status and the shape, never content.
// ============================================================================

const AZURE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate';
const AZURE_API_VERSION = '3.0';

/** Mirrored by lib/translate.ts, which pre-checks it to save a round trip.
 *  THIS is the authority. */
const CHAR_CAP = 2000;
/** A conversation is not unbounded. Fifty messages is a generous read of
 *  "translate this conversation" and a hard stop on a scripted caller. */
const MAX_ITEMS = 50;
/** No single message is a novel. */
const MAX_ITEM_CHARS = 1000;
/** Azure can hang; this endpoint must not hang with it. */
const UPSTREAM_TIMEOUT_MS = 10_000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

/** Code points, not UTF-16 units: '𝄞'.length is 2 and it is one character to
 *  the biller. Counting the cheap way lets astral text cost double its cap. */
function countChars(text: string): number {
  return [...text].length;
}

type TranslateBody = { texts?: unknown; target?: unknown };

/**
 * Validate the request body into a shape the rest of the function can trust.
 *
 * ALLOW-LIST, never block-list. Anything not positively recognised is a
 * rejection — the repo's standing rule for values that cross a boundary the
 * type system does not police.
 */
function parseBody(body: TranslateBody): { texts: string[]; target: string } | string {
  const { texts, target } = body;

  if (typeof target !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(target)) {
    return 'A valid target language is required.';
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    return 'Nothing to translate.';
  }
  if (texts.length > MAX_ITEMS) {
    return 'Too many messages in one request.';
  }

  const cleaned: string[] = [];
  let total = 0;
  for (const text of texts) {
    if (typeof text !== 'string') return 'Every item must be text.';
    const trimmed = text.trim();
    if (!trimmed) continue;
    const length = countChars(trimmed);
    if (length > MAX_ITEM_CHARS) return 'One of those messages is too long to translate.';
    total += length;
    if (total > CHAR_CAP) return 'That is too much text to translate at once.';
    cleaned.push(trimmed);
  }
  if (cleaned.length === 0) return 'Nothing to translate.';

  return { texts: cleaned, target };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return fail(405, 'Method not allowed.');

  // SECOND line of defence only — the platform's JWT verification is the
  // first, and this function must never be deployed with --no-verify-jwt.
  // Reading the header proves a token was SENT, not that it is valid.
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail(401, 'Sign in to translate.');

  const key = Deno.env.get('AZURE_TRANSLATOR_KEY');
  const region = Deno.env.get('AZURE_TRANSLATOR_REGION');
  if (!key || !region) {
    // The operator has not finished setup. Say so as a server fault, and say
    // nothing about WHICH secret is missing.
    console.error('[translate] missing AZURE_TRANSLATOR_KEY or AZURE_TRANSLATOR_REGION');
    return fail(503, 'Translation is not configured.');
  }

  let body: TranslateBody;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Malformed request.');
  }

  const parsed = parseBody(body);
  if (typeof parsed === 'string') return fail(400, parsed);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${AZURE_ENDPOINT}?api-version=${AZURE_API_VERSION}&to=${encodeURIComponent(parsed.target)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsed.texts.map((text) => ({ Text: text }))),
      }
    );
  } catch (error) {
    // An abort and a network failure are the same fact to a caller.
    console.error('[translate] upstream request failed', error instanceof Error ? error.name : 'unknown');
    return fail(502, 'Could not translate that.');
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    // STATUS AND SHAPE ONLY. Azure's body can carry the request, the region
    // and account configuration; it is never read back to the caller and it
    // is not logged either.
    console.error('[translate] upstream status', upstream.status);
    return fail(502, 'Could not translate that.');
  }

  let rows: unknown;
  try {
    rows = await upstream.json();
  } catch {
    console.error('[translate] upstream returned non-JSON');
    return fail(502, 'Could not translate that.');
  }

  if (!Array.isArray(rows) || rows.length !== parsed.texts.length) {
    console.error('[translate] upstream shape mismatch');
    return fail(502, 'Could not translate that.');
  }

  const items: { source: string; translated: string }[] = [];
  let detectedLanguage: string | null = null;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] as {
      detectedLanguage?: { language?: unknown };
      translations?: { text?: unknown }[];
    };
    const translated = row?.translations?.[0]?.text;
    if (typeof translated !== 'string') {
      console.error('[translate] upstream row missing a translation');
      return fail(502, 'Could not translate that.');
    }
    // The FIRST detection wins and is reported once: a conversation is
    // overwhelmingly in one language, and reporting a different one per
    // message would be noise rather than information.
    if (!detectedLanguage && typeof row?.detectedLanguage?.language === 'string') {
      detectedLanguage = row.detectedLanguage.language;
    }
    items.push({ source: parsed.texts[index], translated });
  }

  return new Response(JSON.stringify({ detectedLanguage, items }), { headers: JSON_HEADERS });
});
