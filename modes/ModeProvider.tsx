import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useModeTransition } from '../components/ModeTransitionOverlay';
import { useAuth } from '../hooks/useAuth';
import { confirmAsync } from '../lib/dialog';
import { fetchMyActiveMode, setMyActiveMode } from '../lib/profiles';
import { consumePendingLanding } from '../lib/setupLanding';
import { readCachedMode, writeCachedMode } from './modeStorage';
import {
  DEFAULT_MODE,
  modeFromLanding,
  modeLabel,
  otherMode,
  resolveInitialMode,
  type AppMode,
} from './types';

/**
 * The one authoritative mode state layer (BRAZOS_MASTER_PLAN.md §A/§F,
 * CLAUDE.md "One account, two modes").
 *
 * WHAT THIS REPLACES
 *   Before Phase 2 "mode" was a navigation illusion: Customer Home pushed
 *   BrowseJobs onto the shared Home stack, Worker Home popped it back, and the
 *   Home tab's re-press handler worked out which mode you were in by checking
 *   whether BrowseJobs happened to be on that stack. There was no mode state
 *   anywhere. All of that is gone; this provider is the only thing that knows.
 *
 * THE ONE RULE
 *   switchMode() is the only function that changes mode, and it always
 *   confirms first. Nothing else in the app may set it — not a data tap, not a
 *   card, not "View All", not a deep link. Callers can replace the confirmation
 *   *copy* (a cross-mode link says something different from a Settings switch),
 *   but not remove the confirmation.
 *
 * ONE TRANSITION OWNER
 *   The branded ModeTransitionOverlay is started from exactly one place — here.
 *   Screens no longer call useModeTransition() themselves, so there is no way
 *   to play the panel without an actual mode change, or to change mode without
 *   the panel. `switching` is derived from the overlay's own busy flag rather
 *   than tracked separately, so the two can never disagree.
 *
 * NO ARBITRARY DELAYS
 *   The mode flips inside the overlay's own onSwitch callback, at the moment
 *   the sheet is at rest covering the screen — the same seam the previous
 *   implementation used for its navigate() call. Nothing here waits on a timer
 *   to paper over a navigation race, because there is no navigation: swapping
 *   `mode` swaps which navigator tree is mounted, which resets both stacks to
 *   their tab roots by construction (see navigation/ModeShell.tsx).
 */

type SwitchConfirmation = {
  title: string;
  message?: string;
  confirmText?: string;
};

export type SwitchModeOptions = {
  /**
   * Replaces the default confirmation copy. The confirmation itself is NOT
   * optional and there is deliberately no flag to skip it — §F requires an
   * intentional, acknowledged switch, and an opt-out would be the first thing
   * a future caller reached for.
   */
  confirm?: SwitchConfirmation;
};

export type ModeContextValue = {
  /** The current mode. Only ever one of the two literals — see coerceAppMode. */
  mode: AppMode;
  /**
   * False until the initial resolution for the signed-in account has finished.
   * The shell holds a neutral loader on this rather than rendering a guessed
   * tree and swapping it a tick later, which is what a mode "flash" is.
   */
  ready: boolean;
  /** True from the moment a switch is requested until its transition ends. */
  switching: boolean;
  switchMode: (target: AppMode, options?: SwitchModeOptions) => Promise<void>;
  /**
   * Starts the initial resolution. Called once by the mode shell, which mounts
   * only after auth + legal + setup have all resolved — and that matters,
   * because Setup's "Start in: Find work" choice does not exist until the
   * moment Setup finishes, which is *after* the session appears. Resolving on
   * the session alone would race that choice and lose it.
   */
  armResolution: () => void;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function useMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (!value) {
    throw new Error('useMode must be used inside <ModeProvider>');
  }
  return value;
}

function defaultConfirmation(target: AppMode): SwitchConfirmation {
  return target === 'worker'
    ? {
        title: 'Switch to Worker Mode?',
        message:
          'You’ll see the jobs you can bid on. The jobs you’ve posted stay exactly where they are — switch back any time.',
        confirmText: 'Switch',
      }
    : {
        title: 'Switch to Customer Mode?',
        message:
          'You’ll go back to posting jobs and managing the help you’ve hired. Your bids stay exactly where they are.',
        confirmText: 'Switch',
      };
}

