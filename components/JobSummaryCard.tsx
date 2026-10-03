import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Card } from './Card';
import { Divider } from '../ui/primitives/Divider';
import { MediaViewer, type ViewerItem } from './MediaViewer';
import { RemoteImage } from './RemoteImage';
import { useLoopActive } from '../hooks/useLoopActive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { userMessage } from '../lib/errorMessage';
import { useModalPresence } from '../hooks/useModalPresence';
import { formatBudget } from '../lib/jobs';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import {
  EYEBROW_TYPE,
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { Surface } from '../ui/primitives/Surface';
import { VideoTile } from '../ui/primitives/MediaUploader';
import { STATE_COPY } from '../ui/templates/ScreenStates';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Kind = 'photo' | 'video';
type Upload = (asset: ImagePicker.ImagePickerAsset) => Promise<{ url: string | null; error: Error | null }>;
type Pending = { id: number; kind: Kind; asset: ImagePicker.ImagePickerAsset; status: 'uploading' | 'failed' };
type Tile =
  | { kind: Kind; url: string; pendingId?: undefined; status: 'done' }
  | { kind: Kind; url: null; pendingId: number; status: 'uploading' | 'failed' };

export type SummaryTarget = 'describe' | 'category' | 'area' | 'timing' | 'address' | 'budget';

/** How long a removal can be undone before its file is let go (the reference's 4 s). */
const UNDO_MS = 4000;
/** The add menu's width (#39: ~150, was 210). */
const MENU_WIDTH = 150;
const MENU_ROW = 46;

/** "3 photos, 1 video" — each side pluralised on its own, an empty side omitted. */
export function mediaCountText(photos: number, videos: number): string {
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  if (videos > 0) parts.push(`${videos} ${videos === 1 ? 'video' : 'videos'}`);
  return parts.join(', ');
}

/**
 * The view mode's grid, filling the card's width: one item → a 16:9 hero, two
 * → 4:3 halves, three or four → squares in a row, more → four squares with
 * "+N" on the fourth (refs/job-summary.html `renderMedia`).
 */
export function viewGrid(count: number): { columns: number; aspect: number; shown: number; more: number } {
  if (count <= 1) return { columns: 1, aspect: 16 / 9, shown: count, more: 0 };
  if (count === 2) return { columns: 2, aspect: 4 / 3, shown: 2, more: 0 };
  if (count <= 4) return { columns: count, aspect: 1, shown: count, more: 0 };
  return { columns: 4, aspect: 1, shown: 4, more: count - 3 };
}

/** One detail of the card: its mint glyph and label, the value under them; a tap opens its step. */
function SummaryCell({
  label,
  glyph,
  wide,
  onPress,
  children,
}: {
  label: string;
  glyph: IoniconName;
  wide?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cell, wide ? styles.cellWide : styles.cellHalf, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Change ${label.toLowerCase()}`}
    >
      <View style={styles.labelRow}>
        <Ionicons name={glyph} size={14} color={colors.emerald} />
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </View>
      {children}
    </Pressable>
  );
}

/** The upload ring: an arc turning on the native driver while the file travels. */
function UploadRing({ color, track }: { color: string; track: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  // FIX-RUN F16: the loop runs only while its screen is on top and the app is in front.
  const loopActive = useLoopActive();
  useEffect(() => {
    if (reducedMotion !== false || !loopActive) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [loopActive, reducedMotion, spin]);
  return (
    <Animated.View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 3,
        borderColor: track,
        borderTopColor: color,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    />
  );
}

/**
 * 2026-09-28 (LUX-LIST-64 #38, #39, #40) — THE REVIEW STEP'S JOB SUMMARY, rebuilt
 * from refs/job-summary.html: its layout and behaviour, the app's colours.
 *
 * JOB SUMMARY with "Tap any detail to edit"; the title (the posting flow's one
 * serif) and the description, which open the Describe step. MEDIA with its count
 * and Edit / Done: in view the tiles fill the width (see `viewGrid`) and open the
 * full-screen viewer; in edit they are four across, each with a light X, and a
 * "+" tile opens "Add a photo / Add a video" (#39: ~150 wide, centred under the
 * +, kept on the card). An upload shows its ring and blocks Publish ("Uploading…"
 * — the screen's); a failed one says Retry; a removal says "Photo removed · Undo"
 * and lets the file go only when the undo has passed. No media at all is one
 * wide "Add photos or videos". The limits are the app's: 10 photos, 1 video.
 * Then the details — CATEGORY and AREA side by side, TIMING, ADDRESS (PRIVATE)
 * ("+ Add address" when empty) and BUDGET across the card — each opening the
 * step it came from; BUDGET opens the price list above (#36).
 *
 * The media stay the screen's arrays and every upload goes through the screen's
 * own callbacks, so the storage bookkeeping (what may be deleted, what belongs
 * to a saved row) is still decided in one place.
 */
export function JobSummaryCard({
  title,
  description,
  categoryLabel,
  area,
  timing,
  address,
  showSchedule,
  budgetLabel,
  budgetCents,
  budgetUpTo,
  budgetEmpty,
  photos,
  videos,
  setPhotos,
  setVideos,
  maxPhotos,
  maxVideos,
  uploadPhoto,
  uploadVideo,
  deleteMedia,
  shouldDeleteOnRemove,
  validateVideo,
  videoMaxDurationSec,
  onUploadingChange,
  onUploadError,
  onToast,
  onEdit,
  disabled,
  cornerRadius,
}: {
  title: string;
  description: string;
  categoryLabel: string | null;
  area: string;
  timing: string;
  address: string;
  /** Timing and the private address — a posting's, never a direct offer's. */
  showSchedule: boolean;
  budgetLabel: string;
  budgetCents: number | null;
  /** "Up to $X" (a maximum) rather than "$X" (a price or an offer). */
  budgetUpTo: boolean;
  /** What the BUDGET cell says with no amount: "No maximum", "Choose a price". */
  budgetEmpty: string;
  photos: readonly string[];
  videos: readonly string[];
  setPhotos: Dispatch<SetStateAction<string[]>>;
  setVideos: Dispatch<SetStateAction<string[]>>;
  maxPhotos: number;
  maxVideos: number;
  uploadPhoto: Upload;
  uploadVideo: Upload;
  deleteMedia: (url: string) => Promise<{ error: unknown }>;
  shouldDeleteOnRemove: (url: string) => boolean;
  validateVideo: (asset: ImagePicker.ImagePickerAsset) => { title: string; message: string } | null;
  videoMaxDurationSec: number;
  onUploadingChange: (uploading: boolean) => void;
  onUploadError: (message: string) => void;
  /** The screen draws the note (components/UndoToast.tsx); null clears it. */
  onToast: (toast: { message: string; undo?: () => void } | null) => void;
  onEdit: (target: SummaryTarget) => void;
  disabled?: boolean;
  /** The card's corner — Post a Job's `postJob.reviewCard.radius` dial. */
  cornerRadius?: number;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(menu != null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const window = useWindowDimensions();
  const nextId = useRef(1);
  const cancelled = useRef<Set<number>>(new Set());
  const addRef = useRef<View>(null);
  // The one removal that can still be undone, and the timer that lets it go.
  const removal = useRef<{ kind: Kind; url: string; index: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  const uploading = pending.some((p) => p.status === 'uploading');
  useEffect(() => {
    onUploadingChange(uploading);
  }, [uploading, onUploadingChange]);

  // Leaving the screen lets any removal still waiting on its undo go for real.
  useEffect(
    () => () => {
      const last = removal.current;
      if (last) {
        clearTimeout(last.timer);
        if (shouldDeleteOnRemove(last.url)) void deleteMedia(last.url);
      }
    },
    // The unmount only — the callbacks are the screen's and stable in intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const photoCount = photos.length + pending.filter((p) => p.kind === 'photo').length;
  const videoCount = videos.length + pending.filter((p) => p.kind === 'video').length;
  const canAddPhoto = photoCount < maxPhotos;
  const canAddVideo = videoCount < maxVideos;
  const canAdd = canAddPhoto || canAddVideo;

  const tiles: Tile[] = [
    ...photos.map((url) => ({ kind: 'photo' as const, url, status: 'done' as const })),
    ...videos.map((url) => ({ kind: 'video' as const, url, status: 'done' as const })),
    ...pending.map((p) => ({ kind: p.kind, url: null, pendingId: p.id, status: p.status })),
  ];
  const viewerItems: ViewerItem[] = tiles.flatMap((t) => (t.status === 'done' ? [{ kind: t.kind, url: t.url }] : []));

  function settleRemoval() {
    const last = removal.current;
    if (!last) return;
    clearTimeout(last.timer);
    removal.current = null;
    if (shouldDeleteOnRemove(last.url)) void deleteMedia(last.url);
  }

  async function runUpload(item: Pending) {
    const upload = item.kind === 'photo' ? uploadPhoto : uploadVideo;
    const { url, error } = await upload(item.asset);
    if (cancelled.current.has(item.id)) {
      cancelled.current.delete(item.id);
      // Cancelled while it travelled: the file arrived for nothing, so it goes.
      if (url) void deleteMedia(url);
      return;
    }
    if (error || !url) {
      setPending((all) => all.map((p) => (p.id === item.id ? { ...p, status: 'failed' } : p)));
      onUploadError(userMessage(error, 'Upload failed. Tap Retry.'));
      return;
    }
    setPending((all) => all.filter((p) => p.id !== item.id));
    (item.kind === 'photo' ? setPhotos : setVideos)((all) => [...all, url]);
  }

  async function add(kind: Kind) {
    setMenu(null);
    if (disabled || (kind === 'photo' ? !canAddPhoto : !canAddVideo)) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: kind === 'photo' ? 0.7 : undefined,
      videoMaxDuration: kind === 'video' ? videoMaxDurationSec : undefined,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const rejection = kind === 'video' ? validateVideo(asset) : null;
    if (rejection) {
      onUploadError(rejection.message);
      return;
    }
    const item: Pending = { id: nextId.current++, kind, asset, status: 'uploading' };
    setPending((all) => [...all, item]);
    setEditing(true);
    void runUpload(item);
  }

  function retry(id: number) {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    const again: Pending = { ...item, status: 'uploading' };
    setPending((all) => all.map((p) => (p.id === id ? again : p)));
    void runUpload(again);
  }

  function remove(tile: Tile) {
    if (tile.status !== 'done') {
      // An upload in flight or a failed one: nothing was attached yet.
      if (tile.status === 'uploading') cancelled.current.add(tile.pendingId);
      setPending((all) => all.filter((p) => p.id !== tile.pendingId));
      onToast({ message: 'Upload canceled' });
      return;
    }
    settleRemoval();
    const list = tile.kind === 'photo' ? photos : videos;
    const index = list.indexOf(tile.url);
    (tile.kind === 'photo' ? setPhotos : setVideos)((all) => all.filter((url) => url !== tile.url));
    const timer = setTimeout(() => {
      settleRemoval();
      onToast(null);
    }, UNDO_MS);
    removal.current = { kind: tile.kind, url: tile.url, index, timer };
    onToast({
      message: `${tile.kind === 'photo' ? 'Photo' : 'Video'} removed`,
      undo: () => {
        const last = removal.current;
        if (!last) return;
        clearTimeout(last.timer);
        removal.current = null;
        const cap = last.kind === 'photo' ? maxPhotos : maxVideos;
        (last.kind === 'photo' ? setPhotos : setVideos)((all) =>
          all.length >= cap ? all : [...all.slice(0, last.index), last.url, ...all.slice(last.index)]
        );
        onToast(null);
      },
    });
  }

  function openMenu() {
    if (disabled || !canAdd) return;
    addRef.current?.measureInWindow((x, y, width, height) => {
      // #39 — centred under the +, shifted only as far as the screen's gutter needs.
      const centre = x + width / 2;
      setMenu({
        left: Math.max(20, Math.min(centre - MENU_WIDTH / 2, window.width - 20 - MENU_WIDTH)),
        top: y + height + 8,
      });
    });
  }

  const gap = 10;
  const onGridLayout = (event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width);
  const view = viewGrid(tiles.length);
  const columns = editing ? 4 : view.columns;
  const tileWidth = gridWidth > 0 ? (gridWidth - gap * (columns - 1)) / columns : 0;
  const tileHeight = editing ? tileWidth : tileWidth / view.aspect;
  const shownTiles = editing ? tiles : tiles.slice(0, view.shown);
  const hero = !editing && tiles.length === 1;
  const atLimit = !canAdd;

  function renderTile(tile: Tile, i: number) {
    const more = !editing && view.more > 0 && i === 3 ? view.more : 0;
    const failed = tile.status === 'failed';
    const doneIndex = tile.status === 'done' ? viewerItems.findIndex((v) => v.url === tile.url) : -1;
    return (
      <View key={tile.url ?? `pending-${tile.pendingId}`} style={{ width: tileWidth, height: tileHeight }}>
        <Pressable
          onPress={() => {
            if (failed && tile.pendingId != null) retry(tile.pendingId);
            else if (tile.status === 'done') setViewerIndex(more ? 3 : doneIndex);
          }}
          disabled={tile.status === 'uploading'}
          style={[styles.tile, hero && styles.tileHero, failed && styles.tileFailed]}
          accessibilityRole="button"
          accessibilityLabel={
            failed
              ? `${tile.kind === 'photo' ? 'Photo' : 'Video'} failed to upload. Tap to retry`
              : tile.status === 'uploading'
                ? `${tile.kind === 'photo' ? 'Photo' : 'Video'} uploading`
                : more
                  ? `Show all ${tiles.length} photos and videos`
                  : `${tile.kind === 'photo' ? 'Photo' : 'Video'}. Open`
          }
        >
          {tile.status === 'done' ? (
            tile.kind === 'photo' ? (
              <RemoteImage uri={tile.url} style={styles.fill} contentFit="cover" />
            ) : (
              <VideoTile uri={tile.url} durationMs={null} playSize={hero ? 52 : 28} />
            )
          ) : (
            <View style={[styles.fill, styles.pendingGround]} />
          )}
          {tile.status === 'uploading' ? (
            <View style={styles.overlay}>
              <UploadRing color={colors.emerald} track={withAlpha(colors.white, 0.25)} />
            </View>
          ) : null}
          {failed ? (
            <View style={[styles.overlay, styles.overlayFail]}>
              <Ionicons name="refresh" size={20} color={colors.danger} />
              <Text style={styles.retry}>{STATE_COPY.retry}</Text>
            </View>
          ) : null}
          {more ? (
            <View style={[styles.overlay, styles.overlayMore]}>
              <Text style={styles.moreText}>+{more}</Text>
            </View>
          ) : null}
        </Pressable>
        {editing ? (
          <Pressable
            onPress={() => remove(tile)}
            hitSlop={10}
            style={styles.x}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${tile.kind}`}
          >
            <Ionicons name="close" size={13} color={colors.mediaChrome} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <Card style={[styles.card, cornerRadius != null && { borderRadius: cornerRadius }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>JOB SUMMARY</Text>
        <Text style={styles.hint}>Tap any detail to edit</Text>
      </View>

      <Pressable
        onPress={() => onEdit('describe')}
        style={({ pressed }) => [styles.intro, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Change title and description"
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description} numberOfLines={5}>
          {description}
        </Text>
      </Pressable>

      <View style={styles.media}>
        <View style={styles.mediaHead}>
          <View style={styles.labelRow}>
            <Ionicons name="images-outline" size={14} color={colors.emerald} />
            <Text style={styles.label}>
              MEDIA
              {tiles.length > 0 ? (
                <Text style={styles.count}>
                  {' · '}
                  {editing
                    ? `${photoCount}/${maxPhotos} photos, ${videoCount}/${maxVideos} video`
                    : mediaCountText(photos.length, videos.length) || `${pending.length} uploading`}
                </Text>
              ) : null}
            </Text>
          </View>
          {tiles.length > 0 ? (
            <Pressable
              onPress={() => {
                setMenu(null);
                setEditing((on) => !on);
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Done editing media' : 'Edit media'}
            >
              <Text style={[styles.link, editing && styles.linkStrong]}>{editing ? 'Done' : 'Edit'}</Text>
            </Pressable>
          ) : null}
        </View>

        {tiles.length === 0 ? (
          <View ref={addRef} collapsable={false}>
            <Pressable
              onPress={openMenu}
              style={({ pressed }) => [styles.addWide, menu && styles.addOpen, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add photos or videos"
            >
              <Ionicons name="add" size={18} color={colors.emerald} />
              <Text style={styles.addWideText}>Add photos or videos</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid} onLayout={onGridLayout}>
            {gridWidth > 0 ? shownTiles.map(renderTile) : null}
            {editing && canAdd && gridWidth > 0 ? (
              <View ref={addRef} collapsable={false} style={{ width: tileWidth, height: tileWidth }}>
                <Pressable
                  onPress={openMenu}
                  style={({ pressed }) => [styles.tile, styles.addTile, menu && styles.addOpen, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo or video"
                >
                  <Ionicons name="add" size={26} color={colors.emerald} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        {editing && atLimit ? <Text style={styles.note}>That’s the limit. Remove one to add another.</Text> : null}
      </View>

      <Divider thickness={1} style={styles.divider} />

      <View style={styles.details}>
        <SummaryCell onPress={() => onEdit('category')} label="Category" glyph="grid-outline">
          <Text style={styles.value} numberOfLines={2}>
            {categoryLabel ?? 'Not selected'}
          </Text>
        </SummaryCell>
        <SummaryCell onPress={() => onEdit('area')} label="Area" glyph="location-outline">
          <Text style={styles.value} numberOfLines={2}>
            {area}
          </Text>
        </SummaryCell>
        {showSchedule ? (
          <>
            <SummaryCell onPress={() => onEdit('timing')} label="Timing" glyph="time-outline" wide>
              <Text style={styles.value} numberOfLines={2}>
                {timing}
              </Text>
            </SummaryCell>
            <SummaryCell onPress={() => onEdit('address')} label="Address (private)" glyph="lock-closed-outline" wide>
              {address ? (
                <Text style={styles.value} numberOfLines={2}>
                  {address}
                </Text>
              ) : (
                <View style={styles.addRow}>
                  <Ionicons name="add" size={16} color={colors.emerald} />
                  <Text style={[styles.value, styles.addValue]}>Add address</Text>
                </View>
              )}
            </SummaryCell>
          </>
        ) : null}
        <SummaryCell onPress={() => onEdit('budget')} label={budgetLabel} glyph="wallet-outline" wide>
          {budgetCents != null ? (
            <Text style={styles.value} numberOfLines={1}>
              {budgetUpTo ? <Text style={styles.sub}>Up to </Text> : null}
              <Text style={styles.money}>{formatBudget(budgetCents)}</Text>
            </Text>
          ) : (
            <Text style={[styles.value, styles.sub]} numberOfLines={1}>
              {budgetEmpty}
            </Text>
          )}
        </SummaryCell>
      </View>

      <Modal visible={menu != null} transparent animationType="fade" onRequestClose={() => setMenu(null)} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityRole="button" accessibilityLabel="Close" />
        {menu ? (
          <View style={[styles.menuFrame, { left: menu.left, top: menu.top }]}>
            <Surface material="menu" radius={radius.lg} corners="all" style={styles.menu}>
              {(['photo', 'video'] as const).map((kind, i) => {
                const allowed = kind === 'photo' ? canAddPhoto : canAddVideo;
                return (
                  <View key={kind}>
                    {i > 0 ? <Divider color={withAlpha(isDark ? colors.white : colors.ink, 0.1)} style={styles.menuSep} /> : null}
                    <Pressable
                      onPress={() => void add(kind)}
                      disabled={!allowed}
                      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed, !allowed && styles.menuRowOff]}
                      accessibilityRole="menuitem"
                      accessibilityState={{ disabled: !allowed }}
                    >
                      <Ionicons name={kind === 'photo' ? 'image-outline' : 'videocam-outline'} size={20} color={colors.emerald} />
                      <Text style={styles.menuText}>{kind === 'photo' ? 'Add a photo' : 'Add a video'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </Surface>
          </View>
        ) : null}
      </Modal>

      <MediaViewer
        visible={viewerIndex != null}
        items={viewerItems}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // refs/job-summary.html `.card`: 22 / 20 / 6 of padding — the cells carry
    // their own 14 top and bottom.
    card: {
      paddingTop: 22,
      paddingHorizontal: 20,
      paddingBottom: 6,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    eyebrow: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    hint: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    intro: {
      marginTop: spacing.md,
      borderRadius: radius.md,
    },
    // The posting flow's one serif — the job's own title (LUX-LIST-64 #38).
    title: {
      fontFamily: fonts.displayHero,
      fontSize: 25,
      lineHeight: 30,
      fontWeight: '700',
      color: colors.ink,
    },
    description: {
      marginTop: 10,
      fontSize: 15,
      lineHeight: 23,
      color: colors.textMuted,
    },
    media: {
      marginTop: 18,
    },
    mediaHead: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    // #48 — the row labels are the eyebrow role (gold / antique gold), with the
    // reference's mint glyph before each.
    label: {
      ...EYEBROW_TYPE,
      color: colors.eyebrow,
    },
    count: {
      letterSpacing: 0,
      fontWeight: '500',
      color: colors.textSubtle,
    },
    link: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.emerald,
    },
    linkStrong: {
      fontWeight: '800',
    },
    grid: {
      marginTop: spacing.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tile: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.mint,
    },
    tileHero: {
      borderRadius: 16,
    },
    tileFailed: {
      borderColor: colors.danger,
    },
    fill: {
      width: '100%',
      height: '100%',
    },
    pendingGround: {
      backgroundColor: colors.mint,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: withAlpha(colors.mediaChrome, 0.55),
    },
    overlayFail: {
      backgroundColor: withAlpha(colors.mediaChrome, 0.74),
    },
    overlayMore: {
      backgroundColor: withAlpha(colors.mediaChrome, 0.58),
    },
    retry: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.danger,
    },
    moreText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.white,
    },
    // The iPhone remove button: a light circle on the tile's corner, 44 to tap.
    x: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.white, 0.94),
      shadowColor: colors.black,
      shadowOpacity: 0.5,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    addTile: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.3,
      borderStyle: 'dashed',
      borderColor: colors.secondaryBorder,
      backgroundColor: 'transparent',
    },
    addOpen: {
      borderStyle: 'solid',
      borderColor: colors.emerald,
      backgroundColor: withAlpha(colors.emerald, 0.08),
    },
    addWide: {
      marginTop: spacing.md,
      height: 64,
      borderRadius: 14,
      borderWidth: 1.3,
      borderStyle: 'dashed',
      borderColor: colors.secondaryBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    addWideText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.emerald,
    },
    note: {
      marginTop: 10,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textMuted,
    },
    // The Divider draws the 1 pt border-role rule; this is only its offset.
    divider: {
      marginTop: 20,
      marginBottom: 2,
    },
    details: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 14,
    },
    cell: {
      minHeight: 44,
      paddingVertical: 14,
      borderRadius: radius.md,
    },
    cellHalf: {
      width: '46%',
      flexGrow: 1,
    },
    cellWide: {
      width: '100%',
    },
    value: {
      marginTop: 5,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '600',
      color: colors.ink,
    },
    sub: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textMuted,
    },
    // #40 — money is white in dark, the dark ink in light.
    money: {
      fontWeight: '700',
      color: colors.money,
    },
    addRow: {
      marginTop: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    addValue: {
      marginTop: 0,
      color: colors.emerald,
    },
    pressed: {
      opacity: 0.72,
    },
    menuFrame: {
      position: 'absolute',
      width: MENU_WIDTH,
      shadowColor: colors.black,
      shadowOpacity: 0.45,
      shadowRadius: 17,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    menu: {
      padding: 6,
    },
    // The Divider draws the platform hairline; this is only where it sits.
    menuSep: {
      marginHorizontal: 8,
      marginVertical: 2,
    },
    // At #39's 150 wide, "Add a photo" keeps one line: 8 either side, 8 after the glyph.
    menuRow: {
      height: MENU_ROW,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
    },
    menuRowPressed: {
      backgroundColor: colors.primarySoft,
    },
    menuRowOff: {
      opacity: 0.4,
    },
    menuText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.ink,
    },
  })
);
