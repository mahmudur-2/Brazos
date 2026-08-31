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
import { track } from '../lib/observability/analytics';
import { fetchMyActiveMode, setMyActiveMode } from '../lib/profiles';
import { consumePendingLanding } from '../lib/setupLanding';
import {
  clearPendingModeWrite,
  readCachedMode,
  readPendingModeWrite,
  writeCachedMode,
  writePendingModeWrite,
} from './modeStorage';
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
 *
 * THE SWAP IS TWO COMMITS, NOT ONE (device defect, 2026-08-22)
 *   `mode` is the answer consumers read; `treeMode` is the tree the shell may
 *   mount, and it trails `mode` by exactly one commit during a switch. The gap
 *   commit renders NO navigator tree, so the outgoing tree unmounts fully —
 *   and only then does the incoming tree first render.
 *
 *   Why: both trees root in a bottom-tab navigator, and React Navigation's
 *   container keeps ONE authoritative state store whose adoption check is the
 *   router's `type` alone (`useNavigationBuilder`'s isStateInitialized). Swap
 *   the trees in a single commit and the incoming tree's first render adopts
 *   the outgoing mode's state — route keys preserved by
 *   getStateForRouteNamesChange — while the outgoing tree's unmount cleanup
 *   and the incoming tree's first state publication interleave over that one
 *   store. The tree DRAWS correctly (render uses its locally fixed-up state)
 *   but dispatches evaluate against the store, which is left holding the other
 *   mode's nested Home-stack routeNames: every navigate inside the Home tab
 *   throws "was not handled by any navigator" until a reload rebuilds the
 *   store from scratch. Sequencing unmount before mount means the incoming
 *   tree always initializes from an EMPTY store — nothing to adopt, no
 *   cleanup left to race — which no library ordering can un-fix.
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
   * The mode whose navigator tree the shell may mount. Equal to `mode` except
   * for the single gap commit of a switch, during which the shell renders no
   * tree at all so the outgoing navigators unmount before the incoming ones
   * first render (see "THE SWAP IS TWO COMMITS" above). Only
   * navigation/ModeShell.tsx should render from this; everything else reads
   * `mode`.
   */
  treeMode: AppMode;
  /**
   * False until the initial resolution for the signed-in account has finished.
   * The shell holds a neutral loader on this rather than rendering a guessed
   * tree and swapping it a tick later, which is what a mode "flash" is.
   */
  ready: boolean;
  /** True from the moment a switch is requested until its transition ends. */
  switching: boolean;
  /**
   * Resolves TRUE only after the requested tree has actually been committed —
   * the earliest moment a caller may dispatch navigation into it (Stage 4D's
   * cross-mode notification routing needs exactly that). FALSE when nothing
   * switched: declined, no session, or a switch already running. Requesting
   * the mode you are already in resolves true immediately.
   */
  switchMode: (target: AppMode, options?: SwitchModeOptions) => Promise<boolean>;
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

/**
 * The server half of a mode change, with the F-042 contract: one retry, then
 * a still-failing write is RECORDED as a pending-write debt — never left as
 * a console line only. The next resolution reads the debt, refuses to let
 * the stale server answer silently revert the user's switch, and re-pushes;
 * any successful write clears it.
 */
async function persistModeServerSide(userId: string, mode: AppMode): Promise<void> {
  let { error } = await setMyActiveMode(mode);
  if (error) ({ error } = await setMyActiveMode(mode));
  if (error) {
    console.warn('[modes] active_mode not persisted server-side', error.message);
    await writePendingModeWrite(userId, mode);
    return;
  }
  await clearPendingModeWrite(userId);
}

