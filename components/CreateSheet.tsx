import { useModalPresence } from '../hooks/useModalPresence';
import { useSheetPresence } from '../hooks/useSheetPresence';
import { SheetCard } from './SheetCard';
import { Fragment, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CategoryGlyph } from './CategoryGlyph';
import { DropdownBody, DropdownChevron } from './DropdownReveal';
import { splitNextAction } from './HubCard';
import {
  EYEBROW_TYPE,
  SCRIM_DARK_ALPHA,
  emeraldRadius,
  radius,
  scrimInDark,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { useOverrideNumber, useOverrideString } from '../lib/designOverrides';
import { Surface } from '../ui/primitives/Surface';
import { SheetHeader } from '../ui/primitives/SheetHeader';
import { ConfirmHost } from './ConfirmHost';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { attentionItems } from '../lib/homeAttention';
import { budgetRangeLabel, JOB_CATEGORY_ICONS, type Job } from '../lib/jobs';
import { reusableJobs, reuseCardFigure, reuseCardInstant, reuseCardWidth } from '../lib/reuseJobs';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type CreateSheetItem = {
  key: string;
  label: string;
  /** The row's glyph. A `primary` row draws the heavy plus instead. */
  icon?: IoniconName;
  /** The sheet's first action: the heavier label, the green glass disc, the plus. */
  primary?: boolean;
  onPress: () => void;
};

type CreateSheetProps = {
  visible: boolean;
  title: string;
  items: CreateSheetItem[];
  /** The "Needs you" card's tap — the job that is waiting on the customer. */
  onOpenJob: (job: Job) => void;
  /**
   * 2026-09-30 (idea 2): "Reuse a past job" — a past job's card, tapped. The tree opens a fresh
   * post filled from it; the sheet only draws.
   */
  onReuseJob?: (job: Job) => void;
  /** The bottom row. Hands off to switchMode(), which confirms first. */
  onSwitchMode: () => void;
  switching?: boolean;
  onClose: () => void;
};

/**
 * 2026-09-18 — THE [ + ] CREATE SHEET, as G1 "Clear" of the nine glass
 * treatments the operator chose from (docs/mockups/html/glass-sheet.html;
 * light decided on docs/mockups/html/create-sheet-decide.html, "L2 Frost").
 *
 * Its own component, not an edit of components/ActionSheet.tsx — that is a
 * FLOATING card shared by the chat, inbox and profile long-press menus, and
 * it stays byte-identical — and not ui/primitives/Sheet.tsx, which is the
 * scrollable arbitrary-height sheet with a Done button (DECISIONS.md D7:
 * the fixed short menu and the scrolling sheet are two different things).
 * This one is DOCKED, edge to edge, top corners only, five fixed rows.
 *
 * THE GLASS IS THE MATERIAL'S, NOT THIS FILE'S. The pane wears the `clear`
 * material through Surface — fill, blur, rim and the specular top edge all
 * come from ui/tokens.ts, in both themes (clear is the one material with a
 * light recipe). Nothing here imports lib/blur or the materials table: the
 * backdrop is a SCRIM ONLY, painted at the sheet family's one shared dark
 * strength (emerald D8) and the light strength ActionSheet uses, with the
 * same studio dials. G1 puts the blur in the pane, not behind it, and the
 * fenced 0.55 stands in for the mockup's 0.30 (operator, 2026-09-18).
 *
 * THE ROWS, fixed (operator, 2026-09-18): Needs you (only when a job is
 * waiting on the customer) · Post a job · Hire again · My jobs · Switch to
 * Worker. The three actions and their dispatches stay in
 * navigation/CustomerRoot.tsx and arrive as `items`; the two contextual
 * rows are props of their own. Every row's accessibility label is its text,
 * exactly — the E2E walk taps "My jobs" by label (E2E5).
 *
 * NEEDS YOU is mounted INSIDE the Modal, so it mounts on open and makes its
 * one batched read then — the same hooks/useMyJobsHub.ts read customer Home
 * makes on focus, ranked by the same lib/homeAttention.ts rule (P3-31: one
 * derivation, called from a third place, never rewritten). The action rows
 * never wait on it: the card is absent until the read settles and absent
 * when nothing is waiting, and because the sheet is docked at the bottom
 * it grows UPWARD when the card arrives — the rows do not move.
 */
export function CreateSheet({
  visible,
  title,
  items,
  onOpenJob,
  onReuseJob,
  onSwitchMode,
  switching = false,
  onClose,
}: CreateSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const presence = useSheetPresence(visible);
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
  // ONE batched read per opening, shared by the two rows that show the customer's own jobs — Needs
  // you and Reuse a past job (the hooks/useMyJobsHub.ts read customer Home makes on focus). Until it
  // settles for THIS opening, neither shows the last opening's jobs.
  const hub = useMyJobsHub();
  const { refresh } = hub;
  const [hubReady, setHubReady] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setHubReady(false);
    void refresh().then(() => {
      if (alive) setHubReady(true);
    });
    return () => {
      alive = false;
    };
  }, [visible, refresh]);
  // The mockup's chevrons: the cream at 35% on the dark glass, the nav's
  // inactive grey in light — colour only, per theme.
  const chevron = isDark ? withAlpha(colors.text, 0.35) : colors.navInactive;
  // The sheet family's shared backdrop dials (RUN S2 C7), as ActionSheet and
  // ui/primitives/Sheet.tsx read them. The pane itself is the clear
  // material's, dialled under Blur & Material.
  const backdropColorDial = useOverrideString('sheet.backdropColor');
  const backdropAlphaDial = useOverrideNumber('sheet.backdropAlpha');
  const backdropDial =
    backdropColorDial != null || backdropAlphaDial != null
      ? {
          backgroundColor: withAlpha(
            backdropColorDial ?? (isDark ? colors.background : colors.text),
            backdropAlphaDial ?? (isDark ? SCRIM_DARK_ALPHA : 0.35),
          ),
        }
      : null;

  return (
    <Modal
      visible={presence.mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* 2026-09-29 (LUX-LIST-2 #3): the dim covers the screen at once; only the card moves (hooks/useSheetPresence). */}
        {presence.dimVisible ? (
          <Pressable
            style={[styles.backdrop, isDark && styles.backdropDark, backdropDial]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        ) : null}
        <SheetCard visible={visible} onClosed={presence.onClosed}>
        <Surface
          material="clear"
          corners="top"
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          {/* #64 (M-31) — the one sheet header; "Close": a row is the action. */}
          <SheetHeader title={title} dismissWord="Close" onDismiss={onClose} />

          <NeedsYou hub={hub} ready={hubReady} onOpen={onOpenJob} />

          <View style={styles.rows}>
            {items.map((item, index) => (
              <Fragment key={item.key}>
              <Pressable
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  index === 0 && styles.rowFirst,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={[styles.disc, item.primary && styles.discPrimary]}>
                  {item.primary ? (
                    <PlusGlyph color={colors.onForest} />
                  ) : item.icon ? (
                    <Ionicons name={item.icon} size={20} color={colors.emerald} />
                  ) : null}
                </View>
                <Text style={[styles.rowLabel, item.primary && styles.rowLabelPrimary]}>
                  {item.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={chevron} />
              </Pressable>
              {/* Idea 2: under the first action, the way to start from one posted before. */}
              {index === 0 && onReuseJob ? (
                <ReusePastJob hub={hub} ready={hubReady} visible={visible} onPick={onReuseJob} />
              ) : null}
              </Fragment>
            ))}
          </View>

          <Pressable
            onPress={onSwitchMode}
            disabled={switching}
            style={({ pressed }) => [styles.row, styles.switchRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Switch to Worker"
            accessibilityHint="Confirms first, then opens the jobs you can bid on"
            accessibilityState={{ disabled: switching }}
          >
            <View style={[styles.disc, styles.discRinged, isDark && styles.discRingedDark]}>
              <Ionicons name="swap-horizontal" size={18} color={colors.emerald} />
            </View>
            <Text style={styles.rowLabel}>Switch to Worker</Text>
            <Text style={[styles.hint, isDark && styles.hintDark]}>confirms first</Text>
          </Pressable>
        </Surface>
        </SheetCard>
        {/* #64 (M-31): the switch is asked with this sheet still up (M-38), so
            its confirm is hosted here, over the sheet — iOS presents a Modal
            from the screen that owns it. */}
        <ConfirmHost level={1} />
      </View>
    </Modal>
  );
}

/**
 * The mockup's plus (create-sheet.html's i-plus at the 22px glyph size: a
 * 2.6/24 stroke, 14/24 long): two bars, 14 long, 2.5 thick — heavier than
 * any Ionicons plus, and the one glyph in the sheet that is not an icon-font
 * glyph.
 */
function PlusGlyph({ color }: { color: string }) {
  const styles = stylesFor(useThemeColors().palette);
  return (
    <View style={styles.plus} accessible={false}>
      <View style={[styles.plusBar, styles.plusAcross, { backgroundColor: color }]} />
      <View style={[styles.plusBar, styles.plusDown, { backgroundColor: color }]} />
    </View>
  );
}

type Hub = ReturnType<typeof useMyJobsHub>;

/** The one job most in need of the customer's move, or nothing. */
function NeedsYou({ hub, ready, onOpen }: { hub: Hub; ready: boolean; onOpen: (job: Job) => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const chevron = isDark ? withAlpha(colors.text, 0.35) : colors.navInactive;
  // The sheet's one read per opening (above); nothing shows until it has settled for this one.
  const { posted, payments, openDisputeJobIds, reviewedJobIds, error } = hub;
  const loading = !ready;
  // One clock reading per data load — the hub's rule, so the item's rank and
  // its next-action line cannot be read at two different instants.
  const nowMs = useMemo(() => Date.now(), [posted, payments]);
  const first = useMemo(
    () =>
      attentionItems({ posted, payments, openDisputeJobIds, reviewedJobIds, nowMs })[0] ?? null,
    [posted, payments, openDisputeJobIds, reviewedJobIds, nowMs],
  );
  // A failed read must never render as "nothing needs you": absent, not empty.
  if (loading || error || !first) return null;
  const { job, line } = first;
  // 2026-09-29 (LUX-LIST-2 run): "Approval needed — releases in 66h" breaks at the dash, as it does on the
  // job cards — it was cut to "releases i…" on one line.
  const [action, detail] = splitNextAction(line);
  return (
    <Pressable
      onPress={() => onOpen(job)}
      style={({ pressed }) => [styles.needs, isDark && styles.needsDark, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Needs you: ${line}. ${job.title}`}
    >
      <View style={[styles.needsDisc, isDark && styles.needsDiscDark]}>
        {/* 2026-09-27 (the Lux remake, rulings 5 and 12): the Lux line icon, mint in dark. */}
        <CategoryGlyph
          name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
          size={18}
          color={isDark ? colors.emerald : colors.mark}
          bare
        />
      </View>
      <View style={styles.needsCopy}>
        <Text style={styles.eyebrow}>NEEDS YOU</Text>
        <Text style={styles.needsLine} numberOfLines={1}>
          {action}
        </Text>
        {detail ? (
          <Text style={styles.needsDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        <Text style={styles.needsJob} numberOfLines={1}>
          {job.title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={chevron} />
    </Pressable>
  );
}

/**
 * 2026-09-30 (the build run, idea 2) — REUSE A PAST JOB. A row in the same white as the others,
 * "Reuse a past job" over the grey "Start from one you posted before", CLOSED until tapped (popup
 * 12); its chevron opens, in place, a sideways strip of compact cards — about two and a half across,
 * each 128 to 160 wide, just wide enough for its own words: the full title (three lines at most),
 * the worker's full name and the date on lines of their own, the price at the bottom right (the
 * operator's "what's wrong" item 1). A card opens a fresh post on its Review step, filled from that
 * job — three taps from anywhere. A failed read is absent, never "nothing to reuse".
 */
function ReusePastJob({
  hub,
  ready,
  visible,
  onPick,
}: {
  hub: Hub;
  ready: boolean;
  visible: boolean;
  onPick: (job: Job) => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const chevron = isDark ? withAlpha(colors.text, 0.35) : colors.navInactive;
  const [open, setOpen] = useState(false);
  // Each opening of the sheet starts with the row closed.
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);
  const jobs = useMemo(() => reusableJobs(hub.posted), [hub.posted]);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Reuse a past job"
        accessibilityHint="Start from one you posted before"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.disc}>
          <Ionicons name="repeat-outline" size={20} color={colors.emerald} />
        </View>
        <View style={styles.reuseCopy}>
          <Text style={styles.rowLabel}>Reuse a past job</Text>
          <Text style={[styles.reuseCaption, isDark && styles.hintDark]} numberOfLines={1}>
            Start from one you posted before
          </Text>
        </View>
        <DropdownChevron open={open}>
          <Ionicons name="chevron-down" size={18} color={chevron} />
        </DropdownChevron>
      </Pressable>
      {/* The Fable review: the strip grows the sheet by height, so the sheet's top edge travels. */}
      <DropdownBody open={open} grow>
        {!ready ? (
          <View style={styles.stripState}>
            <ActivityIndicator color={colors.emerald} />
          </View>
        ) : hub.error ? null : jobs.length === 0 ? (
          <View style={styles.stripState}>
            <Text style={[styles.hint, isDark && styles.hintDark]}>
              The jobs you post show here, ready to post again.
            </Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={jobs}
            keyExtractor={(job) => job.id}
            showsHorizontalScrollIndicator={false}
            style={styles.stripScroller}
            contentContainerStyle={styles.strip}
            renderItem={({ item: job }) => (
              <ReuseCard job={job} worker={job.assigned_worker_id ? hub.names[job.assigned_worker_id] ?? null : null} onPick={onPick} />
            )}
          />
        )}
      </DropdownBody>
    </View>
  );
}

/** The sheet's side padding; the reuse strip runs out through it to the sheet's edges. */
const SHEET_PAD_X = 22;

/** One compact card: the title, the worker and the date, the price at the bottom right. */
function ReuseCard({ job, worker, onPick }: { job: Job; worker: string | null; onPick: (job: Job) => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const figure = reuseCardFigure(job);
  const price = figure === 'budget' ? budgetRangeLabel(job) : null;
  const date = new Date(reuseCardInstant(job)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <Pressable
      onPress={() => onPick(job)}
      style={({ pressed }) => [
        styles.card,
        // Its width is its title's (lib/reuseJobs.ts), read with the card's side padding at render.
        { width: reuseCardWidth(job.title, 2 * (spacing.md - 1)) },
        isDark && styles.cardDark,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Post again: ${job.title}`}
      accessibilityHint="Opens a new post filled from this job, ready to publish"
    >
      <Text style={styles.cardTitle} numberOfLines={3}>
        {job.title}
      </Text>
      <View style={styles.cardMeta}>
        {worker ? (
          <Text style={styles.cardLine} numberOfLines={1}>
            {worker}
          </Text>
        ) : null}
        <Text style={styles.cardLine}>{date}</Text>
        {price ? <Text style={styles.cardPrice}>{price}</Text> : null}
      </View>
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    // D7 — a modal scrim DIMS the parent. `text` is the CREAM in dark, so the
    // one expression that dims in light lightens in dark; dark scrims with the
    // page ground instead, at the shared strength (emerald D8).
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(colors.text, 0.35),
    },
    backdropDark: { backgroundColor: scrimInDark(colors.background) },
    // Fill, rim, top radius, blur and the specular edge are the clear
    // material's. paddingBottom is applied at render from the safe-area
    // inset, the way the two other sheets reserve it.
    sheet: {
      paddingTop: 10,
      paddingHorizontal: SHEET_PAD_X,
      gap: 6,
    },
    // The contextual card: a pane on the pane. Light: the frost's own white
    // at 60% over an ink hairline; dark: the cream at 6% over its 10% ring.
    needs: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      borderWidth: 1,
      backgroundColor: withAlpha(colors.surface, 0.6),
      borderColor: withAlpha(colors.text, 0.08),
      marginBottom: 6,
    },
    needsDark: {
      backgroundColor: withAlpha(colors.text, 0.06),
      borderColor: withAlpha(colors.text, 0.1),
    },
    needsDisc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      backgroundColor: colors.mint,
      borderColor: colors.secondaryBorder,
    },
    needsDiscDark: {
      backgroundColor: withAlpha(colors.text, 0.08),
      borderColor: withAlpha(colors.text, 0.1),
    },
    needsCopy: { flex: 1, minWidth: 0 },
    eyebrow: {
      ...EYEBROW_TYPE,
      color: colors.emerald,
    },
    needsLine: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '700',
      color: colors.text,
    },
    // The detail after the dash: one weight lighter, one point smaller, under the action.
    needsDetail: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: colors.text,
    },
    needsJob: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      marginTop: 1,
    },
    rows: { marginTop: 2 },
    // One hairline expression for both themes: the ink at 6% in light, the
    // cream at 6% in dark — the mockup's. 12 + 34 + 12 = 58, over CLAUDE.md's
    // 44 floor. The first row draws none: nothing above it to rule off.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 2,
      minHeight: 44,
      borderTopWidth: 1,
      borderTopColor: withAlpha(colors.text, 0.06),
    },
    rowFirst: { borderTopWidth: 0 },
    pressed: { opacity: 0.7 },
    disc: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    // Post a job: the "2 · List" disc of docs/mockups/html/create-sheet.html
    // (operator, 2026-09-19) — a 40pt rounded square, radius 12, SOLID in
    // the Post-a-job pill's own theme-constant green, both themes, instead of
    // G1's translucent circle. Geometry shared; the fill is one token.
    discPrimary: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.postPillGreen,
      borderColor: colors.postPillGreen,
    },
    discRinged: { borderColor: colors.secondaryBorder },
    discRingedDark: { borderColor: withAlpha(colors.text, 0.12) },
    plus: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
    plusBar: { position: 'absolute', borderRadius: 1.25 },
    plusAcross: { width: 14, height: 2.5 },
    plusDown: { width: 2.5, height: 14 },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    rowLabelPrimary: { fontWeight: '600' },
    // The bottom row sits apart: a stronger hairline and a breath above it.
    switchRow: {
      marginTop: 4,
      paddingBottom: 0,
      borderTopColor: withAlpha(colors.text, 0.1),
    },
    hint: {
      fontSize: 13,
      color: colors.textMuted,
    },
    hintDark: { color: withAlpha(colors.text, 0.45) },
    // Idea 2 — the reuse row's words, and its strip of cards.
    reuseCopy: { flex: 1, minWidth: 0, gap: 2 },
    reuseCaption: {
      fontSize: 12,
      color: colors.textMuted,
    },
    // Full bleed, as Home's tile row: out to the sheet's edges, the first card back on the column.
    stripScroller: { marginHorizontal: -SHEET_PAD_X },
    strip: {
      paddingHorizontal: SHEET_PAD_X,
      gap: spacing.sm + 2,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm + 2,
    },
    stripState: {
      minHeight: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // The operator's compact card: as wide as its own words need, from 128 to 160 (set at render).
    card: {
      minHeight: 118,
      borderRadius: emeraldRadius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md - 1,
      gap: spacing.xs + 2,
      backgroundColor: withAlpha(colors.forest, 0.07),
    },
    cardDark: { backgroundColor: withAlpha(colors.text, 0.06) },
    cardTitle: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      color: colors.text,
    },
    cardMeta: { marginTop: 'auto', gap: 2 },
    cardLine: {
      fontSize: 11,
      lineHeight: 14,
      color: colors.textMuted,
    },
    cardPrice: {
      alignSelf: 'flex-end',
      marginTop: 2,
      fontSize: 13,
      fontWeight: '800',
      color: colors.money,
    },
  }),
);
