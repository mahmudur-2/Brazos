import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { authColors, authRadius, authSizes, authType } from '../lib/authTheme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Restrained press feedback: enough to register as a physical control, not
// enough to read as a bounce. 100ms in, 120ms back.
const PRESS_SCALE = 0.985;
const PRESS_IN_MS = 100;
const PRESS_OUT_MS = 120;

type AuthButtonProps = {
  title: string;
  onPress: () => void;
  /** `ghost` is the reference's .btn.ghost — outlined, forest label. */
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

/**
 * The auth flow's CTA. Separate from components/Button.tsx because this
 * surface runs on the emerald brand palette rather than the in-app forest/cream
 * one, and because the reference calls for a press-scale microinteraction the
 * shared button deliberately doesn't have.
 *
 * The label is replaced by a spinner in place while loading — the button keeps
 * its height and width, so a submit never reflows the form under the user's
 * thumb.
 */
export function AuthButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const isGhost = variant === 'ghost';
  const tint = isGhost ? authColors.forest : authColors.onDark;

  const animate = (to: number, duration: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animate(PRESS_SCALE, PRESS_IN_MS)}
        onPressOut={() => animate(1, PRESS_OUT_MS)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          styles.base,
          isGhost ? styles.ghost : styles.primary,
          // Dimmed, but still clearly the same control — the reference's
          // hierarchy has to survive the disabled state.
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: authSizes.button,
    borderRadius: authRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: authColors.forest,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: authColors.line,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    ...authType.button,
  },
});
