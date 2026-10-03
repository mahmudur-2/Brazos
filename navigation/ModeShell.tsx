import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useMode } from '../modes';
import { ShellGroundProvider, useShellGroundState } from '../lib/shellGround';
import { PinnedFootProvider } from '../ui/primitives/BottomNav';
import { screenGround, useThemeColors } from '../lib/theme';
import { ModeTreeLayoutSignal } from '../components/ModeTransitionOverlay';
import { designStudioAvailable } from '../lib/designStudioGate';
import { CustomerRoot } from './CustomerRoot';
import { WorkerRoot } from './WorkerRoot';

/**
 * LOADED LAZILY (F2). The panel and the schema it reads are about 5,000 lines
 * that only an internal or development build can ever show, so the module is
 * required behind the same gate that mounts it: a preview or production build
 * never evaluates it at boot. The gate is a module-scope constant, so this
 * resolves once.
 */
const NullPanel = () => null;
const DesignStudioPanel = designStudioAvailable
  ? (require('../components/DesignStudioPanel') as typeof import('../components/DesignStudioPanel'))
      .DesignStudioPanel
  : NullPanel;

/**
 * The root mode switch (BRAZOS_MASTER_PLAN.md §F, enforcement mechanism 2).
 *
 * Exactly one tree is mounted. That is the structural half of mode isolation:
 * a worker screen cannot render in customer mode because it is not there, no
 * matter what any component tries to do.
 *
 * WHY THE HOLD
 * Mode resolution is asynchronous (a cached value, a server value, and possibly
 * a just-made Setup choice — see modes/ModeProvider.tsx). Rendering a guessed
 * tree and swapping it when the real answer lands is precisely the "flash
 * between modes" this must not do, so the shell holds the same neutral loader
 * the root navigator already uses for its own gates. Session restoration is
 * unaffected: the loader replaces the tree, not the session, and the resolution
 * that clears it is the one that reads the restored account's persisted mode.
 *
 * WHY IT CANNOT LOOP
 * There is no redirect here — no navigate, no reset, no effect that reacts to
 * the rendered tree. The mode is a value; the tree is a function of that value.
 * The only thing that changes the value is switchMode(), and it is driven by a
 * user action, never by what is on screen.
 *
 * WHY THE SWAP TAKES TWO COMMITS
 * `treeMode` trails `mode` by one commit during a switch (the provider owns
 * that sequencing — see "THE SWAP IS TWO COMMITS" in modes/ModeProvider.tsx).
 * While they differ, this shell renders the painted ground and NO navigator
 * tree: the outgoing tree unmounts completely — its cleanup empties the
 * navigation container's one root-state store — before the incoming tree
 * first renders and initializes fresh. Mounting both halves of the swap in a
 * single commit let the incoming tree adopt the outgoing mode's navigation
 * state (both trees root in the same navigator type), which left every
 * dispatch inside the Home tab evaluating against the other mode's routes:
 * the device-reproduced "NAVIGATE ... was not handled by any navigator" red
 * box that only a reload cleared. The gap commit is a single frame of the
 * same background the trees paint, and the mode-switch overlay is at rest
 * covering the screen for the whole of it.
 *
 * WHY THIS ALSO PAINTS THE GROUND (emerald D2)
 * The floating nav pill (Prestige 0d) sits in normal layout flow and floats by
 * MARGINS — 12pt each side and at least 12pt below, growing to the full home-
 * indicator inset on a notched device. Nothing painted that margin gap. The
 * scene above it is painted by @react-navigation/elements' <Background>
 * (colors.background) from inside <Screen>, but the tab bar is a SIBLING of
 * the scene container, so the navigation theme never reached the bar row;
 * BottomTabView's own SafeAreaProviderCompat, App.tsx's LaunchGate root View
 * and App.tsx's SafeAreaProvider are all `{ flex: 1 }` with no colour. The gap
 * therefore fell through to the iOS root view, which is WHITE by platform
 * default — the white band the dark device pass photographed under the pill.
 *
 * The ground belongs HERE rather than in ui/primitives/BottomNav.tsx: this is
 * the single parent of both trees, it already resolves the palette for the
 * loader, and one View fixes the bar gap for customer and worker at once
 * without the bar primitive growing a second painted surface. The pill stays
 * the only thing the bar row paints. Structural, so it applies in BOTH themes:
 * in light the gap stops being pure white and becomes the same warm ivory the
 * scene above it already uses, which is a seam removed rather than a colour
 * introduced.
 *
 * RUN H3 (C3) — AND THE GROUND FOLLOWS THE SCREEN, because `background` is not
 * every screen's page colour. On the light customer Home render this View was
 * painting #F4F1E8 through the bar row while the page above it painted
 * #FAF5F1, so a band ran the full width under the pill — y 770..851 at
 * 393x852, the pill's 12pt side margins and the 12pt gap beneath it. This View
 * is the ONE node that paints that region; the DOM chain under a point in the
 * band has exactly one painted ancestor between the tab navigator's own
 * SafeAreaProviderCompat and the document body, and it is this one.
 *
 * WHAT IT WAS PAINTING WAS NOT WRONG. `background` IS the page ground for
 * twenty-seven of the thirty screens — the same render of WORKER Home shows
 * one continuous ground straight through the bar row and no band at all. The
 * three screens that paint `homeBackground` (customer Home, JobDetail,
 * WorkerResults) are the outliers, and a screen cannot paint below itself
 * because bottom-tabs lays the scene and the bar out as siblings. So the fix
 * is not a different constant here — that would MOVE the band onto the other
 * twenty-seven — but a ground the focused screen names for itself. See
 * lib/shellGround.tsx for why it is focus-scoped and why it carries a token
 * name rather than a colour.
 *
 * In DARK this resolves to no change whatever: `homeBackground` and
 * `background` are the same #02110D there, so that bar row was already
 * painting the page ground.
 */
