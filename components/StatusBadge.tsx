import { StyleSheet, Text, View } from 'react-native';
import { formatStatus } from '../lib/jobStage';
import {
  metricStyles,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/** Colour pairs per status, computed from the resolved palette (4D-4) so the
 *  badge repaints on a theme change; themedStyles caches one map per palette. */
const statusStylesFor = themedStyles((colors: ColorPalette) => {
  const byStatus: Record<string, { bg: string; text: string }> = {
    // Job statuses
    open: { bg: colors.successBg, text: colors.success },
    // 2026-09-28 (LUX-LIST-64 #20, #46): Assigned is the gold stage and In
    // progress the orange one — the same inks the Inbox job chip, the Home live
    // bar and the stage rail use (ui/tokens.ts `stage*`).
    assigned: { bg: colors.stageAssignedBg, text: colors.stageAssigned },
    in_progress: { bg: colors.stageProgressBg, text: colors.stageProgress },
    // Completed and cancelled previously shared a near-identical low-contrast
    // tan pill (completed) next to a red one (cancelled) — visually backwards,
    // since red reads as "needs attention" for a job that's just over and
    // done with. Completed now gets the positive-outcome green; cancelled
    // moves to neutral gray, clearly different from completed at a glance
    // without borrowing the danger red used elsewhere for rejected/actioned.
    completed: { bg: colors.successBg, text: colors.success },
    cancelled: { bg: colors.neutralBg, text: colors.neutral },
    // Bid/offer statuses (offer_status vocabulary — phase50 made
    // declined/expired/superseded reachable states, so they get deliberate
    // colours instead of the default fallback)
    pending: { bg: colors.warningBg, text: colors.warning },
    accepted: { bg: colors.successBg, text: colors.success },
    rejected: { bg: colors.dangerBg, text: colors.danger },
    declined: { bg: colors.dangerBg, text: colors.danger },
    withdrawn: { bg: colors.neutralBg, text: colors.neutral },
    expired: { bg: colors.neutralBg, text: colors.neutral },
    superseded: { bg: colors.neutralBg, text: colors.neutral },
    // Report statuses (admin moderation queue). 'open' reuses the job status
    // above, which reads correctly here too.
    actioned: { bg: colors.dangerBg, text: colors.danger },
    dismissed: { bg: colors.neutralBg, text: colors.neutral },
  };
  return { byStatus, fallback: { bg: colors.neutralBg, text: colors.neutral } };
});

type StatusBadgeProps = {
  /** Drives the colour pair. */
  status: string;
  /**
   * Overrides the displayed text while keeping `status`'s colour — used by
   * the job detail screen's evolving stage badge, where the wording
   * ("Bids Pending (3)") differs from the underlying status key. See
   * lib/jobStage.ts.
   */
  label?: string;
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const { byStatus, fallback } = statusStylesFor(colors);
  const style = byStatus[status] ?? fallback;
  // The masters never draw a filled status pill on dark: masters 8, 16 and 17
  // outline it, and 35/36 outline it in the status's own green. So under dark
  // the pill becomes line-work in its status colour; light keeps the Heritage
  // tinted fill.
  //
  // 2026-08-24: the RING is now drawn in both, because the pill's geometry is
  // not allowed to depend on the palette. Light's ring is its own fill colour,
  // so the pill still READS as a tinted fill there — the ONLY thing that
  // differs between the two themes is which colour each slot takes, which is
  // the whole rule. The dark-only serif went with it: `fonts.display` resolves
  // to `undefined` (themeTokens' one-serif fence pins that), so it never named
  // a face — all it actually did was make the label a point larger in dark.
  // 13 is dark's size and both now use it.
  //
  // 2026-09-28 (LUX-LIST-64): the dark pill is the approved reference's own
  // (docs/mockups/html/refs/live-job-cards.html `.pill`): the ink at full
  // strength, its rim at .55 and a .09 wash of the same inside — so every dark
  // status reads as one family, the orange In progress and the gold Assigned
  // included. Light keeps the filled tint.
  // 2026-09-29 (LUX-LIST-2 #6): the dark pill is the Lux `.chip` — a soft .14
  // tint of the ink and NO outline (the rim stays transparent so the pill keeps
  // its size); light keeps its filled tint, and its near-invisible rim goes too.
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isDark ? withAlpha(style.text, 0.14) : style.bg,
          borderColor: 'transparent',
        },
      ]}
    >
      <Text style={[styles.text, { color: style.text }]}>
        {label ?? formatStatus(status)}
      </Text>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
}));
