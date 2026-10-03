import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

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

/** A row either person menu draws — the shape both DropMenuItem and GlassDropdownItem accept. */
export type PersonMenuItem = {
  key: string;
  label: string;
  icon: IoniconName;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * F20 (fix run, 2026-10-03) — THE PERSON'S SAFETY ROWS, built once. The chat
 * header's menu and the inbox row's menu both offer Mute, Block (or Unblock)
 * and Report for the same person; each built its own and the words drifted
 * ("Block…" in one, "Block" in the other). Now each menu places `mute` where
 * its own order puts it and appends `safety` last, in red, in this order. The
 * handlers stay the screen's: this decides the words, the glyphs and the order.
 */
export function personSafetyItems({
  muted,
  blocking,
  onMute,
  onBlock,
  onUnblock,
  onReport,
}: {
  muted: boolean;
  blocking: boolean;
  onMute: () => void;
  /** Opens the one chooser (permanently, or for a time). */
  onBlock: () => void;
  onUnblock: () => void;
  onReport: () => void;
}): { mute: PersonMenuItem; safety: PersonMenuItem[] } {
  return {
    mute: {
      key: 'mute',
      label: muted ? 'Unmute' : 'Mute',
      icon: muted ? 'notifications' : 'notifications-off-outline',
      onPress: onMute,
    },
    safety: [
      blocking
        ? { key: 'block', label: 'Unblock', icon: 'lock-open-outline', onPress: onUnblock }
        : { key: 'block', label: 'Block', icon: 'ban-outline', destructive: true, onPress: onBlock },
      { key: 'report', label: 'Report', icon: 'flag-outline', destructive: true, onPress: onReport },
    ],
  };
}
