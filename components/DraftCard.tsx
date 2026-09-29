import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import type { PostJobDraft } from '../lib/postJobDraft';
import { EYEBROW_TYPE, spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/**
 * 2026-09-28 (LUX-LIST-64 #17) — THE UNPUBLISHED DRAFT, as ONE card: the first
 * card under the customer Home's NEEDS YOUR ATTENTION and the card in My Jobs'
 * Draft section, the same component in both (P3-31), so the two cannot word or
 * draw it differently. sim.html's draft card (l.1533) at the approved Home
 * page's numbers (refs/home-tucked-in.html `.draft`): a pencil in a round
 * well, NOT PUBLISHED YET, the job's title (or its category), "Resume where you
 * left off — workers can't see it until you publish.", and a chevron. Tapping
 * it resumes the draft — the caller's navigation, the wizard's own resume.
 */
export function DraftCard({ draft, onPress }: { draft: PostJobDraft; onPress: () => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const title =
    draft.title.trim() || (draft.category ? JOB_CATEGORY_LABELS[draft.category] : null) || 'Untitled job';
  return (
    <Card onPress={onPress} style={styles.card} accessibilityHint="Resumes your unpublished job">
      <View style={[styles.well, { backgroundColor: isDark ? withAlpha(colors.white, 0.06) : colors.primarySoft }]}>
        {/* The mint in dark; the forest #064C3B in light (#47's icon green). */}
        <Ionicons name="pencil-outline" size={20} color={isDark ? colors.emerald : colors.forest} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Not published yet</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          Resume where you left off — workers can’t see it until you publish.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md + 2,
      padding: spacing.lg,
    },
    well: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eyebrow: {
      ...EYEBROW_TYPE,
      fontSize: 11,
      letterSpacing: 1.4,
      color: colors.eyebrowGold, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.ink,
    },
    meta: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
  })
);
