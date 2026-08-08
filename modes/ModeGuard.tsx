import { useEffect, type ReactElement } from 'react';
import { useMode } from './ModeProvider';
import { modeLabel, type AppMode } from './types';

/**
 * The runtime canary (BRAZOS_MASTER_PLAN.md §F, enforcement mechanism 4).
 *
 * The real prevention is structural and happens two layers up: the two
 * navigator trees are mutually exclusive children of the shell
 * (navigation/ModeShell.tsx), and their param lists are separate types, so a
 * worker screen cannot be reached from customer code — it is not mounted, and
 * navigating to it does not compile. This guard exists for the case those two
 * miss: a *component* that ends up rendered under the wrong tree because it was
 * added to a shared route by mistake.
 *
 * It logs; it does not blank the screen. Rendering null on a mode mismatch
 * would turn a wiring mistake into an invisible empty page in production, which
 * is strictly worse than showing something slightly wrong — and would open the
 * door to a render/redirect loop, which §F specifically wants avoided. In a
 * production build the whole thing compiles down to a hook that does nothing.
 */
export function useModeGuard(expected: AppMode, componentName: string): void {
  const { mode, ready } = useMode();

  useEffect(() => {
    if (!__DEV__) return;
    // Nothing is asserted while the mode is still resolving — during that
    // window there is no answer to be wrong about.
    if (!ready) return;
    if (mode === expected) return;
    console.error(
      `[ModeGuard] ${componentName} is ${modeLabel(expected)}-only but rendered in ` +
        `${modeLabel(mode)} Mode. Something reached it across the mode boundary — ` +
        'check which tree registers this route (navigation/CustomerRoot.tsx, ' +
        'navigation/WorkerRoot.tsx).'
    );
  }, [componentName, expected, mode, ready]);
}

/**
 * Component form, for wrapping a subtree whose parent cannot call a hook (a
 * screen registered inline, a shared component used in one mode's list).
 */
export function ModeGuard({
  expects,
  name,
  children,
}: {
  expects: AppMode;
  name: string;
  children: ReactElement | null;
}): ReactElement | null {
  useModeGuard(expects, name);
  return children;
}
