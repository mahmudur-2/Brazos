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

/** The function's own sentence, from a non-2xx body ({ error }), when there is one. */
async function sentenceOf(error: unknown): Promise<string | null> {
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : null;
  const text = context && typeof context === 'object' ? (context as { text?: unknown }).text : null;
  if (typeof text !== 'function') return null;
  try {
    const parsed = JSON.parse(await (text as () => Promise<string>).call(context)) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

async function invoke(body: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  const fallback = 'Could not reach your cards right now.';
  try {
    const { data, error } = await supabase.functions.invoke('payment-methods', { body });
    if (error) return { data: null, error: { message: userMessage(await sentenceOf(error), fallback) } };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: userMessage(err instanceof Error ? err.message : null, fallback) } };
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
