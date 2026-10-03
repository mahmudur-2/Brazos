import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Divider } from '../ui/primitives/Divider';
import { Chip } from './Chip';
import { DrawnCheck } from './DrawnCheck';
import { PostJobBar } from './PostJobBar';
import { useLoopActive } from '../hooks/useLoopActive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { arrivalWindowLabel, formatBudget, JOB_CATEGORY_LABELS, type Job } from '../lib/jobs';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { pricingModeFrom } from '../lib/pricingMode';
import {
  EYEBROW_TYPE,
  fonts,
  spacing,
  themedStyles,
  litCardStyle,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  screenGround,
} from '../lib/theme';

/** The live page's tick tile (refs/publish-moment.html `.tick`), 20 under the
 *  status bar (the reference's 74 under its 54). */
const TILE = 76;
const TILE_TOP = 20;
/** The lit start of the track: the reference's 56pt mint-to-clear gradient,
 *  drawn as seven steps — there is no gradient library. */
const FADE = [1, 0.86, 0.71, 0.57, 0.43, 0.29, 0.14];
const FADE_STEP = 8;

/**
 * 2026-09-28 (LUX-LIST-64 #42) — YOUR JOB IS LIVE, the page the Seal opens
 * (refs/publish-moment.html, the live screen): a 76 tile whose tick draws
 * itself; "Your job is live." (the posting flow's serif, 32) and "Workers nearby
 * can see it now."; the published card in the review summary's layout —
 * PUBLISHED and "Just now", the title, then CATEGORY as a chip, BUDGET ("Up to
 * $120", the price white — #40), AREA and TIMING — read back off the SAVED row,
 * never the form; WHAT HAPPENS NEXT — bids (or requests) arrive, you choose and
 * we hold the payment, you approve and then they're paid — its first step
 * pulsing; "We'll let you know when the first bid arrives."; and the bar in the
 * places the review step's had: Back to Home where Save draft was, "View job and
 * bids →" where Publish was. Everything arrives in order on the native driver;
 * Reduce Motion places it all at once.
 */
export type LiveJob = Pick<
  Job,
  | 'title'
  | 'category'
  | 'location'
  | 'pricing_mode'
  | 'budget_cents'
  | 'budget_max_cents'
  | 'scheduled_date'
  | 'arrival_start_hour'
  | 'arrival_end_hour'
>;

