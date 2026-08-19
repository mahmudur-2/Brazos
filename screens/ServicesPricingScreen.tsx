import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SegmentedControl } from '../components/SegmentedControl';
import { Toggle } from '../ui/primitives';
import { FormScreen } from '../ui/templates/FormScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { dollarsToCents, JOB_CATEGORIES, JOB_CATEGORY_LABELS } from '../lib/jobs';
import { moneyCeilingError } from '../lib/validation';
import { goBackOrHome } from '../lib/navigationRef';
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
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * Screens 64 + 66 (Phase 9, consolidated) — the worker's self-service
 * surface: advertised services with honest pricing (NULL price renders "Ask
 * for a quote", never $0), draft/publish per service, the availability
 * toggle + note (display truth on the public profile), and the honest
 * verification state — there is NO KYC provider in this build and the copy
 * says so instead of pretending.
 */
export function ServicesPricingScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [services, setServices] = useState<WorkerService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The add-service draft. Failure preserves every field (recoverable-error rule).
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<ServicePriceUnit>('flat');
  // §6.3 — the priced-vs-ask choice is EXPLICIT, not "empty field means ask".
  // 'flat' = price_cents set (the flat//hr unit still applies); 'ask' =
  // price_cents null, rendered everywhere as "Ask for a quote".
  const [priceMode, setPriceMode] = useState<'flat' | 'ask'>('flat');
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
    if (profileRes.error) setLoadError(userMessage(profileRes.error));
    else if (profileRes.data) {
      setProfile(profileRes.data);
      setNote(profileRes.data.availability_note ?? '');
    }
    if (servicesRes.error) setLoadError(userMessage(servicesRes.error));
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

  const priceCents = priceMode === 'flat' && price.trim() ? dollarsToCents(price) : null;
  // "Flat price" requires an actual amount — the implicit empty-means-ask
  // state is gone; "Ask me" is its own explicit choice.
  const priceValid =
    priceMode === 'ask' || (priceCents != null && !Number.isNaN(priceCents) && priceCents > 0);
  // phase75 ceiling, refused here with the written sentence BEFORE any write
  // (worker_services carries no CHECK of its own, and a stored over-ceiling
  // price would poison "Book at listed price" downstream).
  const priceCeilingProblem =
    priceCents != null && !Number.isNaN(priceCents) ? moneyCeilingError(priceCents) : null;
  const canAdd = title.trim().length > 0 && priceValid && !priceCeilingProblem && !adding;

  function changePriceMode(next: 'flat' | 'ask') {
    setPriceMode(next);
    // §6.3 — switching to "Ask me" clears the amount; switching back
    // restores an editable empty field (price stays '').
    if (next === 'ask') setPrice('');
  }

  async function addService() {
    if (!user || !canAdd) return;
    setAdding(true);
    const { data, error } = await addWorkerService(user.id, {
      title,
      category,
      priceCents:
        priceMode === 'ask' || priceCents === null || Number.isNaN(priceCents)
          ? null
          : priceCents,
      priceUnit,
      position: services.length,
    });
    setAdding(false);
    if (error || !data) {
      await alertAsync('Could not add the service', userMessage(error, 'Try again.'));
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
      await alertAsync('Could not update the service', userMessage(error, 'Try again.'));
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
      await alertAsync('Could not remove the service', userMessage(error));
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
      await alertAsync('Could not save availability', userMessage(error));
      return;
    }
    if (data) setProfile(data);
  }

  const accepting = profile?.accepting_work ?? true;

  return (
    <FormScreen
      title="Services & availability"
      onBack={goBackOrHome}
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
          <Toggle
            value={accepting}
            onValueChange={(value) => void saveAvailability({ accepting_work: value })}
            disabled={savingAvailability}
            accessibilityLabel="Taking new work"
          />
        </View>
        <TextInput
          keyboardAppearance={isDark ? 'dark' : 'light'}
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
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Standard lawn mow & edge"
          placeholderTextColor={colors.textSubtle}
          maxLength={80}
          accessibilityLabel="Service title"
        />
        <SegmentedControl
          options={[
            { label: 'Flat price', value: 'flat' },
            { label: 'Ask me', value: 'ask' },
          ]}
          value={priceMode}
          onChange={changePriceMode}
        />
        {priceMode === 'flat' ? (
          <View style={styles.priceRow}>
            <TextInput
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={[styles.input, styles.priceInput]}
              value={price}
              onChangeText={setPrice}
              placeholder="Price in dollars"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              maxLength={8}
              accessibilityLabel="Price in dollars"
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
        ) : (
          <Text style={styles.cardNote}>
            Shown as “Ask for a quote” on your profile — you price the work in
            the offer instead.
          </Text>
        )}
        {priceCeilingProblem ? (
          <Text style={styles.priceProblem}>{priceCeilingProblem}</Text>
        ) : null}
        <View style={styles.categoryWrap}>
          {JOB_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              style={[
                styles.categoryChip,
                isDark && styles.categoryChipDark,
                category === c && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === c }}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  isDark && styles.categoryChipTextDark,
                  category === c && styles.categoryChipTextActive,
                ]}
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
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
    gap: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
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
    fontFamily: fonts.display,
    fontSize: 18,
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
    borderRadius: radius.pill,
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
  priceProblem: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
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
  // Masters 23/24 draw the category grid as gold-OUTLINE pills with gold
  // glyphs and cream labels; a chosen one keeps the sage fill so the two
  // states stay obviously different. Light keeps the Heritage pair.
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipDark: {
    borderColor: colors.gold,
    backgroundColor: 'transparent',
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
  categoryChipTextDark: { color: colors.ink },
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
  }),
);
