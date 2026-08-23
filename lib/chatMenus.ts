/**
 * THE SINGLE OPEN-MENU OWNER for the chat screen.
 *
 * WHY THIS EXISTS. The header's overflow dropdown and the composer's [ + ]
 * drop-up each carried their own boolean — `headerMenuOpen` in
 * screens/ChatScreen.tsx and `menuOpen` inside components/ChatComposer.tsx.
 * Two independent booleans have four states, and one of them is "both menus
 * open at once", which is what a device walk caught on screen. No amount of
 * care at either call site removes that state; only collapsing the two
 * booleans into one value that NAMES the open menu does, because "which one is
 * open" then has nowhere to store a second answer.
 *
 * So the state is `ChatMenu | null`, it lives in ChatScreen, and both menus
 * read from it. The invariant is structural rather than enforced: opening one
 * menu cannot leave another open, because there is only one slot.
 *
 * The transition is a pure function so it can be tested as behaviour rather
 * than asserted as source text.
 */

/** The menus that share the single slot. */
export type ChatMenu = 'header' | 'composer';

/**
 * The next open menu, given what is open now and what was asked for.
 *
 * - Asking for `null` closes whatever is open. That is the outside tap, the
 *   keyboard appearing, navigating away, and choosing an item.
 * - Asking for the menu that is ALREADY open closes it: a control that opens a
 *   menu is the same control that dismisses it.
 * - Asking for a DIFFERENT menu replaces the open one, which is the whole
 *   point — B opening is A closing, in one assignment rather than in two
 *   handlers that have to remember each other.
 */
export function nextMenu(current: ChatMenu | null, requested: ChatMenu | null): ChatMenu | null {
  if (requested === null) return null;
  return current === requested ? null : requested;
}

/** Whether `menu` is the one currently open. The only read either menu needs. */
export function isMenuOpen(current: ChatMenu | null, menu: ChatMenu): boolean {
  return current === menu;
}
