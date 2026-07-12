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
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync } from '../lib/dialog';
import {
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  updateJobStatus,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { uploadJobPhoto } from '../lib/storage';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

export function WorkerJobScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'WorkerJob'>>();
  const { user } = useAuth();
  const { job, loading, error, refresh } = useJob(params.jobId);

  const [client, setClient] = useState<Profile | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [working, setWorking] = useState(false);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0]);
    }
  }

  async function handleComplete() {
    setWorking(true);
    let photoUrl: string | null = null;

    if (photo) {
      const { url, error: uploadError } = await uploadJobPhoto(params.jobId, photo);
      if (uploadError) {
        // Photo is optional — warn but still complete the job without it.
        await alertAsync(
          'Photo upload failed',
          'Completing the job without the photo. You can set up the job-photos storage bucket to enable uploads.'
        );
      } else {
        photoUrl = url;
      }
    }

    const { error } = await updateJobStatus(params.jobId, 'completed', photoUrl);
    setWorking(false);
    if (error) {
      await alertAsync('Could not complete job', error.message);
      return;
    }
    setPhoto(null);
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
                Add an optional photo of the finished work, then mark it complete.
              </Text>

              {photo ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhoto(null)}>
                    <Ionicons name="close" size={18} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.photoPicker} onPress={pickPhoto}>
                  <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  <Text style={styles.photoPickerText}>Add done photo (optional)</Text>
                </Pressable>
              )}

              <Button
                title="Mark complete"
                onPress={handleComplete}
                loading={working}
                style={styles.action}
              />
            </Card>
          ) : job.status === 'completed' ? (
            <>
              {job.completion_photo_url ? (
                <Card>
                  <Text style={styles.actionTitle}>Done photo</Text>
                  <Image
                    source={{ uri: job.completion_photo_url }}
                    style={styles.donePhoto}
                  />
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
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    marginTop: spacing.md,
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
