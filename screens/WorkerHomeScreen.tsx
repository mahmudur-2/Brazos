import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoid } from '../components/KeyboardAvoid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { HomeAtmosphere } from '../components/HomeAtmosphere';
import { HomeAvatarButton } from '../components/HomeAvatarButton';
import { LiveDot } from '../components/LiveDot';
import { NotificationBell } from '../components/NotificationBell';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { ServiceTileRow } from '../components/ServiceTileRow';
import { CategoryGlyph } from '../components/CategoryGlyph';
import { Skeleton } from '../components/Skeleton';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useWorkerSkills } from '../hooks/useWorkerSkills';
import { alertAsync } from '../lib/dialog';
import { openJobsPotential } from '../lib/earningsMath';
import { userMessage } from '../lib/errorMessage';
import { resolveCurrentPlace } from '../lib/geolocation';
import { fetchJobsWithinRadius } from '../lib/hotspots';
import { workerAttentionItems } from '../lib/homeAttention';
import {
  formatBudget,
  JOB_CATEGORY_ICONS,
  jobMatchesSkills,
  toOpenJob,
  type OpenJob,
} from '../lib/jobs';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { paymentsMode } from '../lib/adapters/payments';
import { fetchMyEarnings } from '../lib/earnings';
import { payoutSetupNotice, workerTakeCents } from '../lib/payments';
import { fetchMyPayoutsStatus } from '../lib/payments/stripe';
import { fetchNotificationPrefs } from '../lib/notificationPrefs';
import { effectiveOfferStatus } from '../lib/offers';
import type { WorkerHomeStackNavigation } from '../lib/navigation';
import { updateProfile } from '../lib/profiles';
import { MORE_SERVICES } from '../lib/skillCategories';
import { greetingFor } from '../lib/time';
import {
  litCardStyle, EYEBROW_TYPE,
  fonts,
  layout,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
  textLine,
  touchSlop,
} from '../lib/theme';
import { useDialNumber } from '../lib/designOverrides';
import { Divider, SearchBar, Toggle, useScrollClearance } from '../ui/primitives';
import { NEARBY_RADIUS_MILES } from './WorkerResultsScreen';

// Master 43's hero crop, mounted in BOTH themes since the 2026-08-22 parity
// pass (light previously omitted it and kept a full-width copy block). It is
// the only toolbox asset; its baked dark halo disc renders as drawn on light.
// 2026-09-21 — WebP (q90, alpha kept) from the PNG master beside it: 1,448 KB → 234 KB.
const PRESTIGE_TOOLBOX_ART = require('../assets/prestige/hero_toolbox_worker.webp');

const PREVIEW_COUNT = 3;

type NearbyState = 'checking' | 'unavailable' | 'loading' | 'ready';

/**
 * Worker Home (Stage 4D) — the worker tree's initial route.
 *
 * Every job-list intent here lands on WorkerResultsScreen — "View all" is
 * mode 'all', the search field is mode 'search', the two pills are 'skills'
 * and 'nearby' — one list surface, not a chain of them. The search field
 * keeps the retired atlas-48 browse screen's exact dispatch shape.
 *
 * Everything here is derived from data sources that already exist:
 *   - greeting: useProfile. 2026-09-28 (LUX-LIST-64 #61): the "Switch to
 *     Customer" pill left this screen — switching lives in Profile, behind
 *     the same confirm (components/ModeSwitchRow.tsx → switchMode()).
 *   - availability: the phase53 profiles.accepting_work field, read from the
 *     profile row and written through updateProfile() — the same path
 *     ServicesPricingScreen's toggle uses. The 4D-6 card renders it as the
 *     operator's status copy ("Online"/"Offline", a pulse dot with
 *     "Visible"/"Not Visible") — the WORDS are operator-authored; the FACT
 *     behind them is still the public availability field, never device
 *     presence (the device-local availability hook was deleted in Batch F).
 *   - potential earnings: lib/earningsMath.ts's openJobsPotential() over the
 *     open-jobs feed.
 *   - the two counts: jobMatchesSkills() over the feed for skill matches, and
 *     phase41's jobs_within_radius lookup for the nearby count — the exact
 *     sources WorkerResults itself renders from, so a count here can never
 *     disagree with what tapping it opens.
 */
