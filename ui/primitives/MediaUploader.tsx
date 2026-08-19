import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { radius, spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

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
  /**
   * Caller-owned removal policy. By default only tiles added through this
   * instance are delete-on-remove (right for editing a published row, whose
   * seeded media must outlive removal until the edit saves). A restored
   * draft is the opposite case — its seeded media belongs to no saved row
   * and must always be deletable — so a caller that knows better supplies
   * the rule and this instance's own bookkeeping steps aside.
   */
  shouldDeleteOnRemove?: (url: string) => boolean;
  /** Opens a tile (photo viewer, video player). Omit for plain tiles. */
  onPressItem?: (url: string) => void;
  /** Caps in-picker recording length for `kind="video"`. Library picks are
   *  not covered by it — enforce real duration limits via `validate`. */
  videoMaxDurationSec?: number;
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
  shouldDeleteOnRemove,
  onPressItem,
  videoMaxDurationSec,
  kind,
  maxItems,
  disabled,
  label,
}: MediaUploaderProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // `forest` is the Heritage brand green ON CREAM; under Prestige it is the
  // one solid FILL, so every place this component used it as content — the
  // counter, the add tile's dashed edge and glyph, the clip mark — resolved to
  // a deep green on a deep-green ground. In dark those become the gold
  // line-work the converted screens use.
  const lineWork = isDark ? colors.gold : colors.forest;
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
      videoMaxDuration: kind === 'video' ? videoMaxDurationSec : undefined,
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
    const removable = shouldDeleteOnRemove
      ? shouldDeleteOnRemove(url)
      : addedHereRef.current.has(url);
    if (!removable || !onDelete) return;
    addedHereRef.current.delete(url);
    void onDelete(url);
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, isDark && styles.labelDark]}>
        {label} · {items.length}/{maxItems}
      </Text>
      <View style={styles.row}>
        {items.map((url, index) => (
          <View key={url} style={styles.tile}>
            <Pressable
              onPress={onPressItem ? () => onPressItem(url) : undefined}
              disabled={!onPressItem}
              accessibilityRole={onPressItem ? 'imagebutton' : undefined}
              accessibilityLabel={onPressItem ? `Open ${kind} ${index + 1}` : undefined}
              style={styles.thumb}
            >
              {kind === 'photo' ? (
                <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="play-circle" size={26} color={lineWork} />
                  <Text style={[styles.videoLabel, isDark && styles.videoLabelDark]}>
                    Clip {index + 1}
                  </Text>
                </View>
              )}
            </Pressable>
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
            style={[styles.tile, styles.addTile, isDark && styles.addTileDark]}
            onPress={handleAdd}
            disabled={uploading || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Add a ${kind}`}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={lineWork} />
            ) : (
              <Ionicons
                name={kind === 'photo' ? 'add' : 'videocam-outline'}
                size={24}
                color={lineWork}
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const TILE_SIZE = 84;

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    ...typeScale.sub,
    fontWeight: '700',
    color: colors.forest,
  },
  // The counter is the one thing on this control that has to be readable at a
  // glance ("Photos · 3/10"); in dark it takes the cream ink.
  labelDark: { color: colors.ink },
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
  videoLabelDark: { color: colors.ink },
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
  // The dashed add-affordance the manifest's chip vocabulary names (masters 35
  // and 42 draw it in gold line-work).
  addTileDark: { borderColor: colors.gold },
  }),
);
