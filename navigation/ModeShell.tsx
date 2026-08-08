import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useMode } from '../modes';
import { colors } from '../lib/theme';
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
 */
export function ModeShell() {
  const { mode, ready, armResolution } = useMode();

  // Resolution starts here rather than when the session appears, because this
  // component mounts only after auth + legal + setup have all resolved — and
  // Setup's "Start in: Find work" choice does not exist until that last one
  // finishes. Arming on the session alone would race that choice and lose it.
  useEffect(() => {
    armResolution();
  }, [armResolution]);

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return mode === 'worker' ? <WorkerRoot /> : <CustomerRoot />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
