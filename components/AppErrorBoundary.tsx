import { Component, Fragment, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type AppErrorBoundaryState = {
  crashed: boolean;
  /** Bumped on every reset so the child tree remounts from scratch. */
  generation: number;
};

/**
 * The application's ONE error boundary. It wraps RootNavigator inside the
 * NavigationContainer (App.tsx), so an uncaught render/lifecycle error in any
 * screen lands here instead of killing the process — while the launch overlay
 * and the container itself (navigationRef, the parked cold-start replay) sit
 * outside and are never interfered with.
 *
 * Recovery is a real remount, not a re-render: "Try again" bumps the key on
 * the child tree, so every navigator under RootNavigator rebuilds from its
 * initial state. That trades the crashed screen's stack for a working app —
 * the same trade a forced app restart makes, minus the restart.
 *
 * Scope: a boundary catches DESCENDANT render/lifecycle errors only. Async
 * callbacks, event handlers, and rejected promises never reach it, by React's
 * own contract — those stay the job of each call site's error handling.
 *
 * A class component is required (React exposes no hook for error boundaries)
 * and it is hand-rolled — no error-boundary dependency is installed and none
 * may be added. The fallback UI is a separate function component so it can
 * read the resolved theme (4D-4): the boundary sits BELOW ThemeProvider, and
 * a crash in the screen tree never unmounts the provider above it, so the
 * hook is safe in every scenario where this fallback can render at all.
 */
export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { crashed: false, generation: 0 };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Dev console only, never a user surface — but it MUST log the full error
    // and component stack, or the boundary silently masks every defect it
    // catches instead of surfacing it during verification.
    if (__DEV__) {
      console.error(
        '[AppErrorBoundary] uncaught render/lifecycle error',
        error,
        info.componentStack
      );
    }
  }

  private reset = (): void => {
    this.setState((prev) => ({ crashed: false, generation: prev.generation + 1 }));
  };

  render(): ReactNode {
    if (this.state.crashed) {
      return <CrashFallback onReset={this.reset} />;
    }

    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}

function CrashFallback({ onReset }: { onReset: () => void }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        The app ran into a problem it couldn’t recover from on its own. Your
        account, jobs, and messages are safe.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    maxWidth: 320,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonLabel: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  }),
);
