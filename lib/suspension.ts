/**
 * B1 (production-36h) — THE SUSPENDED ACCOUNT, the pure half. No imports, so the node tests execute it.
 *
 * The server is the guard (the access lane, 63f468a): a suspended person can still sign in, but every
 * guarded function refuses with P0001 and hint 'account_suspended', every edge function but the
 * allowed ones answers 401 with the sentence below, and a table read gives no rows. The app only
 * chooses what to SHOW: lib/AuthContext.tsx asks current_user_is_banned() at sign-in, at launch and
 * on the way to the front, and App.tsx shows the suspended screen in place of the app while the
 * answer is yes.
 *
 * Between two checks a refused call is a MARK: the client's one fetch (lib/supabase.ts) hands every
 * answer back untouched and reads a copy here; a mark only asks AuthContext for its check at once.
 * Only the server's own answer switches the screen. 'account_inactive' (a deleted account) is never
 * a mark.
 */

/** The server's own sentence, word for word (require_active_caller's message; the edge 401 body). */
export const SUSPENDED_SENTENCE =
  'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.';

// ---------------------------------------------------------------- the answer

/** The last answer of current_user_is_banned(), with the account it was for. */
export type SuspensionAnswer = { userId: string; suspended: boolean } | null;

/**
 * The answer after one read for `userId`. A failed read FAILS OPEN on the first answer for this
 * account (not suspended, as before B1: the server still refuses) and keeps the last answer after
 * that, so a bad network never flips the screen either way.
 */
export function nextSuspension(
  previous: SuspensionAnswer,
  userId: string,
  read: { data: boolean; error: unknown }
): SuspensionAnswer {
  if (read.error) return previous && previous.userId === userId ? previous : { userId, suspended: false };
  return { userId, suspended: read.data === true };
}

/** What the app reads: null while no answer is known for the signed-in account (or nobody is). */
export function suspendedFor(answer: SuspensionAnswer, userId: string | null): boolean | null {
  if (!userId || !answer || answer.userId !== userId) return null;
  return answer.suspended;
}

/** On the way to the front: always while suspended (the screen must leave when the suspension
 *  ends), otherwise at most once per `everyMs`. */
export function recheckDue(suspended: boolean | null, lastCheck: number, now: number, everyMs: number): boolean {
  return suspended === true || now - lastCheck >= everyMs;
}

/**
 * One read at a time. A call while a read runs joins it and asks for ONE more read after it, so a
 * mark that lands during a read started before the refusal is never lost. A failed run is silent.
 */
export function coalesce(run: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let again = false;
  const start = (): Promise<void> => {
    const current: Promise<void> = Promise.resolve()
      .then(run)
      .catch(() => undefined)
      .then(() => {
        inFlight = null;
        if (again) {
          again = false;
          return start();
        }
        return undefined;
      });
    inFlight = current;
    return current;
  };
  return () => {
    if (inFlight) {
      again = true;
      return inFlight;
    }
    return start();
  };
}

// ---------------------------------------------------------------- the checks

/** B7 (R6): after a read that failed, the next one comes after 5 s, then 15 s, then every 60 s. */
export const RETRY_AFTER_MS = [5_000, 15_000, 60_000] as const;

/** B7 (R7): while the suspended screen shows, the next read comes after 60 s. */
export const SUSPENDED_POLL_MS = 60_000;

/**
 * When the next read is due on its own, or null for none. `failures`: the failed reads in a row;
 * `suspended`: the answer now. A lifted suspension lets the person in within a minute, without a
 * restart and without leaving the app.
 */
export function nextReadIn(failures: number, suspended: boolean): number | null {
  if (failures > 0) return RETRY_AFTER_MS[Math.min(failures, RETRY_AFTER_MS.length) - 1];
  return suspended ? SUSPENDED_POLL_MS : null;
}

