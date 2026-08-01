import { useRef, useState } from 'react';
import {
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
import { Button } from '../components/Button';
import { HomeGreeting } from '../components/HomeGreeting';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { SKILL_CATEGORIES } from '../lib/skillCategories';
import { formatTimeAgo } from '../lib/time';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/** Deliberately small. This is a taste of the work side, not the work side —
 *  the full list is one tap away behind "See all". */
const PREVIEW_COUNT = 3;

/** The services offered as one-tap starting points. Same six the search
 *  screen suggests, so tapping one there and one here mean the same thing. */
const QUICK_SERVICES = SKILL_CATEGORIES.slice(0, 6);

/**
 * One home screen for both sides of the marketplace. There is no mode and no
 * role: the customer half is up top and carries the visual weight, the worker
 * half sits below it, and the same account uses both.
 */
export function HomeScreen() {
  const { profile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const navigation = useNavigation<HomeStackNavigation>();

  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const preview = jobs.slice(0, PREVIEW_COUNT);

  function goToFindWork() {
    navigation.navigate('BrowseJobs');
  }

  function openJob(job: OpenJob) {
    navigation.navigate('JobDetail', { job });
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    navigation.navigate('WorkerSearch', { query: trimmed });
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
        {/* --- Customer half ------------------------------------------- */}
        <View style={styles.hero}>
          <HomeGreeting firstName={firstName} />
          <Text style={styles.heroPrompt}>What do you need help with?</Text>

          <Pressable
            style={styles.searchField}
            // The whole pill is the target, not just the text inside it —
            // tapping the icon or the padding focuses the input too.
            onPress={() => searchRef.current?.focus()}
            accessibilityRole="search"
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              placeholder="Describe the job, e.g. move a mattress"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="sentences"
              returnKeyType="search"
            />
          </Pressable>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.serviceRow}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_SERVICES.map((service) => (
              <Pressable
                key={service.key}
                style={styles.serviceChip}
                onPress={() =>
                  navigation.navigate('WorkerSearch', { category: service.key })
                }
              >
                <Ionicons name={service.icon} size={14} color={colors.primary} />
                <Text style={styles.serviceChipText} numberOfLines={1}>
                  {service.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Button
            title="Post a Job"
            size="lg"
            icon="briefcase-outline"
            onPress={() => navigation.navigate('PostJob')}
            style={styles.postButton}
          />
        </View>

        {/* --- Worker half --------------------------------------------- */}
        <View style={styles.workSection}>
          <View style={styles.workHeader}>
            <View style={styles.workHeaderText}>
              <Text style={styles.workEyebrow}>Looking for work?</Text>
              <Text style={styles.workTitle}>Open jobs</Text>
            </View>
            <Pressable onPress={goToFindWork} hitSlop={10}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.previewList}>
              {/* Placeholder rows rather than a lone spinner, so the section
                  keeps its height and nothing below it jumps on load. */}
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonIcon} />
                  <View style={styles.skeletonText}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? (
            <View style={styles.previewNotice}>
              <Text style={styles.previewError}>Couldn’t load open jobs.</Text>
              <Pressable onPress={refresh} hitSlop={8}>
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </View>
          ) : preview.length === 0 ? (
            <Text style={styles.previewEmpty}>
              No open jobs right now — new jobs appear here automatically as
              clients post them.
            </Text>
          ) : (
            <View style={styles.previewList}>
              {preview.map((job) => (
                <JobPreviewRow key={job.id} job={job} onPress={() => openJob(job)} />
              ))}
            </View>
          )}

          <Button
            title="Find Work"
            variant="secondary"
            icon="search-outline"
            onPress={goToFindWork}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A single line of the home preview: category glyph, title, pay, age. Kept to
 * one row on purpose — the full-size image cards live behind "See all", and
 * three of them here would bury the customer half of the screen.
 */
function JobPreviewRow({ job, onPress }: { job: OpenJob; onPress: () => void }) {
  const accent = categoryAccent(job.category);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.previewRow, pressed && styles.previewRowPressed]}
      accessibilityRole="button"
    >
      <View style={[styles.previewIcon, { backgroundColor: accent.bg }]}>
        <Ionicons
          name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
          size={17}
          color={accent.icon}
        />
      </View>
      <View style={styles.previewText}>
        <Text style={styles.previewTitle} numberOfLines={1}>
          {job.title}
        </Text>
        <Text style={styles.previewMeta} numberOfLines={1}>
          {JOB_CATEGORY_LABELS[job.category] ?? job.category}
          {job.location ? ` · ${job.location}` : ''}
        </Text>
      </View>
      <View style={styles.previewTrailing}>
        <Text style={styles.previewBudget} numberOfLines={1}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
        </Text>
        <Text style={styles.previewTime} numberOfLines={1}>
          {formatTimeAgo(job.created_at)}
        </Text>
      </View>
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
    paddingTop: spacing.xl,
    // MainTabs already lays the tab bar out below this scene and owns the
    // bottom safe-area inset. Extra content padding here rendered as a blank
    // cream band above the bar instead of protecting anything.
    paddingBottom: 0,
    gap: spacing.xxl,
  },
  hero: {
    gap: spacing.lg,
  },
  heroPrompt: {
    fontSize: 16,
    color: colors.textMuted,
    // Pulls the line up under the greeting so the two read as one block.
    marginTop: -spacing.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    // Android centres single-line inputs oddly without this; iOS ignores it.
    paddingVertical: 0,
  },
  serviceRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  serviceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  postButton: {
    marginTop: spacing.xs,
  },
  workSection: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  workHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  workHeaderText: {
    flex: 1,
    gap: 2,
  },
  workEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  workTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  previewList: {
    gap: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // 64 keeps the whole row a comfortable target on its own, without needing
    // hitSlop on a full-width control.
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewRowPressed: {
    opacity: 0.9,
    backgroundColor: colors.primarySoft,
  },
  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  previewMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  previewTrailing: {
    // Caps the money/age column so a long title still gets most of the row
    // instead of being squeezed by "$1,250" and "about 2 hours ago".
    maxWidth: 96,
    alignItems: 'flex-end',
    gap: 2,
  },
  previewBudget: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  previewTime: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  previewNotice: {
    gap: spacing.xs,
  },
  previewError: {
    fontSize: 14,
    color: colors.danger,
  },
  retry: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  previewEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralBg,
  },
  skeletonText: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralBg,
  },
  skeletonLineShort: {
    width: '55%',
  },
});
