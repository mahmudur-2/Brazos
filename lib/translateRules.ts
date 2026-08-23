/**
 * Everything about translation that is a RULE rather than a request.
 *
 * Kept out of lib/translate.ts, which loads the Supabase client, so the tests
 * RUN these instead of reading them — the same pure-sibling arrangement
 * lib/audioMeter, lib/messageTicks and lib/motion120 use. The bounds here are
 * mirrors of the Edge Function's; THAT is the authority, and this is the copy
 * that saves a round trip on a request the server would refuse anyway.
 */

/** The per-call ceiling the function enforces, counted across the whole batch. */
export const TRANSLATE_CHAR_CAP = 2000;

/** How long a translation may take before the app stops waiting. A sheet that
 *  spins forever is worse than one that says it could not. */
export const TRANSLATE_TIMEOUT_MS = 12_000;

export type TranslatedItem = {
  /** The original, echoed back so a caller can pair results to inputs without
   *  trusting array order alone. */
  source: string;
  translated: string;
};

export type TranslateFailure = 'unavailable' | 'too-long' | 'empty' | 'failed';

export type TranslateResult =
  | {
      ok: true;
      /** BCP-47 as the SERVICE detected it, e.g. 'es'. Never guessed here. */
      detectedLanguage: string | null;
      items: TranslatedItem[];
    }
  | { ok: false; reason: TranslateFailure };

/**
 * The device's language as a bare BCP-47 primary subtag ('en', 'es', 'pt').
 *
 * Read from `Intl`, which Hermes ships on iOS and every browser has, rather
 * than from expo-localization — that would be a new dependency for one string,
 * and dependencies are what this run may not add. The region is dropped on
 * purpose: 'pt-BR' and 'pt-PT' are the same TARGET for a chat translation, and
 * asking a translator for a region it may not carry buys nothing.
 *
 * Falls back rather than throwing. A device that cannot answer is not a reason
 * to fail a translation someone asked for.
 */
export function deviceLanguage(fallback = 'en'): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.split('-')[0] || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Trim, drop the empties, and refuse a batch the server would refuse.
 *
 * THE CAP IS COUNTED ACROSS THE WHOLE BATCH, deliberately. Capping per item
 * would let a two-hundred-message conversation through one item at a time,
 * which is the same money spent and none of the bound.
 */
export function prepareBatch(
  texts: string[]
): { ok: true; texts: string[] } | { ok: false; reason: TranslateFailure } {
  const cleaned = texts.map((text) => text.trim()).filter((text) => text.length > 0);
  if (cleaned.length === 0) return { ok: false, reason: 'empty' };

  const total = cleaned.reduce((sum, text) => sum + text.length, 0);
  if (total > TRANSLATE_CHAR_CAP) return { ok: false, reason: 'too-long' };

  return { ok: true, texts: cleaned };
}

/**
 * Turn whatever came back into a result, or into a failure.
 *
 * SHAPE-CHECKED RATHER THAN CAST. This is data crossing a network boundary, so
 * a half-built response has to read as a failure — rendering `undefined` into
 * a bubble is the outcome a cast buys.
 */
export function parseTranslateResponse(data: unknown): TranslateResult {
  const payload = data as { detectedLanguage?: unknown; items?: unknown } | null | undefined;
  const rows = payload?.items;
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, reason: 'failed' };

  const items: TranslatedItem[] = [];
  for (const row of rows) {
    const item = row as { source?: unknown; translated?: unknown } | null;
    if (typeof item?.source !== 'string' || typeof item?.translated !== 'string') {
      return { ok: false, reason: 'failed' };
    }
    items.push({ source: item.source, translated: item.translated });
  }

  const detected = payload?.detectedLanguage;
  return {
    ok: true,
    detectedLanguage: typeof detected === 'string' && detected ? detected : null,
    items,
  };
}

/**
 * What a user is told when a translation does not arrive.
 *
 * No raw error text ever reaches a screen (the lib/errorMessage contract), and
 * none can: the reasons are a CLOSED SET, and nothing from the vendor, the
 * function, or the network crosses this boundary as prose.
 */
export function translateFailureMessage(reason: TranslateFailure): string {
  switch (reason) {
    case 'too-long':
      return 'That is too much text to translate at once. Try a shorter selection.';
    case 'empty':
      return 'There is nothing to translate here.';
    case 'unavailable':
      return 'Translation is not available right now.';
    case 'failed':
    default:
      return 'Could not translate that. Please try again.';
  }
}
