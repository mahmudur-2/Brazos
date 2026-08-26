import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from '../../components/RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { radius, spacing, withAlpha, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors, type ColorPalette } from '../../lib/theme';
import { userMessage } from '../../lib/errorMessage';

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

/**
 * A clip's length as iOS writes it on a thumbnail — `m:ss`, zero-padded.
 *
 * NULL IS THE HONEST ANSWER and it is the whole reason this returns one. The
 * duration comes from the picker asset (`ImagePickerAsset.duration`, in
 * milliseconds); media restored from a draft or loaded from an already-saved
 * job never went through a picker in this session and has no duration to
 * report. A badge is omitted in that case rather than filled with a guess —
 * CLAUDE.md's "never invent marketplace data" covers the clip the customer is
 * about to publish as much as it covers a rating.
 */
export function clipDurationLabel(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

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

/**
 * A picked clip's tile: a real frame from the clip itself, a play mark, and
 * its own length.
 *
 * THE POSTER IS THE CLIP, not a placeholder card — the same arrangement
 * components/JobVideo.tsx already uses for a published job's video, seeking a
 * beat in because a camera-roll opening frame is usually the least
 * informative one. No thumbnail service and no new dependency: expo-video is
 * already how this app shows a paused frame.
 */
function VideoTile({ uri, durationMs }: { uri: string; durationMs: number | null }) {
  const { emerald: colors, palette } = useThemeColors();
  const styles = stylesFor(colors);
  const chrome = chromeFor(palette);
  const player = useVideoPlayer(uri, (instance) => {
    instance.currentTime = 0.5;
    instance.loop = false;
  });
  const duration = clipDurationLabel(durationMs);

  return (
    <View style={styles.thumb}>
      <VideoView
        player={player}
        style={styles.videoPoster}
        nativeControls={false}
        contentFit="cover"
        pointerEvents="none"
      />
      {/* The mark and the badge sit on an arbitrary frame — a light one would
          swallow both without this. */}
      <View style={[styles.videoPoster, chrome.posterScrim]} pointerEvents="none" />
      <View style={styles.videoCentre} pointerEvents="none">
        <Ionicons name="play-circle" size={30} color={palette.white} />
      </View>
      {duration ? (
        <View style={[styles.durationBadge, chrome.scrim]} pointerEvents="none">
          <Text style={[styles.durationText, { color: palette.white }]}>{duration}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
  const { emerald: colors, palette, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const chrome = chromeFor(palette);
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
  /**
   * Uploaded URL -> the picked asset's real duration in milliseconds.
   *
   * A ref rather than state because the append that follows it re-renders
   * this component through the caller's `items` anyway. Only clips picked in
   * THIS session are in here; a restored draft's clip is absent and its tile
   * renders without a badge, which is the honest answer — see
   * `clipDurationLabel`.
   */
  const durationsRef = useRef<Map<string, number>>(new Map());

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
    //
    // G-001 (docs/audit/2026-08-22/guard_coverage.md): this seam used to hand
    // the failure's own raw `.message` straight out, and `onUpload` is bound
    // to lib/storage.ts's `uploadAsset()`, which returns the service's own
    // StorageError — or a raw caught fetch exception — unwrapped. The string
    // reached `alertAsync` verbatim on two live PostJobScreen mounts. It
    // survived the ship-blocker guard only because `ui/` sat outside the
    // sweep's directories, and because by the time it reached the screen it
    // was bound to a parameter named `message`. The wrap belongs HERE, at the
    // one seam every caller passes through, not at each caller.
    if (error || !url) {
      onUploadError?.(userMessage(error, 'Upload failed. Please try again.'));
      return;
    }

    addedHereRef.current.add(url);
    // The picker is the ONLY source of a real duration. Absent here means
    // absent on the tile, never a fabricated one.
    if (asset.duration != null) durationsRef.current.set(url, asset.duration);
    onItemsChange([...items, url]);
  }

  function handleRemove(url: string) {
    onItemsChange(items.filter((item) => item !== url));
    durationsRef.current.delete(url);
    const removable = shouldDeleteOnRemove
      ? shouldDeleteOnRemove(url)
      : addedHereRef.current.has(url);
    if (!removable || !onDelete) return;
    addedHereRef.current.delete(url);
    void onDelete(url);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, isDark && styles.labelDark]}>
          {label} · {items.length}/{maxItems}
        </Text>
        {/* The cap, said out loud beside the counter, and READ FROM the value
            actually handed to the picker — so the pill cannot promise a
            different minute from the one the control enforces. */}
        {kind === 'video' && videoMaxDurationSec ? (
          <View style={[styles.capPill, isDark && styles.capPillDark]}>
            <Ionicons name="time-outline" size={12} color={lineWork} />
            <Text style={[styles.capPillText, isDark && styles.capPillTextDark]}>
              Up to {videoMaxDurationSec} sec
            </Text>
          </View>
        ) : null}
      </View>
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
                <RemoteImage uri={url} style={styles.thumb} contentFit="cover" />
              ) : (
                <VideoTile uri={url} durationMs={durationsRef.current.get(url) ?? null} />
              )}
            </Pressable>
            {/* D8 — ONE remove control, identical on both kinds, anchored
                INSIDE the tile. It used to hang at top:-6/right:-6, which put
                it outside the tile's own bounds: clipped by the tile's
                overflow on a photo, and left floating unattached beside a
                clip. */}
            <Pressable
              style={[styles.remove, chrome.scrim]}
              onPress={() => handleRemove(url)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${kind} ${index + 1}`}
            >
              <Ionicons name="close" size={14} color={palette.white} />
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

/**
 * THE MEDIA-CHROME PAIR, and why it is a second stylesheet.
 *
 * `mediaChrome` and `white` are theme-CONSTANT by decision (lib/theme): they
 * sit on top of an arbitrary photo or video frame, where a colour that
 * followed the theme would disappear into half of them. They live on the
 * legacy ColorPalette rather than the §I one this component styles from, so
 * they arrive through their own factory instead of being restated as
 * literals — and the remove control therefore reads identically in both
 * palettes, which is what "one control, used identically" requires.
 */
const chromeFor = themedStyles((palette: ColorPalette) =>
  StyleSheet.create({
    /** The remove circle and the duration badge. */
    scrim: { backgroundColor: withAlpha(palette.mediaChrome, 0.62) },
    /** The poster wash that keeps the play mark legible on a bright frame —
     *  the same 0.32 components/JobVideo.tsx already uses. */
    posterScrim: { backgroundColor: withAlpha(palette.mediaChrome, 0.32) },
  }),
);

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  videoPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  videoCentre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-right, the way iOS writes a clip's length on its own thumbnail.
  durationBadge: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.xs + 1,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  durationText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  // D8 — INSIDE the tile, not hanging off it. The tile clips to its own
  // bounds (overflow: 'hidden'), so a control at a negative offset was either
  // cut in half or reading as unattached; the inset is what makes it belong
  // to the tile it removes.
  remove: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The cap pill beside the counter. Line-work, no fill in dark — the same
  // vocabulary the add tile's dashed edge already speaks.
  capPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
    backgroundColor: colors.mint,
  },
  capPillDark: {
    borderColor: withAlpha(colors.gold, 0.55),
    backgroundColor: 'transparent',
  },
  capPillText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.forest,
  },
  capPillTextDark: { color: colors.ink },
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
