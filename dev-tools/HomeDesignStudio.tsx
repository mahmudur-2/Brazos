import { useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DEFAULT_HOME_DESIGN_SETTINGS,
  HomeDesignStudioProvider,
  type HomeDesignSettings,
} from '../lib/homeDesignStudio';
import { colors, radius, shadows, spacing } from '../lib/theme';

type Control = {
  key: keyof HomeDesignSettings;
  label: string;
  step: number;
  min: number;
  max: number;
  suffix: string;
};

const CONTROLS: Control[] = [
  { key: 'heroFontSize', label: 'Hero font size', step: 1, min: 28, max: 56, suffix: 'pt' },
  { key: 'screenPadding', label: 'Screen padding', step: 2, min: 8, max: 32, suffix: 'pt' },
  { key: 'sectionGap', label: 'Section gap', step: 2, min: 8, max: 32, suffix: 'pt' },
  { key: 'searchHeight', label: 'Search height', step: 2, min: 44, max: 96, suffix: 'pt' },
  { key: 'searchRadius', label: 'Search radius', step: 2, min: 0, max: 36, suffix: 'pt' },
  { key: 'ctaHeight', label: 'Post a job CTA height', step: 2, min: 44, max: 88, suffix: 'pt' },
  { key: 'ctaRadius', label: 'Post a job CTA radius', step: 2, min: 0, max: 28, suffix: 'pt' },
  { key: 'jobCardRadius', label: 'Job-card radius', step: 2, min: 0, max: 28, suffix: 'pt' },
];

/** Web-only proof of concept: real MainTabs in an iPhone-sized viewport plus controls. */
export function HomeDesignStudio({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<HomeDesignSettings>(DEFAULT_HOME_DESIGN_SETTINGS);

  function adjust(control: Control, direction: -1 | 1) {
    setSettings((current) => ({
      ...current,
      [control.key]: Math.max(
        control.min,
        Math.min(control.max, current[control.key] + control.step * direction)
      ),
    }));
  }

  return (
    <HomeDesignStudioProvider settings={settings}>
      <View style={styles.root}>
        <View style={styles.previewPane}>
          <View style={styles.phoneShell}>
            {/*
              MainTabs is the normal application's navigation tree. Keep the
              decorative bezel outside this viewport so it never steals layout
              space from the actual 393×852 Home screen.
            */}
            <View style={styles.phoneViewport}>{children}</View>
          </View>
        </View>

        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <Text style={styles.eyebrow}>DEVELOPMENT ONLY</Text>
          <Text style={styles.title}>Home Design Studio</Text>
          <Text style={styles.copy}>Live controls for the real Customer Home.</Text>

          <View style={styles.controlList}>
            {CONTROLS.map((control) => (
              <View key={control.key} style={styles.controlRow}>
                <Text style={styles.controlLabel}>{control.label}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => adjust(control, -1)}
                    style={styles.stepButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${control.label}`}
                  >
                    <Text style={styles.stepButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.value}>
                    {settings[control.key]}
                    {control.suffix}
                  </Text>
                  <Pressable
                    onPress={() => adjust(control, 1)}
                    style={styles.stepButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${control.label}`}
                  >
                    <Text style={styles.stepButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setSettings(DEFAULT_HOME_DESIGN_SETTINGS)}
            style={styles.resetButton}
            accessibilityRole="button"
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        </ScrollView>
      </View>
    </HomeDesignStudioProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#E8ECE9' },
  previewPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minWidth: 433,
  },
  phoneShell: {
    width: 413,
    height: 872,
    padding: 10,
    borderRadius: 44,
    backgroundColor: colors.ink,
    ...shadows.raised,
  },
  phoneViewport: { flex: 1, overflow: 'hidden', borderRadius: 34 },
  panel: { width: 336, flexGrow: 0, backgroundColor: colors.surface },
  panelContent: { padding: spacing.xl, gap: spacing.lg },
  eyebrow: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  copy: { color: colors.homeSlate, fontSize: 14, lineHeight: 20 },
  controlList: { gap: spacing.sm },
  controlRow: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.homeBackground,
  },
  controlLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
  },
  stepButtonText: { color: colors.white, fontSize: 22, fontWeight: '500' },
  value: { color: colors.forest, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resetButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  resetButtonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
