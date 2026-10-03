import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FocusRing } from './FocusRing';
import { PickerPopover, type PickerOption, type PopoverAnchor } from './PickerPopover';
import { SegmentedControl } from './SegmentedControl';
import { FieldLabel } from './TextField';
import { useModalPresence } from '../hooks/useModalPresence';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { dollarsToCents, formatBudget } from '../lib/jobs';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import {
  budgetEditorCopy,
  priceFieldLabel,
  PRICING_MODE_OPTIONS,
  type PricingMode,
} from '../lib/pricingMode';
import { moneyCeilingError } from '../lib/validation';
import { radius, spacing, themedStyles, touchSlop, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** #37 — the switch's glyphs: people for bids, a price tag for a set price. */
const MODE_ICONS: Record<PricingMode, { on: IoniconName; off: IoniconName }> = {
  open_bids: { on: 'people', off: 'people-outline' },
  posted_price: { on: 'pricetag', off: 'pricetag-outline' },
};

/** The ready amounts, in dollars — the approved list's own (refs/price-dropdown). */
export const PRICE_PRESETS = [50, 100, 150, 200, 300, 500] as const;

const FIELD_HEIGHT = 52;
const ROW_HEIGHT = 46;
const NONE = 'none';
const CUSTOM = 'custom';
/** PickerPopover's own gap under its pill. Its padding and rim (`listChrome`)
 *  and the list's clearance from the band's edges (`bandMargin` — the header
 *  above, the bar below) are spacing, read at use time (T1). */
const LIST_GAP = 6;
/** Never fewer rows than this, however tight the band. */
const MIN_ROWS = 3;
/** An animated scroll's settle before the field is measured again. */
const SCROLL_SETTLE_MS = 320;
const JUMP_SETTLE_MS = 60;

/** `open()` — from elsewhere on the page too (the summary's BUDGET). */
export type PriceDropdownHandle = { open: () => void };

/**
 * The scrolling page the field sits in: its visible band in window points (under
 * the header, above the posting bar), how far it is scrolled, and a way to scroll
 * it — so the list can always DROP DOWN with room under it (#36), whether the
 * field was tapped where it stands or the summary's BUDGET sent the page up to it
 * (#38, "BUDGET jumps up and opens the dropdown").
 */
export type PriceViewport = {
  measure: (done: (band: { top: number; bottom: number; scrollY: number }) => void) => void;
  scrollTo: (y: number) => void;
};

/**
 * 2026-09-28 (LUX-LIST-64 #36, #37) — THE REVIEW STEP'S PRICE, right under the
 * step bars. The "Ask for bids | Set a price" switch (now with its two glyphs,
 * filled while chosen) and ONE field under it that says the amount and opens a
 * tick list — the Filters' PickerPopover, in the Lux menu glass — instead of the
 * old pencil and its budget dialog.
 *
 * Ask for bids starts on "No maximum"; the list offers "No maximum", the ready
 * maximums and "Enter your own amount", which turns the field into a $ entry
 * with a Done pill and the number pad → "Up to $X". Set a price starts EMPTY
 * ("Choose a price") and Publish waits until one is picked or typed. The flow is
 * the approved Price dropdown file's (.shots/refresh/refs/price-dropdown.html);
 * its look is not taken — the colours are the app's.
 *
 * The amount is the screen's ONE typed figure (`budgetMax`, dollars as text), in
 * whichever column its mode means; the ceiling refuses in writing here, through
 * the shared rule (lib/validation), before anything reaches createJob.
 */
export const PriceDropdown = forwardRef<
  PriceDropdownHandle,
  {
    mode: PricingMode;
    /** Dollars as typed, '' for none. */
    amount: string;
    onModeChange: (mode: PricingMode) => void;
    onAmountChange: (amount: string) => void;
    /** True while the own-amount entry is open — the screen's `editingBudget`. */
    onEditingChange?: (editing: boolean) => void;
    /** Without one, the list measures against the window. */
    viewport?: PriceViewport;
    palette: ColorPalette;
  }
>(function PriceDropdown({ mode, amount, onModeChange, onAmountChange, onEditingChange, viewport, palette }, ref) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const sectionRef = useRef<View>(null);
  const fieldRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const [listRows, setListRows] = useState(MIN_ROWS);
  const [listOpen, setListOpen] = useState(false);
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(listOpen, false);
  const [entering, setEntering] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const turn = useRef(new Animated.Value(0)).current;

  const posted = mode === 'posted_price';
  const cents = dollarsToCents(amount);
  const validCents = cents != null && !Number.isNaN(cents) ? cents : null;
  const copy = budgetEditorCopy(mode);

  // The chevron turns over while the list is open — a transform on the native driver.
  useEffect(() => {
    Animated.timing(turn, {
      toValue: listOpen ? 1 : 0,
      duration: reducedMotion === false ? 180 : 0,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [listOpen, reducedMotion, turn]);

  useEffect(() => {
    onEditingChange?.(entering);
  }, [entering, onEditingChange]);

  /**
   * The list always DROPS DOWN (#36). When the band has no room under the field
   * for the whole list, the page scrolls first — by just enough, never so far
   * that the field's label slips under the header — and the field is measured
   * again once the scroll has settled. A field above the band (the summary's
   * BUDGET, far down the page) is brought down under the header the same way,
   * label and all. Whatever room is left sets how many rows show; the rest
   * scroll inside the list.
   */
  function openList(settled = false) {
    if (entering) return;
    const bandMargin = spacing.md;
    sectionRef.current?.measureInWindow((_sx, sectionTop) => fieldRef.current?.measureInWindow((x, y, width, height) => {
      const place = (bottom: number) => {
        const room = bottom - bandMargin - (y + height + LIST_GAP) - listChrome;
        setListRows(Math.max(MIN_ROWS, Math.min(options.length, Math.floor(room / ROW_HEIGHT))));
        setAnchor({ x, y, width, height });
        setListOpen(true);
      };
      if (!viewport) {
        place(window.height - insets.bottom);
        return;
      }
      viewport.measure(({ top, bottom, scrollY }) => {
        if (!settled) {
          const highest = sectionTop - (top + bandMargin);
          const overflow = y + height + LIST_GAP + fullListHeight - (bottom - bandMargin);
          const dy = highest < 0 ? highest : overflow > 0 ? Math.min(overflow, highest) : 0;
          if (Math.abs(dy) > 1) {
            viewport.scrollTo(Math.max(0, scrollY + dy));
            setTimeout(() => openList(true), reducedMotion === false ? SCROLL_SETTLE_MS : JUMP_SETTLE_MS);
            return;
          }
        }
        place(bottom);
      });
    }));
  }

  useImperativeHandle(ref, () => ({ open: () => openList() }));

  function startEntry() {
    setListOpen(false);
    setDraft(validCents != null ? String(Math.round(validCents / 100)) : '');
    setProblem(null);
    setEntering(true);
    // The pad rises with the field that asks for it.
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function finishEntry() {
    const text = draft.trim();
    if (!text) {
      if (copy.allowEmpty) {
        onAmountChange('');
        setEntering(false);
        return;
      }
      setProblem('Enter an amount.');
      return;
    }
    const typed = dollarsToCents(text);
    if (typed == null || Number.isNaN(typed) || typed <= 0) {
      setProblem('Enter an amount above $0.');
      return;
    }
    const ceiling = moneyCeilingError(typed);
    if (ceiling) {
      setProblem(ceiling);
      return;
    }
    onAmountChange(String(typed / 100));
    setEntering(false);
  }

  // The list: "No maximum" first in open bids, the ready amounts, the amount
  // already chosen if it is not one of them, then the way to type one.
  const presets: number[] = [...PRICE_PRESETS];
  const chosenDollars = validCents != null ? validCents / 100 : null;
  if (chosenDollars != null && !presets.includes(chosenDollars)) {
    presets.push(chosenDollars);
    presets.sort((a, b) => a - b);
  }
  const options: PickerOption<string>[] = [
    ...(posted ? [] : [{ value: NONE, label: 'No maximum' }]),
    ...presets.map((dollars) => ({ value: String(dollars), label: formatBudget(dollars * 100) })),
    { value: CUSTOM, label: 'Enter your own amount', icon: 'pencil' as const, accent: true },
  ];
  const current = chosenDollars != null ? String(chosenDollars) : posted ? null : NONE;
  const listChrome = spacing.xs * 2 + 2;
  const fullListHeight = options.length * ROW_HEIGHT + listChrome;

  const helper = problem
    ? problem
    : entering
      ? posted
        ? 'Type your price, then tap Done.'
        : 'Type your max, then tap Done.'
      : posted
        ? validCents != null
          ? copy.message
          : 'Pick a price to publish.'
        : validCents != null
          ? 'Workers can bid up to this amount.'
          : 'Workers will propose a price.';

  const well = {
    backgroundColor: isDark ? withAlpha(colors.white, 0.06) : colors.surface,
    borderColor: problem ? colors.danger : colors.border,
  };

  return (
    <View style={styles.wrap}>
      <SegmentedControl<PricingMode>
        options={PRICING_MODE_OPTIONS.map((option) => ({ ...option, icon: MODE_ICONS[option.value] }))}
        value={mode}
        onChange={(next) => {
          if (next === mode) return;
          // Each side starts from its own empty state: "No maximum", "Choose a price".
          onAmountChange('');
          setEntering(false);
          setProblem(null);
          onModeChange(next);
        }}
        palette={palette}
      />

      <View ref={sectionRef} collapsable={false} style={styles.field}>
        <FieldLabel palette={palette} tone="gold">{priceFieldLabel(mode)}</FieldLabel>
        {entering ? (
          <View style={[styles.box, styles.entry, well]}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={(text) => {
                setDraft(text.replace(/[^0-9.]/g, ''));
                if (problem) setProblem(null);
              }}
              keyboardType="number-pad"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              returnKeyType="done"
              onSubmitEditing={finishEntry}
              placeholder={posted ? 'Your price' : 'Your max'}
              placeholderTextColor={colors.textSubtle}
              accessibilityLabel={copy.fieldLabel}
              style={styles.entryInput}
            />
            <Pressable
              onPress={finishEntry}
              style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
              hitSlop={touchSlop(38)}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
            <FocusRing focused color={problem ? colors.danger : colors.emerald} radius={FIELD_HEIGHT / 2} />
          </View>
        ) : (
          <Pressable
            ref={fieldRef}
            onPress={() => openList()}
            style={({ pressed }) => [styles.box, well, pressed && styles.boxPressed]}
            accessibilityRole="button"
            // The E2E money walk opens the amount by this label (.maestro/money-walk.yml).
            accessibilityLabel="Edit budget"
            accessibilityHint={
              validCents != null
                ? `${priceFieldLabel(mode)}: ${posted ? '' : 'up to '}${formatBudget(validCents)}`
                : posted
                  ? 'No price chosen yet'
                  : 'No maximum'
            }
            accessibilityState={{ expanded: listOpen }}
          >
            {validCents != null ? (
              <Text style={styles.value} numberOfLines={1}>
                {posted ? null : <Text style={styles.upTo}>Up to </Text>}
                <Text style={styles.money}>{formatBudget(validCents)}</Text>
              </Text>
            ) : (
              <Text style={[styles.value, posted && styles.placeholder]} numberOfLines={1}>
                {posted ? 'Choose a price' : 'No maximum'}
              </Text>
            )}
            <Animated.View
              style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
            >
              <Ionicons name="chevron-down" size={22} color={colors.emerald} />
            </Animated.View>
            <FocusRing focused={listOpen} color={colors.emerald} radius={FIELD_HEIGHT / 2} />
          </Pressable>
        )}
        <Text style={[styles.helper, problem && styles.helperProblem]} accessibilityLiveRegion="polite">
          {helper}
        </Text>
      </View>

      <Modal visible={listOpen} transparent animationType="none" onRequestClose={() => setListOpen(false)} statusBarTranslucent>
        <PickerPopover<string>
          visible={listOpen}
          anchor={anchor}
          onClose={() => setListOpen(false)}
          options={options}
          value={current}
          onSelect={(value) => {
            if (value === CUSTOM) {
              startEntry();
              return;
            }
            onAmountChange(value === NONE ? '' : value);
          }}
          direction="down"
          align="left"
          width={anchor?.width}
          rowHeight={ROW_HEIGHT}
          visibleRows={listRows}
          contentAlign="start"
          accessibilityLabel={posted ? 'Choose your price' : 'Choose a maximum'}
        />
      </Modal>
    </View>
  );
});

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.lg,
    },
    field: {
      gap: spacing.sm,
    },
    box: {
      height: FIELD_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingLeft: 20,
      paddingRight: 18,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    boxPressed: {
      transform: [{ scale: 0.99 }],
    },
    entry: {
      justifyContent: 'flex-start',
      gap: spacing.xs + 2,
      paddingRight: 6,
    },
    value: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.ink,
    },
    placeholder: {
      fontWeight: '500',
      color: colors.textMuted,
    },
    upTo: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textMuted,
    },
    // #40 — money is white (dark) / the dark ink (light): the `money` role.
    money: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.money,
    },
    dollar: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.money,
    },
    entryInput: {
      flex: 1,
      minWidth: 0,
      padding: 0,
      fontSize: 18,
      fontWeight: '700',
      color: colors.money,
    },
    done: {
      height: 38,
      paddingHorizontal: 18,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    donePressed: {
      transform: [{ scale: 0.96 }],
    },
    doneText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    helper: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    helperProblem: {
      color: colors.danger,
    },
  })
);
