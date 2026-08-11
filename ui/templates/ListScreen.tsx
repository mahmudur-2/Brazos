import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SearchBar, SegmentedTabs } from '../primitives';
import { colors, layout, spacing } from '../tokens';
import { ScreenStateView, isReady, type ScreenState } from './ScreenStates';

/**
 * The configurable browse/list template (§I): header, optional search,
 * optional tabs, pull-to-refresh, and the five built-in states.
 *
 * FlatList rather than a ScrollView of mapped rows, always — §I's Phase 8 DoD
 * calls for "smooth scroll on low-end Android (virtualized lists)", and a
 * template that quietly rendered every row would make that impossible to
 * achieve later without rewriting each screen.
 *
 * Bottom padding clears the floating nav (§I's 68pt rule) rather than each
 * screen remembering to, and `edges` stays top-only inside the tabs so the
 * bottom inset is not reserved twice (CLAUDE.md; the exact bug f3e75d0 fixed).
 */

type ListScreenProps<T> = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Pinned to the far edge of the header — a sort or filter control. */
  headerRight?: ReactNode;

  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;

  /** Pass all three to show the search field. */
  searchValue?: string;
  onSearchChange?: (next: string) => void;
  searchPlaceholder?: string;

  /** Pass both to show the segmented tabs. */
  tabs?: readonly { label: string; value: string }[];
  activeTab?: string;
  onTabChange?: (value: string) => void;

  /** Filter chips, a banner — anything between the controls and the list. */
  listHeader?: ReactNode;

  onRefresh?: () => void;
  refreshing?: boolean;

  state?: ScreenState;
  insideTabs?: boolean;
};

export function ListScreen<T>({
  title,
  subtitle,
  onBack,
  headerRight,
  data,
  renderItem,
  keyExtractor,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  tabs,
  activeTab,
  onTabChange,
  listHeader,
  onRefresh,
  refreshing = false,
  state,
  insideTabs = true,
}: ListScreenProps<T>) {
  const showSearch = typeof searchValue === 'string' && Boolean(onSearchChange);
  const showTabs = Boolean(tabs && tabs.length > 0 && activeTab && onTabChange);

  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} right={headerRight} />

      {showSearch || showTabs ? (
        <View style={styles.controls}>
          {showSearch ? (
            <SearchBar
              value={searchValue as string}
              onChangeText={onSearchChange as (next: string) => void}
              placeholder={searchPlaceholder}
            />
          ) : null}
          {showTabs ? (
            <SegmentedTabs
              options={tabs as { label: string; value: string }[]}
              value={activeTab as string}
              onChange={onTabChange as (value: string) => void}
            />
          ) : null}
        </View>
      ) : null}

      {!isReady(state) ? (
        <ScreenStateView state={state as Exclude<ScreenState, { kind: 'ready' }>} />
      ) : (
        <FlatList
          data={data as T[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader ? <View style={styles.header}>{listHeader}</View> : null}
          contentContainerStyle={[
            styles.content,
            insideTabs && { paddingBottom: layout.floatingNavClearance + spacing.lg },
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.forest}
                colors={[colors.forest]}
              />
            ) : undefined
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  controls: {
    gap: spacing.md,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.md,
  },
  header: {
    paddingBottom: spacing.md,
  },
  content: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.xs,
    gap: layout.cardGap,
    // flexGrow so an empty list's own empty component (if a caller passes one)
    // can still fill the screen rather than hugging the top.
    flexGrow: 1,
  },
});
