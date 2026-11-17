/**
 * A4-R1 (A4-01, A4-09) — THE SERVER'S CLOCK. No imports, so the node tests execute it.
 *
 * Every "time has passed" decision about money or the job lifecycle (the booked window, the funding
 * window, the automatic release, an offer's deadline, the no-show and running-late gates) reads
 * serverNowMs(), not the phone's clock: a phone whose clock is wrong must not show a wrong money or
 * lifecycle state. The client's one fetch (lib/supabase.ts) passes every answer's Date header here.
 * A countdown or a "5 minutes ago" label is not such a decision.
 */

/** An answer that took longer than this says too little about when the server wrote its header. */
const MAX_ROUND_TRIP_MS = 5_000;
/** A smaller difference is the header's one-second resolution and the network, not a wrong clock. */
const MIN_SKEW_MS = 60_000;

let offsetMs = 0;
/** UA-03: the newest Date header already accepted; an older one is a cached or replayed answer. */
let newestServerMs = -Infinity;

/**
 * One answer's Date header, with the phone's clock when the request left and when the answer came.
 * A missing or unreadable header, a round trip over 5 s, or a header older than the newest one
 * already accepted (an equal one counts: the header's grain is one second) is ignored; otherwise the
 * offset becomes the skew when it is 60 s or more either way, else 0.
 */
export function noteServerDate(
  dateHeader: string | null | undefined,
  sentAtMs: number,
  receivedAtMs: number
): void {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  const roundTrip = receivedAtMs - sentAtMs;
  if (!(roundTrip >= 0 && roundTrip <= MAX_ROUND_TRIP_MS)) return;
  if (serverMs < newestServerMs) return;
  newestServerMs = serverMs;
  const skew = serverMs - (sentAtMs + receivedAtMs) / 2;
  offsetMs = Math.abs(skew) >= MIN_SKEW_MS ? Math.round(skew) : 0;
}

/** The server's time now, as epoch ms: the phone's clock plus the last noted offset. */
export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

type FetchLike = (input: any, init?: any) => Promise<any>;

/**
 * The client's fetch, with its answers' Date header read. It never changes a request or an answer
 * and never throws: the answer (or the failure) goes back as it came.
 */
export function watchServerClock<T extends FetchLike>(baseFetch: T): T {
  const wrapped: FetchLike = (input, init) => {
    const sentAtMs = Date.now();
    return baseFetch(input, init).then((response: unknown) => {
      try {
        const headers = (response as { headers?: { get?: (name: string) => string | null } } | null)?.headers;
        if (typeof headers?.get === 'function') noteServerDate(headers.get('date'), sentAtMs, Date.now());
      } catch {
        // Silent: the answer goes back exactly as it came.
      }
      return response;
    });
  };
  return wrapped as T;
}
