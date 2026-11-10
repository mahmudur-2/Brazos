/**
 * A6 - A REQUEST THAT NEVER ANSWERS MUST END. supabase-js uses the platform fetch, which has no
 * timeout, so a dead connection left a spinner forever. This wraps fetch with an AbortController
 * deadline. No imports, so the node tests execute it. It wraps fetch only: the realtime socket is
 * a WebSocket and never passes through here.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Storage uploads and downloads move whole photos and videos; a fixed 15 s would cut them off. */
export function isTimeoutExempt(input: unknown): boolean {
  const url = typeof input === 'string' ? input : (input as { url?: string } | null)?.url ?? String(input);
  return url.includes('/storage/v1/');
}

type FetchLike = (input: any, init?: any) => Promise<any>;

export function withRequestTimeout<T extends FetchLike>(baseFetch: T, ms: number = REQUEST_TIMEOUT_MS): T {
  const wrapped: FetchLike = (input, init) => {
    if (isTimeoutExempt(input)) return baseFetch(input, init);
    const controller = new AbortController();
    const upstream: AbortSignal | undefined = init?.signal;
    let timedOut = false;
    const onUpstreamAbort = () => controller.abort();
    if (upstream) {
      if (upstream.aborted) controller.abort();
      else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
    return baseFetch(input, { ...init, signal: controller.signal }).then(
      (response: unknown) => {
        clearTimeout(timer);
        upstream?.removeEventListener('abort', onUpstreamAbort);
        return response;
      },
      (error: unknown) => {
        clearTimeout(timer);
        upstream?.removeEventListener('abort', onUpstreamAbort);
        // lib/errorMessage.ts reads "timeout" as the offline sentence.
        throw timedOut ? new Error('Request timeout') : error;
      }
    );
  };
  return wrapped as T;
}
