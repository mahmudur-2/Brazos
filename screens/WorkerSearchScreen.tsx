import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { userMessage } from '../lib/errorMessage';
import { fetchRehirableWorkerIds } from '../lib/jobs';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { fetchProfilesByIds } from '../lib/profiles';
import { rebookStripItems, type RebookStripItem } from '../lib/rebook';
import { fetchSavedWorkers } from '../lib/savedWorkers';
import { SKILL_CATEGORIES, skillCategoryLabel } from '../lib/skillCategories';
import {
  findWorkers,
  interpretQuery,
  matchReasonText,
  resultHeading,
  type RankingMode,
  type WorkerMatch,
} from '../lib/workerSearch';
import type {
  CustomerHomeStackNavigation,
  WorkerSearchRouteParamList,
} from '../lib/navigation';
import {
  emeraldColorsFor,
  fonts,
  radius,
  shadows,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { SearchBar, useFloatingNavClearance } from '../ui/primitives';

/** Chips offered before anything has been typed. The first six of the shared
 *  skill list — enough to cover the common asks without a wall of options. */
const SUGGESTED_CATEGORIES = SKILL_CATEGORIES.slice(0, 6);

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  // `mode` is whatever actually ranked these rows, and only the lib decides how
  // that reads on screen — see resultHeading().
  | { kind: 'results'; matches: WorkerMatch[]; categories: string[]; mode: RankingMode };

export function WorkerSearchScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint. This is the Discover tab's
  // root since emerald(1), so it is now a first-screen surface.
  const navClearance = useFloatingNavClearance();
  const EMERALD_PALETTE = emeraldColorsFor(colors);
  const navigation = useNavigation<CustomerHomeStackNavigation>();
  const { params } = useRoute<RouteProp<WorkerSearchRouteParamList, 'WorkerSearch'>>();
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();

  const [query, setQuery] = useState(params?.query ?? '');
  // An explicitly tapped chip beats whatever the free text would have implied,
  // and is cleared as soon as the text is edited again.
  const [pinnedCategory, setPinnedCategory] = useState<string | null>(
    params?.category ?? null
  );
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // §4.4 — the Saved / Worked-for-you-before sections collapsed into one
  // horizontal strip at the top of this surface's landing state.
  const [rebook, setRebook] = useState<RebookStripItem[]>([]);

  // Guards a slow response from overwriting a newer one — a fast second search
  // finishing first would otherwise leave the older results on screen.
  const runRef = useRef(0);

  const loadRebook = useCallback(async () => {
    if (!user) {
      setRebook([]);
      return;
    }
    const [savedRes, pastIdsRes] = await Promise.all([
      fetchSavedWorkers(user.id),
      fetchRehirableWorkerIds(user.id),
    ]);
    // The strip is a rebook shortcut, not this surface's content: a failed
    // read renders no strip (and says so in the log) rather than blocking
    // search behind a retry state.
    if (savedRes.error || pastIdsRes.error) {
      console.warn(
        '[WorkerSearch] rebook strip read failed',
        (savedRes.error ?? pastIdsRes.error)?.message
      );
      return;
    }
    const savedProfiles = savedRes.data.map((r) => r.profiles);
    const savedIdSet = new Set(savedProfiles.map((p) => p.id));
    const pastIds = [...pastIdsRes.data].filter((id) => !savedIdSet.has(id));
    let pastProfiles: { id: string; full_name: string | null; avatar_url: string | null }[] =
      [];
    if (pastIds.length > 0) {
      const { data, error } = await fetchProfilesByIds(pastIds);
      if (error) {
        console.warn('[WorkerSearch] rebook strip profiles failed', error.message);
        return;
      }
      pastProfiles = data;
    }
    setRebook(rebookStripItems(savedProfiles, pastProfiles));
  }, [user]);

  // Refresh on focus: a hire or an unsave elsewhere changes who belongs here.
  useFocusEffect(
    useCallback(() => {
      void loadRebook();
    }, [loadRebook])
  );

  const run = useCallback(
    async (text: string, category: string | null) => {
      const trimmed = text.trim();
      if (!trimmed && !category) {
        runRef.current += 1;
        setState({ kind: 'idle' });
        return;
      }

      const runId = ++runRef.current;
      setState({ kind: 'loading' });

      const categories = category ? [category] : interpretQuery(trimmed);
      // findWorkers() only asks the server's best-match ranking to run when
      // there's an actual sentence to compare meanings against — a bare chip
      // tap sends no typed text, so without this it never got that ranking at
      // all and could only ever find workers who had literally checked this
      // exact category box. The category's own label ("TV Mounting") is real
      // language, not a raw enum key, so it's a legitimate phrase to embed —
      // this is what lets a worker with the right completed-job history but a
      // different advertised tag still surface.
      const searchText = trimmed || (category ? skillCategoryLabel(category) : '');
      const { data, error, mode } = await findWorkers({
        query: searchText,
        categories,
        excludeUserId: user?.id ?? null,
      });

      if (runId !== runRef.current) return;
      if (error) {
        setState({ kind: 'error', message: userMessage(error) });
        return;
      }
      setState({ kind: 'results', matches: data, categories, mode });
    },
    [user?.id]
  );

  // Runs the search a caller arrived with (a chip tapped on Home), so the
  // screen opens on results rather than on an empty field.
  useEffect(() => {
    if (params?.query || params?.category) {
      run(params?.query ?? '', params?.category ?? null);
    }
    return () => {
      runRef.current += 1;
    };
    // Only on arrival — later searches are driven by submit/chip presses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  function submit() {
    Keyboard.dismiss();
    run(query, pinnedCategory);
  }

  function chooseCategory(key: string) {
    const next = pinnedCategory === key ? null : key;
    setPinnedCategory(next);
    Keyboard.dismiss();
    run(query, next);
  }

  function openWorker(match: WorkerMatch) {
    navigation.navigate('WorkerProfile', {
      workerId: match.profile.id,
      workerName: match.profile.full_name ?? undefined,
    });
  }

  const activeCategories =
    state.kind === 'results' ? state.categories : pinnedCategory ? [pinnedCategory] : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Master 1 sets "Find help" as the screen's own display headline —
          the back control stays because this surface is pushed from Home as
          well as mounted as a tab root. */}
      <ScreenHeader
        title="Find help"
        onBack={goBackOrHome}
        palette={EMERALD_PALETTE}
        titleSize={32}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.discoveryHeader}>
          {!keyboardVisible && windowHeight >= 650 ? (
            <View style={styles.intro}>
              {/* Master 1's own eyebrow and sub. The second display line the
                  Heritage screen carried is gone: the header title IS the
                  display headline there. */}
              <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>
                FIND TRUSTED HELP, FAST
              </Text>
              <Text style={styles.introText}>
                Describe the task in your own words, or start with a service below.
              </Text>
            </View>
          ) : null}

          {/* The shared SearchBar (mic included when the device supports it).
              Its standard clear control performs exactly what the old custom
              one did: onChangeText('') resets the run guard, the results and
              the pinned chip. */}
          <SearchBar
            style={[styles.searchRow, isDark && styles.searchRowDark]}
            value={query}
            onChangeText={(text) => {
              runRef.current += 1;
              setQuery(text);
              setState({ kind: 'idle' });
              // Typing means the customer is describing the job themselves, so
              // stop forcing the chip they tapped earlier.
              if (pinnedCategory) setPinnedCategory(null);
            }}
            onSubmit={submit}
            placeholder="What do you need help with?"
            autoCapitalize="sentences"
            autoCorrect
            // autoFocus:false is the Discover tab-root mount — opening a TAB
            // with the keyboard up is noise; pushed-from-Home opens focused.
            autoFocus={params?.autoFocus !== false && !params?.query && !params?.category}
            accessibilityLabel="Describe the help you need"
            trailing={
              <Pressable
                onPress={submit}
                style={({ pressed }) => [
                  styles.searchButton,
                  isDark && styles.searchButtonDark,
                  pressed && (isDark ? styles.searchButtonPressedDark : styles.searchButtonPressed),
                ]}
                accessibilityRole="button"
                accessibilityLabel="Search workers"
              >
                {/* Master 1 draws this submit as a gold OUTLINE disc, not the
                    solid conversion fill master 43 gives its own search —
                    gold is line-work (decision 3). Light keeps the Heritage
                    filled control. */}
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={isDark ? colors.gold : colors.onForest}
                />
              </Pressable>
            }
          />

          {!keyboardVisible ? (
            <View style={styles.serviceSection}>
              <View style={styles.serviceHeadingRow}>
                <Text style={styles.serviceHeading}>Popular services</Text>
                <Text style={[styles.serviceHint, isDark && styles.serviceHintDark]}>
                  Swipe to explore
                </Text>
              </View>
              {/* Master 1 draws these as TILES — glyph above a two-line
                  label — not as pills. Same list, same chooseCategory tap;
                  only the shape and the paint moved. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                style={styles.serviceScroll}
                keyboardShouldPersistTaps="handled"
              >
                {SUGGESTED_CATEGORIES.map((category) => {
                  const selected = activeCategories.includes(category.key);
                  return (
                    <Pressable
                      key={category.key}
                      onPress={() => chooseCategory(category.key)}
                      style={({ pressed }) => [
                        styles.serviceTile,
                        selected && styles.serviceTileSelected,
                        pressed && styles.serviceTilePressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={category.label}
                      accessibilityHint={`Find workers for ${category.label.toLowerCase()}`}
                    >
                      <Ionicons
                        name={category.icon}
                        size={24}
                        color={isDark ? colors.gold : colors.forest}
                      />
                      <Text style={styles.serviceTileLabel} numberOfLines={2}>
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>

        {state.kind === 'loading' ? (
          <SearchStateScroll resetKey="loading">
            <SearchStateCard
              busy
              eyebrow="SEARCHING PROFILES"
              title="Finding strong matches"
              message="Checking real services, work history, and trust signals where available."
            />
          </SearchStateScroll>
        ) : state.kind === 'error' ? (
          <SearchStateScroll resetKey="error">
            <SearchStateCard
              icon="alert-circle-outline"
              eyebrow="SEARCH INTERRUPTED"
              title="We couldn’t load matches"
              message={state.message}
              tone="danger"
            >
              <Button
                title="Try again"
                variant="secondary"
                palette={EMERALD_PALETTE}
                onPress={submit}
                style={styles.stateAction}
              />
            </SearchStateCard>
          </SearchStateScroll>
        ) : state.kind === 'idle' ? (
          <SearchStateScroll resetKey="idle" alignTop={rebook.length > 0}>
            {/* §4.4 — Saved first (bookmark-marked), then past workers, one
                strip. Renders nothing when both populations are empty;
                tombstoned accounts are excluded (nothing to hire). */}
            {rebook.length > 0 ? (
              <View style={styles.rebookBlock}>
                <View style={styles.rebookHeaderRow}>
                  <Text style={styles.rebookTitle}>Hire someone again</Text>
                  <Pressable
                    onPress={() => navigateAcrossTabs('Profile', 'SavedWorkers')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="See all saved and past workers"
                  >
                    <Text style={styles.rebookSeeAll}>See all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rebookRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {rebook.map((item) => {
                    const displayName = item.name?.trim() || 'Worker';
                    const firstName = displayName.split(/\s+/)[0];
                    return (
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                          styles.rebookItem,
                          pressed && styles.controlPressed,
                        ]}
                        onPress={() =>
                          navigation.navigate('PostJob', {
                            hireWorkerId: item.id,
                            hireWorkerName: displayName,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Hire ${displayName} again`}
                      >
                        <Avatar name={displayName} uri={item.avatarUrl} size={56} />
                        <View style={styles.rebookNameRow}>
                          {item.saved ? (
                            <Ionicons name="bookmark" size={11} color={colors.emerald} />
                          ) : null}
                          <Text style={styles.rebookName} numberOfLines={1}>
                            {firstName}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            <SearchStateCard
              icon="people-outline"
              eyebrow="START WITH THE TASK"
              title="Describe what you need"
              message="Try “move a queen mattress up three flights” — or choose a popular service above."
            />
          </SearchStateScroll>
        ) : state.matches.length === 0 ? (
          <SearchStateScroll resetKey="empty-results">
            <SearchStateCard
              icon="search-outline"
              eyebrow="NO MATCHES YET"
              title="No workers matched"
              message="We couldn’t find a relevant profile for this search. A public job lets workers who can help come to you."
            >
              <Button
                title="Post a job"
                palette={EMERALD_PALETTE}
                onPress={() => navigation.navigate('PostJob')}
                style={styles.stateAction}
              />
            </SearchStateCard>
          </SearchStateScroll>
        ) : (
          // Re-fades on each new search, so results visibly replace the
          // previous set instead of silently swapping under the reader.
          <FadeIn style={styles.resultsFlex} resetKey={state.categories.join(',')}>
            <FlatList
              data={state.matches}
              keyExtractor={(item) => item.profile.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: navClearance }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.resultsHeader}>
                  <Text style={[styles.resultsEyebrow, isDark && styles.eyebrowDark]}>
                    WORKERS TO CONSIDER
                  </Text>
                  <Text style={styles.resultCount} accessibilityLiveRegion="polite">
                    {resultHeading(state.mode, state.matches.length)}
                  </Text>
                  <Text style={styles.resultsHint}>
                    Open a profile to review real work, services, and feedback.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <WorkerResultCard match={item} onPress={() => openWorker(item)} />
              )}
            />
          </FadeIn>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SearchStateScroll({
  children,
  resetKey,
  alignTop = false,
}: {
  children: ReactNode;
  resetKey: string;
  /** Top-align instead of centering — for when real content (the rebook
   *  strip) sits above the state card and must hug the top of the surface. */
  alignTop?: boolean;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <FadeIn style={styles.resultsFlex} resetKey={resetKey}>
      <ScrollView
        contentContainerStyle={[styles.stateScrollContent, alignTop && styles.stateScrollTop]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </FadeIn>
  );
}

function SearchStateCard({
  icon,
  busy = false,
  eyebrow,
  title,
  message,
  tone = 'brand',
  children,
}: {
  icon?: IoniconName;
  busy?: boolean;
  eyebrow: string;
  title: string;
  message: string;
  tone?: 'brand' | 'danger';
  children?: ReactNode;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const EMERALD_PALETTE = emeraldColorsFor(colors);
  const danger = tone === 'danger';
  return (
    <Card palette={EMERALD_PALETTE} style={[styles.stateCard, isDark && styles.cardBorderDark]}>
      <View style={[styles.stateIcon, danger && styles.stateIconDanger]}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.emerald} />
        ) : (
          <Ionicons
            name={icon ?? 'sparkles-outline'}
            size={27}
            color={danger ? colors.danger : colors.emerald}
          />
        )}
      </View>
      <Text style={[styles.stateEyebrow, danger && styles.stateEyebrowDanger]}>{eyebrow}</Text>
      <Text style={styles.stateTitle} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      <Text style={[styles.stateMessage, danger && styles.stateMessageDanger]} selectable>
        {message}
      </Text>
      {children}
    </Card>
  );
}

/**
 * One result. Every line is something the database actually holds — a worker
 * with no reviews says "New", not a made-up score, and the completed-jobs line
 * is simply absent when there is nothing to report.
 */
function WorkerResultCard({
  match,
  onPress,
}: {
  match: WorkerMatch;
  onPress: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const EMERALD_PALETTE = emeraldColorsFor(colors);
  const { profile, matchedCategories } = match;
  const name = profile.full_name?.trim() || 'Worker';
  const ratingCount = profile.rating_count ?? 0;
  // Whatever the ranking can actually support, or nothing at all. Never a
  // claim about skill, availability or standing that isn't a stored count.
  const reason = matchReasonText(match);
  // Falls back to what they advertise when the search was by name and nothing
  // intersected, so the card still says what this person does.
  const shownCategories = (
    matchedCategories.length > 0 ? matchedCategories : profile.categories ?? []
  ).slice(0, 3);

  return (
    <Card
      onPress={onPress}
      palette={EMERALD_PALETTE}
      style={[styles.resultCard, isDark && styles.cardBorderDark]}
    >
      <View style={styles.resultTopRow}>
        <Avatar name={name} uri={profile.avatar_url} size={56} />
        <View style={styles.resultText}>
          <Text style={styles.profileEyebrow}>WORKER PROFILE</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </View>

          <View style={styles.proofRow}>
            <Ionicons name="star" size={13} color={starColors(colors, isDark).filled} />
            <Text style={styles.proofStrong}>
              {ratingCount > 0 ? (profile.rating_avg ?? 0).toFixed(1) : 'New'}
            </Text>
            <Text style={styles.proofMuted} numberOfLines={1}>
              {ratingCount > 0
                ? `(${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'})`
                : 'no reviews yet'}
            </Text>
          </View>
        </View>
      </View>

      {reason ? (
        <View style={styles.experienceRow}>
          <Ionicons name="ribbon-outline" size={17} color={colors.emerald} />
          <Text style={[styles.experience, isDark && styles.experienceDark]} numberOfLines={2}>
            {reason}
          </Text>
        </View>
      ) : null}

      {shownCategories.length > 0 ? (
        <View style={styles.tagRow}>
          {shownCategories.map((key) => (
            <Chip
              key={key}
              label={skillCategoryLabel(key)}
              variant="soft"
              size="sm"
              style={styles.resultTag}
            />
          ))}
        </View>
      ) : null}

      {/* Master 1's card foot: gold serif label, gold-outline circle-arrow. */}
      <View style={styles.resultActionRow}>
        <Text style={[styles.resultActionText, isDark && styles.resultActionTextDark]}>
          View full profile
        </Text>
        <View style={[styles.resultActionIcon, isDark && styles.resultActionIconDark]}>
          <Ionicons name="arrow-forward" size={17} color={isDark ? colors.gold : colors.forest} />
        </View>
      </View>
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  discoveryHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  intro: {
    gap: spacing.xs,
  },
  // Eyebrow law: a structural section label is gold in dark; light keeps the
  // Heritage emerald.
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.emerald,
  },
  eyebrowDark: { color: colors.gold },
  introText: {
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  // Master 1 rings the whole field in gold; light keeps the Heritage sage
  // hairline.
  searchRowDark: { borderColor: colors.gold },
  searchButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
  },
  searchButtonDark: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  searchButtonPressed: {
    backgroundColor: colors.emerald,
    transform: [{ scale: 0.97 }],
  },
  searchButtonPressedDark: {
    backgroundColor: 'transparent',
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  controlPressed: {
    backgroundColor: colors.mint,
  },
  serviceSection: {
    gap: spacing.sm,
  },
  serviceHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  serviceHeading: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  serviceHint: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  serviceHintDark: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.gold,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  serviceScroll: {
    marginRight: -spacing.lg,
  },
  // Master 1's service tile: glyph over a two-line label, well past the 44pt
  // floor on both axes, selected marked by a heavier ring rather than a fill
  // (gold is line-work).
  serviceTile: {
    width: 108,
    minHeight: 96,
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  serviceTileSelected: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  serviceTilePressed: {
    opacity: 0.82,
  },
  serviceTileLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.ink,
  },
  stateScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  stateScrollTop: {
    justifyContent: 'flex-start',
  },
  rebookBlock: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  rebookHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rebookTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  rebookSeeAll: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  rebookRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingRight: spacing.sm,
  },
  rebookItem: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 72,
  },
  rebookNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: 72,
  },
  rebookName: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderColor: colors.mint2,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  stateIconDanger: {
    backgroundColor: colors.dangerBg,
  },
  stateEyebrow: {
    marginTop: spacing.xs,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.emerald,
  },
  stateEyebrowDanger: {
    color: colors.danger,
  },
  stateTitle: {
    fontFamily: fonts.display,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  stateMessage: {
    maxWidth: 340,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  stateMessageDanger: {
    color: colors.danger,
  },
  stateAction: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  // The FadeIn wrapper has to pass its height down to the FlatList, or the
  // list sizes to its content and stops scrolling.
  resultsFlex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  resultsHeader: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  resultsEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.emerald,
  },
  resultCount: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  resultsHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  resultCard: {
    gap: spacing.md,
    borderColor: colors.mint2,
  },
  // Every dark master rings a card in gold hairline; light keeps the sage.
  cardBorderDark: { borderColor: colors.border },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultText: {
    flex: 1,
    gap: spacing.xs,
  },
  profileEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.emerald,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  proofStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  proofMuted: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  experienceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
  },
  experience: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.forest,
  },
  // Forest on the sage wash is invisible under the v2 dark palette.
  experienceDark: { color: colors.emerald },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  resultTag: {
    maxWidth: '100%',
  },
  resultActionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  resultActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.forest,
  },
  resultActionTextDark: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.gold,
  },
  resultActionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  resultActionIconDark: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  }),
);
