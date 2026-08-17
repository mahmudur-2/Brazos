import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { alertAsync } from '../lib/dialog';
import { openJobsPotential } from '../lib/earningsMath';
import { userMessage } from '../lib/errorMessage';
import { resolveCurrentPlace } from '../lib/geolocation';
import { fetchJobsWithinRadius } from '../lib/hotspots';
import { formatBudget, jobMatchesSkills, type OpenJob } from '../lib/jobs';
import type { WorkerHomeStackNavigation } from '../lib/navigation';
import { updateProfile } from '../lib/profiles';
import { greetingFor } from '../lib/time';
import { useMode } from '../modes';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';
import { NEARBY_RADIUS_MILES } from './WorkerResultsScreen';

const PREVIEW_COUNT = 3;

type NearbyState = 'checking' | 'unavailable' | 'loading' | 'ready';

/**
 * Worker Home (Stage 4D) — the worker tree's initial route.
 *
 * Every job-list intent here lands on WorkerResultsScreen — "View all" is
 * mode 'all', the search field is mode 'search', the two pills are 'skills'
 * and 'nearby' — one list surface, not a chain of them. The search field
 * mirrors the locked screen 48's field and dispatch exactly.
 *
 * Everything here is derived from data sources that already exist:
 *   - greeting + the mandatory-confirm mode switch: useProfile / switchMode()
 *   - "Taking new work": the phase53 profiles.accepting_work field, read from
 *     the profile row and written through updateProfile() — the same path
 *     ServicesPricingScreen's toggle uses. This is AVAILABILITY, a public
 *     display fact on the worker's profile; it is deliberately NOT presence,
 *     so nothing here says "online" or "live".
 *   - potential earnings: lib/earningsMath.ts's openJobsPotential() over the
 *     same open-jobs feed the browse screen renders.
 *   - the two counts: jobMatchesSkills() over the feed for skill matches, and
 *     phase41's jobs_within_radius lookup for the nearby count — the exact
 *     sources the locked screen's own pills use, so a count here can never
 *     disagree with what tapping it opens.
 */
