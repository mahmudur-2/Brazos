import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { goBackOrHome } from '../lib/navigationRef';
import { formatPhoneDisplay } from '../lib/phone';
import { fetchWorkerJobStats, type CategoryStat } from '../lib/portfolio';
import { fetchBothRoleSummaries, type ReviewSummary } from '../lib/reviews';
import { skillCategoryLabel } from '../lib/skillCategories';
import type { ProfileStackNavigation } from '../lib/navigation';
import {
  fonts,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

const LANGUAGE_LABELS: Record<string, string> = { en: 'English', es: 'Español' };

/** "Member since Aug 2026" — the account's own created_at, never a guess. */
function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `Member since ${at.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })}`;
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

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; muted?: boolean }[] = [
    { icon: 'person-outline', label: 'Full name', value: profile?.full_name?.trim() || 'Not set', muted: !profile?.full_name?.trim() },
    {
      icon: 'call-outline',
      label: 'Phone number',
      value: profile?.phone ? formatPhoneDisplay(profile.phone) : 'Not set',
      muted: !profile?.phone,
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Profile"
        onBack={goBackOrHome}
        right={
          <Pressable
            onPress={() => navigation.navigate('ProfileMain', { edit: true })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={[styles.squircle, isDark && styles.squircleDark]}
          >
            <Ionicons name="pencil" size={18} color={isDark ? colors.gold : colors.primary} />
          </Pressable>
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
            {/* D1 (R8b-c): the worker role's shown_average, or the word New —
                nothing at all with zero revealed worker reviews, and nothing
                while the read is unanswered. */}
            {workerSummary && workerReviewTotal > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="star" size={15} color={starColors(colors, isDark).filled} />
                <Text style={styles.metaStrong}>
                  {workerSummary.isNew || workerSummary.shownAverage == null
                    ? 'New'
                    : workerSummary.shownAverage.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {completed != null ? (
              <Text style={styles.metaText}>
                {completed} completed
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
              title="See all your reviews"
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

        <Card style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardGlyph, isDark && styles.cardGlyphDark]}>
              <Ionicons
                name="person-outline"
                size={18}
                color={isDark ? colors.gold : colors.primary}
              />
            </View>
            <View style={styles.cardHeadCopy}>
              <Text style={styles.eyebrow}>SHARED IDENTITY</Text>
              <Text style={styles.cardTitle}>Profile details</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('ProfileMain', { edit: true })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Ionicons name="pencil" size={14} color={colors.gold} />
              <Text style={styles.chipText}>Edit profile</Text>
            </Pressable>
          </View>

          {rows.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <View style={[styles.rowGlyph, isDark && styles.cardGlyphDark]}>
                <Ionicons
                  name={row.icon}
                  size={16}
                  color={isDark ? colors.gold : colors.textMuted}
                />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text
                style={[styles.rowValue, row.muted && styles.rowValueMuted]}
                numberOfLines={2}
              >
                {row.value}
              </Text>
            </View>
          ))}

          {categories.length > 0 ? (
            <View style={styles.categoryBlock}>
              <Text style={styles.eyebrow}>JOB CATEGORIES</Text>
              <View style={styles.categoryRow}>
                {categories.map((key) => (
                  <View key={key} style={styles.chip}>
                    <Text style={styles.chipText}>{skillCategoryLabel(key)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Master 42's PROOF OF WORK card. The dashed block is the honest
            empty state; featured photos themselves live on the hub, which is
            where they are managed. */}
        <Card style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardGlyph, isDark && styles.cardGlyphDark]}>
              <Ionicons
                name="briefcase-outline"
                size={18}
                color={isDark ? colors.gold : colors.primary}
              />
            </View>
            <View style={styles.cardHeadCopy}>
              <Text style={styles.eyebrow}>PROOF OF WORK</Text>
              <Text style={styles.cardTitle}>Past work</Text>
            </View>
            {jobStats && jobStats.length > 0 ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {jobStats[0].count} {skillCategoryLabel(jobStats[0].category)}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={() => navigation.navigate('ProfileMain')}
            accessibilityRole="button"
            accessibilityLabel="Manage your featured past work"
            style={({ pressed }) => [styles.dashed, pressed && styles.chipPressed]}
          >
            <View style={[styles.cardGlyph, isDark && styles.cardGlyphDark]}>
              <Ionicons
                name="camera-outline"
                size={18}
                color={isDark ? colors.gold : colors.primary}
              />
            </View>
            {/* The one past-work empty sentence — the same string the hub's
                PastWork card renders, so the two pages stop describing one
                state two ways. */}
            <Text style={styles.dashedText}>
              Feature photos from jobs you’ve finished to show clients your work.
            </Text>
          </Pressable>
        </Card>
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
    gap: spacing.lg,
  },
  squircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  squircleDark: {
    borderColor: colors.gold,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  email: {
    fontSize: 15,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  metaText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  reviewsAction: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  card: { gap: spacing.md },
  cardDark: { borderColor: colors.border },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeadCopy: { flex: 1, gap: 2 },
  cardGlyph: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardGlyphDark: {
    backgroundColor: 'transparent',
  },
  rowGlyph: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.gold,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  chip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  chipPressed: { opacity: 0.82 },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
  },
  // Master 42's value-right row.
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: {
    flexShrink: 0,
    fontSize: 15,
    color: colors.textMuted,
  },
  rowValue: {
    flex: 1,
    fontSize: 15,
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
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Master 42's dashed empty block.
  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  dashedText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  }),
);
