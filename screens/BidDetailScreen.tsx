import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { StatusPill } from '../ui/primitives/StatusPill';
import { useAuth } from '../hooks/useAuth';
import { useJobOffers } from '../hooks/useJobOffers';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { completionPercent } from '../lib/profiles';
import {
  acceptOffer,
  countersRemaining,
  declineOffer,
  effectiveOfferStatus,
} from '../lib/offers';
import { formatBudget } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import {
  emeraldColorsFor,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screen 29 — Bid Detail. The complete authoritative terms of one bid, the
 * worker's real record behind it, and the three decisions — accept, counter,
 * decline — each behind copy stating exactly what it does. Accepting flows
 * straight into the protected checkout (31): hiring and funding are one
 * continuous motion, with the job assigned the moment accept_offer() commits.
 */
export function BidDetailScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const emeraldColors = emeraldColorsFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'BidDetail'>>();
  const job = params.job;

  const { user } = useAuth();
  const { offers, loading, error, refresh } = useJobOffers(job.id);
  const offer = useMemo(
    () => offers.find((o) => o.id === params.offerId) ?? null,
    [offers, params.offerId]
  );
  const chain = useMemo(
    () =>
      offer ? offers.filter((o) => o.root_offer_id === offer.root_offer_id) : [],
    [offers, offer]
  );

  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);

  const effective = offer ? effectiveOfferStatus(offer) : null;
  const isMyTurn = !!offer && !!user && offer.awaiting_id === user.id;
  const canDecide = effective === 'pending' && isMyTurn;
  const countersLeft = user ? countersRemaining(chain, user.id) : 0;
  const workerName = offer?.worker?.full_name ?? 'this worker';

  const state: ScreenState =
    loading && offers.length === 0
      ? { kind: 'loading', variant: 'skeleton', rows: 4 }
      : error && offers.length === 0
        ? { kind: 'error', message: error, onRetry: () => void refresh() }
        : !offer
          ? {
              kind: 'empty',
              title: 'This bid is no longer here',
              body: 'It may have been withdrawn, or replaced by a newer offer in its negotiation.',
              actionLabel: 'Back to the job',
              onAction: goBackOrHome,
            }
          : { kind: 'ready' };

  async function doAccept() {
    if (!offer || actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    const { data: jobId, error: acceptError } = await acceptOffer(offer.id);
    actingRef.current = false;
    setActing(false);
    setConfirming(null);
    if (acceptError || !jobId) {
      await alertAsync(
        'Could not accept this bid',
        userMessage(acceptError, 'Check your connection and try again.')
      );
      void refresh();
      return;
    }
    // Hired. Funding is the immediate next step; replace so Back can never
    // land on a decision screen for a bid that has already won.
    navigation.replace('Checkout', { job });
  }

  // The pre-hire "Message <worker> first" entry and the thread lookup behind
  // it were removed with phase66: free-form messaging does not exist between
  // these two until the job is confirmed, and the thread this opened has no
  // composer until then. The pair's direct_threads row is still created with
  // the bid (phase52) and still carries the negotiation cards — nothing in
  // the data model changed, only the entry point.

  async function doDecline() {
    if (!offer || actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    const { error: declineError } = await declineOffer(offer.id);
    actingRef.current = false;
    setActing(false);
    setConfirming(null);
    if (declineError) {
      await alertAsync('Could not decline this bid', userMessage(declineError));
      void refresh();
      return;
    }
    goBackOrHome();
  }

  return (
    <>
      <DetailScreen
        title="Bid detail"
        subtitle={job.title}
        onBack={goBackOrHome}
        state={state}
        sections={
          offer
            ? [
                {
                  content: (
                    <View style={styles.headerCard}>
                      <View style={styles.statusRow}>
                        <StatusPill kind="offer" status={effective ?? offer.status} />
                        <Text style={styles.sentAt}>
                          Bid {formatTimeAgo(offer.created_at)}
                        </Text>
                      </View>
                      <Text style={styles.amount}>
                        {formatBudget(offer.amount_cents)}
                      </Text>
                      {offer.expires_at && effective === 'pending' ? (
                        <Text style={styles.expiry}>
                          Open until{' '}
                          {new Date(offer.expires_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          — then it expires on its own.
                        </Text>
                      ) : null}
                    </View>
                  ),
                },
                {
                  title: 'Who you’d be hiring',
                  content: (
                    <Pressable
                      style={({ pressed }) => [
                        styles.workerCard,
                        pressed && styles.pressed,
                      ]}
                      onPress={() =>
                        offer.worker &&
                        navigation.navigate('WorkerProfile', {
                          workerId: offer.worker.id,
                          workerName: offer.worker.full_name ?? undefined,
                        })
                      }
                      disabled={!offer.worker}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${workerName}’s profile`}
                    >
                      <Avatar
                        name={offer.worker?.full_name}
                        uri={offer.worker?.avatar_url}
                        size={52}
                      />
                      <View style={styles.workerText}>
                        <View style={styles.workerNameRow}>
                          <Text style={styles.workerName} numberOfLines={1}>
                            {offer.worker?.full_name ?? 'Worker'}
                          </Text>
                        </View>
                        <Text style={styles.workerMeta}>
                          {(offer.worker?.rating_count ?? 0) > 0 ? (
                            <>
                              {/* One star treatment, BOTH palettes: gold in
                                  dark, the Heritage `star` gold in light. The
                                  light side used to be `undefined`, which let
                                  the glyph inherit the meta line's muted grey
                                  — the one washed-out star left in the app. */}
                              <Text style={{ color: starColors(colors, isDark).filled }}>
                                ★
                              </Text>
                              {` ${(offer.worker?.rating_avg ?? 0).toFixed(1)} (${
                                offer.worker?.rating_count
                              } ${offer.worker?.rating_count === 1 ? 'review' : 'reviews'})`}
                            </>
                          ) : (
                            'No reviews yet'
                          )}
                          {completionPercent(offer.worker?.completion_rate) != null
                            ? ` · ${completionPercent(
                                offer.worker?.completion_rate
                              )}% completion`
                            : ''}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textSubtle}
                      />
                    </Pressable>
                  ),
                },
                ...(offer.message
                  ? [
                      {
                        title: 'Their pitch',
                        content: (
                          <Text style={styles.pitch} selectable>
                            “{offer.message}”
                          </Text>
                        ),
                      },
                    ]
                  : []),
                // No "Message <worker> first" here. phase52 opened pre-hire
                // chat; phase66 closes it again as a product rule — before the
                // job is confirmed the two sides interact through the offer,
                // and the server refuses a pre-confirmation message whatever a
                // screen offers. The thread still exists and still carries the
                // negotiation cards; it just has no composer yet.
                ...(effective === 'pending' && !isMyTurn
                  ? [
                      {
                        content: (
                          <View style={styles.waitingCard}>
                            <Ionicons
                              name="hourglass-outline"
                              size={18}
                              color={colors.textMuted}
                            />
                            <Text style={styles.waitingText}>
                              You countered — waiting for {workerName} to respond.
                            </Text>
                          </View>
                        ),
                      },
                    ]
                  : []),
                ...(canDecide
                  ? [
                      {
                        content: (
                          <View style={styles.consequences}>
                            <Text style={styles.consequenceLine}>
                              <Text style={styles.consequenceStrong}>Accept</Text> —
                              selects {workerName} for the job; the other active
                              bids close. You’ll protect the payment in checkout
                              next.
                            </Text>
                            <Text style={styles.consequenceLine}>
                              <Text style={styles.consequenceStrong}>Counter</Text> —
                              proposes your price instead ({countersLeft} left).
                            </Text>
                            <Text style={styles.consequenceLine}>
                              <Text style={styles.consequenceStrong}>Decline</Text> —
                              closes this bid; it can’t be accepted afterwards.
                            </Text>
                          </View>
                        ),
                      },
                    ]
                  : []),
              ]
            : []
        }
        actionBar={
          offer && canDecide ? (
            <View style={styles.actions}>
              <View style={styles.actionRow}>
                <Button
                  title="Decline"
                  variant="secondary"
                  palette={{
                    ...colors,
                    primary: colors.danger,
                    border: colors.danger,
                  }}
                  onPress={() => setConfirming('decline')}
                  disabled={acting}
                  style={styles.actionButton}
                />
                <Button
                  title="Counter"
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() =>
                    navigation.navigate('Counteroffer', {
                      job,
                      offer,
                      counterpartyName: workerName,
                      countersRemaining: countersLeft,
                    })
                  }
                  disabled={acting || countersLeft === 0}
                  style={styles.actionButton}
                />
              </View>
              <Button
                title={`Accept for ${formatBudget(offer.amount_cents)}`}
                palette={emeraldColors}
                onPress={() => setConfirming('accept')}
                loading={acting && confirming === 'accept'}
                disabled={acting}
              />
            </View>
          ) : undefined
        }
      />

      <ConfirmDialog
        visible={confirming === 'accept'}
        title={`Accept ${formatBudget(offer?.amount_cents ?? null)} from ${workerName}?`}
        message="This selects this bid for the job. The other active bids will no longer be eligible. Next, you’ll authorize and protect the payment in a sandbox checkout — no real money is charged in this development build."
        confirmText="Accept bid"
        cancelText="Cancel"
        loading={acting}
        palette={emeraldColors}
        onConfirm={doAccept}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        visible={confirming === 'decline'}
        title={`Decline ${workerName}’s bid?`}
        message="This declines this bid. It will no longer be available to accept. They can send a new bid unless the job is filled."
        confirmText="Decline bid"
        cancelText="Cancel"
        loading={acting}
        palette={emeraldColors}
        onConfirm={doDecline}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  headerCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sentAt: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.ink,
  },
  expiry: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  workerCard: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  pressed: {
    opacity: 0.72,
  },
  workerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workerName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  workerMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  pitch: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    fontStyle: 'italic',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  waitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  waitingText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  consequences: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  consequenceLine: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  consequenceStrong: {
    fontWeight: '800',
    color: colors.ink,
  },
  actions: {
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
  },
  }),
);
