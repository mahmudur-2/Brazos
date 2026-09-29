import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { useOverrideNumber, useOverrideValue } from '../lib/designOverrides';
import { Surface } from '../ui/primitives/Surface';

/**
 * EVERYTHING BOTH DROPMENU PATHS SHARE — which is everything except the four
 * lines that actually animate the panel.
 *
 * WHY THIS FILE EXISTS. `DropMenu.tsx` (core `Animated`) and
 * `DropMenu.motion120.tsx` (reanimated worklets) are two implementations of
 * one menu, chosen by capability at module load. If each carried its own
 * items, its own backdrop and its own stylesheet, the two binaries would drift
 * into two menus — different touch targets, different labels, a divider on one
 * and not the other — and the drift would be invisible until somebody held
 * both builds side by side. The boundary exists to make the two render the
 * SAME thing; that is only true if the thing is written once.
 *
 * So the split is: geometry, colour, items and dismissal live here, and each
 * sibling owns nothing but its animation driver.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type DropMenuItem = {
  key: string;
  label: string;
  icon?: IoniconName;
  onPress: () => void;
  /** Red label + glyph. The item still confirms wherever the action does. */
  destructive?: boolean;
  disabled?: boolean;
};

export type DropMenuProps = {
  visible: boolean;
  onClose: () => void;
  items: DropMenuItem[];
  /** 'up' grows out of the top of its anchor (a composer's [ + ]); 'down' out
   *  of the bottom (a header's overflow dots). */
  direction?: 'up' | 'down';
  /** Which edge of the anchor's row the panel pins to. */
  align?: 'left' | 'right';
  /** Announced by the backdrop, so dismissing is reachable to a screen reader
   *  rather than being a tap on nothing. */
  closeLabel?: string;
};

/**
 * How far the panel travels, in points, and in which sense.
 *
 * It grows FROM the anchor: a drop-up starts 8pt low and rises, a dropdown
 * starts 8pt high and falls, so the origin of the motion is the button in both
 * cases. Both drivers read this, so the two paths cannot travel differently.
 */
export const PANEL_TRAVEL = 8;

/** The scale the panel starts from. Small enough to read as the control
 *  expanding rather than as a card flying in. */
export const PANEL_SCALE_FROM = 0.96;

export function panelTravelFor(direction: 'up' | 'down'): number {
  return direction === 'up' ? PANEL_TRAVEL : -PANEL_TRAVEL;
}

export function useDropMenuStyles() {
  const { palette: colors } = useThemeColors();
  const base = stylesFor(colors);
  // RUN S2 (C7) — the menu-panel dials. The dial values fold into the panel
  // entry as a nested style array, so BOTH drivers (this file's consumers)
  // pick them up without either being edited.
  const minWidth = useOverrideNumber('menu.minWidth');
  const panelRadius = useOverrideNumber('menu.radius');
  const paddingY = useOverrideNumber('menu.paddingY');
  const dial =
    minWidth != null || panelRadius != null || paddingY != null
      ? {
          ...(minWidth != null ? { minWidth } : null),
          ...(panelRadius != null ? { borderRadius: panelRadius } : null),
          ...(paddingY != null ? { paddingVertical: paddingY } : null),
        }
      : null;
  return {
    colors,
    styles: dial ? { ...base, panel: [base.panel, dial] as const } : base,
  };
}

/**
 * Outside-tap dismissal. It covers the space the menu opens INTO — upward for
 * a drop-up, downward for a dropdown — which is where a finger goes to get rid
 * of it.
 */
export function DropMenuBackdrop({
  direction,
  onClose,
  closeLabel,
}: {
  direction: 'up' | 'down';
  onClose: () => void;
  closeLabel: string;
}) {
  const { styles } = useDropMenuStyles();
  return (
    <Pressable
      style={[styles.backdrop, direction === 'up' ? styles.backdropUp : styles.backdropDown]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={closeLabel}
    />
  );
}

/**
 * The rows. Closing happens FIRST, so the menu's exit overlaps whatever the
 * action opens instead of following it.
 */
export function DropMenuItems({
  items,
  onClose,
}: {
  items: DropMenuItem[];
  onClose: () => void;
}) {
  const { colors, styles } = useDropMenuStyles();
  // RUN S2 (C7) — the menu WEARS THE MENU MATERIAL: the Surface underlay is
  // the panel's fill, blur and hairline (the panel style itself paints
  // nothing any more), so the studio's menu-material dials drive a real
  // surface. Both drivers render these rows, so both paths wear it.
  const menuRadius = useOverrideNumber('menu.radius');
  const itemHeight = useOverrideNumber('menu.itemHeight');
  const itemPaddingX = useOverrideNumber('menu.itemPaddingX');
  const itemSpacing = useOverrideNumber('menu.itemSpacing') ?? 0;
  const separators = useOverrideValue('menu.separators') !== false;
  return (
    <>
      <Surface material="menu" radius={menuRadius} style={[StyleSheet.absoluteFill, styles.panelMaterial]} />
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={() => {
            onClose();
            item.onPress();
          }}
          disabled={item.disabled}
          style={({ pressed }) => [
            styles.item,
            itemHeight != null && { minHeight: itemHeight },
            itemPaddingX != null && { paddingHorizontal: itemPaddingX },
            index > 0 && separators && styles.itemDivided,
            index > 0 && itemSpacing > 0 && { marginTop: itemSpacing },
            pressed && styles.itemPressed,
            item.disabled && styles.itemDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ disabled: !!item.disabled }}
        >
          {item.icon ? (
            <Ionicons
              name={item.icon}
              size={20}
              color={item.destructive ? colors.danger : colors.mark}
            />
          ) : null}
          <Text style={[styles.itemLabel, item.destructive && styles.itemLabelDestructive]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

export const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      left: 0,
      right: 0,
      // Tall enough to cover the surface the menu opens over on any phone,
      // and clipped by whatever the anchor's own scroll container clips to.
      height: 900,
    },
    backdropUp: { bottom: '100%' },
    backdropDown: { top: '100%' },
    // S2 (C7): fill and hairline are the menu MATERIAL's now — the Surface
    // underlay in DropMenuItems paints them, so the panel is only geometry
    // and clip. (overflow already cancelled this shadow on iOS before the
    // material arrived; behaviour is unchanged.) radius.lg here is 16 — the
    // same 16 the menu material declares, so clip and surface agree.
    panel: {
      position: 'absolute',
      minWidth: 208,
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...shadows.raised,
    },
    // The material underlay must never intercept a row's tap.
    panelMaterial: {
      pointerEvents: 'none',
    },
    // 8pt clear of the control, in whichever direction it opens.
    panelUp: { bottom: '100%', marginBottom: spacing.sm },
    panelDown: { top: '100%', marginTop: spacing.sm },
    panelLeft: { left: 0 },
    panelRight: { right: 0 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // The 44pt touch floor, met by the drawn row rather than by hitSlop —
      // rows are adjacent here, so overlapping slop would steal each other's
      // taps.
      minHeight: 46,
      paddingHorizontal: spacing.lg,
    },
    itemDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    itemPressed: { backgroundColor: colors.primarySoft },
    itemDisabled: { opacity: 0.4 },
    itemLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    itemLabelDestructive: { color: colors.danger },
  })
);
