import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useModalPresence } from '../hooks/useModalPresence';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { flagEmoji, searchCountries, type Country } from '../lib/countries';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { MENU_MOTION_MS, MENU_MOTION_OUT_MS } from '../lib/motion120';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  wells,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { PANEL_SCALE_FROM, panelTravelFor } from './DropMenu.shared';
import { FocusRing } from './FocusRing';
import { Surface } from '../ui/primitives/Surface';
import type { PopoverAnchor } from './PickerPopover';

/** ~240 wide: most country names fit whole; the long ones end in "…". */
const PANEL_WIDTH = 240;
/** The Filters popover's row (PickerPopover): 44pt, five showing. */
const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
/** "Select country" and the search well above the rows. */
const HEAD_HEIGHT = 86;
const SEARCH_HEIGHT = 36;
/** Between the pill and the panel, and the panel's nearest approach to an edge. */
const ANCHOR_GAP = 6;
const EDGE_MARGIN = 12;
/** The tick's zone at the row's left edge (PickerPopover's own numbers). */
const TICK_INSET = 10;
const TICK_SIZE = 18;
const TICK_ZONE = TICK_INSET + TICK_SIZE;
const DIVIDER_ALPHA_DARK = 0.1;
const DIVIDER_ALPHA_LIGHT = 0.07;

type CountryPickerProps = {
  visible: boolean;
  /** The country pill, in window points — from its `measureInWindow`. */
  anchor: PopoverAnchor | null;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
};

/**
 * 2026-09-28 (LUX-LIST-64 #5) — THE COUNTRY-CODE DROPDOWN, built on the Filters'
 * system instead of a tall light sheet.
 *
 * It opens right under the "US +1" pill, its left edge on the pill's, floating
 * over the fields below: ~240 wide, five rows showing and the rest scrolling
 * inside, "Select country" and a "Country or code" search on top, each row a
 * flag, the country's name (ending in "…" when long) and its +code, the chosen
 * one ticked in the mint. No X — a tap anywhere outside closes it. When the
 * keyboard leaves no room below the pill it opens UPWARD instead. It wears the
 * Filters popover's material — the menu glass in dark, the flat white panel in
 * light — its rows, its dividers and its motion (the same travel, scale and
 * durations, on the native driver; Reduce Motion: it simply appears).
 *
 * Flags are emoji (lib/countries flagEmoji): real flags on the iPhone, the two
 * regional letters where a platform's font has no flags (Windows renders).
 */
export function CountryPicker({ visible, anchor, selected, onSelect, onClose }: CountryPickerProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList<Country>>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setQuery('');
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? MENU_MOTION_MS : MENU_MOTION_OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [progress, reducedMotion, visible]);

  // The keyboard decides whether there is room under the pill.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates.height)
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardHeight(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const results = useMemo(() => searchCountries(query), [query]);
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(mounted && !!anchor, false);

  if (!mounted || !anchor) return null;

  const rows = Math.max(1, Math.min(VISIBLE_ROWS, results.length));
  const listHeight = VISIBLE_ROWS * ROW_HEIGHT;
  const height = HEAD_HEIGHT + listHeight + spacing.xs;
  const width = Math.min(PANEL_WIDTH, window.width - EDGE_MARGIN * 2);
  const left = Math.max(EDGE_MARGIN, Math.min(anchor.x, window.width - width - EDGE_MARGIN));
  const below = anchor.y + anchor.height + ANCHOR_GAP;
  const floor = window.height - Math.max(keyboardHeight, insets.bottom) - EDGE_MARGIN;
  const opensUp = below + height > floor;
  const top = opensUp
    ? Math.max(insets.top + EDGE_MARGIN, anchor.y - ANCHOR_GAP - height)
    : below;

  const selectedIndex = results.findIndex((country) => country.code === selected.code);
  const initialIndex = selectedIndex < 0 ? 0 : Math.max(0, Math.min(selectedIndex - 1, results.length - rows));
  const divider = withAlpha(isDark ? colors.white : colors.ink, isDark ? DIVIDER_ALPHA_DARK : DIVIDER_ALPHA_LIGHT);
  const travel = panelTravelFor(opensUp ? 'up' : 'down');
  const panelStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [PANEL_SCALE_FROM, 1] }) },
    ],
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close country list"
      />
      <Animated.View
        style={[styles.panel, { left, top, width, height }, panelStyle]}
        accessibilityViewIsModal
        accessibilityLabel="Select country"
      >
        <Surface material="menu" radius={radius.lg} corners="all" style={styles.material}>
          <View style={styles.head}>
            <Text style={styles.title}>Select country</Text>
            <View
              style={[
                styles.search,
                isDark
                  ? {
                      backgroundColor: withAlpha(wells.field.ink, wells.field.inkAlpha),
                      borderColor: withAlpha(wells.field.rim, wells.field.rimAlpha),
                    }
                  : { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Ionicons name="search" size={16} color={colors.emerald} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Country or code"
                placeholderTextColor={colors.textSubtle}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={styles.searchInput}
                accessibilityLabel="Search countries by name or code"
              />
              <FocusRing focused={searchFocused} color={colors.emerald} radius={SEARCH_HEIGHT / 2} />
            </View>
          </View>
          <FlatList
            ref={listRef}
            data={results}
            keyExtractor={(country) => country.code}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            initialScrollIndex={query ? 0 : initialIndex}
            initialNumToRender={VISIBLE_ROWS + 4}
            keyboardShouldPersistTaps="handled"
            indicatorStyle={isDark ? 'white' : 'black'}
            onLayout={() => listRef.current?.flashScrollIndicators()}
            style={{ height: listHeight }}
            ListEmptyComponent={<Text style={styles.empty}>No country matches “{query.trim()}”.</Text>}
            renderItem={({ item, index }) => {
              const on = item.code === selected.code;
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && [styles.rowDivided, { borderTopColor: divider }],
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${item.name}, plus ${item.dial}`}
                >
                  <View style={styles.tick}>
                    {on ? <Ionicons name="checkmark" size={16} color={colors.emerald} /> : null}
                  </View>
                  <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                  <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.dial}>+{item.dial}</Text>
                </Pressable>
              );
            }}
          />
        </Surface>
      </Animated.View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      ...shadows.raised,
    },
    material: {
      flex: 1,
      overflow: 'hidden',
    },
    head: {
      height: HEAD_HEIGHT,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    title: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: colors.ink,
    },
    search: {
      height: SEARCH_HEIGHT,
      borderRadius: SEARCH_HEIGHT / 2,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      fontSize: 15,
      color: colors.ink,
      paddingVertical: 0,
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: TICK_ZONE + 2,
      paddingRight: spacing.md,
    },
    rowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowPressed: { backgroundColor: colors.primarySoft },
    tick: {
      position: 'absolute',
      left: TICK_INSET,
      top: 0,
      bottom: 0,
      width: TICK_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flag: {
      fontSize: 18,
      width: 24,
      textAlign: 'center',
      // A platform with no flag font shows the two letters: ink, not the default black.
      color: colors.ink,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      fontWeight: '500',
      color: colors.ink,
    },
    nameOn: {
      fontWeight: '600',
      color: colors.emerald,
    },
    dial: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },
    empty: {
      padding: spacing.md,
      fontSize: 14,
      color: colors.textMuted,
    },
  })
);
