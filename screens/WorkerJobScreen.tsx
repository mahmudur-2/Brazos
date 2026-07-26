import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Card } from '../components/Card';
import { JobProgress } from '../components/JobProgress';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync, confirmAsync } from '../lib/dialog';
import {
  completionPhotosOf,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  updateJobStatus,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { uploadJobPhoto } from '../lib/storage';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/** Same cap as a job posting's photos, for consistency. */
const MAX_DONE_PHOTOS = 5;

export function WorkerJobScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'WorkerJob'>>();
  const { user } = useAuth();
  const { job, loading, error, refresh } = useJob(params.jobId);

  const [client, setClient] = useState<Profile | null>(null);
  // Uploaded completion photos, held as public URLs so the preview and the
  // final write use exactly the same values (upload happens on pick, not on
  // submit, so a slow upload never blocks marking the job done).
  const [donePhotos, setDonePhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [working, setWorking] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  useEffect(() => {
    if (!job?.client_id) return;
    let active = true;
    fetchProfileById(job.client_id).then(({ data }) => {
      if (active) setClient(data);
    });
    return () => {
      active = false;
    };
  }, [job?.client_id]);

  const isWorker = !!user && job?.assigned_worker_id === user.id;
  const clientName = client?.full_name ?? 'the client';

  async function handleStart() {
    setWorking(true);
    const { error } = await updateJobStatus(params.jobId, 'in_progress');
    setWorking(false);
    if (error) {
      await alertAsync('Could not start job', error.message);
      return;
    }
    await refresh();
  }

  async function pickPhoto() {
    if (donePhotos.length >= MAX_DONE_PHOTOS) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_DONE_PHOTOS - donePhotos.length,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploadingPhoto(true);
    const uploaded: string[] = [];
    let failures = 0;
    for (const asset of result.assets) {
      const { url, error: uploadError } = await uploadJobPhoto(params.jobId, asset);
      if (uploadError || !url) failures++;
      else uploaded.push(url);
    }
    setUploadingPhoto(false);

    if (uploaded.length > 0) {
      setDonePhotos((prev) => [...prev, ...uploaded].slice(0, MAX_DONE_PHOTOS));
    }
    if (failures > 0) {
      await alertAsync(
        'Some photos didn’t upload',
        `${failures} of ${result.assets.length} couldn’t be uploaded. You can try again, or finish without them.`
      );
    }
  }

  function removeDonePhoto(url: string) {
    setDonePhotos((prev) => prev.filter((p) => p !== url));
  }

  async function handleComplete() {
    // Photos are optional, so an empty gallery gets one gentle nudge rather
    // than a hard block — the client sees these as the "after" half of the
    // job, so it's worth one prompt before finishing without them.
    if (donePhotos.length === 0) {
      const addNow = await confirmAsync({
        title: 'Add a photo of the finished job?',
        message:
          'A quick photo shows the client what you did. You can also finish without one.',
        confirmText: 'Add photo',
        cancelText: 'Finish without',
      });
      if (addNow) {
        await pickPhoto();
        return; // Let them review the picked photos, then tap Mark complete again.
      }
    }

    setWorking(true);
    const { error } = await updateJobStatus(params.jobId, 'completed', donePhotos);
    setWorking(false);
    if (error) {
      await alertAsync('Could not complete job', error.message);
      return;
    }
    setDonePhotos([]);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Your Job" onBack={() => navigation.goBack()} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading || !job ? (
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Text style={styles.muted}>Job not found.</Text>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <View style={styles.jobHeader}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={styles.jobHeaderText}>
                <Text style={styles.jobTitle} numberOfLines={2}>
                  {job.title}
                </Text>
                <Text style={styles.jobMeta}>
                  {JOB_CATEGORY_LABELS[job.category] ?? job.category}
                  {job.location ? ` · ${job.location}` : ''}
                </Text>
              </View>
              <StatusBadge status={job.status} />
            </View>
            <View style={styles.jobFooter}>
              <Text style={styles.amount}>
                {formatBudget(job.final_amount_cents ?? job.budget_cents)}
              </Text>
              <Text style={styles.muted}>for {clientName}</Text>
            </View>
          </Card>

          <Card>
            <JobProgress status={job.status} />
          </Card>

          {isWorker && (
            <Button
              title={`Message ${clientName}`}
              variant="secondary"
              onPress={() => navigation.navigate('Chat', { jobId: job.id })}
            />
          )}

          {!isWorker ? (
            <Card style={styles.noticeCard}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>
                You’re not the assigned worker for this job.
              </Text>
            </Card>
          ) : job.status === 'assigned' ? (
            <Card>
              <Text style={styles.actionTitle}>Ready to start?</Text>
              <Text style={styles.actionText}>
                Mark the job in progress when you begin the work.
              </Text>
              <Button
                title="Start job"
                onPress={handleStart}
                loading={working}
                style={styles.action}
              />
            </Card>
          ) : job.status === 'in_progress' ? (
            <Card>
              <Text style={styles.actionTitle}>Finish up</Text>
              <Text style={styles.actionText}>
                Add photos of the finished work (optional), then mark it complete.
              </Text>

              {donePhotos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.donePhotoRow}
                  style={styles.donePhotoScroll}
                >
                  {donePhotos.map((url) => (
                    <View key={url} style={styles.photoWrap}>
                      <Pressable onPress={() => setViewerUri(url)}>
                        <Image source={{ uri: url }} style={styles.photo} />
                      </Pressable>
                      <Pressable
                        style={styles.photoRemove}
                        onPress={() => removeDonePhoto(url)}
                        hitSlop={6}
                      >
                        <Ionicons name="close" size={16} color={colors.onPrimary} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {donePhotos.length < MAX_DONE_PHOTOS && (
                <Pressable
                  style={styles.photoPicker}
                  onPress={pickPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  )}
                  <Text style={styles.photoPickerText}>
                    {donePhotos.length === 0
                      ? 'Add done photos (optional)'
                      : `Add another (${donePhotos.length}/${MAX_DONE_PHOTOS})`}
                  </Text>
                </Pressable>
              )}

              <Button
                title="Mark complete"
                onPress={handleComplete}
                loading={working}
                disabled={uploadingPhoto}
                style={styles.action}
              />
            </Card>
          ) : job.status === 'completed' ? (
            <>
              {completionPhotosOf(job).length > 0 ? (
                <Card>
                  <Text style={styles.actionTitle}>
                    {completionPhotosOf(job).length === 1 ? 'Done photo' : 'Done photos'}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.donePhotoRow}
                    style={styles.donePhotoScroll}
                  >
                    {completionPhotosOf(job).map((url) => (
                      <Pressable key={url} onPress={() => setViewerUri(url)}>
                        <Image source={{ uri: url }} style={styles.donePhoto} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </Card>
              ) : null}

              {user && (
                <ReviewSection
                  jobId={job.id}
                  reviewerId={user.id}
                  revieweeId={job.client_id}
                  revieweeName={clientName}
                  prompt={`How was working with ${clientName}?`}
                />
              )}
            </>
          ) : (
            <Card style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>
                This job is {job.status.replace(/_/g, ' ')}.
              </Text>
            </Card>
          )}
        </ScrollView>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderText: {
    flex: 1,
    gap: 2,
  },
  jobTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  jobMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  jobFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  actionText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.lg,
  },
  photoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
  },
  photoPickerText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  photoWrap: {
    marginTop: spacing.lg,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(31,46,34,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donePhoto: {
    width: 240,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  donePhotoScroll: {
    marginTop: spacing.md,
  },
  donePhotoRow: {
    gap: spacing.sm,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
});
