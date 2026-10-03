import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { endLiveCard, liveCardAvailable, onLiveCardToken, startLiveCard, updateLiveCard, type LiveCardState } from '../lib/liveCard';
import { Sentry } from '../lib/observability/sentry';

/**
 * 2026-09-30 (the build run, idea 9) — THE CUSTOMER'S LOCK-SCREEN CARD follows each of their jobs
 * while the worker is on the way, there, working, and just finished. While the app is open it asks
 * the server what each card says (live_card_state() — the one place the words are decided) and
 * starts, updates or ends the card; each card's push token goes to the server
 * (register_live_activity()), so the card can follow by push while the app is closed once Apple's key
 * is on the project (supabase/functions/send-live-cards).
 *
 * A finished job's card stays up, saying so, for FINISHED_WINDOW_MS — the push path's end keeps it the
 * same two hours — and then ends. Ending removes a card from the lock screen at once (the add-on ends
 * with an immediate dismissal), so a card is ended only when its job has left the lock screen: long
 * finished, cancelled, or no longer live.
 *
 * Mounted once, at the root (App.tsx), in either mode — it reads only jobs the user posted. On a
 * binary without the native module it does nothing at all — not even a query (lib/liveCard.ts).
 */
const STORE_KEY = 'brazos.liveCards.v1';
/** While the app is open, how often the cards are brought up to date. */
const REFRESH_MS = 60_000;
/** A finished job keeps its card this long after it was marked complete (send-live-cards: the same). */
export const FINISHED_WINDOW_MS = 2 * 60 * 60_000;
/** The most live cards read at once; a list cut off here never ends the cards past it. */
const LIVE_LIMIT = 10;

/** jobId → the card's id and the words it last showed (a card is ended with its last words). */
type Cards = Record<string, { id: string; last: LiveCardState }>;

function isCard(value: unknown): value is LiveCardState {
  const v = value as LiveCardState | null;
  return !!v && typeof v.title === 'string' && typeof v.subtitle === 'string' && typeof v.progress === 'number' && typeof v.ended === 'boolean';
}

async function readCards(): Promise<Cards> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const cards: Cards = {};
    if (parsed && typeof parsed === 'object') {
      for (const [jobId, entry] of Object.entries(parsed as Record<string, unknown>)) {
        const e = entry as { id?: unknown; last?: unknown } | null;
        if (e && typeof e.id === 'string' && isCard(e.last)) cards[jobId] = { id: e.id, last: e.last };
      }
    }
    return cards;
  } catch {
    return {};
  }
}

async function writeCards(cards: Cards): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(cards));
  } catch {
    // A lost map only means a card is started afresh next time.
  }
}

export function useLiveJobCard(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || !liveCardAvailable()) return;
    let active = true;
    let running = false;
    // ONE map, in memory, shared by the sync and the token listener — so a token the system issues
    // the moment a card starts always finds its job. Read from storage once, on first use.
    let loaded: Promise<Cards> | null = null;
    const cardsNow = () => (loaded ??= readCards());

    async function sync() {
      // (`!userId` again: a hoisted function does not keep the guard's narrowing — F7.)
      if (running || !active || !userId) return;
      running = true;
      try {
        const since = new Date(Date.now() - FINISHED_WINDOW_MS).toISOString();
        // The customer's own jobs that can be live — hired and not done, or done in the last two hours —
        // newest first. Which of them IS live is live_card_state()'s alone to say.
        const { data, error } = await supabase
          .from('jobs')
          .select('id, status, completed_at')
          .eq('client_id', userId)
          .in('status', ['assigned', 'in_progress', 'completed'])
          // The date is quoted: PostgREST reads a bare ISO instant's punctuation as its own syntax.
          .or(`status.neq.completed,completed_at.gte."${since}"`)
          .order('created_at', { ascending: false })
          .limit(LIVE_LIMIT);
        if (error || !active) return;
        const cards = await cardsNow();
        // The jobs whose card goes on — every other card ends below.
        const keep = new Set<string>();
        for (const job of data ?? []) {
          const { data: state, error: stateError } = await supabase.rpc('live_card_state', { p_job_id: job.id });
          if (!active) break;
          if (stateError) {
            // Unknown this minute: the card stays as it is.
            keep.add(job.id);
            continue;
          }
          // Not live (hired, not yet on the way): no card, and a card it had ends.
          if (!isCard(state)) continue;
          keep.add(job.id);
          const existing = cards[job.id];
          if (existing) {
            // A finished job's card is updated, not ended — "Sam finished · Approve the work" stays up.
            updateLiveCard(existing.id, state);
            cards[job.id] = { id: existing.id, last: state };
          } else if (!state.ended) {
            const started = startLiveCard(state);
            if (started) cards[job.id] = { id: started, last: state };
          }
        }
        // Signed out meanwhile: the cleanup below has ended every card and cleared the map.
        if (!active) return;
        // A list cut off at the limit cannot say a card's job has gone: those cards wait.
        const complete = (data ?? []).length < LIVE_LIMIT;
        // A card whose job has left the lock screen — long finished, cancelled, no longer live — ends.
        for (const jobId of Object.keys(cards)) {
          if (keep.has(jobId) || !complete) continue;
          endLiveCard(cards[jobId].id, cards[jobId].last);
          delete cards[jobId];
        }
        await writeCards(cards);
      } catch (err) {
        Sentry?.captureException(err, { extra: { site: 'useLiveJobCard.sync' } });
      } finally {
        running = false;
      }
    }

    // Each card's push token, as the system issues it, goes to the server for updates by push.
    const stopTokens = onLiveCardToken(async (activityId, pushToken) => {
      const cards = await cardsNow();
      const jobId = Object.keys(cards).find((key) => cards[key].id === activityId);
      if (!jobId || !active) return;
      const { error } = await supabase.rpc('register_live_activity', {
        p_job_id: jobId,
        p_activity_id: activityId,
        p_push_token: pushToken,
      });
      if (error) Sentry?.captureException(error, { extra: { site: 'useLiveJobCard.register' } });
    });

    void sync();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void sync();
    }, REFRESH_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
      stopTokens();
      // Signed out, or another account: this account's cards leave the lock screen.
      void cardsNow().then((cards) => {
        for (const jobId of Object.keys(cards)) endLiveCard(cards[jobId].id, cards[jobId].last);
        void writeCards({});
      });
    };
  }, [userId]);
}
