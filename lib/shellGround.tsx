import { createContext, useCallback, useContext, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { ColorPalette } from './theme';

/**
 * RUN H3 (C3) — WHICH GROUND THE MODE SHELL PAINTS BEHIND THE FLOATING NAV.
 *
 * THE DEFECT THIS EXISTS FOR, measured rather than described. On the light
 * customer Home render the region OUTSIDE the floating pill — its 12pt side
 * margins and the 12pt gap beneath it, y 770..851 at 393x852 — painted
 * #F4F1E8 while the page above painted #FAF5F1, so a band ran the full width
 * of the screen under the bar. One node paints that region:
 * navigation/ModeShell.tsx's tree View, and it painted `palette.background`.
 *
 * THAT NODE WAS NOT WRONG. `background` IS the page ground for twenty-seven of
 * the app's thirty screens — worker Home included, which is why the same
 * render of THAT surface shows one continuous ground through the bar row and
 * no band at all. The three screens that paint `homeBackground` instead
 * (customer Home, JobDetail, WorkerResults) are the outliers, and their ground
 * stops at the scene box because @react-navigation/bottom-tabs lays the scene
 * and the bar out as siblings in one column — a screen cannot paint below
 * itself.
 *
 * SO THE GROUND FOLLOWS THE SCREEN. Hard-coding `homeBackground` into the
 * shell would not fix the band, it would MOVE it onto the other twenty-seven
 * surfaces; and the two ground hexes cannot be reconciled in the palette,
 * because tests/emeraldFences.test.mjs's home(5) fence freezes both of them
 * ("LIGHT IS FROZEN. Not 'different from dark' — these exact values"). What is
 * left is for the screen that owns the page to say so, and for the shell to
 * resolve it.
 *
 * WHY A TOKEN NAME AND NOT A COLOUR. A screen hands over the KEY it already
 * paints itself with, never a resolved value and never a hex — so the shell
 * resolves against its own palette, light and dark can never disagree, and
 * CLAUDE.md's ban on raw colour literals outside the three token surfaces
 * cannot be routed around through this hook.
 *
 * WHY FOCUS AND NOT MOUNT. React Navigation keeps a blurred screen MOUNTED:
 * Home is still mounted while Profile is on top of it, and while a stack
 * screen is pushed over it. A mount-scoped ground would therefore latch on the
 * first Home render and paint every later screen's bar row wrong — the same
 * band, just relocated. Focus is the only scope that matches what is actually
 * on the screen, so the ground is set on focus and released on blur; a screen
 * that says nothing leaves the shell on `palette.background`, which is what it
 * has always painted.
 *
 * IN DARK THIS RESOLVES TO NO CHANGE AT ALL, and that is a fact about the
 * palette rather than a special case here: dark's `homeBackground` and
 * `background` are the same #02110D (the home(5) fence pins all three
 * declarations of it), so the dark bar row was already painting the page
 * ground and still is.
 */

/** A key of the resolved palette — the same one the screen paints with. */
export type ShellGroundToken = keyof ColorPalette;

/**
 * The setter only. The VALUE lives in navigation/ModeShell.tsx, which is the
 * node that paints it; handing the value down as well would let something
 * other than the shell render the ground and there would be two of them again.
 */
const SetShellGround = createContext<(ground: ShellGroundToken | null) => void>(() => {});

export const ShellGroundProvider = SetShellGround.Provider;

/**
 * Shell-side state. `useState`'s setter is referentially stable, so the context
 * value never changes identity and no consumer re-renders because the shell
 * did.
 */
export function useShellGroundState() {
  const [ground, setGround] = useState<ShellGroundToken | null>(null);
  return { ground, setGround };
}

/**
 * Screen-side declaration: "while I am on screen, the shell's ground is this
 * palette key". Call it with the SAME key the screen's own container paints
 * with — there is one ground per page, and this is how the bar row learns it.
 *
 * Safe on any screen inside a navigator, including one that is never focused;
 * outside a navigator `useFocusEffect` is the thing that would throw, and no
 * caller is outside one.
 */
export function useShellGround(ground: ShellGroundToken) {
  const setGround = useContext(SetShellGround);
  useFocusEffect(
    useCallback(() => {
      setGround(ground);
      return () => setGround(null);
    }, [ground, setGround])
  );
}
