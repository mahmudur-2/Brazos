/**
 * FIX-RUN F9 — THE KEYBOARD-AVOIDING VIEW: the chooser and the fallback. The fallback is React
 * Native's KeyboardAvoidingView, exactly as every screen had it; the 120 Hz path
 * (`KeyboardAvoid.motion120.tsx`) pads on the UI thread from keyboard-controller's per-frame
 * keyboard height. This is the ONE file that imports React Native's KeyboardAvoidingView
 * (tests/smoothPass.test.mjs holds that).
 */
import type { ComponentType } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { canTrackKeyboard, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import type { KeyboardAvoidProps } from './KeyboardAvoid.shared';

export type { KeyboardAvoidProps } from './KeyboardAvoid.shared';

function KeyboardAvoidFallback(props: KeyboardAvoidProps) {
  return <KeyboardAvoidingView {...props} />;
}

/**
 * Chosen ONCE, at module load. The keyboard's own frames AND worklets — KeyboardRisingColumn's
 * AND — or React Native's view on the will-change events.
 */
const Impl = resolveMotion120<ComponentType<KeyboardAvoidProps>>(
  { ...motionCapability, keyboard: canTrackKeyboard() && canWorklet() },
  'keyboard',
  () => require('./KeyboardAvoid.motion120').KeyboardAvoid as ComponentType<KeyboardAvoidProps>,
  KeyboardAvoidFallback
);

export function KeyboardAvoid(props: KeyboardAvoidProps) {
  return <Impl {...props} />;
}
