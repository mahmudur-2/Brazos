import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { DELETED_USER_LABEL } from '../lib/rebook';
import { fetchBothRoleSummaries, type ReviewSummary } from '../lib/reviews';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * The page behind a shared profile link — /profile/{id} on the WEB build.
 *
 * It is reached before the navigator (see lib/webRoute.ts and App.tsx), so it
 * renders on its own with no tab bar, no stack and no back control: whoever
 * opens it followed a link from outside the app and has nowhere to go back to.
 *
 * WHAT IT MAY SHOW, and this is the whole design constraint. `profiles`'
 * select policy is `to authenticated` (supabase/phase7_profiles_two_way.sql's
 * profiles_select_authenticated), so an ANONYMOUS visitor can read nothing at
 * all — not the name, not the avatar, not the rating. This page therefore has
 * two honest states and no third:
 *
 *   a signed-in visitor  the real thing: face, name, and the rating summary
 *                        the profile already carries.
 *   everyone else        an install page. It does NOT name the person, does
 *                        not imply they are missing, and does not pretend a
 *                        profile failed to load — it says what is true, which
 *                        is that this page needs the app.
 *
 * NOTHING IS INVENTED. The rating block renders only when a role's REVEALED
 * review total is a real positive number (worker first, hiring when that is
 * all they have — R8b-c, profile_review_summary rather than the legacy
 * profiles aggregate); a person with none gets no stars and no zero, and a
 * failed summary read is UNKNOWN and renders nothing — the repo rule against
 * placeholder marketplace data applies hardest on the one surface strangers
 * see first.
 *
 * WHEN THE SCHEMA GAINS AN ANONYMOUS READ PATH — a party-free select policy,
 * or a security-definer function returning the public columns for one id —
 * this page fills in for everyone with no change above `load()`.
 */

type PublicProfileScreenProps = {
  userId: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'unavailable' };

export function PublicProfileScreen({ userId }: PublicProfileScreenProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // R8b-c: the per-role revealed summaries, signed-in path only — the
  // anonymous visitor could not read the profile, so nothing asks for them.
  // Null is unanswered or failed: UNKNOWN renders no rating block.
  const [roleSummaries, setRoleSummaries] = useState<{
    worker: ReviewSummary | null;
    customer: ReviewSummary | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    setRoleSummaries(null);
    void fetchProfileById(userId).then(({ data }) => {
      if (!alive) return;
      // A read that returns nothing is the SAME state whether the cause is
      // RLS (no session) or a genuinely absent id. The page must not guess
      // between them out loud: it would be telling strangers which user ids
      // exist.
      setState(data ? { status: 'ready', profile: data } : { status: 'unavailable' });
      if (data) {
        void fetchBothRoleSummaries(userId).then(({ worker, customer, error }) => {
          if (!alive || error) return;
          setRoleSummaries({ worker, customer });
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Worker first; the hiring side only when it is all they have. Zero across
  // both roles renders no block at all.
  const pickShown = (summary: ReviewSummary | null) =>
    summary && summary.total > 0 && summary.shownAverage != null
      ? { shownAverage: summary.shownAverage, isNew: summary.isNew, total: summary.total }
      : null;
  const shownSummary =
    pickShown(roleSummaries?.worker ?? null) ?? pickShown(roleSummaries?.customer ?? null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>BRAZOS</Text>

        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.emerald} />
          </View>
        ) : state.status === 'ready' ? (
          <View style={styles.card}>
            <Avatar uri={state.profile.avatar_url} name={state.profile.full_name} size={96} />
            <Text style={styles.name} numberOfLines={2}>
              {state.profile.full_name ?? DELETED_USER_LABEL}
            </Text>
            {shownSummary ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color={colors.star} />
                <Text style={styles.rating}>
                  {shownSummary.isNew ? 'New' : shownSummary.shownAverage.toFixed(1)}
                </Text>
                <Text style={styles.ratingCount}>
                  {shownSummary.total === 1 ? '1 review' : `${shownSummary.total} reviews`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.lockMark}>
              <Ionicons name="person-outline" size={34} color={colors.emerald} />
            </View>
            <Text style={styles.name}>Profiles live in the app</Text>
            <Text style={styles.unavailableNote}>
              Open this link in BRAZOS, or sign in here, to see who shared it with you.
            </Text>
          </View>
        )}

        <Text style={styles.getTheApp}>Get the app — BRAZOS, for getting things done.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      padding: spacing.xl,
    },
    center: {
      paddingVertical: spacing.xl,
    },
    wordmark: {
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: 2,
      color: colors.emerald,
    },
    card: {
      alignItems: 'center',
      gap: spacing.md,
      maxWidth: 420,
      width: '100%',
      padding: spacing.xl,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    lockMark: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    name: {
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
      color: colors.text,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rating: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    ratingCount: {
      fontSize: 14,
      color: colors.textMuted,
    },
    unavailableNote: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      color: colors.textMuted,
    },
    getTheApp: {
      fontSize: 14,
      textAlign: 'center',
      color: colors.textMuted,
    },
  })
);