export function JobLivePage({
  job,
  onBackHome,
  onViewJob,
}: {
  /** The SAVED row — the card states what the database holds, never the form. */
  job: LiveJob;
  onBackHome: () => void;
  onViewJob: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const still = reducedMotion !== false;
  const beats = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(still ? 1 : 0))).current;
  const tick = useRef(new Animated.Value(still ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [stepperWidth, setStepperWidth] = useState(0);
  // FIX-RUN F16: the loop runs only while its screen is on top and the app is in front.
  const loopActive = useLoopActive();

  useEffect(() => {
    if (still) {
      beats.forEach((beat) => beat.setValue(1));
      tick.setValue(1);
      return;
    }
    Animated.stagger(
      70,
      beats.map((beat) =>
        Animated.timing(beat, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER })
      )
    ).start();
    Animated.sequence([
      Animated.delay(260),
      Animated.timing(tick, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [beats, still, tick]);

  useEffect(() => {
    if (still || !loopActive) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [loopActive, pulse, still]);

  const rise = (beat: Animated.Value, from = 14) => ({
    opacity: beat,
    transform: [{ translateY: beat.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  const mode = pricingModeFrom(job.pricing_mode);
  const posted = mode === 'posted_price';
  const cents = posted ? job.budget_cents : job.budget_max_cents ?? null;
  const timing = arrivalWindowLabel(job) ?? 'Flexible';

  // The line from the first node to the last, behind the three.
  const nodeGap = 10;
  const column = stepperWidth > 0 ? (stepperWidth - nodeGap * 2) / 3 : 0;

  return (
    <View style={[styles.page, screenGround(colors, isDark)]}>
      {/* The page covers the whole window, so it clears the status bar itself. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + TILE_TOP }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.tile,
            {
              opacity: beats[0],
              transform: [{ scale: beats[0].interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.6, 1.06, 1] }) }],
            },
          ]}
          accessible
          accessibilityLabel="Your job is published"
        >
          <DrawnCheck size={40} color={colors.emerald} progress={tick} />
        </Animated.View>

        <Animated.Text style={[styles.title, rise(beats[1])]}>Your job is live.</Animated.Text>
        <Animated.Text style={[styles.sub, rise(beats[2])]}>Workers nearby can see it now.</Animated.Text>

        <Animated.View style={rise(beats[3], 18)}>
          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.eyebrow}>PUBLISHED</Text>
              <Text style={styles.hint}>Just now</Text>
            </View>
            <Text style={styles.jobTitle} numberOfLines={2}>
              {job.title}
            </Text>
            <Divider thickness={1} style={styles.hr} />
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.label}>CATEGORY</Text>
                <View style={styles.chipRow}>
                  <Chip label={JOB_CATEGORY_LABELS[job.category]} variant="soft" size="sm" />
                </View>
              </View>
              <View style={styles.cell}>
                <Text style={styles.label}>{posted ? 'PRICE' : 'BUDGET'}</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {cents != null ? (
                    <>
                      {posted ? null : <Text style={styles.valueSub}>Up to </Text>}
                      <Text style={styles.money}>{formatBudget(cents)}</Text>
                    </>
                  ) : (
                    <Text style={styles.valueSub}>No maximum</Text>
                  )}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.label}>AREA</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {job.location}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.label}>TIMING</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {timing}
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View style={[styles.next, litCardStyle(isDark), rise(beats[4], 18)]}>
          <Text style={styles.eyebrow}>WHAT HAPPENS NEXT</Text>
          <View style={styles.stepper} onLayout={(event) => setStepperWidth(event.nativeEvent.layout.width)}>
            {column > 0 ? (
              <>
                <View style={[styles.track, { left: 7, width: column * 2 + nodeGap * 2 }]} />
                {FADE.map((alpha, i) => (
                  <View
                    key={alpha}
                    style={[styles.track, { left: 7 + i * FADE_STEP, width: FADE_STEP, backgroundColor: withAlpha(colors.emerald, alpha) }]}
                  />
                ))}
              </>
            ) : null}
            {[
              [posted ? 'Requests arrive' : 'Bids arrive', 'From workers nearby'],
              ['You choose', 'We hold the payment'],
              ['You approve', 'Then they’re paid'],
            ].map(([head, sub], i) => (
              <View key={head} style={styles.step}>
                <View style={[styles.node, i === 0 && styles.nodeOn]}>
                  {i === 0 && !still ? (
                    <Animated.View
                      style={[
                        styles.nodePulse,
                        {
                          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
                          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
                        },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={styles.stepHead}>{head}</Text>
                <Text style={styles.stepSub}>{sub}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* A promise the app keeps: `bid_received` reaches the job's owner and
            notification_prefs.bids defaults to on (tests/postJobPublish D22). */}
        <Animated.View style={[styles.notify, rise(beats[5], 10)]}>
          <Ionicons name="notifications-outline" size={18} color={colors.emerald} />
          <Text style={styles.notifyText}>We’ll let you know when the first bid arrives.</Text>
        </Animated.View>
      </ScrollView>

      <PostJobBar
        secondary={{ label: 'Back to Home', onPress: onBackHome }}
        primary={{ label: 'View job and bids', onPress: onViewJob }}
        primaryTrailingIcon="arrow-forward"
      />
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md + 2,
    },
    tile: {
      alignSelf: 'center',
      width: TILE,
      height: TILE,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.emerald, 0.35),
      backgroundColor: withAlpha(colors.surface, 0.72),
      shadowColor: colors.emerald,
      shadowOpacity: 0.22,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 0 },
      marginBottom: spacing.xs + 2,
    },
    // The posting flow's one serif — the live page's headline (LUX-LIST-64 #42).
    title: {
      fontFamily: fonts.displayHero,
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      letterSpacing: -0.5,
      textAlign: 'center',
      color: colors.ink,
    },
    sub: {
      marginTop: -spacing.sm,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      color: colors.textMuted,
    },
    card: {
      paddingTop: 18,
      paddingHorizontal: 18,
      paddingBottom: 16,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    eyebrow: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    hint: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    // The same serif title the review summary shows — this is that card, published.
    jobTitle: {
      marginTop: 10,
      fontFamily: fonts.displayHero,
      fontSize: 21,
      lineHeight: 26,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: colors.ink,
    },
    // The Divider draws the 1 pt border-role rule; this is only its offset.
    hr: {
      marginTop: 14,
    },
    grid: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 14,
      rowGap: 12,
    },
    cell: {
      width: '46%',
      flexGrow: 1,
    },
    label: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    chipRow: {
      marginTop: 4,
      flexDirection: 'row',
    },
    value: {
      marginTop: 5,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      color: colors.ink,
    },
    valueSub: {
      fontWeight: '500',
      color: colors.textMuted,
    },
    money: {
      fontWeight: '700',
      color: colors.money,
    },
    next: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: withAlpha(colors.surface, 0.5),
    },
    stepper: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 10,
    },
    track: {
      position: 'absolute',
      top: 6,
      height: 2,
      backgroundColor: colors.border,
    },
    step: {
      flex: 1,
      minWidth: 0,
    },
    node: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: 6,
    },
    nodeOn: {
      borderColor: colors.emerald,
      backgroundColor: colors.emerald,
    },
    nodePulse: {
      position: 'absolute',
      left: -8,
      top: -8,
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: withAlpha(colors.emerald, 0.6),
    },
    stepHead: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '700',
      color: colors.ink,
    },
    stepSub: {
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textMuted,
    },
    notify: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: spacing.xs,
    },
    notifyText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
  })
);
