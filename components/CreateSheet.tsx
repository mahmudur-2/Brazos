import { useEffect, useMemo, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  SCRIM_DARK_ALPHA,
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
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { attentionItems } from '../lib/homeAttention';
import { JOB_CATEGORY_ICONS, type Job } from '../lib/jobs';

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
  onSwitchMode,
  switching = false,
  onClose,
}: CreateSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
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
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, isDark && styles.backdropDark, backdropDial]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Surface
          material="clear"
          corners="top"
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={[styles.handle, isDark && styles.handleDark]} />
          <Text style={styles.title}>{title}</Text>

          <NeedsYou onOpen={onOpenJob} />

          <View style={styles.rows}>
            {items.map((item, index) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  index === 0 && styles.rowFirst,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View
                  style={[
                    styles.disc,
                    item.primary && styles.discPrimary,
                    item.primary && isDark && styles.discPrimaryDark,
                  ]}
                >
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
      </View>
    </Modal>
  );
}

/**
 * The mockup's plus: two 2pt bars, 13 long — heavier than any Ionicons plus
 * at this size, and the one glyph in the sheet that is not an icon-font glyph.
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

/** The one job most in need of the customer's move, or nothing. */
function NeedsYou({ onOpen }: { onOpen: (job: Job) => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const chevron = isDark ? withAlpha(colors.text, 0.35) : colors.navInactive;
  const { posted, payments, openDisputeJobIds, reviewedJobIds, loading, error, refresh } =
    useMyJobsHub();
  // Inside the Modal, so this is the sheet opening: one batched read per open.
  useEffect(() => {
    void refresh();
  }, [refresh]);
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
  return (
    <Pressable
      onPress={() => onOpen(job)}
      style={({ pressed }) => [styles.needs, isDark && styles.needsDark, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Needs you: ${line}. ${job.title}`}
    >
      <View style={[styles.needsDisc, isDark && styles.needsDiscDark]}>
        <Ionicons
          name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
          size={18}
          color={colors.gold}
        />
      </View>
      <View style={styles.needsCopy}>
        <Text style={styles.eyebrow}>NEEDS YOU</Text>
        <Text style={styles.needsLine} numberOfLines={1}>
          {line}
        </Text>
        <Text style={styles.needsJob} numberOfLines={1}>
          {job.title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={chevron} />
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
      paddingHorizontal: 22,
      gap: 6,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.text, 0.18),
      marginBottom: spacing.sm,
    },
    handleDark: { backgroundColor: withAlpha(colors.text, 0.28) },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      letterSpacing: -0.2,
      color: colors.text,
      marginBottom: spacing.sm,
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
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.5,
      color: colors.emerald,
    },
    needsLine: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '700',
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
    // Post a job: solid emerald in light; in dark the emerald as GLASS — the
    // mockup's translucent green disc with its own lighter ring.
    discPrimary: {
      backgroundColor: colors.emerald,
      borderColor: colors.emerald,
    },
    discPrimaryDark: {
      backgroundColor: withAlpha(colors.emerald, 0.28),
      borderColor: withAlpha(colors.emerald, 0.45),
    },
    discRinged: { borderColor: colors.secondaryBorder },
    discRingedDark: { borderColor: withAlpha(colors.text, 0.12) },
    plus: { width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
    plusBar: { position: 'absolute', borderRadius: 1 },
    plusAcross: { width: 13, height: 2 },
    plusDown: { width: 2, height: 13 },
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
  }),
);
