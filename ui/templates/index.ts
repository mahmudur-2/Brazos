/**
 * The BRAZOS screen templates (BRAZOS_MASTER_PLAN.md §I).
 *
 * InboxScreen and ChatScreen are explicitly Phase 7 per the master plan
 * ("Not included: ... Inbox/Chat templates (Phase 7)") — messaging already
 * has working screens, and reshaping them belongs with the phase that
 * reworks messaging, not this one. ListScreen shipped in Phase 1 but no
 * screen ever adopted it (every list surface composes its own FlatList) and
 * it was removed as dead code 2026-08-18; if a list template is wanted
 * later, derive it from a screen that actually exists.
 *
 * Every template takes the same `state` prop and renders the same five
 * non-ready states from ScreenStates, so a screen author configures them
 * rather than reinventing them per route.
 */

export { FormScreen } from './FormScreen';
export { DetailScreen } from './DetailScreen';
export type { DetailSection } from './DetailScreen';
export { SuccessScreen } from './SuccessScreen';
export type { SuccessAction } from './SuccessScreen';

export { ScreenStateView, isReady, STATE_COPY, SPINNER_STATE, loadErrorTitle } from './ScreenStates';
export type { ScreenState } from './ScreenStates';
