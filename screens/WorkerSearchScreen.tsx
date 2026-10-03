import {
  useCallback,
  useEffect,
  useMemo,
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useHiddenUserIds } from '../hooks/useHiddenUserIds';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { useRebookWorkers } from '../hooks/useRebookWorkers';
import { fetchProfileReviewSummaries, type ProfileReviewSummaryRow } from '../lib/reviews';
import { SKILL_CATEGORIES, skillCategoryLabel } from '../lib/skillCategories';
import {
  emptyResultTitle,
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
import { useDialNumber } from '../lib/designOverrides';
import {
  litCardStyle, EYEBROW_TYPE,
  emeraldColorsFor,
  fonts,
  radius,
  shadows,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { CategoryGlyph } from '../components/CategoryGlyph';
import { SearchBar, useScrollClearance } from '../ui/primitives';

/** Tiles offered before anything has been typed: the whole shared skill list,
 *  in its own order. It was the first six, which left four categories able to
 *  apply a filter this row could not mark at all — among them the one behind
 *  Home's own "TV Mounting" pill. */
const SUGGESTED_CATEGORIES = SKILL_CATEGORIES;

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
  // RUN T2 (C10) — THE CATEGORY TILES ARE THIS SCREEN. Each dial falls back to
  // the value this file drew before it existed, spelled here and nowhere else;
  // the two token-backed ones take the `theme.*` scale this file imports
  // spacing/radius from.
  const serviceTileWidth = useDialNumber('workerSearch.serviceTile.width') ?? 108;
  const serviceTileHeight = useDialNumber('workerSearch.serviceTile.height') ?? 96;
  const serviceTileRadius = useDialNumber('workerSearch.serviceTile.radius') ?? radius.lg;
  const chipRowGap = useDialNumber('workerSearch.chipRow.gap') ?? spacing.sm;
  // emerald(3): the floating pill's real footprint. This is the Discover tab's
  // root since emerald(1), so it is now a first-screen surface.
  const navClearance = useScrollClearance();
  const EMERALD_PALETTE = emeraldColorsFor(colors);
  const navigation = useNavigation<CustomerHomeStackNavigation>();
  const { params } = useRoute<RouteProp<WorkerSearchRouteParamList, 'WorkerSearch'>>();
  // M-16 — the Discover tab mounts this screen with autoFocus: false and
  // nothing else; every push from Home leaves it unset.
  const isTabRoot = params?.autoFocus === false && !params?.query && !params?.category;
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();

  const [query, setQuery] = useState(params?.query ?? '');
  // An explicitly tapped chip beats whatever the free text would have implied,
  // and is cleared as soon as the text is edited again.
  const [pinnedCategory, setPinnedCategory] = useState<string | null>(
    params?.category ?? null
  );
  const [searched, setState] = useState<SearchState>({ kind: 'idle' });
  // FIX-RUN B3 (Apple 1.2): a blocked worker leaves the results — a block
  // either way — the moment the block lands, without a second search.
  const hidden = useHiddenUserIds();
  const state = useMemo<SearchState>(
    () =>
      searched.kind === 'results' && hidden.size
        ? { ...searched, matches: searched.matches.filter((match) => !hidden.has(match.profile.id)) }
        : searched,
    [searched, hidden]
  );
  // The result cards' rating (n7): ONE profile_review_summaries() call over
  // the ids the list renders — worker role, revealed reviews only — re-run
  // only when that id set changes. Null until it answers (or when it failed):
  // UNKNOWN, so a card prints no number and no "New" rather than a zero.
  const [summaries, setSummaries] = useState<Map<string, ProfileReviewSummaryRow> | null>(
    null
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // §4.4 — the Saved / Worked-for-you-before sections collapsed into one
  // horizontal strip at the top of this surface's landing state.
  // 2026-09-28 (LUX-LIST-64 #62): the one rebook read, shared with the Home's
  // "Hire again" row (hooks/useRebookWorkers.ts).
  const rebook = useRebookWorkers('WorkerSearch');

  // Guards a slow response from overwriting a newer one — a fast second search
  // finishing first would otherwise leave the older results on screen.
  const runRef = useRef(0);

  // The tile row scrolls horizontally, and the category a customer arrives
  // with can sit well past the right edge — dog walking is sixth of ten — so
  // the ring that marks it gets painted where nobody can see it, leaving a
  // filtered search with no visible sign of its filter. Aim the row at that
  // tile on arrival, from the tile's OWN measured x: the row's gap and padding
  // make any width-derived guess wrong.
  const tileRowRef = useRef<ScrollView>(null);
  const arrivalCategory = useRef<string | null>(params?.category ?? null);
  const arrivalTileX = useRef<number | null>(null);

  const revealArrivalTile = useCallback(() => {
    const x = arrivalTileX.current;
    if (arrivalCategory.current === null || x === null) return;
    // chipRow carries no leading padding — its content starts flush against
    // the scroller's left edge — so the tile's own x IS the offset that lands
    // it on the same inset the first tile occupies.
    tileRowRef.current?.scrollTo({ x: Math.max(0, x), animated: false });
  }, []);


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

  // Effects compare by identity and each search builds a fresh array, so the
  // read is keyed on the sorted distinct ids — one call per id set, not one
  // per render. An empty key (no results on screen) issues no request.
  const resultIdKey =
    state.kind === 'results'
      ? [...new Set(state.matches.map((match) => match.profile.id))].sort().join(',')
      : '';

  useEffect(() => {
    if (!resultIdKey) {
      setSummaries(null);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await fetchProfileReviewSummaries(resultIdKey.split(','), 'worker');
      if (!active) return;
      // A failed read is null — UNKNOWN — never an empty map standing in
      // for "no reviews".
      setSummaries(data);
    })();
    return () => {
      active = false;
    };
  }, [resultIdKey]);

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
    // The row now belongs to the customer: a tile they reached for is already
    // in view, and re-aiming under their thumb would fight them.
    arrivalCategory.current = null;
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

  // Only the chip path names a category. Typing clears the pin, so a category
  // the free text merely implied is never announced as a filter the customer
  // chose — and the label that appears is the same one on the ringed tile.
  const appliedCategoryLabel = pinnedCategory
    ? skillCategoryLabel(pinnedCategory)
    : undefined;

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* Master 1 sets "Find help" as the screen's own display headline.
          2026-09-26 (the refresh, audit M-16): as the Discover TAB root it
          wears the tab's own word and draws no back chevron (there is
          nothing behind a tab root); pushed from Home's "Browse workers" it
          is "Find help" with its way back. The tab root is the one mount
          that carries autoFocus: false (navigation/CustomerRoot.tsx). */}
      {/* 2026-09-27 (the Lux remake, the operator's Discover picture): the
          circle back button is back on the tab root too — it goes Home, as
          `goBackOrHome` does — the title "Discover", no eyebrow. */}
      {/* 2026-09-28 (LUX-LIST-64 #27): Discover keeps the big left title even
          when it opens from Home with a back button — Back on its own row
          above it, named "Home" when that is where it goes (#60). */}
      <ScreenHeader
        title={isTabRoot ? 'Discover' : 'Find Help'}
        onBack={goBackOrHome}
        palette={EMERALD_PALETTE}
        largeTitle
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.discoveryHeader}>
          {!keyboardVisible && windowHeight >= 650 ? (
            <View style={styles.intro}>
              {/* 2026-09-27 (the Lux remake): no eyebrow, and the subtitle on
                  one line at 393 wide (ruling 10). */}
              <Text style={styles.introText}>
                Describe the job, or pick a service below.
              </Text>
            </View>
          ) : null}

          {/* The shared SearchBar (mic included when the device supports it).
              Its standard clear control performs exactly what the old custom
              one did: onChangeText('') resets the run guard, the results and
              the pinned chip. */}
          <SearchBar
            style={[styles.searchRow, isDark && styles.searchRowDark, isDark && shadows.cardDark]}
            value={query}
            onChangeText={(text) => {
              runRef.current += 1;
              setQuery(text);
              setState({ kind: 'idle' });
              // Typing means the customer is describing the job themselves, so
              // stop forcing the chip they tapped earlier.
              if (pinnedCategory) setPinnedCategory(null);
              arrivalCategory.current = null;
            }}
            onSubmit={submit}
            // One line, never two (the operator's Discover picture).
            placeholder="What do you need?"
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
                  // The pressed treatment is a base plus a colour override,
                  // exactly like the resting one above it — not two
                  // alternatives. As alternatives the dark branch silently
                  // dropped the scale the light branch carried, and the light
                  // branch dropped dark's dim.
                  pressed && styles.searchButtonPressed,
                  pressed && isDark && styles.searchButtonPressedDark,
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
                  // 2026-09-27 (the Lux remake): the arrow disc is the Lux `.disc`
                  // — a solid mint disc with the CTA's dark ink on it.
                  color={isDark ? colors.onPrimary : colors.onForest}
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
                ref={tileRowRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.chipRow, { gap: chipRowGap }]}
                style={styles.serviceScroll}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={revealArrivalTile}
              >
                {SUGGESTED_CATEGORIES.map((category) => {
                  const selected = activeCategories.includes(category.key);
                  return (
                    <Pressable
                      key={category.key}
                      onPress={() => chooseCategory(category.key)}
                      style={({ pressed }) => [
                        styles.serviceTile,
                        {
                          width: serviceTileWidth,
                          minHeight: serviceTileHeight,
                          borderRadius: serviceTileRadius,
                        },
                        // 2026-09-29 (LUX-LIST-2 #6): the lit tile; a chosen tile's mint rim still wins.
                        litCardStyle(isDark, 'tile'),
                        selected && styles.serviceTileSelected,
                        pressed && styles.serviceTilePressed,
                      ]}
                      onLayout={(event) => {
                        // Only the tile the customer arrived on reports itself;
                        // every other measurement is noise here.
                        if (category.key !== arrivalCategory.current) return;
                        arrivalTileX.current = event.nativeEvent.layout.x;
                        revealArrivalTile();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={category.label}
                      accessibilityHint={`Find workers for ${category.label.toLowerCase()}`}
                    >
                      {/* 2026-09-27 (the Lux remake, ruling 12): the Lux line icon, mint. */}
                      <CategoryGlyph
                        name={category.icon}
                        size={24}
                        color={isDark ? colors.emerald : colors.forest}
                        bare
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
              eyebrow="START WITH THE JOB"
              eyebrowGold
              title="Describe what you need"
              message="e.g. “move a queen mattress up three flights”"
            />
          </SearchStateScroll>
        ) : state.matches.length === 0 ? (
          <SearchStateScroll resetKey="empty-results">
            <SearchStateCard
              icon="search-outline"
              eyebrow="NO MATCHES YET"
              title={emptyResultTitle(appliedCategoryLabel)}
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
                    {resultHeading(state.mode, state.matches.length, appliedCategoryLabel)}
                  </Text>
                  <Text style={styles.resultsHint}>
                    Open a profile to see real work and reviews.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <WorkerResultCard
                  match={item}
                  summary={summaries?.get(item.profile.id) ?? null}
                  onPress={() => openWorker(item)}
                />
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
  eyebrowGold = false,
  children,
}: {
  icon?: IoniconName;
  busy?: boolean;
  eyebrow: string;
  /** 2026-09-29 (LUX-LIST-2 #4): START WITH THE JOB is one of the kept-gold labels. */
  eyebrowGold?: boolean;
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
      <Text style={[styles.stateEyebrow, eyebrowGold && styles.stateEyebrowGold, danger && styles.stateEyebrowDanger]}>{eyebrow}</Text>
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
  summary,
  onPress,
}: {
  match: WorkerMatch;
  /** The worker-role revealed summary for this row, or null while UNKNOWN. */
  summary: ProfileReviewSummaryRow | null;
  onPress: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const EMERALD_PALETTE = emeraldColorsFor(colors);
  const { profile, matchedCategories } = match;
  const name = profile.full_name?.trim() || 'Worker';
  // The rating line reads the summary and nothing else (R8b-c D1): the word
  // "New" while the reputation is under three revealed reviews, the shrunk
  // shown_average to one decimal once it is not, and nothing while the row is
  // unknown. The count beside it is REVEALED reviews only.
  const ratingCount = summary?.total ?? null;
  const ratingText =
    summary == null
      ? ''
      : summary.isNew
        ? 'New'
        : summary.shownAverage != null && summary.total > 0
          ? summary.shownAverage.toFixed(1)
          : '';
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
            <Text style={styles.proofStrong}>{ratingText}</Text>
            <Text style={styles.proofMuted} numberOfLines={1}>
              {ratingCount == null
                ? ''
                : ratingCount > 0
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
          <Ionicons name="arrow-forward" size={17} color={isDark ? colors.emerald : colors.forest} />
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
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  eyebrowDark: { color: colors.eyebrow },
  introText: {
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingLeft: 18,
    paddingRight: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  // Master 1 rings the whole field in gold; light keeps the Heritage sage
  // hairline.
  // 2026-09-27 (the Lux remake): the field's rim is the mint-neutral rim, not gold.
  searchRowDark: { borderColor: colors.border },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchButtonDark: {
    backgroundColor: colors.emerald,
    borderColor: 'transparent',
  },
  searchButtonPressed: {
    backgroundColor: colors.emerald,
    transform: [{ scale: 0.97 }],
    opacity: 0.72,
  },
  searchButtonPressedDark: {
    backgroundColor: 'transparent',
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
  // 2026-09-27 (the Lux remake, ruling 4): "POPULAR SERVICES" is the eyebrow —
  // gold in dark, emerald in light; the hint beside it stays muted.
  serviceHeading: {
    flexShrink: 1,
    ...EYEBROW_TYPE,
    // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    color: colors.eyebrowGold,
  },
  serviceHint: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  serviceHintDark: {
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    paddingRight: spacing.lg,
  },
  serviceScroll: {
    marginRight: -spacing.lg,
  },
  // Master 1's service tile: glyph over a two-line label, well past the 44pt
  // floor on both axes, selected marked by a heavier ring rather than a fill
  // (gold is line-work).
  serviceTile: {
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // A chosen tile lights its rim mint (ruling 11), never gold.
  serviceTileSelected: {
    borderWidth: 2,
    borderColor: colors.emerald,
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
  // 2026-09-27 (the Lux remake, ruling 4): a section heading is the eyebrow.
  rebookTitle: {
    ...EYEBROW_TYPE,
    // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    color: colors.eyebrowGold,
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
    ...EYEBROW_TYPE,
    marginTop: spacing.xs,
    // The eyebrow role: gold in dark, emerald in light (ruling 4).
    color: colors.eyebrow,
  },
  stateEyebrowGold: { color: colors.eyebrowGold },
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
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
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
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.forest,
  },
  resultActionTextDark: {
    color: colors.gold,
  },
  resultActionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultActionIconDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  }),
);
