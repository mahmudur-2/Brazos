import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useModalPresence } from '../hooks/useModalPresence';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MENU_MOTION_MS, MENU_MOTION_OUT_MS } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { PANEL_SCALE_FROM, panelTravelFor } from './DropMenu.shared';
import type { PopoverAnchor } from './PickerPopover';
import { Surface } from '../ui/primitives/Surface';
import { Divider } from '../ui/primitives/Divider';
import { paneFills, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type GlassDropdownItem = {
  key: string;
  label: string;
  icon: IoniconName;
  /** Drawn in the dropdown's red. */
  destructive?: boolean;
  /**
   * FIX-RUN F11 — shown, honestly, but not available (Post a job's "Add a video" once the one
   * video is in): drawn at half strength and it does not fire.
   */
  disabled?: boolean;
  onPress: () => void;
};

/**
 * What opens the menu, and under what: `measure` finds the control (the row's
 * •••) in window points when the menu opens; `delayMs` waits that long first —
 * a row swiped open is still springing shut when its More tile is tapped.
 *
 * `width` (FIX-RUN F11) fixes the panel's width and CENTRES it under the control, shifted only
 * as far as the page gutter needs — Post a job's add menu under its + (LUX-LIST-64 #39). Without
 * it the panel is as wide as its longest row and its right edge sits 8pt from the screen's.
 */
export type GlassDropdownRequest = {
  key: string;
  measure: (done: (anchor: PopoverAnchor) => void) => void;
  delayMs?: number;
  width?: number;
};

/** refs/inbox-clean-list.html `.menu` / `.mi`: 40pt rows inside 5 of padding. */
const ROW_HEIGHT = 40;
const PANEL_PADDING = 5;
/** A group rule: 1pt with 4 above and below. */
const RULE_SPACE = 9;
/** The right edge 8pt from the screen's; the top 10 under the control. */
const SCREEN_EDGE = 8;
const ANCHOR_GAP = 10;
const RADIUS = 18;
/** A centred panel (`request.width`) keeps the page gutter, as #39's add menu did. */
const CENTRED_GUTTER = 20;

/**
 * 2026-09-28 (LUX-LIST-64 #53) — THE ••• GLASS DROPDOWN, right under the control
 * that opened it (docs/mockups/html/refs/inbox-clean-list.html): only as wide as
 * its longest row (11 either side), its right edge 8pt from the screen's, groups
 * split by a faint rule, the red rows in the dropdown's own red. The glass is
 * the `dropdown` material — the 160° gradient over a blur in dark, the frosted
 * white in light, the mint rim, the white top edge and the deep shadow — worn
 * through Surface like every other pane. It opens the way the app's other
 * panels do (a short drop and scale on the native driver; Reduce Motion: at
 * once) and drops UP instead when the screen has no room under the control.
 * Tapping outside closes it; a row closes it, then acts.
 */
export function GlassDropdown({
  request,
  groups,
  onClose,
  onClosed,
  accessibilityLabel,
}: {
  request: GlassDropdownRequest | null;
  groups: GlassDropdownItem[][];
  onClose: () => void;
  /**
   * FIX-RUN F11 — the panel has gone and its Modal with it. A row that presents something of
   * its own (the photo library) waits for this, because iOS dismissing a Modal also dismisses
   * whatever was presented over it.
   */
  onClosed?: () => void;
  accessibilityLabel: string;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const [fixedWidth, setFixedWidth] = useState<number | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const requestKey = request?.key ?? null;
  const requestRef = useRef(request);
  requestRef.current = request;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const wasMounted = useRef(false);

  // A request finds its control (after its delay), then the panel comes up.
  useEffect(() => {
    if (!requestKey) return;
    let alive = true;
    const open = () =>
      requestRef.current?.measure((next) => {
        if (!alive) return;
        setAnchor(next);
        setFixedWidth(requestRef.current?.width);
        setMounted(true);
      });
    const delay = requestRef.current?.delayMs ?? 0;
    const timer = delay > 0 ? setTimeout(open, delay) : null;
    if (!timer) open();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestKey]);

  const shown = mounted && requestKey != null;
  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.timing(progress, {
      toValue: shown ? 1 : 0,
      duration: reducedMotion === false ? (shown ? MENU_MOTION_MS : MENU_MOTION_OUT_MS) : 0,
      easing: shown ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !shown) {
        setMounted(false);
        setAnchor(null);
      }
    });
    return () => animation.stop();
  }, [mounted, progress, reducedMotion, shown]);

  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(mounted && !!anchor, false);

  // A passive effect, so it runs after the presence report above has recorded the close.
  useEffect(() => {
    if (mounted) {
      wasMounted.current = true;
      return;
    }
    if (!wasMounted.current) return;
    wasMounted.current = false;
    onClosedRef.current?.();
  }, [mounted]);

  if (!mounted || !anchor) return null;

  const rows = groups.reduce((sum, group) => sum + group.length, 0);
  const rules = Math.max(0, groups.filter((group) => group.length > 0).length - 1);
  const height = rows * ROW_HEIGHT + rules * RULE_SPACE + PANEL_PADDING * 2 + 2;
  const below = anchor.y + anchor.height + ANCHOR_GAP;
  const direction: 'down' | 'up' =
    below + height <= window.height - insets.bottom - SCREEN_EDGE ? 'down' : 'up';
  const top =
    direction === 'down'
      ? below
      : Math.max(insets.top + SCREEN_EDGE, anchor.y - ANCHOR_GAP - height);

  const panelMotion = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [panelTravelFor(direction), 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [PANEL_SCALE_FROM, 1] }) },
    ],
  };
  const pressedFill = withAlpha(isDark ? colors.emeraldBright : colors.emerald, isDark ? 0.1 : 0.06);
  const rule = withAlpha(colors.dropRule, 0.12);
  const place =
    fixedWidth != null
      ? {
          top,
          width: fixedWidth,
          left: Math.max(
            CENTRED_GUTTER,
            Math.min(anchor.x + anchor.width / 2 - fixedWidth / 2, window.width - CENTRED_GUTTER - fixedWidth)
          ),
        }
      : { top, right: SCREEN_EDGE + insets.right };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <Animated.View
        style={[styles.frame, place, panelMotion]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <Surface material="dropdown" fill={paneFills.dropdown} radius={RADIUS} style={styles.panel}>
          {groups
            .filter((group) => group.length > 0)
            .map((group, index) => (
              <View key={group[0].key}>
                {index > 0 ? <Divider thickness={1} color={rule} style={styles.rule} /> : null}
                {group.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      onClose();
                      item.onPress();
                    }}
                    disabled={item.disabled}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: pressedFill },
                      item.disabled && styles.rowOff,
                    ]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={item.label}
                    accessibilityState={item.disabled ? { disabled: true } : undefined}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={item.destructive ? colors.dropDanger : colors.dropGlyph}
                    />
                    <Text
                      style={[styles.label, item.destructive && { color: colors.dropDanger }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
        </Surface>
      </Animated.View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    frame: {
      position: 'absolute',
    },
    panel: {
      padding: PANEL_PADDING,
      borderRadius: RADIUS,
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 11,
      borderRadius: 12,
    },
    rowOff: {
      opacity: 0.5,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.ink,
    },
    // The Divider draws the 1 pt rule in the ruled colour; this is only where it sits.
    rule: {
      marginVertical: 4,
      marginHorizontal: 8,
    },
  })
);
