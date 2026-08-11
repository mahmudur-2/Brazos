/**
 * The modes domain (BRAZOS_MASTER_PLAN.md §O `src/modes/`).
 *
 * One import path for everything mode-related, so there is never a question of
 * which file owns mode state: this one does, and nothing outside it may set a
 * mode.
 */

export { ModeProvider, useMode, useModeSwitch } from './ModeProvider';
export type { ModeContextValue, SwitchModeOptions } from './ModeProvider';
export { ModeGuard, useModeGuard } from './ModeGuard';
export { ModePreview, useModePerspective } from './perspective';
export {
  APP_MODES,
  DEFAULT_MODE,
  coerceAppMode,
  isAppMode,
  modeFromLanding,
  modeLabel,
  modeStorageKey,
  otherMode,
  resolveInitialMode,
  type AppMode,
} from './types';
