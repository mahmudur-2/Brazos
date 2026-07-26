import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { useOneTimeNotice } from '../hooks/useOneTimeNotice';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  addPortfolioItem,
  fetchPortfolio,
  fetchPortfolioCandidates,
  MAX_CAPTION_LENGTH,
  MAX_PORTFOLIO_ITEMS,
  type PortfolioCandidate,
} from '../lib/portfolio';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { colors, radius, spacing } from '../lib/theme';

type PortfolioPickerProps = {
  visible: boolean;
  workerId: string;
  onClose: () => void;
  /** Called after at least one item was added, so the profile can refetch. */
  onAdded: () => void;
};

/**
 * Curation sheet: pick photos from your own completed jobs to feature, with
 * an optional caption each.
 *
 * The candidate pool is the worker's completion photos across finished jobs
 * (phase17), so nothing enters a portfolio that wasn't already produced as
 * proof of a real job.
 */
export function PortfolioPicker({
  visible,
  workerId,
  onClose,
  onAdded,
}: PortfolioPickerProps) {
  const [candidates, setCandidates] = useState<PortfolioCandidate[]>([]);
  const [featured, setFeatured] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PortfolioCandidate | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [addedAny, setAddedAny] = useState(false);

  const privacyNotice = useOneTimeNotice('portfolio-privacy');

  const load = useCallback(async () => {
    const [pool, existing] = await Promise.all([
      fetchPortfolioCandidates(workerId),
      fetchPortfolio(workerId),
    ]);
    setCandidates(pool.data);
    setFeatured(new Set(existing.data.map((i) => i.photo_url)));
    setLoading(false);
  }, [workerId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(null);
    setCaption('');
    setAddedAny(false);
    load();
  }, [visible, load]);

  function handleClose() {
    if (addedAny) onAdded();
    onClose();
  }

  async function handlePick(candidate: PortfolioCandidate) {
    if (featured.has(candidate.photoUrl)) return;

    if (featured.size >= MAX_PORTFOLIO_ITEMS) {
      await alertAsync(
        'Portfolio is full',
        `You can feature up to ${MAX_PORTFOLIO_ITEMS} photos. Remove one to add another.`
      );
      return;
    }

    // One-time reminder: a completion photo can show the inside of someone's
    // home, and featuring it makes it public. Shown before the first add only.
    if (privacyNotice.seen === false) {
      const ok = await confirmAsync({
        title: 'Visible on your public profile',
        message:
          'This will be visible to anyone viewing your profile — make sure it doesn’t show anything you’d rather keep private.',
        confirmText: 'Got it',
        cancelText: 'Cancel',
      });
      await privacyNotice.markSeen();
      if (!ok) return;
    }

    setSelected(candidate);
    setCaption('');
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    const { error } = await addPortfolioItem(
      {
        workerId,
        sourceJobId: selected.jobId,
        photoUrl: selected.photoUrl,
        category: selected.category,
        caption,
      },
      featured.size
    );
    setSaving(false);

    if (error) {
      await alertAsync('Could not add to portfolio', error.message);
      return;
    }

    setFeatured((prev) => new Set(prev).add(selected.photoUrl));
    setAddedAny(true);
    setSelected(null);
    setCaption('');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feature past work</Text>
          <Pressable onPress={handleClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          {featured.size}/{MAX_PORTFOLIO_ITEMS} featured · tap a photo from a
          finished job to add it
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : candidates.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={30} color={colors.textSubtle} />
            <Text style={styles.emptyText}>
              No completion photos yet. Add photos when you mark a job complete and
              they’ll show up here.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid}>
            {candidates.map((c) => {
              const already = featured.has(c.photoUrl);
              return (
                <Pressable
                  key={`${c.jobId}:${c.photoUrl}`}
                  onPress={() => handlePick(c)}
                  disabled={already}
                  style={styles.gridItem}
                >
                  <Image
                    source={{ uri: c.photoUrl }}
                    style={[styles.gridPhoto, already && styles.gridPhotoUsed]}
                  />
                  {already && (
                    <View style={styles.usedBadge}>
                      <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                    </View>
                  )}
                  <Text style={styles.gridLabel} numberOfLines={1}>
                    {JOB_CATEGORY_LABELS[c.category] ?? c.category}
                  </Text>
                  <Text style={styles.gridJob} numberOfLines={1}>
                    {c.jobTitle}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Caption step, shown once a photo is picked. */}
        <Modal visible={!!selected} transparent animationType="fade">
          <View style={styles.captionBackdrop}>
            <View style={styles.captionSheet}>
              <Text style={styles.captionTitle}>Add a caption</Text>
              <Text style={styles.captionHint}>Optional — a few words about the job.</Text>

              {selected && (
                <Image source={{ uri: selected.photoUrl }} style={styles.captionPhoto} />
              )}

              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="e.g. Rebuilt back fence in a weekend"
                placeholderTextColor={colors.textSubtle}
                maxLength={MAX_CAPTION_LENGTH}
                multiline
              />
              <Text style={styles.captionCount}>
                {caption.length}/{MAX_CAPTION_LENGTH}
              </Text>

              <View style={styles.captionActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setSelected(null)}
                  disabled={saving}
                  style={styles.captionBtn}
                />
                <Button
                  title="Add"
                  onPress={handleSave}
                  loading={saving}
                  style={styles.captionBtn}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSubtle,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.lg,
    paddingTop: 0,
  },
  gridItem: {
    width: 150,
    gap: 2,
  },
  gridPhoto: {
    width: 150,
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  gridPhotoUsed: {
    opacity: 0.4,
  },
  usedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  gridJob: {
    fontSize: 12,
    color: colors.textMuted,
  },
  captionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,46,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  captionSheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  captionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  captionHint: {
    fontSize: 13,
    color: colors.textMuted,
  },
  captionPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
    marginVertical: spacing.sm,
  },
  captionInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  captionCount: {
    fontSize: 11,
    color: colors.textSubtle,
    alignSelf: 'flex-end',
  },
  captionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  captionBtn: {
    flex: 1,
    height: 46,
  },
});