export function ModeShell() {
  const { mode, treeMode, ready, armResolution } = useMode();
  const { palette, isDark } = useThemeColors();
  // Declared by whichever screen is focused; null until one does, and null
  // again the moment it blurs — so a screen that says nothing leaves this
  // exactly where it has always been.
  const { ground, setGround } = useShellGroundState();
  const treeGround = ground ? palette[ground] : palette.background;
  // 2026-09-27 (the Lux remake, ruling 9): in dark the shell paints the Lux
  // gradient over that flat ground, so the bar row and any screen that lets
  // the shell show through sit on the one ground the screens draw themselves.
  const luxGround = screenGround(palette, isDark);

  // Resolution starts here rather than when the session appears, because this
  // component mounts only after auth + legal + setup have all resolved — and
  // Setup's "Start in: Find work" choice does not exist until that last one
  // finishes. Arming on the session alone would race that choice and lose it.
  useEffect(() => {
    armResolution();
  }, [armResolution]);

  if (!ready) {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }, luxGround]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  // The gap commit of the two-commit swap: no tree at all, so the outgoing
  // navigators unmount before the incoming ones exist. Ground only — the
  // switch overlay covers this frame entirely.
  if (treeMode !== mode) {
    return <View style={[styles.tree, { backgroundColor: palette.background }, luxGround]} />;
  }

  // The provider sits OUTSIDE the painted View on purpose: the View is the
  // consumer of what the trees inside it declare, and nesting it the other way
  // would need a second node to read the value it had just set.
  return (
    <ShellGroundProvider value={setGround}>
      {/* Fix run D13: who pins a footer over the pill, shared by the screens and the bar's fade. */}
      <PinnedFootProvider>
      <View style={[styles.tree, { backgroundColor: treeGround }, luxGround]}>
        {treeMode === 'worker' ? <WorkerRoot /> : <CustomerRoot />}
        {/* 2026-09-21 — THE PAINT SIGNAL the mode switch's reveal waits for:
            keyed by the tree, so it lays out in the same pass as the incoming
            tree's first layout and reports it (components/ModeTransitionOverlay.tsx).
            Draws nothing, takes no touch, changes no layout. */}
        <ModeTreeLayoutSignal key={treeMode} />
      </View>
      </PinnedFootProvider>
      {/* FENCE: DESIGN STUDIO (RUN S2 C1) — PERMANENT and CHANNEL-GATED: the panel mounts only where lib/designStudioGate.ts says the studio may exist (Metro __DEV__, or update channel internal/development; FAIL CLOSED on preview, production and unknown). tests/designStudio.test.mjs pins this gate — no future run may loosen it. Renders null until toggled on the Appearance screen. */}
      {designStudioAvailable ? <DesignStudioPanel /> : null}
    </ShellGroundProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Colourless here; the ground comes from the resolved palette at render
  // time, the same arrangement the loader above uses.
  tree: {
    flex: 1,
  },
});
