import { useCallback, useState } from 'react';
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
import { fetchSavedWorkers, unsaveWorker } from '../lib/savedWorkers';
import type { ProfileStackNavigation } from '../lib/navigation';
import { useMode } from '../modes/ModeProvider';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/** The lightest shape a row needs — the batch profile read returns a subset
 *  of Profile, and the rating/availability extras render only when present. */
type PersonRow = Pick<Profile, 'id' | 'full_name' | 'avatar_url'> &
  Partial<Pick<Profile, 'rating_avg' | 'rating_count' | 'accepting_work'>>;

/**
 * Screen 46 + the Rebook 08 fold-in (Phase 9) — the customer's people
 * surface: workers they saved, and workers who actually completed a job for
 * them. Every row is a real relationship (a save they made, a job that
 * finished) — nothing suggested, nothing invented. Rows open the worker's
 * profile; past workers carry the one-tap rehire that PostJob's
 * hireWorkerId flow already implements.
 */
export function SavedWorkersScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user } = useAuth();
  const { mode } = useMode();

  const [saved, setSaved] = useState<{ worker_id: string; profiles: Profile }[]>([]);
  const [past, setPast] = useState<PersonRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const row = (profile: PersonRow, options: { saved: boolean }) => (
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
          <Text style={styles.rowMeta}>
            {(profile.rating_count ?? 0) > 0
              ? `★ ${(profile.rating_avg ?? 0).toFixed(1)} (${profile.rating_count})`
              : 'No reviews yet'}
            {profile.accepting_work === false ? ' · Not taking work right now' : ''}
          </Text>
        </View>
      </Pressable>
      {/* A tombstoned account cannot complete a hire, so its row carries no
          Hire control — the label and any historical reviews still render,
          because those are real. */}
      {canHire(profile.full_name) ? (
        <Pressable
          style={styles.hireButton}
          onPress={() =>
            navigation.navigate('PostJob', {
              hireWorkerId: profile.id,
              hireWorkerName: profile.full_name ?? 'this worker',
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Hire ${profile.full_name ?? 'worker'} again`}
        >
          <Text style={styles.hireButtonText}>Hire</Text>
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

  return (
    <DetailScreen
      title="Saved & past workers"
      onBack={goBackOrHome}
      state={state}
      sections={[
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
    fontSize: 15,
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
  hireButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
  },
  }),
);
