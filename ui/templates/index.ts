/**
 * The BRAZOS screen templates (BRAZOS_MASTER_PLAN.md §I).
 *
 * Four of the six ship in Phase 1. InboxScreen and ChatScreen are explicitly
 * Phase 7 per the master plan ("Not included: ... Inbox/Chat templates
 * (Phase 7)") — messaging already has working screens, and reshaping them
 * belongs with the phase that reworks messaging, not this one.
 *
 * Every template takes the same `state` prop and renders the same five
 * non-ready states from ScreenStates, so a screen author configures them
 * rather than reinventing them per route.
 */

export { FormScreen } from './FormScreen';
export { ListScreen } from './ListScreen';
export { DetailScreen } from './DetailScreen';
export type { DetailSection } from './DetailScreen';
export { SuccessScreen } from './SuccessScreen';
export type { SuccessAction } from './SuccessScreen';

export { ScreenStateView, isReady } from './ScreenStates';
export type { ScreenState } from './ScreenStates';
