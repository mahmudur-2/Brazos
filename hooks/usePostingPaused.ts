import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRemoteConfig } from '../lib/remoteConfig';

export type PostingPause = {
  /** True only when the server's postingEnabled reads false. */
  paused: boolean;
  /** A read is running (the 'Try Again' button shows its spinner). */
  checking: boolean;
  /** Read again: the 'Try Again' button. */
  recheck: () => void;
};

/**
 * U3 (A4-M5) — whether Post a job is paused (remote config `postingEnabled`).
 * Read when the screen mounts and on 'Try Again'. It starts at not paused, so
 * the form is never held back by a slow read, and a failed read is FALLBACK,
 * whose postingEnabled is true: only the server's own "false" pauses anyone.
 * create_job refuses with the same sentence regardless, so this is the early
 * notice, never the only lock. When two reads overlap, only the newest decides.
 */
export function usePostingPaused(): PostingPause {
  const [paused, setPaused] = useState(false);
  const [checking, setChecking] = useState(false);
  const latest = useRef(0);
  const mounted = useRef(true);

  const recheck = useCallback(() => {
    const mine = ++latest.current;
    setChecking(true);
    void fetchRemoteConfig().then((config) => {
      if (!mounted.current || mine !== latest.current) return;
      setPaused(!config.postingEnabled);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    recheck();
    return () => {
      mounted.current = false;
    };
  }, [recheck]);

  return { paused, checking, recheck };
}
