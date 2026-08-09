import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, type as typeScale } from '../tokens';

/**
 * §I "MediaUploader" (BRAZOS_MASTER_PLAN.md §J Phase 4 — the one Phase 1
 * primitive explicitly deferred here: "the failure-safe upload logic already
 * exists and is verified in lib/storage.ts; what is missing is the UI around
 * it").
 *
 * FAILURE SAFETY, the actual point of this component:
 * `items` only ever grows by appending a URL that a real upload already
 * returned successfully. A failed pick or a failed upload changes nothing —
 * no optimistic entry is added and then rolled back, so there is never a
 * frame where a previously-uploaded item can be clobbered by a later
 * failure. Removal is exclusively user-initiated (the "x" on a tile) and
 * never triggered by an upload outcome.
 *
 * This does not replace `lib/storage.ts` — callers supply their own
 * `onUpload`/`onDelete` bound to whichever bucket/path scheme applies
 * (job posting photos, review photos, completion video, …), so one
 * component works across every media surface without hardcoding a bucket.
 */

export type MediaUploaderKind = 'photo' | 'video';

export type MediaUploaderProps = {
  /** Uploaded URLs currently attached, in display order. */
  items: readonly string[];
  onItemsChange: (items: string[]) => void;
  /** Performs the real upload; only a non-null `url` is appended to items. */
  onUpload: (
    asset: ImagePicker.ImagePickerAsset
  ) => Promise<{ url: string | null; error: Error | null }>;
  /** Optional cleanup call when a tile is removed (storage delete). Failures
   *  are swallowed the same way existing callers already treat them — an
   *  orphaned object is a cheaper failure mode than blocking the UI. */
  onDelete?: (url: string) => Promise<{ error: Error | null }>;
  /** Validates a picked asset before any byte uploads (duration/size/format).
   *  Returning a message rejects the pick with that message; returning null
   *  accepts it. */
  validate?: (asset: ImagePicker.ImagePickerAsset) => { title: string; message: string } | null;
  onUploadError?: (message: string) => void;
  kind: MediaUploaderKind;
  maxItems: number;
  disabled?: boolean;
  label: string;
};

export function MediaUploader({
  items,
  onItemsChange,
  onUpload,
  onDelete,
  validate,
  onUploadError,
  kind,
  maxItems,
  disabled,
  label,
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  // Only tiles added through this component instance are ever candidates for
  // delete-on-remove; a caller may seed `items` with media it already owns
  // (e.g. an edit-mode draft) that must outlive removal-from-picker until the
  // parent screen actually saves.
  const addedHereRef = useRef<Set<string>>(new Set());

  const atLimit = items.length >= maxItems;

  async function handleAdd() {
    if (atLimit || uploading || disabled) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: kind === 'photo' ? 0.7 : undefined,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const rejection = validate?.(asset);
    if (rejection) {
      onUploadError?.(rejection.message);
      return;
    }

    setUploading(true);
    const { url, error } = await onUpload(asset);
    setUploading(false);

    // Failure changes nothing: `items` is untouched, so previously-uploaded
    // media can never be clobbered by this attempt.
    if (error || !url) {
      onUploadError?.(error?.message ?? 'Upload failed. Please try again.');
      return;
    }

    addedHereRef.current.add(url);
    onItemsChange([...items, url]);
  }

  function handleRemove(url: string) {
    onItemsChange(items.filter((item) => item !== url));
    if (!addedHereRef.current.has(url) || !onDelete) return;
    addedHereRef.current.delete(url);
    void onDelete(url);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label} · {items.length}/{maxItems}
      </Text>
      <View style={styles.row}>
        {items.map((url, index) => (
          <View key={url} style={styles.tile}>
            {kind === 'photo' ? (
              <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.videoThumb]}>
                <Ionicons name="play-circle" size={26} color={colors.forest} />
                <Text style={styles.videoLabel}>Clip {index + 1}</Text>
              </View>
            )}
            <Pressable
              style={styles.remove}
              onPress={() => handleRemove(url)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${kind} ${index + 1}`}
            >
              <Ionicons name="close" size={13} color={colors.onForest} />
            </Pressable>
          </View>
        ))}

        {!atLimit && (
          <Pressable
            style={[styles.tile, styles.addTile]}
            onPress={handleAdd}
            disabled={uploading || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Add a ${kind}`}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.forest} />
            ) : (
              <Ionicons
                name={kind === 'photo' ? 'add' : 'videocam-outline'}
                size={24}
                color={colors.forest}
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const TILE_SIZE = 84;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    ...typeScale.sub,
    fontWeight: '700',
    color: colors.forest,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  videoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  videoLabel: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.forest,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  addTile: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
