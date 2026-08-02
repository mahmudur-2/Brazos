import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { useJobOwnerActions } from '../hooks/useJobOwnerActions';
import { colors, spacing } from '../lib/theme';

type JobOwnerActionsProps = {
  jobId: string;
  posterId: string;
  status: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * "Edit job" / "Delete job" — shown only to the job's poster, only while
 * it's still open, and only while it has zero bids. Renders nothing
 * otherwise (hidden entirely, not disabled) so it's safe to drop into any
 * job-detail screen unconditionally. See useJobOwnerActions for the
 * eligibility rule and actions themselves.
 *
 * Styled to sit INSIDE the job's detail card (hairline divider above,
 * shorter buttons) rather than float as its own block below it, so the card
 * reads as one component.
 */
export function JobOwnerActions({ jobId, posterId, status, style }: JobOwnerActionsProps) {
  const {
    canManage,
    deleting,
    onEdit,
    onDelete,
    deleteDialogVisible,
    confirmDelete,
    cancelDelete,
  } = useJobOwnerActions(jobId, posterId, status);

  if (!canManage) return null;

  return (
    <View style={[styles.row, style]}>
      <Button
        title="Edit job"
        variant="secondary"
        onPress={onEdit}
        disabled={deleting}
        style={styles.btn}
      />
      <Button
        title="Delete job"
        variant="secondary"
        onPress={onDelete}
        loading={deleting}
        disabled={deleting}
        palette={{ ...colors, primary: colors.danger, border: colors.danger }}
        style={styles.btn}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete this job?"
        message="This cannot be undone."
        confirmText="Delete job"
        cancelText="Cancel"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: {
    flex: 1,
    height: 44,
  },
});