export function ModeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { start: startTransition, busy } = useModeTransition();

  const userId = user?.id ?? null;

  const [mode, setMode] = useState<AppMode>(DEFAULT_MODE);
  const [treeMode, setTreeMode] = useState<AppMode>(DEFAULT_MODE);
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
  //
  // Disarming matters as much as the mode reset (AUD-P2-06): `armed` left true
  // from the previous account would fire resolution the instant the NEXT
  // session appears — before that account's Setup has run — consuming a
  // pending landing that isn't theirs and stamping resolvedFor before Setup's
  // "Start in" choice exists. ModeShell re-arms on mount, which happens only
  // after auth + legal + setup have all resolved for the new account.
  useEffect(() => {
    if (userId) return;
    setArmed(false);
    setResolvedFor(null);
    setMode(DEFAULT_MODE);
    setTreeMode(DEFAULT_MODE);
  }, [userId]);

  // The trailing half of the two-commit swap: `treeMode` follows `mode` one
  // commit later, and the shell renders no tree while they differ. This effect
  // is the ONLY writer of treeMode after a switch; the initial resolution and
  // the sign-out reset set both values in one commit so no gap frame exists
  // outside an actual switch.
  useEffect(() => {
    if (treeMode !== mode) setTreeMode(mode);
  }, [mode, treeMode]);

  useEffect(() => {
    if (!armed || !userId || resolvedFor === userId) return;

    let active = true;

    // Read synchronously, before any await: this is a one-shot handoff and a
    // second consumer must not be able to interleave and take it.
    const landingPreference = consumePendingLanding();
    const landing = landingPreference ? modeFromLanding(landingPreference) : undefined;

    (async () => {
      const [local, remoteResult, pendingWrite] = await Promise.all([
        readCachedMode(userId),
        fetchMyActiveMode(),
        readPendingModeWrite(userId),
      ]);
      if (!active) return;

      // A failed/absent RPC (phase42 not applied, offline, permissions) yields
      // null, and null simply loses to the local cache in resolveInitialMode.
      // A recorded pending write means LOCAL is ahead of the server — the
      // last switch never landed there — so the stale remote answer is set
      // aside instead of silently reverting the user's choice (F-042).
      const remote = pendingWrite ? null : remoteResult.data;
      const resolved = resolveInitialMode({ landing, remote, local: pendingWrite ?? local });

      setMode(resolved);
      setTreeMode(resolved);
      setResolvedFor(userId);

      // Make every source agree with what was just decided. Both are
      // best-effort: the user is already in the right mode on screen.
      void writeCachedMode(userId, resolved);
      if (pendingWrite || resolved !== remoteResult.data) {
        void persistModeServerSide(userId, resolved);
      }
    })();

    return () => {
      active = false;
    };
  }, [armed, userId, resolvedFor]);

  /**
   * Switches awaited by their callers (Stage 4D). The overlay flips `mode` at
   * its midpoint; the tree itself mounts one commit later, when `treeMode`
   * catches up — so resolution keys on the [treeMode] effect below, which runs
   * AFTER the tree's commit and after the newly mounted tree's own effects
   * (children before parents). That makes resolving here the earliest moment a
   * dispatch into the new tree can find it mounted and registered. Entries
   * that never match (the provider unmounting mid-switch) simply never
   * resolve, which drops the caller's follow-up navigation rather than
   * dispatching it into the wrong tree.
   */
  const pendingSwitchResolvers = useRef<
    Array<{ target: AppMode; resolve: (switched: boolean) => void }>
  >([]);

  useEffect(() => {
    if (pendingSwitchResolvers.current.length === 0) return;
    pendingSwitchResolvers.current = pendingSwitchResolvers.current.filter((entry) => {
      if (entry.target !== treeMode) return true;
      entry.resolve(true);
      return false;
    });
  }, [treeMode]);

  const switchMode = useCallback(
    async (target: AppMode, options?: SwitchModeOptions): Promise<boolean> => {
      if (!userId) return false;
      // Already there: trivially satisfied — a caller routing after the
      // switch may dispatch immediately. A switch already running stays a
      // refusal: a double tap should do nothing, not stack transitions.
      if (target === mode) return true;
      if (requestingRef.current || busy) return false;

      requestingRef.current = true;
      setRequesting(true);
      let settled: Promise<boolean> | null = null;
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
        if (!confirmed) return false;

        settled = new Promise<boolean>((resolve) => {
          pendingSwitchResolvers.current.push({ target, resolve });
        });

        startTransition({
          destination: target,
          // The single seam where mode actually changes. It runs while the
          // sheet is at rest over the screen, so the tree swap underneath is
          // never visible mid-flight.
          onSwitch: () => setMode(target),
        });

        // The switch has committed: the confirmation was accepted, the
        // transition owns the change, and nothing downstream can cancel it. A
        // DECLINED confirmation returned above and emits nothing.
        //
        // Emitted HERE and not from setMyActiveMode(): that is the persistence
        // call, it is allowed to fail offline and be repaid later (F-042),
        // and a mode the user is already looking at is switched whether or not
        // the server has heard about it yet. ModeProvider is the single
        // authority for a mode change, so it is the single emitter.
        track({ name: 'mode_switched', to: target });

        // Persistence runs alongside the animation rather than gating it — a
        // slow network must not stall a UI state change the user already
        // committed to, and the local cache carries the answer either way.
        // The server write retries once and records its failure as a debt
        // the next resolution repays (F-042) — see persistModeServerSide.
        void writeCachedMode(userId, target);
        void persistModeServerSide(userId, target);
      } finally {
        // The request window closes when the transition takes over ownership
        // of the guard (`busy`) — exactly as before; the settled promise is
        // awaited OUTSIDE it so a slow animation never pins `requesting`.
        requestingRef.current = false;
        setRequesting(false);
      }
      return settled ? await settled : false;
    },
    [busy, mode, startTransition, userId]
  );

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      treeMode,
      ready: userId !== null && resolvedFor === userId,
      switching: requesting || busy,
      switchMode,
      armResolution,
    }),
    [mode, treeMode, userId, resolvedFor, requesting, busy, switchMode, armResolution]
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
