import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { EmptyState } from '../primitives';
import { layout, radius, spacing } from '../tokens';
import { useThemeColors } from '../../lib/theme';
import { Skeleton } from '../../components/Skeleton';

/**
 * The five non-ready screen states every template ships with (§I: "each ships
 * loading / empty / error+retry / offline / permission-denied states built in,
 * so every screen inherits them for free").
 *
 * The point of centralising these is that a screen author cannot forget one.
 * A template takes a single `state` prop; if it is anything other than
 * `ready`, the template renders this instead of its own body. Screens
 * configure the copy, they do not reimplement the state.
 *
 * Every variant is deliberately reachable with default copy — a screen that
 * passes `{ kind: 'error' }` and nothing else still gets a usable, honest
 * error surface rather than a blank frame.
 */

export type ScreenState =
  | { kind: 'ready' }
  | {
      kind: 'loading';
      /** `skeleton` mimics the shape of the content that is coming, which is
       *  the better default for lists and detail bodies. `spinner` is for
       *  short waits where a fake shape would be misleading. */
      variant?: 'skeleton' | 'spinner';
      /** Skeleton rows to draw. Ignored by the spinner variant. */
      rows?: number;
    }
  | {
      kind: 'empty';
      title?: string;
      body?: string;
      actionLabel?: string;
      onAction?: () => void;
    }
  | {
      kind: 'error';
      /** Prefer a plain-language sentence over a raw error string. */
      message?: string;
      onRetry?: () => void;
    }
  | { kind: 'offline'; onRetry?: () => void }
  | {
      kind: 'permissionDenied';
      title?: string;
      body?: string;
      /** Usually "Open Settings" — the OS prompt is one-shot, so a denied
       *  permission can only be changed there. */
      actionLabel?: string;
      onAction?: () => void;
    };

export function isReady(state: ScreenState | undefined): boolean {
  return !state || state.kind === 'ready';
}

export function ScreenStateView({ state }: { state: Exclude<ScreenState, { kind: 'ready' }> }) {
  const { emerald: colors } = useThemeColors();
  switch (state.kind) {
    case 'loading':
      if (state.variant === 'spinner') {
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.forest} />
          </View>
        );
      }
      return (
        <View style={styles.skeletonWrap} accessibilityLabel="Loading">
          {Array.from({ length: state.rows ?? 4 }).map((_, i) => (
            <Skeleton key={i} style={styles.skeletonRow} />
          ))}
        </View>
      );

    case 'empty':
      return (
        <EmptyState
          icon="file-tray-outline"
          title={state.title ?? 'Nothing here yet'}
          body={state.body}
          actionLabel={state.actionLabel}
          onAction={state.onAction}
        />
      );

    case 'error':
      return (
        <EmptyState
          icon="alert-circle-outline"
          tone="attention"
          title="Something went wrong"
          body={state.message ?? 'That did not load. It is usually temporary.'}
          actionLabel={state.onRetry ? 'Try again' : undefined}
          onAction={state.onRetry}
        />
      );

    case 'offline':
      return (
        <EmptyState
          icon="cloud-offline-outline"
          tone="attention"
          title="You are offline"
          body="Reconnect to load this. Anything you have already typed is kept."
          actionLabel={state.onRetry ? 'Try again' : undefined}
          onAction={state.onRetry}
        />
      );

    case 'permissionDenied':
      return (
        <EmptyState
          icon="lock-closed-outline"
          title={state.title ?? 'Permission needed'}
          body={
            state.body ??
            'This screen needs a permission that is currently turned off. You can change it in Settings.'
          }
          actionLabel={state.actionLabel ?? (state.onAction ? 'Open Settings' : undefined)}
          onAction={state.onAction}
        />
      );
  }
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenGutter,
  },
  skeletonWrap: {
    flex: 1,
    gap: spacing.md,
    padding: layout.screenGutter,
  },
  skeletonRow: {
    height: 78,
    borderRadius: radius.md,
  },
});
