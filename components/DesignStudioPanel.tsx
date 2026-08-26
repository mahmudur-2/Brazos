import { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  patchDesignOverrides,
  patchMaterialOverride,
  resetDesignOverrides,
  setDesignStudioOpen,
  useDesignOverrides,
  useDesignStudioOpen,
  useMaterials,
} from '../lib/designOverrides';
import { useNavBottomPad } from '../hooks/useNavInset';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import {
  STUDIO_CARD_FILL_CYCLE,
  STUDIO_GOLD_CYCLE,
  type MaterialName,
} from '../ui/tokens';
import { SURFACE_GLOW_ALPHA } from '../ui/primitives';

// FENCE: DESIGN STUDIO (RUN S2 C1) — PERMANENT and CHANNEL-GATED. The old "strip before TestFlight" instruction is SUPERSEDED: the panel ships in every build and lib/designStudioGate.ts decides where it may exist (Metro __DEV__, or update channel internal/development; FAIL CLOSED elsewhere). Its mount in navigation/ModeShell.tsx reads that gate.

/**
 * RUN G1 (C3) — THE DESIGN STUDIO.
 *
 * A floating tuning panel over the whole app, toggled from the Appearance
 * screen's "Design studio" row. It writes the in-memory override layer
 * (lib/designOverrides.ts) and nothing else — every dial applies live to its
 * consumers, nothing persists, and a relaunch is a full reset.
 *
 * DELIBERATELY NOT GLASS. The panel is a plain solid dark card in both
 * themes, so it never blurs — or repaints with — the very materials it is
 * tuning. It is draggable vertically by its header so it never permanently
 * covers the surface being dialled.
 *
 * The gold and card-fill cycles live in ui/tokens.ts (the literal contract's
 * one hex home); "current" means no override — the palette's own value.
 */

const MATERIAL_NAMES: MaterialName[] = ['chrome', 'sheet', 'menu'];

/** The Values readout is data, so it renders in the platform's monospace. */
const STUDIO_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function cycleNext(
  current: string | undefined,
  cycle: readonly string[],
): string | undefined {
  if (current == null) return cycle[0];
  const at = cycle.indexOf(current);
  return at === -1 || at === cycle.length - 1 ? undefined : cycle[at + 1];
}

