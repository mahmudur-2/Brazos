import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FadeIn } from '../components/FadeIn';
import { ScreenHeader } from '../components/ScreenHeader';
import { VerificationBadge } from '../components/VerificationBadge';
import { useAuth } from '../hooks/useAuth';
import { SKILL_CATEGORIES, skillCategoryLabel } from '../lib/skillCategories';
import {
  findWorkers,
  interpretQuery,
  matchReasonText,
  resultHeading,
  type RankingMode,
  type WorkerMatch,
} from '../lib/workerSearch';
import type { HomeStackNavigation, WorkerSearchRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/** Chips offered before anything has been typed. The first six of the shared
 *  skill list — enough to cover the common asks without a wall of options. */
const SUGGESTED_CATEGORIES = SKILL_CATEGORIES.slice(0, 6);

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  // `mode` is whatever actually ranked these rows, and only the lib decides how
  // that reads on screen — see resultHeading().
  | { kind: 'results'; matches: WorkerMatch[]; categories: string[]; mode: RankingMode };

export function WorkerSearchScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { params } = useRoute<RouteProp<WorkerSearchRouteParamList, 'WorkerSearch'>>();
  const { user } = useAuth();

  const [query, setQuery] = useState(params?.query ?? '');
  // An explicitly tapped chip beats whatever the free text would have implied,
  // and is cleared as soon as the text is edited again.
  const [pinnedCategory, setPinnedCategory] = useState<string | null>(
    params?.category ?? null
  );
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  // Guards a slow response from overwriting a newer one — a fast second search
  // finishing first would otherwise leave the older results on screen.
  const runRef = useRef(0);

  const run = useCallback(
    async (text: string, category: string | null) => {
      const trimmed = text.trim();
      if (!trimmed && !category) {
        setState({ kind: 'idle' });
        return;
      }

      const runId = ++runRef.current;
      setState({ kind: 'loading' });

      const categories = category ? [category] : interpretQuery(trimmed);
      const { data, error, mode } = await findWorkers({
        query: trimmed,
        categories,
        excludeUserId: user?.id ?? null,
      });

      if (runId !== runRef.current) return;
      if (error) {
        setState({ kind: 'error', message: error.message });
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
    // Only on arrival — later searches are driven by submit/chip presses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <ScreenHeader title="Find help" onBack={() => navigation.goBack()} />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            // Typing means the customer is describing the job themselves, so
            // stop forcing the chip they tapped earlier.
            if (pinnedCategory) setPinnedCategory(null);
          }}
          onSubmitEditing={submit}
          placeholder="What do you need help with?"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="search"
          autoFocus={!params?.query && !params?.category}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => {
              setQuery('');
              setPinnedCategory(null);
              setState({ kind: 'idle' });
            }}
            hitSlop={10}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
          </Pressable>
        )}
      </View>

      <View style={styles.chipRow}>
        {SUGGESTED_CATEGORIES.map((category) => {
          const selected = activeCategories.includes(category.key);
          return (
            <Pressable
              key={category.key}
              onPress={() => chooseCategory(category.key)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={category.icon}
                size={13}
                color={selected ? colors.onPrimary : colors.primary}
              />
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
                numberOfLines={1}
              >
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.kind === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{state.message}</Text>
          <Button
            title="Try again"
            variant="secondary"
            onPress={submit}
            style={styles.centerAction}
          />
        </View>
      ) : state.kind === 'idle' ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Describe what you need</Text>
          <Text style={styles.emptyText}>
            Try “move a queen mattress up three flights” — or pick a service
            above to see who does it.
          </Text>
        </View>
      ) : state.matches.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="search-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No workers matched</Text>
          <Text style={styles.emptyText}>
            Nobody has listed this service yet. Posting the job puts it in front
            of every worker browsing, and they come to you.
          </Text>
          <Button
            title="Post a job"
            onPress={() => navigation.navigate('PostJob')}
            style={styles.centerAction}
          />
        </View>
      ) : (
        // Re-fades on each new search, so results visibly replace the
        // previous set instead of silently swapping under the reader.
        <FadeIn style={styles.resultsFlex} resetKey={state.categories.join(',')}>
        <FlatList
          data={state.matches}
          keyExtractor={(item) => item.profile.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {resultHeading(state.mode, state.matches.length)}
            </Text>
          }
          renderItem={({ item }) => (
            <WorkerResultCard match={item} onPress={() => openWorker(item)} />
          )}
        />
        </FadeIn>
      )}
    </SafeAreaView>
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
    <Card onPress={onPress} style={styles.resultCard}>
      <View style={styles.resultRow}>
        <Avatar name={name} uri={profile.avatar_url} size={48} />
        <View style={styles.resultText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <VerificationBadge status={profile.verification_status} />
          </View>

          <View style={styles.proofRow}>
            <Ionicons name="star" size={13} color={colors.star} />
            <Text style={styles.proofStrong}>
              {ratingCount > 0 ? (profile.rating_avg ?? 0).toFixed(1) : 'New'}
            </Text>
            <Text style={styles.proofMuted} numberOfLines={1}>
              {ratingCount > 0
                ? `(${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'})`
                : 'no reviews yet'}
            </Text>
          </View>

          {reason && (
            <Text style={styles.experience} numberOfLines={1}>
              {reason}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </View>

      {shownCategories.length > 0 && (
        <View style={styles.tagRow}>
          {shownCategories.map((key) => (
            <View key={key} style={styles.tag}>
              <Text style={styles.tagText} numberOfLines={1}>
                {skillCategoryLabel(key)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md + 2,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    // Android centres single-line inputs oddly without this; iOS ignores it.
    paddingVertical: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.onPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerAction: {
    marginTop: spacing.lg,
    minWidth: 180,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 20,
  },
  // The FadeIn wrapper has to pass its height down to the FlatList, or the
  // list sizes to its content and stops scrolling.
  resultsFlex: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  resultCard: {
    gap: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultText: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proofStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  proofMuted: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  experience: {
    fontSize: 13,
    color: colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