export function WorkerHomeScreen() {
  const navigation = useNavigation<WorkerHomeStackNavigation>();
  const { user } = useAuth();
  const { profile, setProfile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const { switchMode, switching } = useMode();
  const [refreshing, setRefreshing] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [query, setQuery] = useState('');

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const accepting = profile?.accepting_work ?? true;

  const myCategories = useMemo(
    () => new Set(profile?.categories ?? []),
    [profile?.categories]
  );
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

  function switchToCustomer() {
    // The one authoritative switch — its confirmation is mandatory and lives
    // inside switchMode() itself (modes/ModeProvider.tsx).
    void switchMode('customer');
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigation.navigate('WorkerResults', { mode: 'search', query: trimmed });
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

  const matchLabel = hasSkills
    ? `${skillMatchCount} match your skills`
    : 'Add skills to see matches';
  const nearbyLabel =
    nearbyState === 'ready'
      ? `${nearbyCount} within ${NEARBY_RADIUS_MILES} miles`
      : nearbyState === 'unavailable'
        ? 'Enable location'
        : `Within ${NEARBY_RADIUS_MILES} miles`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Standard input mechanics (.claude/rules/native-ui.md) for the search
          field below — nothing visual, and the field sits at the top so the
          keyboard can never cover it or its submit affordance. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.forest}
              colors={[colors.forest]}
            />
          }
        >
          {/* --- Greeting + the deliberate mode switch ---------------------- */}
          <View style={styles.greetingRow}>
            <View style={styles.greetingBlock}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greetingFor(new Date())}
                {firstName ? `, ${firstName}` : ''}
              </Text>
              <Text style={styles.headline} maxFontSizeMultiplier={1.3}>
                Your work today
              </Text>
            </View>
            <Pressable
              onPress={switchToCustomer}
              disabled={switching}
              style={({ pressed }) => [styles.modeSwitch, pressed && styles.modeSwitchPressed]}
              accessibilityRole="button"
              accessibilityLabel="Switch to Customer"
              accessibilityHint="Returns to posting and managing your own jobs"
              accessibilityState={{ disabled: switching }}
            >
              <Ionicons name="person" size={19} color={colors.forest} />
              <Text style={styles.modeSwitchText}>Switch to Customer</Text>
            </Pressable>
          </View>

          {/* --- Search (mirrors the locked 48's field — the one route to
              WorkerResults mode 'search') ---------------------------------- */}
          <View style={styles.searchField}>
            <Ionicons name="search" size={22} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              placeholder="Search for jobs or areas"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              returnKeyType="search"
            />
            <View style={styles.searchDivider} />
            <Pressable
              onPress={submitSearch}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="arrow-forward-circle" size={22} color={colors.emerald} />
            </Pressable>
          </View>

          {/* --- Taking new work (phase53 availability, never presence) ----- */}
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.cardTitle}>Taking new work</Text>
              <Text style={styles.cardNote}>
                Shown on your public profile — it tells customers what to expect.
              </Text>
            </View>
            <Switch
              value={accepting}
              onValueChange={(value) => void saveAcceptingWork(value)}
              disabled={savingAvailability || !profile}
              trackColor={{ true: colors.emerald, false: colors.border }}
              accessibilityLabel="Taking new work"
            />
          </View>

          {/* --- Potential earnings + the two counts ------------------------ */}
          {loading ? null : (
            <View style={styles.earningsCard}>
              <Text style={styles.earningsEyebrow}>POTENTIAL EARNINGS</Text>
              <Text style={styles.earningsAmount} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {potential.count === 0 ? '$0' : formatBudget(potential.cents)}
              </Text>
              <Text style={styles.earningsCaption}>
                {`across ${potential.count} open ${potential.count === 1 ? 'job' : 'jobs'}`}
              </Text>
            </View>
          )}

          <View style={styles.pillRow}>
            <Pressable
              onPress={() => navigation.navigate('WorkerResults', { mode: 'skills' })}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel={matchLabel}
            >
              <Ionicons name="ribbon-outline" size={17} color={colors.forest} />
              <Text style={styles.pillText} numberOfLines={1}>
                {matchLabel}
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
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel={nearbyLabel}
            >
              <Ionicons name="location-outline" size={17} color={colors.forest} />
              <Text style={styles.pillText} numberOfLines={1}>
                {nearbyLabel}
              </Text>
            </Pressable>
          </View>

          {/* --- A taste of the open-jobs feed ------------------------------ */}
          <View style={styles.feedHeader}>
            <Text style={styles.sectionTitle}>Open jobs</Text>
            <Pressable
              onPress={() => navigation.navigate('WorkerResults', { mode: 'all' })}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
              accessibilityRole="button"
              accessibilityLabel="View all open jobs"
            >
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.forest} />
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
              <Pressable onPress={() => void onRefresh()} hitSlop={8} accessibilityRole="button">
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </View>
          ) : previewJobs.length === 0 ? (
            <Text style={styles.empty}>
              No open jobs right now — new jobs appear here automatically as clients post them.
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // MainTabs already reserves the safe tab-bar height. Adding another
    // bottom inset here creates a visible dead strip above that bar.
    paddingBottom: 0,
    gap: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, gap: 2 },
  greeting: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  headline: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    color: colors.ink,
  },
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
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  // The locked 48's searchField/searchInput/searchDivider, value for value.
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 63,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
  },
  searchDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
  },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  availabilityCopy: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardNote: { fontSize: 12, lineHeight: 17, color: colors.textMuted },
  earningsCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    gap: 2,
    ...shadows.card,
  },
  earningsEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.gold,
  },
  earningsAmount: { fontSize: 32, fontWeight: '800', color: colors.white },
  earningsCaption: { fontSize: 13, color: colors.mint },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  pillPressed: { opacity: 0.82 },
  pillText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.forest },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  viewAll: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  viewAllPressed: { opacity: 0.78 },
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  cardList: { gap: spacing.md },
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
});