function StepperRow({
  label,
  display,
  onStep,
  styles,
}: {
  label: string;
  display: string;
  onStep: (direction: 1 | -1) => void;
  styles: ReturnType<typeof stylesFor>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => onStep(-1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} minus`}
        hitSlop={6}
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      <Text style={styles.rowValue}>{display}</Text>
      <Pressable
        onPress={() => onStep(1)}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} plus`}
        hitSlop={6}
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

function CycleRow({
  label,
  value,
  cycle,
  onCycle,
  styles,
}: {
  label: string;
  value: string | undefined;
  cycle: readonly string[];
  onCycle: (next: string | undefined) => void;
  styles: ReturnType<typeof stylesFor>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => onCycle(cycleNext(value, cycle))}
        style={({ pressed }) => [styles.cycle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} cycle`}
      >
        {value != null ? <View style={[styles.swatch, { backgroundColor: value }]} /> : null}
        <Text style={styles.cycleValue}>{value ?? 'current'}</Text>
      </Pressable>
    </View>
  );
}

export function DesignStudioPanel() {
  const open = useDesignStudioOpen();
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const overrides = useDesignOverrides();
  const resolved = useMaterials();
  const navBottomPad = useNavBottomPad();
  const [material, setMaterial] = useState<MaterialName>('chrome');

  // Vertical drag by the header — position state only, never an animation,
  // so there is no driver to configure.
  const translateY = useRef(new Animated.Value(0)).current;
  const restingY = useRef(0);
  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(restingY.current + gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        restingY.current += gesture.dy;
      },
      onPanResponderTerminate: (_event, gesture) => {
        restingY.current += gesture.dy;
      },
    }),
  ).current;

  if (!open) return null;

  const spec = resolved[material];

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
        <View style={styles.header} {...drag.panHandlers}>
          <View style={styles.grip} />
          <Text style={styles.title}>Design studio</Text>
          <Pressable
            onPress={resetDesignOverrides}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Reset all overrides"
          >
            <Text style={styles.headerActionLabel}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={() => setDesignStudioOpen(false)}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close the design studio"
          >
            <Text style={styles.headerActionLabel}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.picker}>
            {MATERIAL_NAMES.map((name) => (
              <Pressable
                key={name}
                onPress={() => setMaterial(name)}
                style={[styles.pickerItem, name === material && styles.pickerItemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: name === material }}
              >
                <Text
                  style={[styles.pickerLabel, name === material && styles.pickerLabelActive]}
                >
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>

          <StepperRow
            styles={styles}
            label="Blur"
            display={String(spec.blur)}
            onStep={(direction) =>
              patchMaterialOverride(material, {
                blur: clamp(spec.blur + direction * 2, 0, 100),
              })
            }
          />
          <StepperRow
            styles={styles}
            label="Scrim alpha"
            display={spec.scrimAlpha.toFixed(2)}
            onStep={(direction) =>
              patchMaterialOverride(material, {
                scrimAlpha: clamp(round2(spec.scrimAlpha + direction * 0.02), 0, 1),
              })
            }
          />
          <StepperRow
            styles={styles}
            label="Border alpha"
            display={spec.borderAlpha.toFixed(2)}
            onStep={(direction) =>
              patchMaterialOverride(material, {
                borderAlpha: clamp(round2(spec.borderAlpha + direction * 0.02), 0, 1),
              })
            }
          />

          <Text style={styles.sectionLabel}>Global</Text>
          <StepperRow
            styles={styles}
            label="Glow alpha"
            display={(overrides.glowAlpha ?? SURFACE_GLOW_ALPHA).toFixed(2)}
            onStep={(direction) =>
              patchDesignOverrides({
                glowAlpha: clamp(
                  round2((overrides.glowAlpha ?? SURFACE_GLOW_ALPHA) + direction * 0.02),
                  0,
                  1,
                ),
              })
            }
          />
          <StepperRow
            styles={styles}
            label="Nav radius"
            display={String(overrides.navRadius ?? 0)}
            onStep={(direction) =>
              patchDesignOverrides({
                navRadius: clamp((overrides.navRadius ?? 0) + direction * 2, 0, 40),
              })
            }
          />
          <StepperRow
            styles={styles}
            label="Nav bottom pad"
            display={`${navBottomPad}${overrides.navBottomPad == null ? ' (auto)' : ''}`}
            onStep={(direction) =>
              patchDesignOverrides({
                navBottomPad: clamp(navBottomPad + direction * 2, 0, 34),
              })
            }
          />
          <CycleRow
            styles={styles}
            label="Gold"
            value={overrides.gold}
            cycle={STUDIO_GOLD_CYCLE}
            onCycle={(next) => patchDesignOverrides({ gold: next })}
          />
          <CycleRow
            styles={styles}
            label="Card fill"
            value={overrides.cardFill}
            cycle={STUDIO_CARD_FILL_CYCLE}
            onCycle={(next) => patchDesignOverrides({ cardFill: next })}
          />

          <Text style={styles.sectionLabel}>Values</Text>
          <Text selectable style={styles.json}>
            {JSON.stringify(overrides, null, 2)}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    // A plain solid dark card in BOTH themes — never glass, never the palette
    // surface it might itself be tuning.
    panel: {
      position: 'absolute',
      top: 72,
      left: 12,
      right: 12,
      maxHeight: 460,
      backgroundColor: colors.black,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.18),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.white, 0.12),
    },
    grip: {
      width: 24,
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(colors.white, 0.35),
    },
    title: {
      flex: 1,
      fontSize: 13,
      fontWeight: '800',
      color: colors.white,
    },
    headerAction: {
      minWidth: 44,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerActionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.75),
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      padding: 12,
      gap: 8,
    },
    picker: {
      flexDirection: 'row',
      gap: 8,
    },
    pickerItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    pickerItemActive: {
      borderColor: colors.gold,
    },
    pickerLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: withAlpha(colors.white, 0.7),
    },
    pickerLabelActive: {
      color: colors.gold,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
    },
    rowLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.white,
    },
    rowValue: {
      minWidth: 72,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
    },
    step: {
      width: 34,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    stepGlyph: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.white,
    },
    cycle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.25),
    },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.4),
    },
    cycleValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
    },
    sectionLabel: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: withAlpha(colors.white, 0.55),
    },
    json: {
      fontFamily: STUDIO_MONO,
      fontSize: 11,
      lineHeight: 16,
      color: withAlpha(colors.white, 0.85),
    },
    pressed: {
      opacity: 0.7,
    },
  }),
);
