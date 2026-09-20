import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from './Chip';
import {
  DISTANCE_FILTER_OPTIONS,
  distanceChipLabel,
  type DistanceFilterMiles,
} from '../lib/discoveryFilter';
import { metricStyles, spacing } from '../lib/theme';

/**
 * 2026-09-20 (sitting 2) — WHOLE-NUMBER HEIGHTS, so nothing rounds away.
 * The phone showed the chosen chip's gold outline cut flat along its bottom
 * on Available Jobs: the row sized itself from the chips' content (a 14pt
 * line, 10pt of padding either side, the rim), which lands on a fraction,
 * and the row's frame rounded down — clipping the last pixel row of every
 * chip, visible only on the one whose outline is drawn. The chips are
 * exactly 44 (the primitive's touch minimum, made explicit here), the row
 * exactly 44 + the 8pt it pads above and below, and the row never shrinks
 * in its column.
 */
const CHIP_HEIGHT = 44;
/** Read at use time, never frozen (D7): the row is the chip plus its padding. */
const rowHeight = () => CHIP_HEIGHT + spacing.sm * 2;

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
  const styles = stylesFor();
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
          style={styles.chip}
          accessibilityLabel={
            option === null ? 'Show jobs at any distance' : `Show jobs within ${option} miles`
          }
        />
      ))}
    </ScrollView>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  row: {
    flexGrow: 0,
    flexShrink: 0,
    height: rowHeight(),
  },
  content: {
    alignItems: 'center',
    height: rowHeight(),
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    height: CHIP_HEIGHT,
  },
}));