export function ModeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { start: startTransition, busy } = useModeTransition();

  const userId = user?.id ?? null;

  const [mode, setMode] = useState<AppMode>(DEFAULT_MODE);
  /** Which account the value in `mode` was resolved for. */
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  /**
   * The window between the confirmation opening and the overlay taking over.
   * `busy` is false during it, so without this a second tap could open a second
   * dialog. The ref is the real guard (two taps in one frame both read the old
   * state); the state exists so consumers re-render with controls disabled.
   */
  const [requesting, setRequesting] = useState(false);
  const requestingRef = useRef(false);

  const armResolution = useCallback(() => setArmed(true), []);

  // Signing out drops back to a known state, so the next account cannot inherit
  // the previous one's mode for even one frame.
  useEffect(() => {
    if (userId) return;
    setResolvedFor(null);
    setMode(DEFAULT_MODE);
  }, [userId]);

  useEffect(() => {
    if (!armed || !userId || resolvedFor === userId) return;

    let active = true;

    // Read synchronously, before any await: this is a one-shot handoff and a
    // second consumer must not be able to interleave and take it.
    const landingPreference = consumePendingLanding();
    const landing = landingPreference ? modeFromLanding(landingPreference) : undefined;

    (async () => {
      const [local, remoteResult] = await Promise.all([
        readCachedMode(userId),
        fetchMyActiveMode(),
      ]);
      if (!active) return;

      // A failed/absent RPC (phase42 not applied, offline, permissions) yields
      // null, and null simply loses to the local cache in resolveInitialMode.
      const remote = remoteResult.data;
      const resolved = resolveInitialMode({ landing, remote, local });

      setMode(resolved);
      setResolvedFor(userId);

      // Make every source agree with what was just decided. Both are
      // best-effort: the user is already in the right mode on screen.
      void writeCachedMode(userId, resolved);
      if (resolved !== remote) void setMyActiveMode(resolved);
    })();

    return () => {
      active = false;
    };
  }, [armed, userId, resolvedFor]);

  const switchMode = useCallback(
    async (target: AppMode, options?: SwitchModeOptions) => {
      if (!userId) return;
      // Already there, or a switch is already running. Both are no-ops rather
      // than errors: a double tap should do nothing, not stack transitions.
      if (target === mode) return;
      if (requestingRef.current || busy) return;

      requestingRef.current = true;
      setRequesting(true);
      try {
        const copy = options?.confirm ?? defaultConfirmation(target);
        const confirmed = await confirmAsync({
          title: copy.title,
          message: copy.message,
          confirmText: copy.confirmText ?? `Switch to ${modeLabel(target)}`,
          cancelText: 'Stay in ' + modeLabel(mode),
        });
        // Declining lands the user exactly where they already were — §F's
        // "decline lands on the current mode's home", which is free here
        // because nothing has moved yet.
        if (!confirmed) return;

        startTransition({
          destination: target,
          // The single seam where mode actually changes. It runs while the
          // sheet is at rest over the screen, so the tree swap underneath is
          // never visible mid-flight.
          onSwitch: () => setMode(target),
        });

        // Persistence runs alongside the animation rather than gating it — a
        // slow network must not stall a UI state change the user already
        // committed to, and the local cache carries the answer either way.
        void writeCachedMode(userId, target);
        void setMyActiveMode(target).then(({ error }) => {
          if (error) {
            console.warn('[modes] active_mode not persisted server-side', error.message);
          }
        });
      } finally {
        requestingRef.current = false;
        setRequesting(false);
      }
    },
    [busy, mode, startTransition, userId]
  );

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      ready: userId !== null && resolvedFor === userId,
      switching: requesting || busy,
      switchMode,
      armResolution,
    }),
    [mode, userId, resolvedFor, requesting, busy, switchMode, armResolution]
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/**
 * The switch control's whole API, so a screen never has to name the mode it is
 * switching *to* (and never has to work out which one that is).
 */
export function useModeSwitch() {
  const { mode, switching, switchMode } = useMode();
  const target = otherMode(mode);
  return {
    target,
    switching,
    switchToOtherMode: (options?: SwitchModeOptions) => switchMode(target, options),
  };
}
