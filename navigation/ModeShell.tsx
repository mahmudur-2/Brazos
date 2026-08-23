import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useMode } from '../modes';
import { useThemeColors } from '../lib/theme';
import { CustomerRoot } from './CustomerRoot';
import { WorkerRoot } from './WorkerRoot';

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
 */
export function ModeShell() {
  const { mode, treeMode, ready, armResolution } = useMode();
  const { palette } = useThemeColors();

  // Resolution starts here rather than when the session appears, because this
  // component mounts only after auth + legal + setup have all resolved — and
  // Setup's "Start in: Find work" choice does not exist until that last one
  // finishes. Arming on the session alone would race that choice and lose it.
  useEffect(() => {
    armResolution();
  }, [armResolution]);

  if (!ready) {
    return (
      <View style={[styles.loader, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  // The gap commit of the two-commit swap: no tree at all, so the outgoing
  // navigators unmount before the incoming ones exist. Ground only — the
  // switch overlay covers this frame entirely.
  if (treeMode !== mode) {
    return <View style={[styles.tree, { backgroundColor: palette.background }]} />;
  }

  return (
    <View style={[styles.tree, { backgroundColor: palette.background }]}>
      {treeMode === 'worker' ? <WorkerRoot /> : <CustomerRoot />}
    </View>
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