type Timers = { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const systemTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SuspensionChecks = {
  /** Read now (one at a time, coalesce above). */
  check: () => Promise<void>;
  /** On the way to the front: a read when recheckDue says so. */
  foreground: () => void;
  /** No read publishes after this, and no timer is left. */
  stop: () => void;
};

/**
 * One signed-in account's checks (lib/AuthContext.tsx runs one per user id). Each read publishes
 * nextSuspension's answer, so the app still opens when the first read fails (as before B7).
 *
 * B7 (R6): a read that fails is not a check. The ten-minute clock keeps the time of the last read
 * that answered, and the next read comes after 5 s, then 15 s, then every 60 s, until one answers:
 * a suspended account whose first read failed is not left in the app for ten minutes.
 * B7 (R7): while the answer is "suspended", a read every 60 s as well (and on the way to the front,
 * as before), so the suspended screen leaves when the suspension ends.
 */
export function suspensionChecks(options: {
  userId: string;
  read: () => Promise<{ data: boolean; error: unknown }>;
  publish: (answer: SuspensionAnswer) => void;
  everyMs: number;
  now?: () => number;
  timers?: Timers;
}): SuspensionChecks {
  const now = options.now ?? Date.now;
  const timers = options.timers ?? systemTimers;
  let active = true;
  let answer: SuspensionAnswer = null;
  let lastCheck = 0;
  let failures = 0;
  let timer: unknown = null;

  const cancelTimer = () => {
    if (timer === null) return;
    timers.clear(timer);
    timer = null;
  };

  const check = coalesce(async () => {
    if (!active) return;
    cancelTimer();
    let read: { data: boolean; error: unknown };
    try {
      read = await options.read();
    } catch (error) {
      read = { data: false, error: error ?? true };
    }
    if (!active) return;
    if (read.error) {
      failures += 1;
    } else {
      failures = 0;
      lastCheck = now();
    }
    answer = nextSuspension(answer, options.userId, read);
    options.publish(answer);
    const wait = nextReadIn(failures, answer?.suspended === true);
    if (wait !== null) {
      timer = timers.set(() => {
        timer = null;
        void check();
      }, wait);
    }
  });

  return {
    check,
    foreground: () => {
      if (recheckDue(answer ? answer.suspended : null, lastCheck, now(), options.everyMs)) void check();
    },
    stop: () => {
      active = false;
      cancelTimer();
    },
  };
}

// ---------------------------------------------------------------- the marks

/**
 * The two exact marks, and nothing else:
 *   - a database call (/rest/v1/) answered 400 whose body's hint is 'account_suspended';
 *   - an edge function (/functions/v1/) answered 401 whose body's error is SUSPENDED_SENTENCE.
 */
export function isSuspensionMark(url: string, status: number, body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const fields = body as { hint?: unknown; error?: unknown };
  if (status === 400 && url.includes('/rest/v1/')) return fields.hint === 'account_suspended';
  if (status === 401 && url.includes('/functions/v1/')) return fields.error === SUSPENDED_SENTENCE;
  return false;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** AuthContext listens while someone is signed in; the return value stops it. */
export function onSuspensionMark(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyMarked(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener's fault is its own; the others still hear the mark.
    }
  }
}

function urlOf(input: unknown): string {
  return typeof input === 'string' ? input : (input as { url?: string } | null)?.url ?? String(input);
}

/** Reads a COPY of a possibly marked answer in the background. Every step is inside a catch: a
 *  detection fault is silent and never reaches the caller. */
function inspect(input: unknown, response: unknown): void {
  try {
    const answer = response as { status?: unknown; clone?: () => { json: () => Promise<unknown> } } | null;
    const status = answer?.status;
    if (status !== 400 && status !== 401) return;
    const url = urlOf(input);
    if (!url.includes(status === 400 ? '/rest/v1/' : '/functions/v1/')) return;
    const clone = answer?.clone;
    if (typeof clone !== 'function') return;
    const copy = clone.call(answer);
    void Promise.resolve()
      .then(() => copy.json())
      .then((body) => {
        if (isSuspensionMark(url, status, body)) notifyMarked();
      })
      .catch(() => undefined);
  } catch {
    // Silent: the answer goes back exactly as it came.
  }
}

type FetchLike = (input: any, init?: any) => Promise<any>;

/**
 * The client's fetch, watched. It never changes, delays or breaks an answer: the response (or the
 * failure) goes back at once, as it came; only a copy of a 400 or 401 is read, in the background.
 */
export function watchSuspension<T extends FetchLike>(baseFetch: T): T {
  const wrapped: FetchLike = (input, init) =>
    baseFetch(input, init).then((response: unknown) => {
      inspect(input, response);
      return response;
    });
  return wrapped as T;
}
