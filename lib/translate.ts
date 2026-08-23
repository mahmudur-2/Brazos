import { supabase } from './supabase';
import {
  TRANSLATE_TIMEOUT_MS,
  parseTranslateResponse,
  prepareBatch,
  type TranslateResult,
} from './translateRules';

/**
 * The one call into the `translate` Edge Function.
 *
 * It knows the function's NAME and nothing else — no vendor SDK, no key, no
 * region, no endpoint on this side. That is the point: an API key that reaches
 * a phone is a published API key, and a per-user rate limit that lives in the
 * app is a suggestion. Everything about HOW text is translated is a server
 * concern, and the function that owns it is a DRAFT (see
 * supabase/functions/translate/index.ts) that has never been deployed.
 *
 * SO EVERY CALL FAILS TODAY, and this is built to fail the way an un-deployed
 * function actually fails rather than the way a bug does: the invoke returns
 * an error, `unavailable` comes back, and the sheet shows the one honest line.
 * The TRANSLATION flag keeps the entry points dark so nobody meets that path
 * by accident.
 *
 * The rules — the cap, the timeout, the parsing, the messages — live in
 * ./translateRules.ts, which loads nothing and is executed by the tests.
 */

export {
  TRANSLATE_CHAR_CAP,
  TRANSLATE_TIMEOUT_MS,
  deviceLanguage,
  translateFailureMessage,
} from './translateRules';
export type { TranslateResult, TranslatedItem, TranslateFailure } from './translateRules';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Translate one message, or a whole conversation's worth in ONE call.
 *
 * BATCHING IS THE POINT of taking an array: "Translate Conversation" is one
 * request with N strings, not N requests. It is cheaper, it is one round trip,
 * and — the part that matters — it is one rate-limit decision on the server
 * rather than N.
 *
 * `targetLanguage` is passed in rather than read here so this module stays a
 * thin seam over the invoke and the language rule stays testable.
 */
export async function translateTexts(
  texts: string[],
  targetLanguage: string
): Promise<TranslateResult> {
  const batch = prepareBatch(texts);
  if (!batch.ok) return batch;

  const response = await withTimeout(
    supabase.functions.invoke<unknown>('translate', {
      body: { texts: batch.texts, target: targetLanguage },
    }),
    TRANSLATE_TIMEOUT_MS
  );

  // A timeout and a transport failure are the same fact to a user: nothing
  // came back. An UN-DEPLOYED function lands here too, which is where every
  // call lands today.
  if (!response || response.error) return { ok: false, reason: 'unavailable' };

  return parseTranslateResponse(response.data);
}
