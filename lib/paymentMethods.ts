/**
 * 2026-09-30 (the build run, idea 20) — THE SAVED CARD for one-tap hiring. The card itself lives at the
 * payment provider, on the customer the app already keeps there (create-payment's); Brazos never sees
 * its number. The customer opts in — "Save this card for one-tap hiring", off by default — at
 * Checkout, or adds one in Payment methods, and removes it there. These are the three calls the
 * payment-methods edge function answers for the signed-in user; `cardLabel` is the one way the app
 * names a card.
 */
import { supabase } from './supabase';
import { userMessage } from './errorMessage';

export type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
};

export type CardSetupSession = {
  customerId: string;
  setupIntentClientSecret: string;
  ephemeralKeySecret: string;
};

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  jcb: 'JCB',
  diners: 'Diners Club',
  unionpay: 'UnionPay',
};

/** "Visa ···· 4242". */
export function cardLabel(card: Pick<SavedCard, 'brand' | 'last4'>): string {
  const key = card.brand.toLowerCase();
  const brand = BRANDS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Card');
  return `${brand} ···· ${card.last4}`;
}

function cardsFrom(raw: unknown): SavedCard[] {
  const list = (raw as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter((c) => typeof c.id === 'string' && typeof c.brand === 'string' && /^\d{4}$/.test(String(c.last4 ?? '')))
    .map((c) => ({
      id: c.id as string,
      brand: c.brand as string,
      last4: String(c.last4),
      expMonth: Number.isInteger(c.expMonth) ? (c.expMonth as number) : null,
      expYear: Number.isInteger(c.expYear) ? (c.expYear as number) : null,
    }));
}

/**
 * The function's own sentence, from a non-2xx body ({ error }), when there is one. A4 wiring (P2,
 * G3-2): only a sentence written for people (a capital first, a full stop last) counts; the shared
 * refusal of an unconfigured function ("not configured") is engine text and gives the fallback.
 */
async function sentenceOf(error: unknown): Promise<string | null> {
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : null;
  const text = context && typeof context === 'object' ? (context as { text?: unknown }).text : null;
  if (typeof text !== 'function') return null;
  try {
    const parsed = JSON.parse(await (text as () => Promise<string>).call(context)) as { error?: unknown };
    return typeof parsed.error === 'string' && /^[A-Z].*[.!?]$/s.test(parsed.error) ? parsed.error : null;
  } catch {
    return null;
  }
}

/** The HTTP status of a non-2xx answer (the error's context is the Response), when there is one. */
function statusOf(error: unknown): number | null {
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : null;
  const status = context && typeof context === 'object' ? (context as { status?: unknown }).status : null;
  return typeof status === 'number' ? status : null;
}

async function invoke(
  body: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string; status: number | null } | null }> {
  const fallback = 'Could not reach your cards right now.';
  try {
    const { data, error } = await supabase.functions.invoke('payment-methods', { body });
    if (error) return { data: null, error: { message: userMessage(await sentenceOf(error), fallback), status: statusOf(error) } };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: userMessage(err instanceof Error ? err.message : null, fallback), status: null } };
  }
}

/** The caller's saved cards, most recent first. */
export async function listSavedCards(): Promise<{ data: SavedCard[]; error: { message: string } | null }> {
  const { data, error } = await invoke({ action: 'list' });
  return { data: error ? [] : cardsFrom(data), error };
}

/** Detaches one of the caller's own cards from the provider's customer. */
export async function removeSavedCard(paymentMethodId: string): Promise<{ error: { message: string } | null }> {
  const { error } = await invoke({ action: 'remove', paymentMethodId });
  return { error };
}

/** A4 wiring (P2): list-and-remove rounds before an account deletion gives up (five cards a round). */
export const MAX_CARD_ROUNDS = 10;

export type CardSweepFailure =
  /** The list failed or could not be read: whether a card is left is unknown. */
  | { kind: 'list'; message: string }
  /** A remove failed for a reason other than "already gone". */
  | { kind: 'remove'; message: string }
  /** Cards were still listed after MAX_CARD_ROUNDS rounds. */
  | { kind: 'rounds' };

/**
 * A4 wiring (P2): before an account on the card path is deleted, every saved card leaves the
 * provider, and only an empty list proves it. A round lists the caller's cards (the function lists
 * at most five, and never creates a provider customer: no customer is `{ cards: [] }`) and removes
 * each one; the next round lists again. A remove answered 404 ("That card is not on your
 * account.") right after the fresh list means the card is already gone, so it is no failure. Any
 * other failure, a list that cannot be read, or cards still listed after MAX_CARD_ROUNDS rounds
 * returns a failure, and the caller deletes nothing. `removed` counts the cards this call really
 * removed (a 404 is not counted), so the caller can say the cards are gone when it keeps the account.
 */
export async function removeEverySavedCard(): Promise<{ error: CardSweepFailure | null; removed: number }> {
  let count = 0;
  for (let round = 0; round < MAX_CARD_ROUNDS; round += 1) {
    const listed = await invoke({ action: 'list' });
    if (listed.error) return { error: { kind: 'list', message: listed.error.message }, removed: count };
    const raw = (listed.data as { cards?: unknown } | null)?.cards;
    const ids = Array.isArray(raw) ? raw.map((c) => (c && typeof c === 'object' ? (c as { id?: unknown }).id : null)) : null;
    if (!ids || !ids.every((id): id is string => typeof id === 'string')) {
      return { error: { kind: 'list', message: 'Could not reach your cards right now.' }, removed: count };
    }
    if (ids.length === 0) return { error: null, removed: count };
    for (const id of ids) {
      const removed = await invoke({ action: 'remove', paymentMethodId: id });
      if (removed.error && removed.error.status !== 404) return { error: { kind: 'remove', message: removed.error.message }, removed: count };
      if (!removed.error) count += 1;
    }
  }
  return { error: { kind: 'rounds' }, removed: count };
}

/** A4 wiring (P2): what the delete screen says when the card step keeps the account. */
export function cardSweepMessage(failure: CardSweepFailure): string {
  if (failure.kind === 'list') {
    return `Brazos couldn’t check your saved cards, so your account was not deleted. ${failure.message}`;
  }
  if (failure.kind === 'remove') {
    return `A saved card couldn’t be removed from the payment provider, so your account was not deleted. ${failure.message}`;
  }
  return 'Some saved cards are still on your account, so it was not deleted.';
}

/**
 * B7 (R5): the one line the suspended screen shows after "Remove Saved Cards" (removeEverySavedCard:
 * list and remove only, both allowed for a suspended account). No account is deleted there, so the
 * line says only what happened to the cards.
 */
export function cardRemovalMessage(failure: CardSweepFailure | null): string {
  if (!failure) return 'Your saved cards are removed.';
  if (failure.kind === 'list') return `Brazos couldn’t check your saved cards. ${failure.message}`;
  if (failure.kind === 'remove') return `A saved card couldn’t be removed from the payment provider. ${failure.message}`;
  return 'Some saved cards are still on your account. Try again.';
}

/** The strings the provider's sheet needs to save a card for later — nothing is charged. */
export async function startCardSetup(): Promise<{ data: CardSetupSession | null; error: { message: string } | null }> {
  const { data, error } = await invoke({ action: 'setup' });
  if (error) return { data: null, error };
  const d = data as Partial<CardSetupSession> | null;
  if (!d || typeof d.customerId !== 'string' || typeof d.setupIntentClientSecret !== 'string' || typeof d.ephemeralKeySecret !== 'string') {
    return { data: null, error: { message: 'Could not start adding a card.' } };
  }
  return { data: d as CardSetupSession, error: null };
}
