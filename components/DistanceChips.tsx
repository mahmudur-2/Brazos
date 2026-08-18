import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from './Chip';
import {
  DISTANCE_FILTER_OPTIONS,
  distanceChipLabel,
  type DistanceFilterMiles,
} from '../lib/discoveryFilter';
import { spacing } from '../lib/theme';

type DistanceChipsProps = {
  /** The applied filter; null = Any distance. */
  value: DistanceFilterMiles | null;
  onChange: (value: DistanceFilterMiles | null) => void;
  /** Radius-promise surfaces (WorkerResults' "nearby") always constrain by a
   *  radius, so they hide the Any chip; browse surfaces keep it. */
  includeAny?: boolean;
};

/**
 * The 4D-2 distance filter as a single-select chip row — the same control on
 * the worker map and the worker results list, so one persisted selection
 * (lib/discoveryFilterStorage.ts) means one thing everywhere it appears.
 */
export function DistanceChips({ value, onChange, includeAny = true }: DistanceChipsProps) {
  const options: (DistanceFilterMiles | null)[] = includeAny
    ? [null, ...DISTANCE_FILTER_OPTIONS]
    : [...DISTANCE_FILTER_OPTIONS];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {options.map((option) => (
        <Chip
          key={option === null ? 'any' : String(option)}
          label={distanceChipLabel(option)}
          variant="filter"
          selected={option === value}
          onPress={() => onChange(option)}
          accessibilityLabel={
            option === null ? 'Show jobs at any distance' : `Show jobs within ${option} miles`
          }
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
});
