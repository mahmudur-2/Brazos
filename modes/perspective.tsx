import { createContext, useContext, type PropsWithChildren } from 'react';
import { useMode } from './ModeProvider';
import type { AppMode } from './types';

/**
 * Which perspective a shared component renders in.
 *
 * CLAUDE.md: "JobCard perspective comes from ModeContext, never a hand-passed
 * prop." This hook is that rule made mechanical — a component asks what
 * perspective it is in, and the answer comes from the mode state, not from its
 * caller. There is no prop to pass the wrong value into, so a customer surface
 * cannot render EST. PAY by mistake.
 */
const PerspectiveOverrideContext = createContext<AppMode | null>(null);

export function useModePerspective(): AppMode {
  const override = useContext(PerspectiveOverrideContext);
  const { mode } = useMode();
  return override ?? mode;
}

/**
 * The one deliberate exception, and it exists only in development.
 *
 * The dev component catalog has to show a mode-aware component in *both* of its
 * states side by side, which the rule above otherwise makes impossible — you
 * would have to switch the whole app's mode to see the other half. This
 * override is scoped to a subtree, gated on __DEV__ (in a production build it
 * renders its children with no override at all), and is used by exactly one
 * caller: dev-tools/ComponentCatalog.tsx.
 *
 * It is not an escape hatch for screens. A screen that wants a fixed
 * perspective is a screen that belongs to one mode's navigator tree.
 */
export function ModePreview({ mode, children }: PropsWithChildren<{ mode: AppMode }>) {
  if (!__DEV__) return <>{children}</>;
  return (
    <PerspectiveOverrideContext.Provider value={mode}>
      {children}
    </PerspectiveOverrideContext.Provider>
  );
}
