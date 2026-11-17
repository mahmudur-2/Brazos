import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { goBackOrHome } from '../lib/navigationRef';
import { formatPhoneDisplay } from '../lib/phone';
import { fetchWorkerJobStats, type CategoryStat } from '../lib/profiles';
import { fetchBothRoleSummaries, type ReviewSummary } from '../lib/reviews';
import { skillCategoryLabel } from '../lib/skillCategories';
import type { ProfileStackNavigation } from '../lib/navigation';
import {
  EYEBROW_TYPE,
  spacing,
  starColors,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';
import { formatMonthYear } from '../lib/time';
import { titleCase } from '../lib/titleCase';

const LANGUAGE_LABELS: Record<string, string> = { en: 'English', es: 'Español' };

/** "Member since Aug 2026" — the account's own created_at, never a guess. */
function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `Member since ${formatMonthYear(at)}`;
}

/**
 * Golden master 42 — the profile hub's details page.
 *
 * Read-only by design: it states what the account holds and routes to the
 * edit surface for changing it. Every value is the stored one or absent —
 * "No bio yet" is the honest empty, not a placeholder sentence, and the
 * meta row omits any figure the reads have not returned.
 */
export function ProfileDetailsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint, derived from the bar's own
  // geometry plus this device's home-indicator inset. Overrides the static
  // paddingBottom in styles.content, which was 24 against a pill that occupies
  // 82-104.
  const navClearance = useScrollClearance();
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [jobStats, setJobStats] = useState<CategoryStat[] | null>(null);
  // A failed read stays UNKNOWN — the completed-jobs figure is never shown as
  // zero — but it also SAYS so: the meta row carries a retry instead of
  // silently omitting the figure (F-026).
  const [statsReadFailed, setStatsReadFailed] = useState(false);
  const [statsReadAttempt, setStatsReadAttempt] = useState(0);
  const [avatarViewerUri, setAvatarViewerUri] = useState<string | null>(null);
  // R8b-c: the rating comes from the per-role REVEALED summaries, never
  // profiles.rating_avg/rating_count — the legacy aggregate mixes both roles
  // and counts reviews the blind window still holds back. Null is a read
  // that has not answered (or failed): UNKNOWN renders nothing, never zero.
  const [roleSummaries, setRoleSummaries] = useState<{
    worker: ReviewSummary | null;
    customer: ReviewSummary | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setStatsReadFailed(false);
    fetchWorkerJobStats(user.id).then(({ data, error }) => {
      if (!active) return;
      if (error) setStatsReadFailed(true);
      else setJobStats(data);
    });
    return () => {
      active = false;
    };
  }, [user, statsReadAttempt]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchBothRoleSummaries(user.id).then(({ worker, customer, error }) => {
      if (!active || error) return;
      setRoleSummaries({ worker, customer });
    });
    return () => {
      active = false;
    };
  }, [user]);

  const completed = jobStats?.reduce((total, row) => total + row.count, 0) ?? null;
  const workerSummary = roleSummaries?.worker ?? null;
  const workerReviewTotal = workerSummary?.total ?? 0;
  // The link gate sums both roles — a customer-only account still has
  // reviews worth reading (R8b-c, the gate defect).
  const reviewTotal = workerReviewTotal + (roleSummaries?.customer?.total ?? 0);
  // The account's own creation timestamp, from the auth session — `profiles`
  // carries no created_at, so an absent session simply omits the line.
  const since = memberSince(user?.created_at);
  const categories = profile?.categories ?? [];

  // 2026-09-28 (LUX-LIST-64 #2): the phone row's label is the mint (`accent`).
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; muted?: boolean; accent?: boolean }[] = [
    { icon: 'person-outline', label: 'Full Name', value: profile?.full_name?.trim() || 'Not set', muted: !profile?.full_name?.trim() },
    {
      icon: 'call-outline',
      label: 'Phone Number',
      value: profile?.phone ? formatPhoneDisplay(profile.phone) : 'Not set',
      muted: !profile?.phone,
      accent: true,
    },
    {
      icon: 'globe-outline',
      label: 'Language',
      value: LANGUAGE_LABELS[profile?.language ?? 'en'] ?? 'English',
    },
    {
      icon: 'document-text-outline',
      label: 'Bio',
      value: profile?.bio?.trim() || 'No bio yet',
      muted: !profile?.bio?.trim(),
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title="Profile Details"
        onBack={goBackOrHome}
        right={
          <Button
            title="Edit"
            variant="ghost"
            size="sm"
            icon="pencil"
            iconPosition="leading"
            onPress={() => navigation.navigate('ProfileMain', { edit: true })}
            accessibilityLabel="Edit profile"
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Master 42's centred identity header. */}
        <View style={styles.identity}>
          <AvatarPressable
            name={profile?.full_name}
            uri={profile?.avatar_url}
            size={96}
            onLongPress={
              profile?.avatar_url ? () => setAvatarViewerUri(profile.avatar_url) : undefined
            }
          />
          <Text style={styles.name} numberOfLines={1}>
            {profile?.full_name?.trim() || 'Your profile'}
          </Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}

          <View style={styles.metaRow}>
            {/* D1 (R8b-c): the worker role's shown_average with its count, or the
                count alone while the rating is young — nothing at all with zero
                revealed worker reviews, and nothing while the read is unanswered. */}
            {workerSummary && workerReviewTotal > 0 ? (
              <View style={styles.metaItem}>
                {/* F11 (owner, 2026-11-16): no star beside a young rating. */}
                {workerSummary.isNew || workerSummary.shownAverage == null ? null : (
                  <Ionicons name="star" size={15} color={starColors(colors, isDark).filled} />
                )}
                <Text style={styles.metaStrong}>
                  {workerSummary.isNew || workerSummary.shownAverage == null
                    ? `${workerReviewTotal} ${workerReviewTotal === 1 ? 'review' : 'reviews'}`
                    : `${workerSummary.shownAverage.toFixed(1)} (${workerReviewTotal})`}
                </Text>
              </View>
            ) : null}
            {completed != null ? (
              <Text style={styles.metaText}>
                {completed} {completed === 1 ? 'job' : 'jobs'} completed
              </Text>
            ) : statsReadFailed ? (
              // The failed read, named as itself — never "0 completed".
              <Pressable
                onPress={() => setStatsReadAttempt((attempt) => attempt + 1)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Job history didn’t load. Retry."
              >
                <Text style={styles.metaText}>Job history didn’t load — retry</Text>
              </Pressable>
            ) : null}
            {since ? <Text style={styles.metaText}>{since}</Text> : null}
          </View>

          {reviewTotal > 0 && user ? (
            <Button
              title="See All Your Reviews"
              variant="secondary"
              icon="star-outline"
              iconPosition="leading"
              accessibilityLabel={`See all ${reviewTotal} reviews about you`}
              onPress={() =>
                navigation.navigate('ProfileReviews', {
                  userId: user.id,
                  name: profile?.full_name ?? undefined,
                  role: 'both',
                })
              }
              style={styles.reviewsAction}
            />
          ) : null}
        </View>

        {/* One lit group under its section label: the stored value right of each label.
            F20: the header's Edit is the one door to the editor. */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>Both Modes</Text>
          <Card style={styles.card}>
            {rows.map((row, index) => (
              <View key={row.label} style={[styles.detailRow, index > 0 && styles.rowDivider]}>
                <Ionicons name={row.icon} size={20} color={isDark ? colors.emerald : colors.mark} />
                <Text style={[styles.rowLabel, row.accent && { color: colors.emerald }, isDark && styles.rowLabelDark]}>{row.label}</Text>
                <Text
                  style={[styles.rowValue, row.muted && styles.rowValueMuted]}
                  numberOfLines={2}
                >
                  {row.value}
                </Text>
              </View>
            ))}

            {categories.length > 0 ? (
              <View style={[styles.categoryBlock, styles.rowDivider]}>
                <Text accessibilityRole="header" style={styles.eyebrow}>Job Categories</Text>
                <View style={styles.categoryRow}>
                  {categories.map((key) => (
                    <Chip key={key} variant="soft" size="sm" label={titleCase(skillCategoryLabel(key))} />
                  ))}
                </View>
              </View>
            ) : null}
          </Card>
        </View>
      </ScrollView>

      <PhotoViewer
        visible={!!avatarViewerUri}
        uri={avatarViewerUri}
        onClose={() => setAvatarViewerUri(null)}
        allowShare={false}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...textScale.display,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  email: {
    ...textScale.callout,
    fontWeight: '400',
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaStrong: {
    ...textScale.callout,
    fontWeight: '700',
    color: colors.ink,
  },
  metaText: {
    ...textScale.body,
    color: colors.textMuted,
  },
  reviewsAction: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
    marginHorizontal: 2,
  },
  card: { paddingVertical: spacing.xs },
  eyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  // Master 42's value-right row.
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: {
    flexShrink: 0,
    ...textScale.callout,
    fontWeight: '400',
    color: colors.textMuted,
  },
  // F5: in dark a field label is the main button's mint.
  rowLabelDark: { color: colors.primary },
  rowValue: {
    flex: 1,
    ...textScale.callout,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
  },
  rowValueMuted: {
    fontWeight: '500',
    color: colors.textMuted,
  },
  categoryBlock: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  }),
);
