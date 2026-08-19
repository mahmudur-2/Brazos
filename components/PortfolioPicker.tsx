import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import {
  categoryAccent,
  JOB_CATEGORIES,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
} from '../lib/jobs';
import {
  addPortfolioItem,
  fetchPortfolio,
  fetchPortfolioCandidates,
  removePortfolioItem,
  updatePortfolioItem,
  MAX_CAPTION_LENGTH,
  MAX_PORTFOLIO_ITEMS,
  MIN_DESCRIPTION_LENGTH,
  type PortfolioCandidate,
  type PortfolioItem,
} from '../lib/portfolio';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

const OTHER_KEY = '__other__';

// JOB_CATEGORIES already includes an 'other' enum value (a job posted with
// no more specific category) — showing it as its own chip AND the free-text
// "Other" chip reads as two identical options. Only the free-text one lets
// the worker actually say what the job was, so the enum value is folded into
// it instead of getting a chip of its own.
const DISPLAYABLE_CATEGORIES = JOB_CATEGORIES.filter((c) => c !== 'other');

/** Maps a stored category (enum key or free text) to chip selection state. */
function categoryStateFor(rawCategory: string): { category: string; customCategory: string } {
  if ((DISPLAYABLE_CATEGORIES as readonly string[]).includes(rawCategory)) {
    return { category: rawCategory, customCategory: '' };
  }
  return { category: OTHER_KEY, customCategory: rawCategory === 'other' ? '' : rawCategory };
}

type PortfolioPickerProps = {
  visible: boolean;
  workerId: string;
  onClose: () => void;
  /** Called after the portfolio was added to, edited, or removed from, so the profile can refetch. */
  onChanged: () => void;
};

/**
 * Curation sheet: pick photos from your own completed jobs to feature, then
 * confirm a category and write a real description for each one. Tapping an
 * already-featured photo (shown with the checkmark badge) reopens that same
 * detail step in edit mode instead, letting the category/description be
 * changed or the item removed — removing only unfeatures it, the underlying
 * completion photo and job record are untouched.
 *
 * The candidate pool is the worker's completion photos across finished jobs
 * (phase17), so nothing enters a portfolio that wasn't already produced as
 * proof of a real job.
 *
 * Deliberately NOT React Native's <Modal>. This is rendered as a sibling of
 * PhotoViewer on ProfileScreen (the avatar viewer), which also owns a
 * <Modal>. RN's Modal keeps its native host (RCTModalHostView on iOS, a
 * Dialog on Android) mounted for a window after `visible` goes false — on
 * iOS specifically, an internal `isRendered` flag only clears once the async
 * native `modalDismissed` event arrives — so two sibling <Modal>s can have
 * live native hosts stacked at the same time, not just nested ones. That
 * class of bug is what broke this screen's own close button before: once a
 * second native modal host exists anywhere in the tree, touches on the first
 * one's controls stop reliably reaching it. A plain, always-in-tree overlay
 * View has no native host to stack against anything, on any platform, so
 * this can't recur no matter what else on the screen happens to be a Modal.
 */