export function WorkerHomeScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C2) — WORKER HOME'S OWN DIALS. Each falls back to the number this
  // file drew before the dial existed, spelled here and nowhere else. The two
  // that answer to a token take the `theme.*` scale, because this file imports
  // `spacing`/`radius` from lib/theme — ui/tokens' bare `radius.lg` is 17, not
  // 16, and pointing a child at it would move the card the moment the operator
  // turned the parent.
  const summaryCardRadius = useDialNumber('workerHome.summaryCard.radius') ?? radius.lg;
  const summaryCardGap = useDialNumber('workerHome.summaryCard.gap') ?? 14;
  const contentPaddingX = useDialNumber('workerHome.content.paddingX') ?? spacing.lg;
  const contentGap = useDialNumber('workerHome.content.gap') ?? spacing.lg;
  // RUN GROUND1 (C3): the nav pill is out of layout flow on this route, so this
  // scene is the whole screen and the atmosphere behind it reaches the bottom
  // edge instead of stopping at a band above the bar. The pill's footprint is
  // no longer reserved by the column, so it is reserved here — DERIVED from the
  // bar's own height plus the margin that floats it, never a static token.
  const navClearance = useScrollClearance();
  // Forest is a near-black deep green in the v2 dark palette, so a forest
  // glyph on a dark surface is invisible paint. Two resolved accents instead:
  // `accent` is the interactive green the masters draw, `glyph` the cream
  // they give the count-pill icons.
  const accent = isDark ? colors.emerald : colors.forest;
  const glyph = isDark ? colors.ink : colors.forest;
  const navigation = useNavigation<WorkerHomeStackNavigation>();
  const { user } = useAuth();
  const { profile, setProfile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const [refreshing, setRefreshing] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  // M-15 — WHAT NEEDS THE WORKER, from the same batched read My Jobs makes:
  // a counter waiting on the worker first, then the worker's own next step on
  // a hired job (lib/homeAttention.ts workerAttentionItems — the hub card's
  // own lines). Two cards at most; the rest are counted behind "See all".
  const {
    working,
    pendingBids,
    payments,
    openDisputeJobIds,
    reviewedJobIds,
    names,
    // F13: the cached hub — read on focus only when stale (own mutations invalidate it).
    refreshIfStale: refreshMyJobs,
  } = useMyJobsHub();
  useFocusEffect(
    useCallback(() => {
      void refreshMyJobs();
    }, [refreshMyJobs])
  );
  const needsYou = useMemo(() => {
    const counters = pendingBids
      .filter(
        (bid) =>
          !!bid.job &&
          !!user &&
          effectiveOfferStatus(bid) === 'pending' &&
          bid.awaiting_id === user.id &&
          bid.author_id !== user.id
      )
      .map((bid) => ({ kind: 'counter' as const, bid }));
    const moves = workerAttentionItems({ working, payments, openDisputeJobIds, reviewedJobIds }).map(
      (item) => ({ kind: 'job' as const, item })
    );
    return [...counters, ...moves];
  }, [pendingBids, working, payments, openDisputeJobIds, reviewedJobIds, user]);

  // 2026-09-28 (LUX-LIST-64 #63, audit M-14) — MONEY WAITING ON THE WORKER'S
  // OWN SETUP: on the card path only (no RPC on the sandbox path), the stored
  // payout status; and only when it was read and is not enabled, the ledger,
  // whose approved-and-waiting rows the ONE rule (payoutSetupNotice) picks.
  // Their takes, summed, head the "Needs you" strip as one tap to Payouts.
  // Anything unread says nothing.
  const [payoutWaitCents, setPayoutWaitCents] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user || paymentsMode !== 'stripe') return;
      void (async () => {
        const status = await fetchMyPayoutsStatus();
        if (!active) return;
        if (!status.data || status.data === 'enabled') {
          setPayoutWaitCents(null);
          return;
        }
        const earnings = await fetchMyEarnings(user.id);
        if (!active) return;
        if (earnings.error || !earnings.data) {
          setPayoutWaitCents(null);
          return;
        }
        const cents = earnings.data.rows
          .filter((row) => payoutSetupNotice(status.data, [row]) !== null)
          .reduce((sum, row) => sum + workerTakeCents(row), 0);
        setPayoutWaitCents(cents > 0 ? cents : null);
      })();
      return () => {
        active = false;
      };
    }, [user?.id])
  );

  // M-20 — whether "default-on" nearby alerts can actually reach this worker:
  // the toggle AND a saved area (alerts are measured from home_lat/home_lng,
  // which only Notification settings writes). Said in one line on the summary
  // card, with the way to fix it. An unread or failed read shows no line.
  const [alerts, setAlerts] = useState<{ on: boolean; radius: number; located: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) return;
      fetchNotificationPrefs(user.id).then(({ data }) => {
        if (!active) return;
        setAlerts(
          data
            ? { on: data.nearby_jobs, radius: data.nearby_radius_miles, located: data.home_lat != null && data.home_lng != null }
            : null
        );
      });
      return () => {
        active = false;
      };
    }, [user?.id])
  );
  const alertsLine = !alerts
    ? null
    : alerts.on && alerts.located
      ? `Nearby alerts on · ${alerts.radius} mi`
      : alerts.on
        ? 'Set your area to get nearby alerts'
        : 'Turn on nearby alerts';

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const accepting = profile?.accepting_work ?? true;

  // The worker's skills — the ONE rule (hooks/useWorkerSkills.ts, 2026-09-20
  // sitting 2): profile categories and listed services, so Home's skill
  // matches agree with the map's Best Match and the results' Skill Matches.
  const { skills: myCategories } = useWorkerSkills();
  const hasSkills = myCategories.size > 0;
  const skillMatchCount = useMemo(
    () => jobs.filter((job) => jobMatchesSkills(job, myCategories)).length,
    [jobs, myCategories]
  );

  const potential = useMemo(() => openJobsPotential(jobs, profile?.id), [jobs, profile?.id]);

  // A taste of the feed: skill matches first, then newest — enough to make
  // "View all" worth tapping, not a second marketplace.
  const previewJobs = useMemo(() => {
    const byNewest = (a: OpenJob, b: OpenJob) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return [...jobs]
      .sort((a, b) => {
        const aFits = jobMatchesSkills(a, myCategories) ? 1 : 0;
        const bFits = jobMatchesSkills(b, myCategories) ? 1 : 0;
        return bFits - aFits || byNewest(a, b);
      })
      .slice(0, PREVIEW_COUNT);
  }, [jobs, myCategories]);

  const bidCounts = useBidCounts(useMemo(() => previewJobs.map((j) => j.id), [previewJobs]));

  // Same silent pattern as the locked browse screen: the permission state is
  // CHECKED on mount (never prompted for — getForegroundPermissionsAsync shows
  // no dialog), so opening Home never pops a permission request. Only tapping
  // into the nearby results screen, which calls resolveCurrentPlace(), may.
  const [nearbyState, setNearbyState] = useState<NearbyState>('checking');
  const [nearbyCount, setNearbyCount] = useState(0);
  const [nearbyCoords, setNearbyCoords] = useState<{
    lat: number;
    lng: number;
    label?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!active) return;
      if (status !== 'granted') {
        setNearbyState('unavailable');
        return;
      }
      setNearbyState('loading');
      const here = await resolveCurrentPlace();
      if (!active) return;
      if (!here.ok) {
        setNearbyState('unavailable');
        return;
      }
      const { data } = await fetchJobsWithinRadius(
        here.place.lat,
        here.place.lng,
        NEARBY_RADIUS_MILES
      );
      if (!active) return;
      setNearbyCoords({ lat: here.place.lat, lng: here.place.lng, label: here.place.label });
      setNearbyCount(data.length);
      setNearbyState('ready');
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigation.navigate('WorkerResults', { mode: 'search', query: trimmed });
  }

  // The category pills' dispatch: the full feed, seeded with that one
  // category through WorkerResults' existing filter model — the same list
  // surface every other job intent lands on, no new screen.
  function searchCategory(categoryKey: string) {
    navigation.navigate('WorkerResults', { mode: 'all', category: categoryKey });
  }

  async function saveAcceptingWork(next: boolean) {
    if (!user || savingAvailability) return;
    setSavingAvailability(true);
    const { data, error: saveError } = await updateProfile(user.id, { accepting_work: next });
    setSavingAvailability(false);
    if (saveError) {
      await alertAsync('Could not save availability', userMessage(saveError));
      return;
    }
    if (data) setProfile(data);
  }

  // M-29 — with no skills the pill names the fix and opens it: the profile
  // editor, where the categories are picked. With skills it is the count.
  const matchLabel = hasSkills
    ? `${skillMatchCount} match your skills`
    : 'Add your skills';
  const nearbyLabel =
    nearbyState === 'ready'
      ? `${nearbyCount} within ${NEARBY_RADIUS_MILES} miles`
      : nearbyState === 'unavailable'
        ? 'Enable location'
        : `Within ${NEARBY_RADIUS_MILES} miles`;

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* home(4): a fixed layer, OUTSIDE the scroller, so the page slides over
          it instead of carrying it. Dark only; renders nothing in light. The
          ScrollView below paints no ground of its own, so nothing covers it. */}
      <HomeAtmosphere />
      {/* Standard input mechanics (.claude/rules/native-ui.md) for the search
          field below — nothing visual, and the field sits at the top so the
          keyboard can never cover it or its submit affordance. */}
      <KeyboardAvoid
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: contentPaddingX, gap: contentGap, paddingBottom: navClearance },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent}
              colors={[accent]}
            />
          }
        >
          {/* --- Greeting, the bell and your photo. 2026-09-28 (LUX-LIST-64
              #61): the mode pill is gone, so the greeting shows in full;
              switching is Profile's, behind its confirm. ---------------- */}
          <View style={styles.greetingRow}>
            <View style={styles.greetingBlock}>
              {/* Master 43 stacks the greeting: the salutation muted, the name
                  on its own line carrying the gold. Light keeps one line in
                  the Heritage muted tone. */}
              <Text style={styles.greeting} numberOfLines={1}>
                {greetingFor(new Date())}
                {firstName ? ',' : ''}
              </Text>
              {firstName ? (
                <Text
                  style={[styles.greeting, isDark && styles.greetingName]}
                  numberOfLines={1}
                >
                  {firstName}
                </Text>
              ) : null}
            </View>
            {/* M-24 — the feed, one tap from Home, with its unread count.
                #59 — your photo right of the bell; a tap opens your profile
                to edit. The customer Home's pair, the same two components. */}
            <View style={styles.headerActions}>
              <NotificationBell onPress={() => navigation.navigate('Notifications')} />
              <HomeAvatarButton name={profile?.full_name} uri={profile?.avatar_url} />
            </View>
          </View>

          {/* --- The hero (master 43): headline with the second sentence on
              the palette's GREEN accent, subtitle beneath, the toolbox
              artwork beside it — mounted the same way master 44's armchair
              is. Parity 2026-08-22: one composition in both themes (the
              dark-only gate and light's full-width Heritage block are
              retired). The crop carries its own baked dark halo disc, which
              light shows as drawn — an asset property, recorded in the run
              report for the operator's device pass. --- */}
          <View style={styles.heroBlock}>
            <Image
              source={PRESTIGE_TOOLBOX_ART}
              style={styles.heroArt}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.heroCopy}>
              <Text style={styles.heroHeadline} maxFontSizeMultiplier={1.25}>
                Get hired.{'\n'}
                <Text style={styles.heroHeadlineAccent}>Get paid.</Text>
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Grow your reputation.
              </Text>
            </View>
          </View>

          {/* --- M-15 — NEEDS YOU: under the greeting and the hero, above the
              search and the summary card, only when something is the
              worker's move. --- */}
          {needsYou.length > 0 || payoutWaitCents != null ? (
            <View style={styles.needsYou}>
              <View style={styles.needsYouHeader}>
                {/* 2026-09-28 (LUX-LIST-64 #49): the gold label with the red
                    Sonar dot before it — the customer Home's alarm, the same. */}
                <View style={styles.alarmLabel}>
                  <LiveDot color={colors.danger} size={9} motion="sonar" />
                  <Text style={styles.needsYouTitle}>Needs you</Text>
                </View>
                {needsYou.length > (payoutWaitCents != null ? 1 : 2) ? (
                  <Pressable
                    onPress={() => navigateAcrossTabs('MyJobs')}
                    hitSlop={touchSlop(textLine(styles.needsYouAll))}
                    accessibilityRole="button"
                    accessibilityLabel="See all in My Jobs"
                  >
                    <Text style={styles.needsYouAll}>See all ({needsYou.length})</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={[styles.needsCard, litCardStyle(isDark)]}>
                {/* #63 (M-14) — money approved and waiting on the worker's own
                    payout setup: first, one tap to Payouts (it was three). */}
                {payoutWaitCents != null ? (
                  <Pressable
                    onPress={() => navigateAcrossTabs('Profile', 'Payouts', {})}
                    style={({ pressed }) => [styles.needsRow, pressed && styles.pillPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set up payouts to receive ${formatBudget(payoutWaitCents)}`}
                  >
                    <View style={[styles.needsGlyph, isDark && styles.needsGlyphDark]}>
                      <Ionicons name="wallet-outline" size={18} color={isDark ? colors.emerald : colors.forest} />
                    </View>
                    <View style={styles.needsCopy}>
                      <Text style={styles.needsMove} numberOfLines={1}>
                        Set up payouts to receive {formatBudget(payoutWaitCents)}
                      </Text>
                      <Text style={styles.needsJob} numberOfLines={1}>
                        Approved — waiting on your payout setup
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                  </Pressable>
                ) : null}
                {needsYou.slice(0, payoutWaitCents != null ? 1 : 2).map((entry, index) => {
                  // A counter opens the offer on its job; a hired job opens the
                  // stage screen. The first line is the MOVE, the second the job.
                  const isCounter = entry.kind === 'counter';
                  const job = isCounter ? toOpenJob(entry.bid.job!) : entry.item.job;
                  const client = names[job.client_id] ?? 'Customer';
                  const move = isCounter
                    ? `${client.split(/\s+/)[0] || client} sent you a counter-offer — respond`
                    : entry.item.line;
                  return (
                    <Pressable
                      key={isCounter ? `counter-${entry.bid.id}` : `move-${job.id}`}
                      onPress={() =>
                        isCounter
                          ? navigateAcrossTabs('MyJobs', 'JobDetail', { job })
                          : navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: job.id })
                      }
                      style={({ pressed }) => [
                        styles.needsRow,
                        (index > 0 || payoutWaitCents != null) && styles.needsRowDivider,
                        pressed && styles.pillPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${move}: ${job.title}`}
                    >
                      <View style={[styles.needsGlyph, isDark && styles.needsGlyphDark]}>
                        <CategoryGlyph
                          name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                          size={18}
                          color={isDark ? colors.emerald : colors.forest}
                          bare
                        />
                      </View>
                      <View style={styles.needsCopy}>
                        <Text style={styles.needsMove} numberOfLines={1}>{move}</Text>
                        <Text style={styles.needsJob} numberOfLines={1}>
                          {job.title} · {client}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* --- Search (mirrors the locked 48's field — the one route to
              WorkerResults mode 'search'). The shared SearchBar carries the
              input (and the mic where the device supports it); the locked
              twin renders no clear control, so disableClear keeps the
              mirror, and its divider + arrow submit stays verbatim. ------- */}
          <SearchBar
            style={styles.searchField}
            value={query}
            onChangeText={setQuery}
            onSubmit={submitSearch}
            placeholder="Search for jobs or areas"
            autoCapitalize="sentences"
            autoCorrect
            disableClear
            trailing={
              <>
                <View style={styles.searchDivider} />
                <Pressable
                  onPress={submitSearch}
                  hitSlop={10}
                  style={({ pressed }) => [styles.searchGo, pressed && styles.searchGoPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                >
                  {/* Master 43's inset submit is a SOLID green disc — one of
                      the three conversion fills in the whole set (decision 3)
                      — with the background colour cut out of it as the
                      arrow. Light keeps the Heritage forest disc. */}
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={isDark ? colors.background : colors.onForest}
                  />
                </Pressable>
              </>
            }
          />

          {/* --- The service row (2026-09-17): the SAME sliding tile row as
              customer Home — components/ServiceTileRow.tsx is the one shared
              arrangement, tiles and geometry alike — in the slot the chip
              rows held, with every tap landing on WorkerResults seeded with
              that category and "Other" opening the sheet below. No heading
              here: the row sits directly under the search field. The inset
              is this column's own padding. --- */}
          <ServiceTileRow
            inset={contentPaddingX}
            onSelect={searchCategory}
            onOther={() => setMoreOpen(true)}
          />

          {/* --- The summary card (4D-6, operator spec — the ONE card where
              the mockup is a pixel target): a surface container with a gold
              hairline border, never a forest fill (the e195012 ClientJobDetail
              construction: under Prestige forest IS the gold primary, so
              gold-family text on a forest fill goes invisible in dark). Two
              rows: eyebrowed availability | earnings columns split by a
              divider, then the two count pills. The status copy ("Online"/
              "Offline", "Visible"/"Not Visible") is operator-authored — it
              renders the same phase53 accepting_work fact through the same
              toggle; nothing here is device presence. -------------------- */}
          <View
            style={[
              styles.summaryCard,
              { gap: summaryCardGap, borderRadius: summaryCardRadius },
              litCardStyle(isDark),
            ]}
          >
            <View style={styles.summaryRow}>
              <View style={styles.availabilityHalf}>
                {/* M-13 — the flag's own name, as Services & availability
                    says it: this is phase53 accepting_work, shown on the
                    profile. It never hid anyone, so nothing here says
                    online, offline or visible. */}
                <Text style={styles.summaryEyebrow}>TAKING NEW WORK</Text>
                <View style={styles.statusRow}>
                  {/* 30pt is the spec; auto-fit lets the word fall as far as
                      the 26pt continue-path floor (0.87 × 30) before anything
                      could clip on the narrowest supported width. */}
                  {/* 2026-09-28 (LUX-LIST-64 #50): "Paused" whole. The column
                      beside the 52pt toggle holds 91pt of word; "Open" fits at 30,
                      "Paused" is SET at 24 (0.8 × 30) rather than left to the
                      platform's shrink — which web never runs and a larger text
                      size outgrew — and the word never scales past the toggle.
                      Fix run E5: it now follows Dynamic Type as far as the 0.87
                      auto-fit can bring it back to the column (1.14 × 0.87 < 1),
                      so a larger text size grows it and it is still whole. */}
                  <Text
                    style={[styles.statusWord, !accepting && styles.statusWordPaused]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.87}
                    maxFontSizeMultiplier={1.14}
                  >
                    {accepting ? 'Open' : 'Paused'}
                  </Text>
                  <Toggle
                    value={accepting}
                    onValueChange={(value) => void saveAcceptingWork(value)}
                    disabled={savingAvailability || !profile}
                    accessibilityLabel="Taking new work"
                  />
                </View>
                <View style={styles.statusDotRow}>
                  {/* RUN H2 — the OFFLINE dot goes to the reference coral, and
                      this is a restoration rather than a new colour. Master 43
                      draws this exact dot in #D54C2C, the whole master set's
                      only UI red; it was rendering as `danger`, which is a
                      terracotta in light and a different red in dark, so the
                      one dot the reference specifies was the one drawn in two
                      colours, neither of them the measured one. The ONLINE
                      branch keeps `emerald` — the live-state hue, unchanged. */}
                  {/* 2026-09-28 (LUX-LIST-64 #50): paused, the red dot takes the
                      Sonar — a ring travelling out, every 2 s; open, the green
                      dot holds still. Reduce Motion: both still. */}
                  <LiveDot
                    color={accepting ? colors.emerald : colors.referenceCoral}
                    size={10}
                    motion={accepting ? 'still' : 'sonar'}
                  />
                  {/* Master 43 spells the consequence out rather than
                      abbreviating it; the PNG is the authority over the
                      earlier two-word draft. Same accepting_work fact. */}
                  {/* #50: "Offers still reach you" on ONE line, at any text size
                      the row can hold; the open caption keeps its two lines. */}
                  <Text
                    style={styles.statusCaption}
                    numberOfLines={accepting ? 2 : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    maxFontSizeMultiplier={1.1}
                  >
                    {accepting ? 'Shown as available on your profile' : 'Offers still reach you'}
                  </Text>
                </View>
              </View>
              <Divider orientation="vertical" thickness={1} style={styles.summaryDivider} />
              <View style={styles.earningsHalf}>
                {/* Tier A (C6): the summed budgets of the open jobs beside
                    their count — a fact about demand, not a promise of pay. */}
                <Text style={styles.summaryEyebrow}>NEARBY DEMAND</Text>
                {loading ? (
                  <>
                    {/* The figures wait for the feed, exactly as the old
                        card's loading gate did — a pulse, never a fake $0. */}
                    <Skeleton style={styles.earningsAmountLoading} />
                    <Skeleton style={styles.earningsCaptionLoading} />
                  </>
                ) : (
                  <>
                    <Text
                      style={styles.earningsAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.87}
                      maxFontSizeMultiplier={1.2}
                    >
                      {potential.count === 0 ? formatBudget(0) : formatBudget(potential.cents)}
                    </Text>
                    <Text style={styles.earningsCaption}>
                      {`across ${potential.count} ${potential.count === 1 ? 'job' : 'jobs'}`}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View style={styles.pillRow}>
              <Pressable
                onPress={() =>
                  hasSkills
                    ? navigation.navigate('WorkerResults', { mode: 'skills' })
                    : navigateAcrossTabs('Profile', 'ProfileMain', { edit: true })
                }
                // 40pt visual height is the spec; the slop keeps the 44pt
                // touch floor.
                hitSlop={{ top: 2, bottom: 2 }}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel={matchLabel}
              >
                <Ionicons name="sparkles-outline" size={16} color={glyph} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {hasSkills ? (
                    <>
                      <Text style={styles.pillCount}>{skillMatchCount}</Text>
                      {' match your skills'}
                    </>
                  ) : (
                    matchLabel
                  )}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  navigation.navigate('WorkerResults', {
                    mode: 'nearby',
                    lat: nearbyCoords?.lat,
                    lng: nearbyCoords?.lng,
                    label: nearbyCoords?.label,
                  })
                }
                hitSlop={{ top: 2, bottom: 2 }}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel={nearbyLabel}
              >
                <Ionicons name="location-outline" size={16} color={glyph} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {nearbyState === 'ready' ? (
                    <>
                      <Text style={styles.pillCount}>{nearbyCount}</Text>
                      {` within ${NEARBY_RADIUS_MILES} miles`}
                    </>
                  ) : (
                    nearbyLabel
                  )}
                </Text>
              </Pressable>
            </View>
            {alertsLine ? (
              <Pressable
                onPress={() => navigateAcrossTabs('Profile', 'NotificationSettings')}
                hitSlop={8}
                style={({ pressed }) => [styles.alertsRow, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel={alertsLine}
              >
                <Ionicons
                  name={alerts?.on && alerts.located ? 'notifications-outline' : 'notifications-off-outline'}
                  size={15}
                  color={alerts?.on && alerts.located ? colors.emerald : colors.textMuted}
                />
                <Text style={styles.alertsText} numberOfLines={1}>{alertsLine}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>

          {/* --- A taste of the open-jobs feed ------------------------------ */}
          <View style={styles.feedHeader}>
            {/* 2026-09-28 (LUX-LIST-64 #51): the heading alone — no dot. */}
            <View style={styles.feedTitleRow}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Available Jobs</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('WorkerResults', { mode: 'all' })}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
              accessibilityRole="button"
              accessibilityLabel="View all open jobs"
            >
              <Text style={[styles.viewAllText, isDark && styles.viewAllTextDark]}>View all</Text>
              <Ionicons name="chevron-forward" size={18} color={accent} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.cardList}>
              <WorkerJobCardSkeleton />
              <WorkerJobCardSkeleton />
            </View>
          ) : error ? (
            <View style={styles.notice}>
              <Text style={styles.noticeError}>Couldn’t load open jobs.</Text>
              <Pressable onPress={() => void onRefresh()} hitSlop={touchSlop(textLine(styles.retry))} accessibilityRole="button">
                <Text style={[styles.retry, isDark && styles.retryDark]}>Try again</Text>
              </Pressable>
            </View>
          ) : previewJobs.length === 0 ? (
            <Text style={styles.empty}>
              No open jobs right now — new jobs appear here automatically as customers post them.
            </Text>
          ) : (
            <View style={styles.cardList}>
              {previewJobs.map((job) => (
                <WorkerJobCard
                  key={job.id}
                  job={job}
                  bidCount={bidCounts[job.id]}
                  onPress={() => navigation.navigate('JobDetail', { job })}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoid>

      <ServicePickerSheet
        visible={moreOpen}
        title="All services"
        subtitle="Pick the kind of work you're after"
        services={MORE_SERVICES}
        onSelect={(categoryKey) => {
          setMoreOpen(false);
          searchCategory(categoryKey);
        }}
        onClose={() => setMoreOpen(false)}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingTop: spacing.sm,
    // The column reserved the bar's height for every screen, so a second
    // bottom inset here was a visible dead strip above the pill. RUN GROUND1
    // (C3) took the pill out of flow on this route so the atmosphere could
    // reach the screen's bottom edge, which means the reservation is now owed
    // — and it is applied at the call site from useScrollClearance(),
    // because it depends on the device inset and this object cannot see one.
    paddingBottom: 0,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, flexGrow: 1, gap: 2 },
  // #59 — the bell and the photo, the customer Home's own spacing: 3 between
  // the 44pt targets keeps the ink ~16 apart, and the photo's 4pt of target
  // slack is taken back at the column's edge.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: -4 },
  // #49 — the alarm label: the Sonar dot, 9 before the eyebrow.
  alarmLabel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // M-15 — the "Needs you" strip.
  needsYou: { gap: spacing.sm },
  needsYouHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  needsYouTitle: { ...EYEBROW_TYPE, color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
  needsYouAll: { fontSize: 13, fontWeight: '700', color: colors.emerald },
  needsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  needsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  needsRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  needsGlyph: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.mint,
    backgroundColor: colors.mint,
  },
  needsGlyphDark: { borderColor: colors.border },
  needsCopy: { flex: 1, gap: 2 },
  needsMove: { fontSize: 14, fontWeight: '800', color: colors.ink },
  needsJob: { fontSize: 12, color: colors.textMuted },
  greeting: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  greetingName: { color: colors.gold },
  // The customer Home headline treatment, mirrored token for token (serif
  // display face, 39/45, -0.3 tracking, ink). heroBlock is the positioning
  // context for the dark-only toolbox crop; heroCopy holds the rhythm.
  heroBlock: {},
  // Master 43 holds the headline in a narrow column beside the toolbox — in
  // BOTH themes since the parity pass (2026-08-22); light's full-width block
  // is retired.
  heroCopy: { gap: spacing.sm, maxWidth: '58%' },
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  heroHeadlineAccent: { color: colors.emerald },
  heroSubtitle: { fontSize: 16, fontWeight: '500', color: colors.homeSlate },
  heroArt: { position: 'absolute', zIndex: 0, right: -10, top: 18, width: 162, height: 108 },
  // 2026-09-28 (LUX-LIST-64 #61): the modeSwitch* styles left with the pill.
  // The locked 48's searchField/searchDivider, value for value — laid over
  // the shared SearchBar's own field so the mirror's geometry wins; the
  // input styling inside now rides SearchBar itself.
  // 2026-08-23 — THE SAME OUTLINE THE CUSTOMER FIELD GOT, and it was missed
  // here because this screen keeps its own copy of the style rather than
  // sharing one. `colors.surface` plus `shadows.card` is a WHITE ELEVATED CARD
  // in light and very nearly nothing in dark, since a #10261D shadow at 0.08
  // opacity over a forest ground has almost no contrast to spend — so the two
  // themes were not one design in two palettes, they were an outlined field
  // and a floating card. Light is a RECOLOUR of dark, so the fill and the
  // elevation go and the border carries the field in both:
  //   fill    colors.surface -> transparent
  //   depth   shadows.card removed. An outlined field does not float.
  //   edge    colors.mint2 -> colors.border, the same warm hairline the
  //           customer field reads against its own ground.
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  searchDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
  },
  // Master 43's inset submit disc: 32pt drawn, the 44pt floor met by the
  // Pressable's hitSlop rather than by growing the pill.
  searchGo: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.emerald,
  },
  searchGoPressed: { opacity: 0.85 },
  // 2026-09-17: the six chip-row entries (serviceRows / serviceRow /
  // serviceChip / compactServiceChip / goldOutlineChip / otherChip — home(24)'s
  // geometry, verbatim from customer Home) went with the chips. The service
  // row is components/ServiceTileRow.tsx, which carries the one geometry for
  // both screens.
  // ONE container, surface-filled with a GOLD hairline — never a forest
  // fill: under Prestige forest is the gold primary, and gold-family text on
  // it disappears (the defect e195012 repaired on ClientJobDetail's hero).
  // Geometry is the 4D-6 operator spec: §I card padding 14 (layout token),
  // row 2 sits 14pt below row 1, both columns share one 6pt vertical rhythm.
  summaryCard: {
    padding: layout.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  summaryRow: { flexDirection: 'row' },
  availabilityHalf: { flex: 1, gap: 6 },
  // The Divider draws the 1 pt vertical rule, stretched to the row; this is only its air.
  summaryDivider: {
    marginHorizontal: 14,
  },
  earningsHalf: { flex: 1, gap: 6 },
  // One eyebrow style for both columns — the shared rhythm is the point.
  summaryEyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusWord: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
  },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusCaption: { fontSize: 13, color: colors.textMuted },
  // #50 — "Paused" set to fit the 91pt beside the toggle: 24 (0.8 × 30).
  statusWordPaused: { fontSize: 24 },
  // The figure reads in the GREEN accent on surface in both palettes —
  // emerald, not forest (gold in dark) and not white (white-on-gold was the
  // live dark defect this card shipped with).
  earningsAmount: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700',
    color: colors.money,
  },
  earningsCaption: { fontSize: 13, color: colors.textMuted },
  earningsAmountLoading: { height: 34, width: 96, borderRadius: radius.sm },
  earningsCaptionLoading: { height: 14, width: 80, borderRadius: radius.sm },
  pillRow: { flexDirection: 'row', gap: spacing.md },
  // M-20 — the alerts status line under the pills.
  alertsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 28 },
  alertsText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textMuted },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  pillPressed: { opacity: 0.82 },
  pillText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  pillCount: { color: colors.emerald },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  feedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // 2026-09-28 (LUX-LIST-64 #51): `feedDot` — mockup 43's status dot on the
  // feed heading — is gone with the dot it drew.
  // 2026-09-27 (the Lux remake, ruling 4): the section heading is the Lux
  // eyebrow — gold in dark, emerald in light through the `eyebrow` role.
  sectionTitle: { ...EYEBROW_TYPE, color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
  viewAll: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  viewAllPressed: { opacity: 0.78 },
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  viewAllTextDark: { color: colors.emerald },
  cardList: { gap: spacing.md },
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  retryDark: { color: colors.emerald },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  }),
);
