import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '../components/Chip';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { alertAsync } from '../lib/dialog';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { HOME_QUICK_SERVICES, MORE_SERVICES } from '../lib/skillCategories';
import { greetingFor } from '../lib/time';
import type { CustomerHomeStackNavigation } from '../lib/navigation';
import { useMode } from '../modes';
import { useHomeDesignSettings } from '../lib/homeDesignStudio';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';

const POST_MARK = require('../assets/brand/customer-home-post-mark-hd.png');
const HOME_HERO_ART = require('../assets/brand/customer-home-chair.png');
const PREVIEW_COUNT = 4;
const HOME_SERVICE_ROWS = [HOME_QUICK_SERVICES.slice(0, 2), HOME_QUICK_SERVICES.slice(2, 4)];

function similarPostedToday(jobs: OpenJob[], job: OpenJob): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  return jobs.filter(
    (other) =>
      other.id !== job.id &&
      other.category === job.category &&
      new Date(other.created_at) >= midnight
  ).length;
}

/** Home cards intentionally show only the neighborhood; job details retain the full location. */
function previewNeighborhood(location: string): string {
  return location.split(',')[0]?.trim() || location;
}

/** Approved Emerald customer-home composition, retaining the existing data and routes. */
export function HomeScreen() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const navigation = useNavigation<CustomerHomeStackNavigation>();
  const reducedMotion = useReducedMotion();
  const design = useHomeDesignSettings();
  const { switchMode, switching } = useMode();

  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const livePulse = useRef(new Animated.Value(0)).current;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const preview = useMemo(() => jobs.slice(0, PREVIEW_COUNT), [jobs]);
  const bidCounts = useBidCounts(useMemo(() => preview.map((job) => job.id), [preview]));

  useEffect(() => {
    if (reducedMotion === null) return;

    livePulse.stopAnimation();
    if (reducedMotion) {
      livePulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [livePulse, reducedMotion]);

  const livePulseStyle = {
    opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.72] }),
    transform: [
      { scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.3] }) },
    ],
  };

  // PHASE 2 WIRING (no visual change to this LOCKED screen).
  //
  // "View all" and the Live Nearby cards both used to push worker surfaces
  // (Worker Home / the worker bid screen) onto the customer's own Home stack —
  // the "customer View All crosses into worker behaviour" leak. Those routes no
  // longer exist in CustomerHomeStackParamList, so this is now a compile-time
  // guarantee, not a convention.
  //
  // Until Phase 8 builds the customer-safe MarketJobPreview route (§E/§F), the
  // honest behaviour for a customer asking to see the open-job marketplace is
  // §F's cross-mode rule: never switch silently, always confirm. switchMode()
  // is the only path, so the panel plays, the mode persists, and the stacks
  // reset — none of which the old plain push did.
  function browseOpenJobs() {
    void switchMode('worker', {
      confirm: {
        title: 'Switch to Worker Mode?',
        message:
          'Browsing every open job happens in Worker Mode, where you can bid on them. Your posted jobs stay exactly where they are.',
        confirmText: 'Switch',
      },
    });
  }

  // The mode-switch pill. Same deliberate switch as before — now through the
  // one authoritative switchMode() rather than a navigate() dressed up as one.
  function switchToWorker() {
    void switchMode('worker');
  }


  // The "Post a job" CTA's own entry point — carries over whatever the
  // customer already typed in the search field so a fresh post doesn't start
  // blank. Category chips are a separate action (searchCategory below): they
  // find matching workers, not start a job draft.
  function startJobDraft() {
    navigation.navigate('PostJob', {
      initialDescription: query.trim() || undefined,
    });
  }

  function searchCategory(categoryKey: string) {
    navigation.navigate('WorkerSearch', { category: categoryKey });
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    navigation.navigate('WorkerSearch', { query: trimmed });
  }

  function openMap() {
    navigation.getParent()?.navigate('Map');
  }

  async function explainVoice() {
    await alertAsync(
      'Voice search is coming',
      'Voice input is not switched on yet. Type what you need for now — the same smart matching runs either way.'
    );
    searchRef.current?.focus();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: design.screenPadding, gap: design.sectionGap },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.intro}>
            <Image
              source={HOME_HERO_ART}
              style={styles.homeHeroArt}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.introCopy}>
              <View style={styles.introTopLine}>
                <View style={styles.greetingBlock}>
                  <Text style={styles.greeting} numberOfLines={1}>
                    {greetingFor(new Date())}
                    {firstName ? ',' : ''}
                  </Text>
                  {firstName ? (
                    <Text style={styles.greeting} numberOfLines={1}>
                      {firstName}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={switchToWorker}
                  disabled={switching}
                  style={({ pressed }) => [styles.modeSwitch, pressed && styles.modeSwitchPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Switch to Worker"
                  accessibilityHint="Opens the jobs you can bid on"
                  accessibilityState={{ disabled: switching }}
                >
                  <Ionicons name="build" size={23} color={colors.forest} />
                  <Text style={styles.modeSwitchText}>Switch to Worker</Text>
                </Pressable>
              </View>

              <Text
                style={[
                  styles.headline,
                  {
                    fontSize: design.heroFontSize,
                    lineHeight: Math.round(design.heroFontSize * (45 / 39)),
                  },
                ]}
                maxFontSizeMultiplier={1.25}
              >
                Take a task off your plate.
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Describe it. Hire help. Get it handled.
              </Text>
            </View>
          </View>

          <Pressable
            style={[
              styles.searchField,
              { minHeight: design.searchHeight, borderRadius: design.searchRadius },
            ]}
            onPress={() => searchRef.current?.focus()}
            accessibilityRole="search"
          >
            <Ionicons name="search" size={27} color={colors.ink} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              placeholder="Describe a service or problem"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              returnKeyType="search"
            />
            <Pressable
              onPress={explainVoice}
              hitSlop={8}
              style={styles.micButton}
              accessibilityRole="button"
              accessibilityLabel="Voice search"
              accessibilityHint="Voice input is not available yet"
            >
              <Ionicons name="mic-outline" size={25} color={colors.forest} />
            </Pressable>
            <View style={styles.searchDivider} />
            <Ionicons
              name="sparkles"
              size={23}
              color={colors.gold}
              accessibilityLabel="Smart matching is on"
            />
          </Pressable>

          <View style={styles.serviceRows}>
            {HOME_SERVICE_ROWS.map((row, rowIndex) => (
              <View key={`service-row-${rowIndex}`} style={styles.serviceRow}>
                {row.map((service) => (
                  <Chip
                    key={service.label}
                    label={service.label}
                    icon={service.icon}
                    variant="service"
                    style={[
                      styles.goldOutlineChip,
                      rowIndex === 1 && styles.compactServiceChip,
                    ]}
                    onPress={() => searchCategory(service.key)}
                    accessibilityHint={`Find ${service.label.toLowerCase()} help`}
                  />
                ))}
                {rowIndex === HOME_SERVICE_ROWS.length - 1 ? (
                  <Chip
                    label="Other"
                    icon="chevron-down"
                    variant="service"
                    style={[styles.goldOutlineChip, styles.compactServiceChip, styles.otherChip]}
                    onPress={() => setMoreOpen(true)}
                    accessibilityLabel="Other services"
                    accessibilityHint="Opens the full list of services"
                  />
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroBody}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>FASTEST WAY TO START</Text>
                <Text style={styles.heroHeadline} maxFontSizeMultiplier={1.3}>
                  Describe the job. BRAZOS handles the rest.
                </Text>
              </View>
              <Pressable
                onPress={() => startJobDraft()}
                style={({ pressed }) => [
                  styles.heroButton,
                  {
                    minHeight: design.ctaHeight,
                    borderRadius: design.ctaRadius,
                  },
                  pressed && styles.heroButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Post a job"
              >
                <Text style={styles.heroButtonText}>Post a job</Text>
              </Pressable>
            </View>
            <Image
              source={POST_MARK}
              style={styles.heroMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <View style={styles.section}>
            <View style={styles.liveNearbyHeader}>
              <View style={styles.liveNearbyTitle}>
                <View style={styles.liveIndicator} accessibilityLabel="Live nearby jobs">
                  <Animated.View style={[styles.liveDotHalo, livePulseStyle]} />
                  <View style={styles.liveDot} />
                </View>
                <Text style={styles.sectionTitle}>Live Nearby</Text>
              </View>
              <Pressable
                onPress={openMap}
                style={({ pressed }) => [styles.mapPill, pressed && styles.mapPillPressed]}
                accessibilityRole="button"
                accessibilityLabel="View map"
                accessibilityHint="Opens the map of nearby work"
              >
                <Ionicons name="location" size={17} color={colors.forest} />
                <Text style={styles.mapPillText}>View map</Text>
              </Pressable>
              <Pressable
                onPress={browseOpenJobs}
                style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
                accessibilityRole="button"
                accessibilityLabel="View all open jobs"
              >
                <Text style={styles.viewAllText}>View all</Text>
                <Ionicons name="arrow-forward" size={19} color={colors.forest} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.cardList}>
                <View style={styles.skeletonCard}>
                  <Skeleton style={styles.skeletonThumb} />
                  <View style={styles.skeletonText}>
                    <Skeleton style={styles.skeletonLine} />
                    <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  </View>
                </View>
              </View>
            ) : error ? (
              <View style={styles.notice}>
                <Text style={styles.noticeError}>Couldn’t load open jobs.</Text>
                <Pressable onPress={refresh} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.retry}>Try again</Text>
                </Pressable>
              </View>
            ) : preview.length === 0 ? (
              <Text style={styles.empty}>
                No open jobs right now — new jobs appear here automatically as clients post them.
              </Text>
            ) : (
              <View style={styles.cardList}>
                {preview.map((job) => (
                  <OpenJobCard
                    key={job.id}
                    job={job}
                    isOwn={!!user && user.id === job.client_id}
                    bidCount={bidCounts[job.id]}
                    similarToday={similarPostedToday(jobs, job)}
                    onPress={browseOpenJobs}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ServicePickerSheet
        visible={moreOpen}
        title="All services"
        subtitle="Pick what you need help with"
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

function OpenJobCard({
  job,
  isOwn,
  bidCount,
  similarToday,
  onPress,
}: {
  job: OpenJob;
  isOwn: boolean;
  bidCount: number | undefined;
  similarToday: number;
  onPress: () => void;
}) {
  const design = useHomeDesignSettings();
  const accent = categoryAccent(job.category);
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showThumb = !!thumbUrl && !thumbFailed;
  const interest =
    bidCount === undefined
      ? null
      : bidCount === 0
        ? isOwn
          ? 'No bids yet'
          : 'Be the first to bid'
        : `${bidCount} ${bidCount === 1 ? 'pro' : 'pros'} interested`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.jobCard,
        { borderRadius: design.jobCardRadius },
        pressed && styles.jobCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
      <View style={styles.jobBody}>
        {showThumb ? (
          <Image
            source={{ uri: thumbUrl }}
            style={styles.jobThumb}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <View style={[styles.jobThumb, styles.jobThumbFallback, { backgroundColor: accent.bg }]}>
            <Ionicons
              name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
              size={28}
              color={accent.icon}
            />
          </View>
        )}
        <View style={styles.jobMain}>
          <View style={styles.jobHeadRow}>
            <Text style={styles.jobTitle} numberOfLines={2}>
              {job.title}
            </Text>
            <View style={styles.jobPriceBlock}>
              <Text style={styles.jobPriceCaption}>EST. PRICE</Text>
              <Text style={styles.jobPrice} numberOfLines={1}>
                {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
              </Text>
            </View>
          </View>
          {job.location ? (
            <View style={styles.jobPlaceRow}>
              <Ionicons name="location-outline" size={16} color={colors.homeSlate} />
              <Text style={styles.jobPlace} numberOfLines={1}>
                {previewNeighborhood(job.location)}
              </Text>
            </View>
          ) : null}
          <View style={styles.jobFootRow}>
            <View style={styles.jobTags}>
              {isOwn ? <Chip label="Your job" variant="soft" size="sm" /> : null}
              <Chip label={JOB_CATEGORY_LABELS[job.category] ?? job.category} variant="soft" size="sm" />
            </View>
            {interest ? (
              <View style={styles.jobInterest}>
                <Ionicons name="people-outline" size={17} color={colors.homeSlate} />
                <Text style={styles.jobInterestText} numberOfLines={1}>
                  {interest}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {similarToday > 0 ? (
        <View style={styles.jobMeta}>
          <View style={styles.demandRow}>
            <Ionicons name="trending-up" size={16} color={colors.forest} />
            <Text style={styles.demandText}>High demand in your area</Text>
          </View>
          <Text style={styles.jobMetaText} numberOfLines={1}>
            {similarToday} similar {similarToday === 1 ? 'job' : 'jobs'} posted today
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.homeBackground },
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.homeBackground },
  content: {
    flexGrow: 1,
    backgroundColor: colors.homeBackground,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: 0,
    gap: 20,
  },
  intro: { position: 'relative', minHeight: 160, paddingBottom: spacing.sm },
  introCopy: { position: 'relative', zIndex: 1, gap: spacing.sm },
  introTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, gap: 2 },
  greeting: { fontSize: 18, fontWeight: '500', color: colors.homeSlate },
  modeSwitch: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1.25,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  // Phase 1's tactile answer to the tap — the press state itself, so the
  // feedback lands on touch-down rather than after an animation starts.
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  headline: {
    maxWidth: '73%',
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  heroSubtitle: {
    maxWidth: '73%',
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '500',
    color: colors.homeSlate,
  },
  homeHeroArt: { position: 'absolute', zIndex: 0, width: 112, height: 124, right: -6, top: 47 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 70,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#F1EAE2',
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: { flex: 1, fontSize: 17, color: colors.ink, paddingVertical: 0 },
  micButton: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchDivider: { width: 1, height: 32, backgroundColor: colors.border },
  serviceRows: { gap: spacing.sm },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  // Same gold hairline as the "Switch to Worker" pill above, so the quick-
  // service row reads as part of the same control family.
  goldOutlineChip: { borderWidth: 1.25, borderColor: colors.gold },
  compactServiceChip: { paddingHorizontal: 10 },
  // Fills whatever room is left in row 2 next to House Cleaning/TV Mounting —
  // flexShrink keeps it from forcing a wrap to a 3rd row if space is tight,
  // flexGrow claims any leftover space when there's room to spare, so it's
  // always as wide as it can be without ever leaving this row.
  otherChip: { flexGrow: 1, flexShrink: 1, justifyContent: 'center' },
  heroCard: {
    borderRadius: 22,
    backgroundColor: colors.forest,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroBody: { padding: 16, gap: 12 },
  heroCopy: { gap: 4, paddingRight: 68 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, color: colors.gold },
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.25,
    fontWeight: '700',
    color: colors.white,
  },
  heroMark: { position: 'absolute', top: 12, right: 10, width: 79, height: 101 },
  heroButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroButtonPressed: { opacity: 0.9 },
  heroButtonText: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.forest },
  section: { gap: 12 },
  liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  liveNearbyTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },
  liveIndicator: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: '#7DE7A4',
  },
  liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: '#0DBC5A' },
  mapPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#E7E3DB',
    backgroundColor: colors.surface,
  },
  mapPillPressed: { opacity: 0.82 },
  mapPillText: { fontSize: 14, fontWeight: '600', color: colors.forest },
  viewAll: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  viewAllPressed: { opacity: 0.78 },
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  cardList: { gap: spacing.md },
  jobCard: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', ...shadows.card },
  jobCardPressed: { opacity: 0.9 },
  jobBody: { flexDirection: 'row', gap: spacing.md, padding: 14 },
  jobThumb: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.neutralBg },
  jobThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  jobMain: { flex: 1, gap: spacing.xs + 2 },
  jobHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  jobTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: '700', color: colors.ink },
  jobPriceBlock: { alignItems: 'flex-end', maxWidth: 102 },
  jobPriceCaption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.homeSlate },
  jobPrice: { fontSize: 24, fontWeight: '800', color: colors.forest },
  jobPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobPlace: { flex: 1, fontSize: 14, color: colors.homeSlate },
  jobFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  jobTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  jobInterest: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobInterestText: { fontSize: 12, color: colors.homeSlate },
  jobMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  demandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexShrink: 1 },
  demandText: { fontSize: 13, fontWeight: '600', color: colors.forest },
  jobMetaText: { flexShrink: 1, fontSize: 13, color: colors.homeSlate },
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  empty: { fontSize: 14, color: colors.homeSlate, lineHeight: 20 },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  skeletonThumb: { width: 104, height: 104, borderRadius: radius.md },
  skeletonText: { flex: 1, gap: spacing.sm },
  skeletonLine: { height: 12 },
  skeletonLineShort: { width: '55%' },
});