export function PortfolioPicker({
  visible,
  workerId,
  onClose,
  onChanged,
}: PortfolioPickerProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [candidates, setCandidates] = useState<PortfolioCandidate[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Add-new mode (a candidate not yet featured) vs. edit mode (an
  // already-featured item, tapped again to change or remove it). Only one
  // is ever set at a time.
  const [selected, setSelected] = useState<PortfolioCandidate | null>(null);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  const privacyNotice = useOneTimeNotice('portfolio-privacy');

  const featured = new Set(portfolioItems.map((i) => i.photo_url));

  const load = useCallback(async () => {
    const [pool, existing] = await Promise.all([
      fetchPortfolioCandidates(workerId),
      fetchPortfolio(workerId),
    ]);
    setCandidates(pool.data);
    setPortfolioItems(existing.data);
    setLoading(false);
  }, [workerId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(null);
    setEditingItem(null);
    setChanged(false);
    load();
  }, [visible, load]);

  function handleClose() {
    if (changed) onChanged();
    onClose();
  }

  // RN's <Modal> handles the Android hardware back button itself via
  // onRequestClose; a plain overlay View needs its own listener to keep that
  // behavior.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  function openEdit(item: PortfolioItem) {
    setEditingItem(item);
    setSelected(null);
    const { category: cat, customCategory: custom } = categoryStateFor(item.category);
    setCategory(cat);
    setCustomCategory(custom);
    setDescription(item.caption ?? '');
  }

  async function handlePick(candidate: PortfolioCandidate) {
    const existingItem = portfolioItems.find((i) => i.photo_url === candidate.photoUrl);
    if (existingItem) {
      openEdit(existingItem);
      return;
    }

    if (portfolioItems.length >= MAX_PORTFOLIO_ITEMS) {
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
    setEditingItem(null);
    // Pre-select the job's own category as a sensible default — the worker
    // still has to confirm it (or pick something else, including Other)
    // rather than it being silently inherited.
    const { category: cat, customCategory: custom } = categoryStateFor(candidate.category);
    setCategory(cat);
    setCustomCategory(custom);
    setDescription('');
  }

  function closeDetailStep() {
    setSelected(null);
    setEditingItem(null);
    setCategory(null);
    setCustomCategory('');
    setDescription('');
  }

  const trimmedDescription = description.trim();
  const finalCategory = category === OTHER_KEY ? customCategory.trim() : category;
  const canSave =
    !!finalCategory &&
    finalCategory.length > 0 &&
    trimmedDescription.length >= MIN_DESCRIPTION_LENGTH;

  async function handleSave() {
    if (!canSave || !finalCategory) return;
    setSaving(true);

    if (editingItem) {
      const { error } = await updatePortfolioItem(editingItem.id, {
        category: finalCategory,
        caption: trimmedDescription,
      });
      setSaving(false);

      if (error) {
        await alertAsync('Could not save changes', userMessage(error));
        return;
      }

      setPortfolioItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? { ...i, category: finalCategory, caption: trimmedDescription }
            : i
        )
      );
      setChanged(true);
      closeDetailStep();
      return;
    }

    if (!selected) return;
    const { data, error } = await addPortfolioItem(
      {
        workerId,
        sourceJobId: selected.jobId,
        photoUrl: selected.photoUrl,
        category: finalCategory,
        caption: trimmedDescription,
      },
      portfolioItems.length
    );
    setSaving(false);

    if (error) {
      await alertAsync('Could not add to portfolio', userMessage(error));
      return;
    }

    if (data) setPortfolioItems((prev) => [...prev, data]);
    setChanged(true);
    closeDetailStep();
  }

  async function handleRemove() {
    if (!editingItem) return;
    const ok = await confirmAsync({
      title: 'Remove from portfolio?',
      message:
        'This only unfeatures it — the completion photo itself is kept, and you can feature a different photo in its place.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setSaving(true);
    const { error } = await removePortfolioItem(editingItem.id);
    setSaving(false);

    if (error) {
      await alertAsync('Could not remove', userMessage(error));
      return;
    }

    setPortfolioItems((prev) => prev.filter((i) => i.id !== editingItem.id));
    setChanged(true);
    closeDetailStep();
  }

  return (
    <View style={styles.screenOverlay}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feature past work</Text>
          {/* Master 20 rings the close control in gold. */}
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityLabel="Close"
            style={[styles.closeRing, isDark && styles.closeRingDark]}
          >
            <Ionicons name="close" size={22} color={isDark ? colors.gold : colors.text} />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          <Text style={styles.subtitleCount}>
            {portfolioItems.length}/{MAX_PORTFOLIO_ITEMS}
          </Text>
          {' featured · tap a photo to add it, tap a featured one (checkmark) to '}
          {'edit or remove it'}
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
                    {already ? 'Tap to edit' : c.jobTitle}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Category + description step — doubles as add-new (from `selected`)
            and edit-existing (from `editingItem`). A plain absolutely-
            positioned overlay inside THIS modal — deliberately not a nested
            <Modal> — see the component doc comment for why. */}
        {(selected || editingItem) && (
          <View style={styles.detailBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.detailKeyboardWrap}
            >
              <ScrollView
                style={styles.detailSheet}
                contentContainerStyle={styles.detailContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.detailHeaderRow}>
                  <Text style={styles.detailTitle}>
                    {editingItem ? 'Edit featured photo' : 'Feature this photo'}
                  </Text>
                  <Pressable
                    onPress={closeDetailStep}
                    hitSlop={10}
                    accessibilityLabel="Cancel"
                  >
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Image
                  source={{ uri: selected ? selected.photoUrl : editingItem!.photo_url }}
                  style={styles.detailPhoto}
                />

                <Text style={styles.detailLabel}>Category</Text>
                <View style={styles.categoryChips}>
                  {DISPLAYABLE_CATEGORIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[
                        styles.categoryChip,
                        category === c && styles.categoryChipSelected,
                      ]}
                    >
                      <Ionicons
                        name={JOB_CATEGORY_ICONS[c]}
                        size={14}
                        // D2: the saturated per-category palette is retired in
                        // dark wherever a category is drawn — an unselected
                        // glyph reads gold. Light keeps its accent.
                        color={
                          category === c
                            ? colors.onPrimary
                            : isDark
                            ? colors.gold
                            : categoryAccent(c).bg
                        }
                      />
                      <Text
                        style={[
                          styles.categoryChipText,
                          category === c && styles.categoryChipTextSelected,
                        ]}
                      >
                        {JOB_CATEGORY_LABELS[c]}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setCategory(OTHER_KEY)}
                    style={[
                      styles.categoryChip,
                      category === OTHER_KEY && styles.categoryChipSelected,
                    ]}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={14}
                      color={category === OTHER_KEY ? colors.onPrimary : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === OTHER_KEY && styles.categoryChipTextSelected,
                      ]}
                    >
                      Other
                    </Text>
                  </Pressable>
                </View>

                {category === OTHER_KEY && (
                  <TextInput
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={styles.customCategoryInput}
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    placeholder="e.g. Pressure washing"
                    placeholderTextColor={colors.textSubtle}
                    autoCapitalize="words"
                  />
                )}

                <Text style={styles.detailLabel}>What did this job involve?</Text>
                <Text style={styles.detailHint}>
                  A real sentence or two — this is what clients read to judge your work.
                </Text>
                <TextInput
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.descriptionInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Rebuilt a 20ft cedar fence panel by panel after storm damage, including new posts set in concrete."
                  placeholderTextColor={colors.textSubtle}
                  maxLength={MAX_CAPTION_LENGTH}
                  multiline
                />
                <Text
                  style={[
                    styles.descriptionCount,
                    trimmedDescription.length < MIN_DESCRIPTION_LENGTH &&
                      styles.descriptionCountShort,
                  ]}
                >
                  {trimmedDescription.length < MIN_DESCRIPTION_LENGTH
                    ? `${MIN_DESCRIPTION_LENGTH - trimmedDescription.length} more characters needed`
                    : `${description.length}/${MAX_CAPTION_LENGTH}`}
                </Text>

                <View style={styles.detailActions}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={closeDetailStep}
                    disabled={saving}
                    style={styles.detailBtn}
                  />
                  <Button
                    title={editingItem ? 'Save changes' : 'Add to portfolio'}
                    onPress={handleSave}
                    loading={saving}
                    disabled={!canSave}
                    style={styles.detailBtn}
                  />
                </View>

                {editingItem && (
                  <Pressable
                    onPress={handleRemove}
                    disabled={saving}
                    style={styles.removeRow}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={styles.removeRowText}>Remove from portfolio</Text>
                  </Pressable>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  screenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
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
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  closeRing: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeRingDark: {
    borderWidth: 1,
    borderColor: colors.gold,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  // Master 20 sets the "0/20" count itself in gold, the rest of the line
  // muted — the count is what the screen is about.
  subtitleCount: { color: colors.gold, fontWeight: '700' },
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridPhotoUsed: {
    borderWidth: 3,
    borderColor: colors.primary,
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
  // Master 20's per-tile caption: a gold small-caps eyebrow over the job's
  // own title.
  gridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: spacing.xs,
  },
  gridJob: {
    fontSize: 12,
    color: colors.textMuted,
  },
  detailBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(colors.text, 0.45),
  },
  detailKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  detailSheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  detailContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  detailPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  detailHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  categoryChipTextSelected: {
    color: colors.onPrimary,
  },
  customCategoryInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    marginTop: spacing.xs,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  descriptionCount: {
    fontSize: 11,
    color: colors.textSubtle,
    alignSelf: 'flex-end',
  },
  descriptionCountShort: {
    color: colors.danger,
    fontWeight: '600',
  },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  detailBtn: {
    flex: 1,
    height: 46,
  },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
  }),
);
