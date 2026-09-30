/**
 * 2026-09-30 (the build run, idea 10) — MONEY MOMENTS YOU CAN FEEL. When the funds are held, the
 * payment card gives one soft haptic and a one-second pulse; when they are released, a tick pops
 * in beside "Payment released" with the success haptic. Built with core Animated on the native
 * driver and the haptics the app already has (lib/haptics), as the idea was drawn.
 *
 * A MOMENT IS NEWS, SO IT PLAYS ONCE AND ONLY WHILE IT IS FRESH: the payment row's own timestamp
 * (held_at / released_at) must be under two minutes old when the card appears — which is how the
 * customer returning from Checkout, or either side opening the job just after, meets it — and each
 * payment's moment plays once per app session. An old held or released row is simply shown.
 * Reduce Motion keeps the haptic and drops the movement.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { confirm, tap } from '../lib/haptics';
import { USE_NATIVE_DRIVER } from '../lib/motion';

/** How recent a held or released stamp must be for its moment to play. */
export const MOMENT_FRESH_MS = 2 * 60 * 1000;
const PULSE_SCALE = 1.035;
const PULSE_UP_MS = 280;
const PULSE_DOWN_MS = 720;

const played = new Set<string>();

/** True when `at` is a stamp from the last two minutes (and not from the future). */
export function isFreshMoment(at: string | null | undefined, now: number = Date.now()): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now - t >= -5000 && now - t <= MOMENT_FRESH_MS;
}

/** Claims a payment's moment for this session; false when it has already played. */
function claim(key: string): boolean {
  if (played.has(key)) return false;
  played.add(key);
  return true;
}

/** Wraps the held payment card: the soft haptic and the one-second pulse, once, while fresh. */
export function HeldPulse({
  paymentId,
  heldAt,
  style,
  children,
}: {
  paymentId: string;
  heldAt: string | null;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() === true;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isFreshMoment(heldAt) || !claim(`held:${paymentId}`)) return;
    tap();
    if (reduced) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: PULSE_SCALE, duration: PULSE_UP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scale, { toValue: 1, duration: PULSE_DOWN_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [paymentId, heldAt, reduced, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** The tick beside "Payment released": it pops in with the success haptic, once, while fresh. */
export function ReleasedTick({
  paymentId,
  releasedAt,
  color,
  size = 22,
}: {
  paymentId: string;
  releasedAt: string | null;
  color: string;
  size?: number;
}) {
  const reduced = useReducedMotion() === true;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isFreshMoment(releasedAt) || !claim(`released:${paymentId}`)) return;
    confirm();
    if (reduced) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, stiffness: 260, damping: 14, mass: 1, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [paymentId, releasedAt, reduced, pop]);
  return (
    <Animated.View
      style={{ opacity: pop, transform: [{ scale: pop }] }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="checkmark-circle" size={size} color={color} />
    </Animated.View>
  );
}
