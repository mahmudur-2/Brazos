import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentsMode } from '../lib/adapters/payments';
import { payoutSetupNotice, payoutsCta, type PayoutsStatus } from '../lib/payments';
import {
  beginPayoutsOnboarding,
  fetchMyPayoutsStatus,
  refreshPayoutsStatus,
} from '../lib/payments/stripe';
import { fetchMyEarnings, type EarningsRow } from '../lib/earnings';
import type { ProfileStackParamList } from '../lib/navigation';
import { EYEBROW_TYPE, radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * R6c (D1) — Payouts: the worker's payout state, over the R5b Connect
 * contract (HANDOFF.md R5b "FOR R6 — THE CLIENT").
 *
 * TWO READS, ONE MOVER. The first render reads my_payouts_status() — the
 * cheap read of the STORED state. A Refresh, every foreground return while
 * this screen is focused, and the brazos://payouts?from=return bounce call
 * connect-status (the only thing that moves payouts_status after onboarding)
 * and then re-read my_payouts_status(). Nothing here ever sets a state on its
 * own — not off the bounce, not off the onboarding response; "Payouts are set
 * up" is said only when the database holds `enabled`.
 *
 * THE FOUR STATES render exactly the contract: none → "Set up payouts";
 * action_needed → "Finish setting up payouts" (the same call — the provider
 * resumes where the worker left off); under_review → "Payouts under review",
 * no CTA, a refresh offered; enabled → no CTA, a plain "Payouts are set up".
 * The mapping is payoutsCta() in lib/payments.ts, executed by
 * tests/payouts.test.mjs.
 *
 * THE LINK opens in a SYSTEM BROWSER session — Linking.openURL, never a
 * WebView (expo-web-browser is not installed, and this run adds no
 * dependency). ?from=refresh means the single-use link expired unused: the
 * screen requests a fresh one immediately and says so in one sentence.
 *
 * No sentence here says "verified" or makes an identity claim —
 * payouts_enabled is not identity verification. No user-facing string names
 * the provider.
 */

/** R6c (D2): the one sentence the screen says when the bounce was ?from=refresh. */
export const PAYOUTS_LINK_EXPIRED_NOTICE =
  'That setup link had expired, so a fresh one was requested — continue below.';
/** Outside the card path there is no payout account to show. */
export const PAYOUTS_SANDBOX_BODY =
  'Test mode: cash out from Earnings is a test, and no payout account exists.';
export const PAYOUTS_DISABLED_BODY =
  'Payments aren’t available right now, so there is no payout account to set up.';
export const PAYOUTS_OPEN_FAILED =
  'The setup page could not be opened on this device. Nothing changed — try again.';

const STATUS_ICON: Record<PayoutsStatus, keyof typeof Ionicons.glyphMap> = {
  none: 'wallet-outline',
  action_needed: 'alert-circle-outline',
  under_review: 'time-outline',
  enabled: 'checkmark-circle-outline',
};

export function PayoutsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const { params } = useRoute<RouteProp<ProfileStackParamList, 'Payouts'>>();
  const from = params?.from;
  const at = params?.at;

  const [status, setStatus] = useState<PayoutsStatus | null>(null);
  // n4b (2026-09-05): the payee's own ledger rows, read beside the status so
  // the notice can say when an approved payment is waiting on setup. Null
  // until read — unknown, and unknown renders nothing.
  const [rows, setRows] = useState<EarningsRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A link already minted for ?from=refresh, opened on the next tap.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const stripe = paymentsMode === 'stripe';
  const userId = user?.id ?? null;

  /** The cheap read: the stored state, nothing asked of the provider — then
   *  (n4b) the same ledger read Earnings makes, so the notice above the action
   *  button can say when an approved payment is waiting on setup. A failed
   *  ledger read leaves the rows null, and the notice stays silent rather
   *  than guessing; it never touches the status. */
  const readStatus = useCallback(async () => {
    if (!stripe) return;
    const { data, error } = await fetchMyPayoutsStatus();
    if (!activeRef.current) return;
    if (error) {
      setLoadError(userMessage(error));
      return;
    }
    setLoadError(null);
    setStatus(data);
    if (!userId) return;
    const earnings = await fetchMyEarnings(userId);
    if (!activeRef.current) return;
    setRows(earnings.data?.rows ?? null);
  }, [stripe, userId]);

  /** The refresh: connect-status, then the re-read. The stored state is the
   *  truth either way — a failed refresh leaves the last read standing. */
  const refresh = useCallback(async () => {
    if (!stripe || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { error } = await refreshPayoutsStatus();
      if (!activeRef.current) return;
      if (error) setRefreshError(userMessage(error));
      await readStatus();
    } finally {
      refreshingRef.current = false;
      if (activeRef.current) setRefreshing(false);
    }
  }, [stripe, readStatus]);

  // First render and every focus: the cheap read. While focused, every
  // foreground return refreshes — that is the worker coming back from the
  // browser, bounce or no bounce.
  useFocusEffect(
    useCallback(() => {
      void readStatus();
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') void refresh();
      });
      return () => subscription.remove();
    }, [readStatus, refresh])
  );

  /** connect-onboarding: the single-use url, and the stored state re-read
   *  (a brand-new account is action_needed) rather than trusted off the body. */
  const requestLink = useCallback(async (): Promise<string | null> => {
    const { data, error } = await beginPayoutsOnboarding();
    if (!activeRef.current) return null;
    if (error || !data) {
      await alertAsync(
        'Could not start payout setup',
        `${userMessage(error, 'Check your connection and try again.')}\n\nNothing changed.`
      );
      return null;
    }
    await readStatus();
    return data.url;
  }, [readStatus]);

  // The bounce (D2). from=return: the connect-status refresh. from=refresh:
  // the link expired unused — a fresh one now, and one sentence saying so.
  // `at` changes on every arrival, so a repeated bounce runs this again.
  useEffect(() => {
    if (!stripe || !from) return;
    if (from === 'return') {
      void refresh();
      return;
    }
    let active = true;
    (async () => {
      setNotice(PAYOUTS_LINK_EXPIRED_NOTICE);
      const url = await requestLink();
      if (active && url) setFreshUrl(url);
    })();
    return () => {
      active = false;
    };
  }, [stripe, from, at, refresh, requestLink]);

  /** The one CTA, for none and action_needed alike: a fresh link unless one
   *  is already in hand, opened in the system browser. */
  async function openSetup() {
    if (opening) return;
    setOpening(true);
    try {
      const url = freshUrl ?? (await requestLink());
      if (!url || !activeRef.current) return;
      setFreshUrl(null);
      setNotice(null);
      try {
        await Linking.openURL(url);
      } catch {
        await alertAsync('Could not open payout setup', PAYOUTS_OPEN_FAILED);
      }
    } finally {
      if (activeRef.current) setOpening(false);
    }
  }

  const view = status ? payoutsCta(status) : null;
  // n4b: both reads or nothing — null is unknown, and unknown says nothing.
  const setupNotice = status && rows ? payoutSetupNotice(status, rows) : null;

  /** The one button of the action bar: the setup CTA for none and
   *  action_needed, Refresh for under_review, nothing when enabled. */
  const actionButton = view?.cta ? (
    <Button title={view.cta} onPress={() => void openSetup()} loading={opening} disabled={opening} />
  ) : view?.refresh ? (
    <Button
      title="Refresh"
      variant="secondary"
      onPress={() => void refresh()}
      loading={refreshing}
      disabled={refreshing}
    />
  ) : undefined;

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : !stripe
      ? {
          kind: 'permissionDenied',
          title: 'Payouts are on the card path only',
          body: paymentsMode === 'sandbox' ? PAYOUTS_SANDBOX_BODY : PAYOUTS_DISABLED_BODY,
        }
      : loadError
        ? { kind: 'error', message: loadError, onRetry: () => void readStatus() }
        : !view || !status
          ? { kind: 'loading', variant: 'spinner' }
          : { kind: 'ready' };

  return (
    <DetailScreen
      title="Payouts"
      subtitle="Where approved payments land"
      onBack={goBackOrHome}
      headerRight={
        stripe && view ? (
          <Pressable
            style={styles.refreshButton}
            onPress={() => void refresh()}
            disabled={refreshing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh payout status"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.emerald} />
            ) : (
              <Ionicons name="refresh" size={22} color={colors.emerald} />
            )}
          </Pressable>
        ) : undefined
      }
      state={state}
      sections={
        !view || !status
          ? []
          : [
              {
                content: (
                  <View style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                      <View style={styles.statusGlyph}>
                        <Ionicons name={STATUS_ICON[status]} size={18} color={colors.emerald} />
                      </View>
                      <View style={styles.statusCopy}>
                        <Text style={styles.eyebrow}>PAYOUT STATUS</Text>
                        <Text style={styles.headline}>{view.headline}</Text>
                      </View>
                    </View>
                    <Text style={styles.body}>{view.body}</Text>
                    {refreshing ? (
                      <Text style={styles.meta}>Checking with the payment provider…</Text>
                    ) : null}
                    {refreshError ? <Text style={styles.errorText}>{refreshError}</Text> : null}
                  </View>
                ),
              },
              ...(notice
                ? [
                    {
                      content: (
                        <View style={styles.noticeCard}>
                          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                          <Text style={styles.noticeText}>{notice}</Text>
                        </View>
                      ),
                    },
                  ]
                : []),
              {
                title: 'How payouts work',
                content: (
                  <View style={styles.explainer}>
                    <ExplainRow
                      icon="open-outline"
                      strong="Set up once"
                      text="a short setup with the payment provider, in your browser. You come straight back here when it’s done."
                    />
                    <ExplainRow
                      icon="checkmark-done-outline"
                      strong="Approved payments transfer on their own"
                      text="when a customer approves your finished work, the payment is released and transferred to you on the provider’s schedule."
                    />
                    <ExplainRow
                      icon="wallet-outline"
                      strong="No cash-out step"
                      text="there is nothing to trigger. Earnings shows each payment as held, released and transferred as it happens."
                    />
                  </View>
                ),
              },
            ]
      }
      actionBar={
        actionButton ? (
          <>
            {setupNotice ? <Text style={styles.body}>{setupNotice}</Text> : null}
            {actionButton}
          </>
        ) : undefined
      }
    />
  );
}

function ExplainRow({
  icon,
  strong,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  strong: string;
  text: string;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.explainRow}>
      <Ionicons name={icon} size={18} color={colors.emerald} />
      <Text style={styles.explainText}>
        <Text style={styles.explainStrong}>{strong}</Text> — {text}
      </Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    refreshButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusCard: {
      padding: spacing.lg,
      gap: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.mint2,
      backgroundColor: colors.surface,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    statusGlyph: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    statusCopy: {
      flex: 1,
      gap: 2,
    },
    eyebrow: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    headline: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.ink,
    },
    body: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    meta: {
      fontSize: 12,
      color: colors.textMuted,
    },
    errorText: {
      fontSize: 12,
      color: colors.danger,
      lineHeight: 17,
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    noticeText: {
      flex: 1,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    explainer: {
      gap: spacing.md,
    },
    explainRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    explainText: {
      flex: 1,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    explainStrong: {
      fontWeight: '800',
      color: colors.ink,
    },
  })
);
