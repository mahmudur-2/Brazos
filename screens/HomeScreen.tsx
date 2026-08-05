import { useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
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
import { SectionHeader } from '../components/SectionHeader';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
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
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';

const BRAND_MARK = require('../assets/brand/brazos-b-leaf.png');

/** Deliberately small. This is a taste of what's open nearby, not the feed —
 *  the full list is one tap away behind "View all". */
const PREVIEW_COUNT = 3;

/**
 * How many other open jobs in this job's category were posted today.
 *
 * Counted from the list already on screen rather than asked of the server —
 * it is a read of real data the screen is holding anyway. Returns 0 when there
 * are none, and the caller omits the line entirely rather than printing "0
 * similar jobs", which would read as a signal rather than an absence.
 */
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

/**
 * The customer home screen (Emerald atlas screen 07).
 *
 * Every control here was already wired before this redesign and still points
 * at the same place: the search field and the service chips run the existing
 * WorkerSearch flow, the hero CTA opens PostJob, and the job cards open
 * JobDetail. What changed is the composition and the palette.
 *
 * Two things the reference shows that are deliberately NOT rendered, because
 * the data behind them does not exist: a per-job distance badge (exact job
 * coordinates live in `job_locations`, which only the poster and the assigned
 * worker may read — an open job the viewer does not own has no distance the
 * client can compute) and a "high demand in your area" flag (there is no such
 * signal in the schema, and deriving one from a made-up threshold would be
 * inventing marketplace data). Everything else on the card is real.
 */
export function HomeScreen() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const navigation = useNavigation<HomeStackNavigation>();

  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const preview = useMemo(() => jobs.slice(0, PREVIEW_COUNT), [jobs]);

  // Bid counts for exactly the cards on screen — one batched call, not one
  // per card. An unknown count omits the line rather than guessing zero.
  const bidCounts = useBidCounts(useMemo(() => preview.map((j) => j.id), [preview]));

  function goToFindWork() {
    navigation.navigate('BrowseJobs');
  }

  function openJob(job: OpenJob) {
    navigation.navigate('JobDetail', { job });
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
    // The map is a sibling tab, not a route in this stack, so the jump has to
    // go through the tab navigator above it.
    navigation.getParent()?.navigate('Map');
  }

  /**
   * Voice input is not built yet — no speech-to-text is available to the app
   * (Expo ships none, and every option needs either a custom dev build or a
   * paid transcription API). The control says so plainly instead of listening
   * to nothing and looking broken.
   */
  async function explainVoice() {
    await alertAsync(
      'Voice search is coming',
      'Voice input is not switched on yet. Type what you need for now — the same smart matching runs either way.'
    );
    searchRef.current?.focus();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* --- Header ---------------------------------------------------- */}
        <View style={styles.header}>
          {/* Absolutely positioned so the title is centred against the whole
              width, the way the reference has it, rather than against the
              space the pill leaves over. */}
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
            Home
          </Text>
          <View style={styles.headerAction}>
            <Chip
              label="Switch to Worker"
              icon="people"
              variant="outlineGold"
              onPress={goToFindWork}
              accessibilityLabel="Switch to worker mode"
              accessibilityHint="Opens the list of jobs you can bid on"
            />
          </View>
        </View>

        {/* --- Greeting -------------------------------------------------- */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <Text style={styles.greeting} numberOfLines={1}>
              {greetingFor(new Date())}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text style={styles.headline} maxFontSizeMultiplier={1.4}>
              Take a task off your plate.
            </Text>
          </View>

          <View style={styles.artWrap} pointerEvents="none">
            {/* Placeholder artwork. The reference has a rendered illustration
                (armchair, plant, brass lamp) that this project has no asset
                for; this is the same palette and mass rather than a stand-in
                pretending to be that image. Swapping in the real illustration
                is a follow-up. */}
            <View style={styles.artOval} />
            <Ionicons name="leaf" size={42} color={colors.forest} style={styles.artGlyph} />
          </View>

          <Ionicons name="sparkles" size={17} color={colors.gold} style={styles.headlineSparkle} />
        </View>

        {/* --- Search ---------------------------------------------------- */}
        <Pressable
          style={styles.searchField}
          // The whole pill is the target, not just the text inside it.
          onPress={() => searchRef.current?.focus()}
          accessibilityRole="search"
        >
          <Ionicons name="search" size={20} color={colors.ink} />
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
            <Ionicons name="mic-outline" size={20} color={colors.forest} />
          </Pressable>

          <View style={styles.searchDivider} />

          {/* Indicates the typed request is parsed into services rather than
              matched literally — see interpretQuery in lib/workerSearch.ts. */}
          <Ionicons
            name="sparkles"
            size={18}
            color={colors.gold}
            accessibilityLabel="Smart matching is on"
          />
        </Pressable>

        {/* --- Quick services -------------------------------------------- */}
        <View style={styles.chipWrap}>
          {HOME_QUICK_SERVICES.map((service) => (
            <Chip
              key={service.label}
              label={service.label}
              icon={service.icon}
              variant="service"
              onPress={() => searchCategory(service.key)}
              accessibilityHint={`Find ${service.label.toLowerCase()} help`}
            />
          ))}
          <Chip
            label="Other"
            icon="chevron-down"
            variant="service"
            onPress={() => setMoreOpen(true)}
            accessibilityLabel="Other services"
            accessibilityHint="Opens the full list of services"
          />
        </View>

        {/* --- Hero CTA -------------------------------------------------- */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>FASTEST WAY TO START</Text>
              <Text style={styles.heroHeadline} maxFontSizeMultiplier={1.3}>
                Describe the job. BRAZOS handles the rest.
              </Text>
            </View>
            <Image
              source={BRAND_MARK}
              style={styles.heroMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate('PostJob')}
            style={({ pressed }) => [styles.heroButton, pressed && styles.heroButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Post a job"
          >
            <Text style={styles.heroButtonText}>Post a job</Text>
          </Pressable>
        </View>

        {/* --- Open near you --------------------------------------------- */}
        <View style={styles.section}>
          <SectionHeader title="Open near you" actionLabel="View all" onAction={goToFindWork}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText} numberOfLines={1}>
                Live activity in your area
              </Text>
              <Chip
                label="View map"
                icon="location-outline"
                variant="service"
                size="sm"
                onPress={openMap}
                accessibilityHint="Opens the map of nearby work"
              />
            </View>
          </SectionHeader>

          {loading ? (
            <View style={styles.cardList}>
              {[0, 1].map((i) => (
                <View key={i} style={styles.skeletonCard}>
                  <Skeleton style={styles.skeletonThumb} />
                  <View style={styles.skeletonText}>
                    <Skeleton style={styles.skeletonLine} />
                    <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  </View>
                </View>
              ))}
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
              No open jobs right now — new jobs appear here automatically as clients post
              them.
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
                  onPress={() => openJob(job)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

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

/**
 * One open job, in the reference's card anatomy: thumbnail, title, place,
 * category tag, estimated price and how many workers have bid.
 */
function OpenJobCard({
  job,
  isOwn,
  bidCount,
  similarToday,
  onPress,
}: {
  job: OpenJob;
  isOwn: boolean;
  /** Undefined means "not known yet" — distinct from zero, and rendered as
   *  nothing rather than as "no bids". */
  bidCount: number | undefined;
  similarToday: number;
  onPress: () => void;
}) {
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
      style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
      <View style={styles.jobBody}>
        {showThumb ? (
          <Image
            source={{ uri: thumbUrl! }}
            style={styles.jobThumb}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <View style={[styles.jobThumb, styles.jobThumbFallback, { backgroundColor: accent.bg }]}>
            <Ionicons
              name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
              size={26}
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
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.jobPlace} numberOfLines={1}>
                {job.location}
              </Text>
            </View>
          ) : null}

          <View style={styles.jobFootRow}>
            <View style={styles.jobTags}>
              {isOwn ? <Chip label="Your job" variant="soft" size="sm" /> : null}
              <Chip
                label={JOB_CATEGORY_LABELS[job.category] ?? job.category}
                variant="soft"
                size="sm"
              />
            </View>

            {interest ? (
              <View style={styles.jobInterest}>
                <Ionicons name="person-outline" size={14} color={colors.textMuted} />
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
          <Text style={styles.jobMetaText} numberOfLines={1}>
            {similarToday} similar {similarToday === 1 ? 'job' : 'jobs'} posted today
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    // MainTabs already lays the tab bar out below this scene and owns the
    // bottom safe-area inset. Extra content padding here rendered as a blank
    // cream band above the bar instead of protecting anything — there is a
    // test asserting this stays zero.
    paddingBottom: 0,
    gap: spacing.xl,
  },

  header: {
    minHeight: 48,
    justifyContent: 'center',
  },
  headerTitle: {
    ...StyleSheet.absoluteFillObject,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontFamily: fonts.display,
    fontSize: 25,
    fontWeight: '700',
    color: colors.forest,
    // The pill sits above this in z-order; without it the invisible full-width
    // text box would swallow taps meant for the pill.
    pointerEvents: 'none',
    lineHeight: 48,
  },
  headerAction: {
    alignItems: 'flex-end',
  },

  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greetingText: {
    flex: 1,
    gap: spacing.xs,
  },
  greeting: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textMuted,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700',
    color: colors.ink,
  },
  headlineSparkle: {
    position: 'absolute',
    // Sits in the gutter between the headline and the artwork, where the
    // reference puts its gold burst.
    right: 96,
    top: 62,
  },
  artWrap: {
    width: 104,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artOval: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 58,
    backgroundColor: colors.goldSoft,
  },
  artGlyph: {
    // Nudged off-centre so the composition doesn't read as an icon in a
    // circle, which is what a perfectly centred glyph would look like.
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },

  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    // Android centres single-line inputs oddly without this; iOS ignores it.
    paddingVertical: 0,
  },
  micButton: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },

  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  heroCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.forest,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.gold,
  },
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: '700',
    color: colors.white,
  },
  heroMark: {
    width: 68,
    height: 68,
  },
  heroButton: {
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroButtonPressed: {
    opacity: 0.9,
  },
  heroButtonText: {
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '700',
    color: colors.forest,
  },

  section: {
    gap: spacing.md,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  liveText: {
    // Shrinks before the map pill does — the pill is a control, the label is
    // description.
    flexShrink: 1,
    fontSize: 14,
    color: colors.textMuted,
  },

  cardList: {
    gap: spacing.md,
  },
  jobCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.card,
  },
  jobCardPressed: {
    opacity: 0.9,
  },
  jobBody: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  jobThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  jobThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobMain: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  jobHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  jobTitle: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: colors.ink,
  },
  jobPriceBlock: {
    alignItems: 'flex-end',
    // Caps the money column so a long title keeps most of the row.
    maxWidth: 96,
  },
  jobPriceCaption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textSubtle,
  },
  jobPrice: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.forest,
  },
  jobPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  jobPlace: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  jobFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  jobTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  jobInterest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  jobInterestText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  jobMeta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  jobMetaText: {
    fontSize: 12,
    color: colors.textSubtle,
  },

  notice: {
    gap: spacing.xs,
  },
  noticeError: {
    fontSize: 14,
    color: colors.danger,
  },
  retry: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.forest,
  },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  skeletonThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
  },
  skeletonText: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 12,
  },
  skeletonLineShort: {
    width: '55%',
  },
});
