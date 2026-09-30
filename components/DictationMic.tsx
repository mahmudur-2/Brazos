import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Easing, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { joinDictation } from '../lib/dictation';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { fieldAccessory, metricStyles, useThemeColors, withAlpha } from '../lib/theme';
import { voiceSearch, type VoiceSession } from '../lib/voiceSearch';

/**
 * 2026-09-30 (the build run, idea 18) — DICTATION INTO A FIELD, IN PLACE. The operator's own
 * version: "just add microphone icons next to title and description, where it uses apple's speech
 * to text", a 26pt mic at the far right inside the title and at the bottom-right inside the
 * description — no sheet, no big button.
 *
 * The listening is the Home search's (lib/voiceSearch): recognized on the device only, one bounded
 * session per tap — it ends on a pause after speech, a 30 s ceiling, a second tap, leaving the
 * screen, or the app going to the background. The mic renders only where that boundary says the
 * on-device recognizer is available (every degraded case leaves it unrendered, never disabled).
 *
 * THE FIELD SHOWS THE WORDS AS THEY ARRIVE, BUT ONLY THE FINAL PHRASE IS KEPT: while listening the
 * returned `value` is the field's text with the provisional phrase joined on — a display, never
 * written to the form — and the phrase the recognizer settles on is committed once, through
 * `onChangeText`, exactly as typing would. A session that ends without one leaves the field as it
 * was. Typing into the field while it listens ends the session and keeps what was typed.
 */
export function useDictation({
  value,
  onChangeText,
  maxLength,
  field,
  join = (base, spoken) => joinDictation(base, spoken, maxLength),
}: {
  value: string;
  onChangeText: (text: string) => void;
  maxLength: number;
  /** What the mic fills, for its label: "Dictate the title". */
  field: string;
  /** Where the words go in the field's text — by default its end (lib/dictation.ts). */
  join?: (base: string, spoken: string) => string;
}): { value: string; accessory: ReactNode } {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState<string | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const baseRef = useRef('');
  const committedRef = useRef<string | null>(null);
  const focused = useIsFocused();

  useEffect(() => {
    let alive = true;
    void voiceSearch.getAvailability().then((availability) => {
      if (alive) setAvailable(availability.status === 'available');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Never an open microphone the person cannot see: leaving the screen, the app going inactive or
  // to the background, and unmounting all end the session without keeping anything.
  useEffect(() => {
    if (!focused) sessionRef.current?.cancel();
  }, [focused]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') sessionRef.current?.cancel();
    });
    return () => {
      subscription.remove();
      sessionRef.current?.cancel();
    };
  }, []);

  // Typing while it listens: the typed text wins and the session ends.
  useEffect(() => {
    if (!listening || value === baseRef.current || value === committedRef.current) return;
    sessionRef.current?.cancel();
  }, [listening, value]);

  function toggle() {
    if (sessionRef.current) {
      sessionRef.current.stop();
      return;
    }
    Keyboard.dismiss();
    baseRef.current = value;
    committedRef.current = null;
    setListening(true);
    sessionRef.current = voiceSearch.beginSession({
      onInterimTranscript: (phrase) => setInterim(phrase),
      onTranscript: (phrase) => {
        const next = join(baseRef.current, phrase);
        committedRef.current = next;
        setInterim(null);
        onChangeText(next);
      },
      onEnd: () => {
        sessionRef.current = null;
        setInterim(null);
        setListening(false);
      },
    });
  }

  return {
    value: listening && interim ? join(baseRef.current, interim) : value,
    accessory: available ? <DictationMicButton listening={listening} onPress={toggle} field={field} /> : null,
  };
}

/** The mic itself: a filled disc in the CTA colours; while it listens a soft ring pulses round it. */
function DictationMicButton({ listening, onPress, field }: { listening: boolean; onPress: () => void; field: string }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening || reducedMotion !== false) {
      pulse.setValue(listening ? 1 : 0);
      return;
    }
    const half = fieldAccessory.pulseMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0.35, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, reducedMotion, pulse]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={fieldAccessory.inset}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop dictating' : `Dictate the ${field}`}
      accessibilityState={{ busy: listening }}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      {listening ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              backgroundColor: withAlpha(colors.emerald, 0.22),
              opacity: pulse,
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
        />
      ) : null}
      <View style={[styles.disc, { backgroundColor: colors.primary }]}>
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={fieldAccessory.glyph} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    hit: {
      width: fieldAccessory.size,
      height: fieldAccessory.size,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.8 },
    disc: {
      width: fieldAccessory.size,
      height: fieldAccessory.size,
      borderRadius: fieldAccessory.size / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    halo: {
      position: 'absolute',
      left: -fieldAccessory.halo,
      top: -fieldAccessory.halo,
      width: fieldAccessory.size + 2 * fieldAccessory.halo,
      height: fieldAccessory.size + 2 * fieldAccessory.halo,
      borderRadius: fieldAccessory.size / 2 + fieldAccessory.halo,
    },
  })
);
