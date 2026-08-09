import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../ui/templates/FormScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { VerificationBadge } from '../components/VerificationBadge';
import { useAuth } from '../hooks/useAuth';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { dollarsToCents, JOB_CATEGORIES, JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  addWorkerService,
  fetchWorkerServices,
  removeWorkerService,
  servicePriceLabel,
  updateWorkerService,
  type ServicePriceUnit,
  type WorkerService,
} from '../lib/services';
import { fetchMyProfile, updateProfile, type Profile } from '../lib/profiles';
import type { ProfileStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Screens 64 + 66 (Phase 9, consolidated) — the worker's self-service
 * surface: advertised services with honest pricing (NULL price renders "Ask
 * for a quote", never $0), draft/publish per service, the availability
 * toggle + note (display truth on the public profile), and the honest
 * verification state — there is NO KYC provider in this build and the copy
 * says so instead of pretending.
 */
export function ServicesPricingScreen() {
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [services, setServices] = useState<WorkerService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The add-service draft. Failure preserves every field (recoverable-error rule).
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<ServicePriceUnit>('flat');
  const [category, setCategory] = useState<string>('other');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [savingAvailability, setSavingAvailability] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const [profileRes, servicesRes] = await Promise.all([
      fetchMyProfile(user.id),
      fetchWorkerServices(user.id),
    ]);
    if (profileRes.error) setLoadError(profileRes.error.message);
    else if (profileRes.data) {
      setProfile(profileRes.data);
      setNote(profileRes.data.availability_note ?? '');
    }
    if (servicesRes.error) setLoadError(servicesRes.error.message);
    else setServices(servicesRes.data);
    setLoaded(true);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : !loaded
      ? { kind: 'loading', variant: 'spinner' }
      : loadError
        ? { kind: 'error', message: loadError, onRetry: () => void load() }
        : { kind: 'ready' };

  const priceCents = price.trim() ? dollarsToCents(price) : null;
  const priceValid = priceCents === null || (!Number.isNaN(priceCents) && priceCents > 0);
  const canAdd = title.trim().length > 0 && priceValid && !adding;

  async function addService() {
    if (!user || !canAdd) return;
    setAdding(true);
    const { data, error } = await addWorkerService(user.id, {
      title,
      category,
      priceCents: priceCents === null || Number.isNaN(priceCents) ? null : priceCents,
      priceUnit,
      position: services.length,
    });
    setAdding(false);
    if (error || !data) {
      await alertAsync('Could not add the service', error?.message ?? 'Try again.');
      return;
    }
    setServices((prev) => [...prev, data]);
    setTitle('');
    setPrice('');
  }

  async function togglePublished(service: WorkerService) {
    if (busyId) return;
    setBusyId(service.id);
    const { data, error } = await updateWorkerService(service.id, {
      published: !service.published,
    });
    setBusyId(null);
    if (error || !data) {
      await alertAsync('Could not update the service', error?.message ?? 'Try again.');
      return;
    }
    setServices((prev) => prev.map((s) => (s.id === service.id ? data : s)));
  }

  async function deleteService(service: WorkerService) {
    if (busyId) return;
    const sure = await confirmAsync({
      title: 'Remove this service?',
      message: `“${service.title}” will no longer appear on your profile.`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!sure) return;
    setBusyId(service.id);
    const { error } = await removeWorkerService(service.id);
    setBusyId(null);
    if (error) {
      await alertAsync('Could not remove the service', error.message);
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== service.id));
  }

  async function saveAvailability(patch: { accepting_work?: boolean; availability_note?: string | null }) {
    if (!user || savingAvailability) return;
    setSavingAvailability(true);
    const { data, error } = await updateProfile(user.id, patch);
    setSavingAvailability(false);
    if (error) {
      // The toggle/note keep their edited values; nothing typed is lost.
      await alertAsync('Could not save availability', error.message);
      return;
    }
    if (data) setProfile(data);
  }

  const accepting = profile?.accepting_work ?? true;

  return (
    <FormScreen
      title="Services & availability"
      onBack={() => navigation.goBack()}
      state={state}
    >
      <View style={styles.card}>
        <View style={styles.availabilityRow}>
          <View style={styles.availabilityCopy}>
            <Text style={styles.cardTitle}>Taking new work</Text>
            <Text style={styles.cardNote}>
              Shown on your public profile. Turning it off doesn’t block offers
              — it just tells customers what to expect.
            </Text>
          </View>
          <Switch
            value={accepting}
            onValueChange={(value) => void saveAvailability({ accepting_work: value })}
            disabled={savingAvailability}
            trackColor={{ true: colors.emerald, false: colors.border }}
            accessibilityLabel="Taking new work"
          />
        </View>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          onEndEditing={() => void saveAvailability({ availability_note: note.trim() || null })}
          placeholder="Availability note — e.g. Weekday evenings, weekends"
          placeholderTextColor={colors.textSubtle}
          maxLength={140}
          accessibilityLabel="Availability note"
        />
      </View>

      <View style={styles.card}>
        <View style={styles.verificationRow}>
          <Text style={styles.cardTitle}>Verification</Text>
          <VerificationBadge status={profile?.verification_status} />
        </View>
        <Text style={styles.cardNote}>
          Identity verification isn’t connected in this build — no provider,
          no checks. The badge shows exactly what the database records.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Your services</Text>
      {services.length === 0 ? (
        <Text style={styles.cardNote}>
          List what you do and what it costs, so customers can hire you with
          the right expectations. A draft is visible only to you.
        </Text>
      ) : (
        <View style={styles.list}>
          {services.map((service) => (
            <View key={service.id} style={styles.serviceRow}>
              <View style={styles.serviceCopy}>
                <Text style={styles.serviceTitle} numberOfLines={1}>
                  {service.title}
                </Text>
                <Text style={styles.serviceMeta}>
                  {JOB_CATEGORY_LABELS[service.category as keyof typeof JOB_CATEGORY_LABELS] ??
                    service.category}{' '}
                  · {servicePriceLabel(service)}
                  {service.published ? '' : ' · Draft — only you can see this'}
                </Text>
              </View>
              <Pressable
                onPress={() => togglePublished(service)}
                disabled={busyId === service.id}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={service.published ? 'Unpublish' : 'Publish'}
              >
                <Ionicons
                  name={service.published ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={service.published ? colors.emerald : colors.textSubtle}
                />
              </Pressable>
              <Pressable
                onPress={() => deleteService(service)}
                disabled={busyId === service.id}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${service.title}`}
              >
                <Ionicons name="close" size={20} color={colors.textSubtle} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a service</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Standard lawn mow & edge"
          placeholderTextColor={colors.textSubtle}
          maxLength={80}
          accessibilityLabel="Service title"
        />
        <View style={styles.priceRow}>
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={price}
            onChangeText={setPrice}
            placeholder="Price in dollars — empty = ask"
            placeholderTextColor={colors.textSubtle}
            keyboardType="decimal-pad"
            maxLength={8}
            accessibilityLabel="Price in dollars, leave empty for ask for a quote"
          />
          <Pressable
            style={styles.unitToggle}
            onPress={() => setPriceUnit((u) => (u === 'flat' ? 'hourly' : 'flat'))}
            accessibilityRole="button"
            accessibilityLabel={`Price unit ${priceUnit}`}
          >
            <Text style={styles.unitToggleText}>
              {priceUnit === 'flat' ? 'flat' : '/hr'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.categoryWrap}>
          {JOB_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              onPress={() => setCategory(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === c }}
            >
              <Text
                style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}
              >
                {JOB_CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
          onPress={addService}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Add service"
        >
          <Text style={styles.addButtonText}>{adding ? 'Adding…' : 'Add service'}</Text>
        </Pressable>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  cardNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  list: {
    gap: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  serviceCopy: {
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  serviceMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  unitToggle: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    minHeight: 44,
  },
  unitToggleText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.emerald,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  categoryChipTextActive: {
    color: colors.emerald,
  },
  addButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onPrimary,
  },
});
