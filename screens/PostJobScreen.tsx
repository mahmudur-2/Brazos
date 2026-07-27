import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import {
  createJob,
  dollarsToCents,
  fetchJobById,
  fetchJobLocation,
  JOB_CATEGORIES,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  updateJob,
  type JobCategory,
} from '../lib/jobs';
import { createJobRequest } from '../lib/jobRequests';
import { alertAsync } from '../lib/dialog';
import { maybePromptForPush } from '../lib/pushNotifications';
import { resolveCurrentPlace } from '../lib/geolocation';
import { uploadJobAttachment } from '../lib/storage';
import type { PostJobRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const MAX_PHOTOS = 5;

export function PostJobScreen() {
  // Registered in three stacks (Home, MyJobs, Messages) for the Hire Again
  // entry points, so its types are standalone rather than tied to one stack.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<PostJobRouteParamList, 'PostJob'>>();
  const { user } = useAuth();

  // "Hire Again" mode — sends a private request into the conversation these
  // two already share. It does NOT create a job; the worker can accept,
  // decline or counter first (phase18).
  const hireWorkerId = params?.hireWorkerId ?? null;
  const hireWorkerName = params?.hireWorkerName ?? 'this worker';
  const isHiring = !!hireWorkerId;

  // Edit mode — reopens this same form pre-filled with an existing job's
  // details instead of creating a new one. Only ever launched from
  // ClientJobDetailScreen, which itself only shows the entry point while the
  // job has zero bids.
  const editJobId = params?.editJobId ?? null;
  const isEditing = !!editJobId;
  const [loadingJob, setLoadingJob] = useState(isEditing);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<JobCategory | null>(null);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [budget, setBudget] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const successScale = useRef(new Animated.Value(0.4)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!editJobId) return;
    let active = true;

    (async () => {
      const [{ data: job, error }, { data: loc }] = await Promise.all([
        fetchJobById(editJobId),
        fetchJobLocation(editJobId),
      ]);
      if (!active) return;

      if (error || !job) {
        await alertAsync(
          'Could not load job',
          error?.message ?? 'This job may have been deleted.'
        );
        navigation.goBack();
        return;
      }

      setTitle(job.title);
      setDescription(job.description);
      setCategory(job.category);
      setLocation(job.location ?? '');
      setBudget(job.budget_cents != null ? String(job.budget_cents / 100) : '');
      setPhotos(job.photos);
      if (loc) setCoords({ lat: loc.lat, lng: loc.lng });
      setLoadingJob(false);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId]);

  function playSuccessThenLeave() {
    setShowSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    setTimeout(() => {
      setShowSuccess(false);
      successScale.setValue(0.4);
      successOpacity.setValue(0);
      setTitle('');
      setDescription('');
      setCategory(null);
      setLocation('');
      setCoords(null);
      setBudget('');
      setPhotos([]);
      if (isEditing) {
        // Pop back to the hub instead of goBack(): this screen was pushed
        // from ClientJobDetailScreen, which only holds the pre-edit job as a
        // route param and won't reflect the changes just saved.
        navigation.navigate('MyJobsHub' as never);
      } else {
        // Return to Home, then jump to the My Jobs hub tab to see the new post.
        navigation.goBack();
        navigation.getParent()?.navigate('MyJobs' as never);
      }
    }, 1200);
  }

  async function handleUseCurrentLocation() {
    setLocating(true);
    const result = await resolveCurrentPlace();
    setLocating(false);

    if (!result.ok) {
      await alertAsync('Location unavailable', result.message);
      return;
    }
    setLocation(result.place.label);
    setCoords({ lat: result.place.lat, lng: result.place.lng });
  }

  async function handleAddPhoto() {
    if (photos.length >= MAX_PHOTOS || !user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    const { url, error } = await uploadJobAttachment(user.id, result.assets[0]);
    setUploadingPhoto(false);

    if (error || !url) {
      await alertAsync(
        'Photo upload failed',
        'Please try again. If this keeps happening, the job-photos storage bucket may need setting up.'
      );
      return;
    }
    setPhotos((prev) => [...prev, url]);
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
  }

  async function handleSubmit() {
    if (!user) return;

    if (!title.trim() || !description.trim() || !category || !location.trim()) {
      await alertAsync(
        'Missing details',
        'Title, description, category, and location are all required.'
      );
      return;
    }

    const budgetCents = dollarsToCents(budget);
    if (Number.isNaN(budgetCents)) {
      await alertAsync('Invalid budget', 'Budget must be a positive dollar amount.');
      return;
    }
    // A hire request opens with a proposed price, so an amount is required —
    // it's the starting point for the negotiation, not a final figure.
    if (isHiring && budgetCents == null) {
      await alertAsync(
        'Price required',
        `Enter the amount you'd like to offer ${hireWorkerName}. They can accept or counter.`
      );
      return;
    }

    // Hire Again no longer creates a job. It sends a request into the
    // conversation these two already have; a job only exists if the worker
    // accepts (or they settle on a counter-offer). See phase18.
    if (isHiring && !isEditing) {
      setSubmitting(true);
      const { error: requestError } = await createJobRequest({
        workerId: hireWorkerId!,
        title: title.trim(),
        description: description.trim(),
        category,
        location: location.trim(),
        amountCents: budgetCents!,
        photos,
        coords,
        threadJobId: params?.threadJobId ?? null,
      });
      setSubmitting(false);

      if (requestError) {
        await alertAsync('Could not send request', requestError.message);
        return;
      }
      playSuccessThenLeave();
      return;
    }

    setSubmitting(true);
    const { error, locationError } = isEditing
      ? await updateJob(editJobId!, {
          title: title.trim(),
          description: description.trim(),
          category,
          location: location.trim(),
          budgetCents,
          photos,
          coords,
        })
      : await createJob(user.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          location: location.trim(),
          budgetCents,
          photos,
          coords,
          hireWorkerId,
        });
    setSubmitting(false);

    if (error) {
      await alertAsync(isEditing ? 'Could not save changes' : 'Could not post job', error.message);
      return;
    }
    if (locationError) {
      // The job saved fine; only the map pin is missing. Include the real
      // reason (already logged in createJob/updateJob) so it's actually
      // diagnosable instead of just "something went wrong".
      await alertAsync(
        'Saved, but without a map pin',
        `Your job is live, but we couldn't save its location for the map: ${locationError.message}`
      );
    }

    // First good moment to ask: they've just posted work and have a concrete
    // reason to want alerts. Only on a genuinely new post — editing an
    // existing job isn't the same moment. Deliberately not awaited so the
    // success animation isn't held up behind a dialog.
    if (!isEditing) {
      maybePromptForPush(
        isHiring
          ? 'Get told the moment they accept, decline, or counter your offer.'
          : 'Get told the moment a worker bids on your job.'
      );
    }

    playSuccessThenLeave();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title={isEditing ? 'Edit Job' : isHiring ? 'Hire Again' : 'Post a Job'}
        onBack={() => navigation.goBack()}
      />

      {loadingJob ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isHiring && (
            <View style={styles.hireBanner}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.hireBannerText}>
                {hireWorkerName} will get this as a request in your chat. They can accept, decline, or suggest a different price.
              </Text>
            </View>
          )}

          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Walk my dog on weekday mornings"
            autoCapitalize="sentences"
          />

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what you need done…"
            autoCapitalize="sentences"
            multiline
            numberOfLines={4}
            style={styles.multiline}
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Photos (optional) · {photos.length}/{MAX_PHOTOS}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
              keyboardShouldPersistTaps="handled"
            >
              {photos.map((url) => (
                <View key={url} style={styles.photoWrap}>
                  <Pressable onPress={() => setViewerUri(url)}>
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removePhoto(url)}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}

              {photos.length < MAX_PHOTOS && (
                <Pressable
                  style={styles.addTile}
                  onPress={handleAddPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="add" size={28} color={colors.primary} />
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chips}>
              {JOB_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={JOB_CATEGORY_LABELS[c]}
                  icon={JOB_CATEGORY_ICONS[c]}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>

          <View style={styles.locationRow}>
            <View style={styles.locationField}>
              <TextField
                label="Location"
                value={location}
                onChangeText={(text) => {
                  setLocation(text);
                  // Typing over a resolved place invalidates its coordinates.
                  if (coords) setCoords(null);
                }}
                placeholder="e.g. Sheepshead Bay, Brooklyn"
                autoCapitalize="words"
              />
            </View>
            <Pressable
              onPress={handleUseCurrentLocation}
              disabled={locating}
              style={styles.locationBtn}
              accessibilityLabel="Use my current location"
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ionicons name="location" size={20} color={colors.onPrimary} />
              )}
            </Pressable>
          </View>

          <TextField
            label={isHiring ? 'Your offer ($)' : 'Budget ($) (Optional)'}
            value={budget}
            onChangeText={setBudget}
            placeholder="e.g. 50"
            keyboardType="numeric"
          />

          <Button
            // "Send Request", not "Hire" — the worker still has to agree, so a
            // label implying the hire already happened would misdescribe it.
            title={isEditing ? 'Save changes' : isHiring ? 'Send Request' : 'Post job'}
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      )}

      {showSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}>
          <Animated.View
            style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
          >
            <Ionicons name="checkmark" size={56} color={colors.onPrimary} />
          </Animated.View>
          <Text style={styles.successText}>
            {isEditing ? 'Job updated!' : isHiring ? 'Request sent!' : 'Job posted!'}
          </Text>
        </Animated.View>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hireBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hireBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    lineHeight: 18,
  },
  multiline: {
    height: 110,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  photoRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  addTile: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  locationField: {
    flex: 1,
  },
  locationBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    marginTop: spacing.sm,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(244,241,232,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  successCircle: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
});
