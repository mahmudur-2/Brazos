import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { fetchRehirableWorkerIds } from '../lib/jobs';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { fetchProfilesByIds, type Profile } from '../lib/profiles';
import { canHire, pastOnlyIds } from '../lib/rebook';
import { fetchProfileReviewSummaries, type ProfileReviewSummaryRow } from '../lib/reviews';
import { fetchSavedWorkers, unsaveWorker } from '../lib/savedWorkers';
import type { ProfileStackNavigation } from '../lib/navigation';
import { useMode } from '../modes/ModeProvider';
import {
  fonts,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/** The lightest shape a row needs — the batch profile read returns a subset
 *  of Profile, and the availability extra renders only when present. The
 *  rating is not on the profile at all (n7): it is the worker-role revealed
 *  summary, fetched once for every id on the screen and looked up by id. */
type PersonRow = Pick<Profile, 'id' | 'full_name' | 'avatar_url'> &
  Partial<Pick<Profile, 'accepting_work'>>;

/**
 * Screen 46 + the Rebook 08 fold-in (Phase 9) — the customer's people
 * surface: workers they saved, and workers who actually completed a job for
 * them. Every row is a real relationship (a save they made, a job that
 * finished) — nothing suggested, nothing invented. Rows open the worker's
 * profile; past workers carry the one-tap rehire that PostJob's
 * hireWorkerId flow already implements.
 */
export function SavedWorkersScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user } = useAuth();
  const { mode } = useMode();

  const [saved, setSaved] = useState<{ worker_id: string; profiles: Profile }[]>([]);
  const [past, setPast] = useState<PersonRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The rows' rating (n7): ONE profile_review_summaries() call over every id
  // this screen renders — saved and past, worker role, revealed reviews only
  // — re-run only when that id set changes. Null until it answers (or when
  // it failed): UNKNOWN, so a row prints nothing rather than a zero.
  const [summaries, setSummaries] = useState<Map<string, ProfileReviewSummaryRow> | null>(
    null
  );

  // Effects compare by identity and both lists are fresh arrays per read;
  // keying on the sorted distinct ids is what makes this one call per id set.
  const rowIdKey = useMemo(
    () =>
      [...new Set([...saved.map((r) => r.worker_id), ...past.map((p) => p.id)])]
        .sort()
        .join(','),
    [saved, past]
  );

  useEffect(() => {
    if (!rowIdKey) {
      setSummaries(null);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await fetchProfileReviewSummaries(rowIdKey.split(','), 'worker');
      if (!active) return;
      // A failed read is null — UNKNOWN — never an empty map standing in
      // for "no reviews".
      setSummaries(data);
    })();
    return () => {
      active = false;
    };
  }, [rowIdKey]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const [savedRes, pastIdsRes] = await Promise.all([
      fetchSavedWorkers(user.id),
      fetchRehirableWorkerIds(user.id),
    ]);
    if (savedRes.error) setLoadError(userMessage(savedRes.error));
    else setSaved(savedRes.data);
    // §4.1 — a worker in both populations appears ONLY under Saved, so the
    // past section is deduped against the saved ids before profiles are even
    // fetched. When the saved read failed nothing is known to subtract; the
    // retryable error state below owns that case.
    const savedIdSet = savedRes.error
      ? new Set<string>()
      : new Set(savedRes.data.map((r) => r.worker_id));
    // A failed past-workers read must not masquerade as "no one here yet"
    // (hardening A6): surface it into the same retryable error state.
    if (pastIdsRes.error) {
      const message = userMessage(pastIdsRes.error);
      setLoadError((prev) => prev ?? message);
    } else {
      const wantedIds = pastOnlyIds(pastIdsRes.data, savedIdSet);
      if (wantedIds.length > 0) {
        const { data: profiles, error: profilesError } = await fetchProfilesByIds(wantedIds);
        if (profilesError) setLoadError((prev) => prev ?? userMessage(profilesError));
        else setPast(profiles);
      } else {
        setPast([]);
      }
    }
    setLoaded(true);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function removeSaved(workerId: string) {
    if (!user || busyId) return;
    setBusyId(workerId);
    const { error } = await unsaveWorker(user.id, workerId);
    setBusyId(null);
    if (error) {
      await alertAsync('Could not remove', userMessage(error));
      return;
    }
    setSaved((prev) => prev.filter((r) => r.worker_id !== workerId));
  }

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : !loaded
      ? { kind: 'loading', variant: 'spinner' }
      : loadError
        ? { kind: 'error', message: loadError, onRetry: () => void load() }
        : saved.length === 0 && past.length === 0
          ? {
              kind: 'empty',
              title: 'No one here yet',
              body: 'Save a worker from their profile, or finish a job with someone — both show up here for quick rehiring.',
              // §4.1 — the way out of an empty people surface is finding
              // people. Worker search lives in the customer tree only, so the
              // worker-mode fallback stays Back rather than a dead dispatch.
              actionLabel: mode === 'customer' ? 'Find workers' : 'Back',
              onAction:
                mode === 'customer'
                  ? () => navigateAcrossTabs('Discover', 'WorkerSearch', { autoFocus: false })
                  : goBackOrHome,
            }
          : { kind: 'ready' };

  // What the meta line prints in the number's place (R8b-c D1): the shrunk
  // shown_average to one decimal, or the word "New" while the reputation is
  // under three revealed reviews. Null is UNKNOWN — the batch unanswered or
  // failed, or a row with nothing displayable — and prints nothing.
  const ratingWord = (summary: ProfileReviewSummaryRow): string | null =>
    summary.isNew
      ? 'New'
      : summary.shownAverage != null
        ? summary.shownAverage.toFixed(1)
        : null;

  const row = (profile: PersonRow, options: { saved: boolean }) => {
    const summary = summaries?.get(profile.id) ?? null;
    const word = summary != null && summary.total > 0 ? ratingWord(summary) : null;
    return (
      <View key={`${options.saved ? 's' : 'p'}:${profile.id}`} style={styles.row}>
        <Pressable
          style={styles.rowMain}
          onPress={() =>
            navigation.navigate('WorkerProfile', {
              workerId: profile.id,
              workerName: profile.full_name ?? undefined,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`View ${profile.full_name ?? 'worker'}`}
        >
          <Avatar name={profile.full_name} uri={profile.avatar_url} size={44} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowName} numberOfLines={1}>
              {profile.full_name ?? 'Worker'}
            </Text>
            {/* Master 22 draws this row's star in the set's gold, like every
                other rating in the app. It was inheriting the meta line's grey
                because it is a glyph inside the sentence, so it gets its own
                span — painted through the one star treatment in BOTH palettes
                (gold in dark, the Heritage `star` gold in light). */}
            <Text style={styles.rowMeta}>
              {summary != null && word != null ? (
                <>
                  <Text style={{ color: starColors(colors, isDark).filled }}>★</Text>
                  {` ${word} (${summary.total})`}
                </>
              ) : summary != null && summary.total === 0 ? (
                'No reviews yet'
              ) : (
                ''
              )}
              {profile.accepting_work === false ? ' · Not taking work right now' : ''}
            </Text>
          </View>
        </Pressable>
        {/* A tombstoned account cannot complete a hire, so its row carries no
            Hire control — the label and any historical reviews still render,
            because those are real. */}
        {canHire(profile.full_name) ? (
          <Pressable
            style={[styles.hireButton, isDark && styles.hireButtonDark]}
            onPress={() =>
              navigation.navigate('PostJob', {
                hireWorkerId: profile.id,
                hireWorkerName: profile.full_name ?? 'this worker',
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Hire ${profile.full_name ?? 'worker'} again`}
          >
            <Text style={[styles.hireButtonText, isDark && styles.hireButtonTextDark]}>
              Hire
            </Text>
          </Pressable>
        ) : null}
        {options.saved ? (
          <Pressable
            onPress={() => removeSaved(profile.id)}
            disabled={busyId === profile.id}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove from saved"
          >
            <Ionicons name="bookmark" size={20} color={colors.emerald} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <DetailScreen
      title="Saved & past workers"
      onBack={goBackOrHome}
      state={state}
      sections={[
        {
          // Master 22's leaf divider, the one place in the set it appears.
          content: (
            <View style={styles.leafDivider} pointerEvents="none">
              <View style={styles.leafRule} />
              <Ionicons name="leaf-outline" size={18} color={colors.gold} />
              <View style={styles.leafRule} />
            </View>
          ),
        },
        ...(saved.length > 0
          ? [
              {
                title: 'Saved',
                content: <View style={styles.list}>{saved.map((r) => row(r.profiles, { saved: true }))}</View>,
              },
            ]
          : []),
        ...(past.length > 0
          ? [
              {
                title: 'Worked for you before',
                content: <View style={styles.list}>{past.map((p) => row(p, { saved: false }))}</View>,
              },
            ]
          : []),
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 64,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  hireButton: {
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Master 22's Hire is a gold-OUTLINE pill with a gold serif label — gold as
  // line-work. Light keeps the Heritage sage-filled emerald pill.
  hireButtonDark: {
    borderColor: colors.gold,
    backgroundColor: 'transparent',
  },
  hireButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.emerald,
  },
  hireButtonTextDark: {
    color: colors.gold,
  },
  // Master 22's gold leaf divider under the header. Two rules with the
  // brand's own leaf between them — decoration, so it takes no touches.
  leafDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  leafRule: {
    flex: 1,
    height: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  }),
);
