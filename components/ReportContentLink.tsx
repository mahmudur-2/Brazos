import { useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReportDialog } from './ReportDialog';
import { useAuth } from '../hooks/useAuth';
import type { ReportSubject } from '../lib/moderation';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type ReportContentLinkProps = {
  /** The job post, profile, review or portfolio photo being reported. */
  subject: ReportSubject;
  /** The person who wrote or owns it. Null while unknown: nothing renders. */
  reportedId: string | null | undefined;
  reportedName: string;
  jobId?: string | null;
  /** "Report" by default; "Report this job", "Report this review"… */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * FIX-RUN B3 (Apple guideline 1.2) — Report + Block wherever another person's
 * content is shown, not only in chat and the inbox. One quiet text link that
 * opens the shared ReportDialog (whose "Also block this person" is the block),
 * with the subject recorded on the report. Never on your own content, and
 * never signed out. The dialog mounts on first use, so a list of links costs
 * nothing until one is tapped.
 */
export function ReportContentLink({
  subject,
  reportedId,
  reportedName,
  jobId,
  label = 'Report',
  style,
}: ReportContentLinkProps) {
  const { user } = useAuth();
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  if (!user || !reportedId || reportedId === user.id) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`Report or block ${reportedName}`}
        hitSlop={8}
        onPress={() => {
          setMounted(true);
          setOpen(true);
        }}
        style={({ pressed }) => [styles.link, pressed && styles.pressed, style]}
      >
        <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
        <Text style={styles.text}>{label}</Text>
      </Pressable>
      {mounted ? (
        <ReportDialog
          visible={open}
          reporterId={user.id}
          reportedId={reportedId}
          reportedName={reportedName}
          jobId={jobId ?? null}
          subject={subject}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      minHeight: 44,
      paddingVertical: spacing.xs,
    },
    pressed: { opacity: 0.6 },
    text: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
  })
);
