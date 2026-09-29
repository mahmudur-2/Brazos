import { useRef, useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from './Chip';
import { PickerPopover, type PopoverAnchor } from './PickerPopover';
import { useModalPresence } from '../hooks/useModalPresence';
import {
  DISTANCE_CUSTOM_VALUES,
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
  /** 2026-09-26 (the refresh, audit M-39): one more chip at the row's end —
   *  Available Jobs puts "Filters" here, mid-screen where the thumb is, as a
   *  duplicate of the header's icon. */
  trailing?: ReactNode;
};

/**
 * The 4D-2 distance filter as a single-select chip row — the same control on
 * the worker map and the worker results list, so one persisted selection
 * (lib/discoveryFilterStorage.ts) means one thing everywhere it appears.
 *
 * 2026-09-28 (LUX-LIST-64 #64, audit M-25) — THE ONE RADIUS CONTROL on the job
 * list: the Filters sheet there carries no Distance row any more, so this row
 * carries its CUSTOM choice too — the sheet's own ruled list
 * (DISTANCE_CUSTOM_VALUES), in the same checkmark popup, opening under the
 * chip. Once a custom value is chosen, the chip wears it ("35 mi").
 */
export function DistanceChips({ value, onChange, includeAny = true, trailing }: DistanceChipsProps) {
  const styles = stylesFor();
  const customRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  // #64 (M-31): the popup's Modal reports itself to the one confirm engine.
  useModalPresence(anchor !== null, false);
  const options: (DistanceFilterMiles | null)[] = includeAny
    ? [null, ...DISTANCE_FILTER_OPTIONS]
    : [...DISTANCE_FILTER_OPTIONS];
  const isPreset = value === null || (DISTANCE_FILTER_OPTIONS as readonly number[]).includes(value);

  return (
    <>
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
        <View ref={customRef} collapsable={false}>
          <Chip
            label={isPreset ? 'Custom' : distanceChipLabel(value)}
            variant="filter"
            selected={!isPreset}
            // A door to the list until a custom value is chosen; then a choice.
            check={!isPreset}
            onPress={() =>
              customRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))
            }
            style={styles.chip}
            accessibilityLabel={isPreset ? 'Choose a custom distance' : `Custom distance, ${distanceChipLabel(value)}`}
          />
        </View>
        {trailing}
      </ScrollView>
      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        onRequestClose={() => setAnchor(null)}
        statusBarTranslucent
      >
        <PickerPopover<number>
          visible={anchor !== null}
          anchor={anchor}
          onClose={() => setAnchor(null)}
          options={DISTANCE_CUSTOM_VALUES.map((miles) => ({ value: miles, label: distanceChipLabel(miles) }))}
          value={value}
          onSelect={(miles) => onChange(miles)}
          direction="down"
          align="left"
          accessibilityLabel="Custom distance"
        />
      </Modal>
    </>
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
