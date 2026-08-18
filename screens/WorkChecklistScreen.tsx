import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../ui/templates/FormScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import {
  addChecklistItem,
  fetchChecklist,
  removeChecklistItem,
  setChecklistItemDone,
  type ChecklistItem,
} from '../lib/checklist';
import type { MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Screen 57 — Work checklist (Phase 6, worker side).
 *
 * The assigned worker's own work plan for one job: add steps, check them off,
 * remove mistakes. RLS is the authority — writes only by the assigned worker
 * and only while the job is assigned/in_progress; the customer can read the
 * list from their side. Once the job completes, the list stays visible as a
 * record and the database (not just this screen) refuses further edits.
 */
export function WorkChecklistScreen() {
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'WorkChecklist'>>();
  const { user } = useAuth();
  const { job, loading, error, refresh } = useJob(params.jobId);

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  // A failed list fetch must not masquerade as "No steps yet" (hardening A6).
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const loadItems = useCallback(async () => {
    const { data, error: listError } = await fetchChecklist(params.jobId);
    if (listError) setItemsError(userMessage(listError));
    else {
      setItems(data);
      setItemsError(null);
    }
    setItemsLoaded(true);
  }, [params.jobId]);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems])
  );

  const isWorker = !!user && !!job && job.assigned_worker_id === user.id;
  const editable = isWorker && (job?.status === 'assigned' || job?.status === 'in_progress');
  const doneCount = items.filter((i) => i.done).length;

  const state: ScreenState = loading || !itemsLoaded
    ? { kind: 'loading', variant: 'spinner' }
    : error
      ? { kind: 'error', message: error, onRetry: () => void refresh() }
      : itemsError
        ? { kind: 'error', message: itemsError, onRetry: () => void loadItems() }
        : !job
        ? {
            kind: 'empty',
            title: 'This job is no longer available',
            body: 'It may have been deleted or you may no longer have access to it.',
            actionLabel: 'Back',
            onAction: goBackOrHome,
          }
        : !isWorker
          ? {
              kind: 'permissionDenied',
              title: 'Only the assigned worker edits this checklist',
              body: 'The customer can follow along from their job screen.',
            }
          : { kind: 'ready' };

  async function addItem() {
    const label = draft.trim();
    if (!label || adding) return;
    setAdding(true);
    const nextPosition = items.length === 0 ? 0 : Math.max(...items.map((i) => i.position)) + 1;
    const { data, error: addError } = await addChecklistItem(params.jobId, label, nextPosition);
    setAdding(false);
    if (addError || !data) {
      // The input keeps the typed text — a failed save never costs the entry.
      await alertAsync(
        'Could not add the step',
        userMessage(addError, 'Check your connection and try again.')
      );
      return;
    }
    setDraft('');
    setItems((prev) => [...prev, data]);
  }

  async function toggleItem(item: ChecklistItem) {
    if (busyId) return;
    setBusyId(item.id);
    // Optimistic flip; the server result (or a failure) settles it.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: !item.done } : i))
    );
    const { data, error: toggleError } = await setChecklistItemDone(item.id, !item.done);
    setBusyId(null);
    if (toggleError || !data) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      await alertAsync(
        'Could not update the step',
        userMessage(toggleError, 'Check your connection and try again.')
      );
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
  }

  async function deleteItem(item: ChecklistItem) {
    if (busyId) return;
    const sure = await confirmAsync({
      title: 'Remove this step?',
      message: `“${item.label}” will be removed from the checklist.`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!sure) return;
    setBusyId(item.id);
    const { error: deleteError } = await removeChecklistItem(item.id);
    setBusyId(null);
    if (deleteError) {
      await alertAsync('Could not remove the step', userMessage(deleteError));
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <FormScreen
      title="Work checklist"
      subtitle={job?.title}
      onBack={goBackOrHome}
      state={state}
      submitLabel={editable ? 'Add step' : undefined}
      onSubmit={editable ? addItem : undefined}
      submitDisabled={!draft.trim()}
      submitLoading={adding}
      footerNote={
        editable ? (
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Mow the back yard"
            placeholderTextColor={colors.textSubtle}
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={addItem}
            accessibilityLabel="New checklist step"
          />
        ) : undefined
      }
    >
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {items.length === 0
            ? 'No steps yet'
            : `${doneCount} of ${items.length} done`}
        </Text>
        {!editable && job ? (
          <Text style={styles.readOnlyTag}>
            {job.status === 'completed' ? 'Job completed — record only' : 'Read only'}
          </Text>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="list-outline" size={26} color={colors.emerald} />
          <Text style={styles.emptyTitle}>Plan the job in steps</Text>
          <Text style={styles.emptyText}>
            Break the work into steps and check them off as you go — the
            customer can follow your progress.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Pressable
                style={styles.itemMain}
                onPress={editable ? () => toggleItem(item) : undefined}
                disabled={!editable || busyId === item.id}
                accessibilityRole={editable ? 'checkbox' : 'text'}
                accessibilityState={editable ? { checked: item.done } : undefined}
                accessibilityLabel={item.label}
              >
                <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                  {item.done ? (
                    <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                  ) : null}
                </View>
                <Text
                  style={[styles.itemLabel, item.done && styles.itemLabelDone]}
                  numberOfLines={3}
                >
                  {item.label}
                </Text>
              </Pressable>
              {editable ? (
                <Pressable
                  onPress={() => deleteItem(item)}
                  disabled={busyId === item.id}
                  hitSlop={8}
                  style={styles.itemDelete}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.label}`}
                >
                  <Ionicons name="close" size={18} color={colors.textSubtle} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  readOnlyTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // Comfortable touch target for the toggle without inflating the row art.
    minHeight: 32,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    borderColor: colors.emerald,
    backgroundColor: colors.emerald,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 21,
  },
  itemLabelDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  itemDelete: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
