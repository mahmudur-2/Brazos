import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../primitives';
import { layout, radius, spacing } from '../tokens';
import { metricStyles, useThemeColors } from '../../lib/theme';
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

/**
 * Fix run E7 — THE words for a screen that did not load, in one place. Every
 * load retry in the app reads `STATE_COPY.retry` (tests/screenStates.test.mjs
 * keeps "Retry" and "Refresh" out); a re-check of a payment or payout state
 * says "Check again" instead, because nothing failed.
 */
export const STATE_COPY = {
  errorTitle: 'Couldn’t load this',
  errorBody: 'It’s usually temporary.',
  retry: 'Try again',
  offlineTitle: 'You’re offline',
  offlineBody: 'Reconnect to load this. Anything you’ve typed is kept.',
} as const;

/** The error title for a named thing: `loadErrorTitle('jobs')` → "Couldn’t load jobs". */
export function loadErrorTitle(noun?: string): string {
  return noun ? `Couldn’t load ${noun}` : STATE_COPY.errorTitle;
}

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
      /** A line under the spinner ("Loading your jobs…"); also what VoiceOver says. */
      label?: string;
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
      /** `loadErrorTitle(noun)` when the screen can name what failed. */
      title?: string;
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

/** The full-screen wait every screen shares (E7): one spinner, one place. */
export const SPINNER_STATE = { kind: 'loading', variant: 'spinner' } as const satisfies ScreenState;

export function ScreenStateView({ state }: { state: Exclude<ScreenState, { kind: 'ready' }> }) {
  const styles = stylesFor();
  const { emerald: colors, palette } = useThemeColors();
  switch (state.kind) {
    case 'loading':
      if (state.variant === 'spinner') {
        return (
          <View style={styles.centered} accessible accessibilityLabel={state.label ?? 'Loading'}>
            <ActivityIndicator size="large" color={colors.forest} />
            {state.label ? <Text style={[styles.spinnerLabel, { color: palette.textMuted }]}>{state.label}</Text> : null}
          </View>
        );
      }
      return (
        <View style={styles.skeletonWrap} accessible accessibilityLabel="Loading">
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
          title={state.title ?? STATE_COPY.errorTitle}
          body={state.message ?? STATE_COPY.errorBody}
          actionLabel={state.onRetry ? STATE_COPY.retry : undefined}
          onAction={state.onRetry}
        />
      );

    case 'offline':
      return (
        <EmptyState
          icon="cloud-offline-outline"
          tone="attention"
          title={STATE_COPY.offlineTitle}
          body={STATE_COPY.offlineBody}
          actionLabel={state.onRetry ? STATE_COPY.retry : undefined}
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

const stylesFor = metricStyles(() => StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: layout.screenGutter,
  },
  spinnerLabel: {
    fontSize: 14,
    textAlign: 'center',
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
}));
