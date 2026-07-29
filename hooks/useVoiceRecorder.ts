import { useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

export type RecorderPhase = 'idle' | 'pending' | 'recording' | 'preview';

/** Delay between tapping the mic and recording actually starting — long
 *  enough that a stray/accidental tap on the icon never produces a clip,
 *  short enough that a deliberate tap doesn't feel laggy. */
export const START_DELAY_MS = 500;

export type FinishedClip = { uri: string; durationMs: number };

// expo-audio's setAudioModeAsync(mode: Partial<AudioMode>) looks like a
// merge from the TS signature, but the native side (AudioModule.swift)
// decodes whatever partial object is passed into a FULL AudioMode Record,
// and every field on that Record carries its own default —
// `@Field var playsInSilentMode: Bool = false` among them (see
// node_modules/expo-audio/ios/AudioRecords.swift). So any call that omits
// playsInSilentMode doesn't leave it as whatever a previous call set — it
// resets it to false. That's the actual bug behind "voice notes play with
// no sound": stop() used to call setAudioModeAsync({ allowsRecording: false })
// after every recording, silently flipping playback-in-silent-mode off for
// the rest of the session (or permanently, until the app restarts) even
// though start() had explicitly turned it on. Every call below repeats
// playsInSilentMode: true for exactly this reason — never omit it.
async function setAudioMode(overrides: { allowsRecording: boolean }) {
  await setAudioModeAsync({ playsInSilentMode: true, ...overrides });
}

/**
 * Tap-to-start / tap-to-stop voice recording for the chat composer.
 *
 * Phase model:
 *   idle      — nothing happening.
 *   pending   — mic was tapped; a START_DELAY_MS timer is running before the
 *               native recorder actually engages, so a stray tap never
 *               produces a clip. Tapping again during this window cancels it.
 *   recording — audio is actually being captured. Ends via stopRecording(),
 *               never auto-sends.
 *   preview   — stopRecording() produced a clip; it's held (not sent) until
 *               the caller either sends it (reset()) or discard()s it.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // 100ms polling keeps the on-screen timer smooth without much overhead.
  const recorderState = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<FinishedClip | null>(null);

  // The last duration observed while recording. recorderState.durationMillis
  // resets once the recorder stops, so it has to be captured on the way past
  // or the finished clip would always report 0.
  const lastDurationRef = useRef(0);
  useEffect(() => {
    if (recorderState.isRecording) {
      lastDurationRef.current = recorderState.durationMillis;
    }
  }, [recorderState.isRecording, recorderState.durationMillis]);

  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearPendingTimer() {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }

  async function beginRecording() {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone access is off. Enable it in Settings to send a voice message.');
        setPhase('idle');
        return;
      }

      // Without allowsRecording the iOS session stays in playback mode and
      // the recorder captures silence.
      await setAudioMode({ allowsRecording: true });

      await recorder.prepareToRecordAsync();
      recorder.record();
      lastDurationRef.current = 0;
      setPhase('recording');
    } catch (err) {
      console.error('[useVoiceRecorder] start failed', err);
      setError(err instanceof Error ? err.message : 'Could not start recording.');
      setPhase('idle');
    }
  }

  /** Tap the mic icon. From idle, arms the start delay; tapping again while
   *  armed cancels it. No-op once actually recording or previewing — those
   *  states have their own dedicated stop/send/discard controls instead. */
  function tapMic() {
    if (phase === 'idle') {
      setPhase('pending');
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        beginRecording();
      }, START_DELAY_MS);
      return;
    }
    if (phase === 'pending') {
      clearPendingTimer();
      setPhase('idle');
    }
  }

  async function stopRecording() {
    if (phase !== 'recording') return;
    try {
      const durationMs = lastDurationRef.current;
      await recorder.stop();
      // Hand the session back so playback isn't stuck in record mode.
      await setAudioMode({ allowsRecording: false });

      const uri = recorder.uri;
      if (!uri) {
        setPhase('idle');
        return;
      }

      setPreviewClip({ uri, durationMs });
      setPhase('preview');
    } catch (err) {
      console.error('[useVoiceRecorder] stop failed', err);
      setError(err instanceof Error ? err.message : 'Could not finish recording.');
      setPhase('idle');
    }
  }

  /** Abandon the previewed take without sending it. */
  function discard() {
    if (phase !== 'preview') return;
    setPreviewClip(null);
    setPhase('idle');
  }

  /** The caller has consumed previewClip (sent it) — clear back to idle. */
  function reset() {
    setPreviewClip(null);
    setPhase('idle');
  }

  /** Abandon whatever's in flight without producing a clip — used on unmount. */
  async function cancel() {
    clearPendingTimer();
    if (phase === 'recording') {
      try {
        await recorder.stop();
        await setAudioMode({ allowsRecording: false });
      } catch {
        // Already stopped or never started — nothing to recover.
      }
    }
    setPreviewClip(null);
    setPhase('idle');
  }

  // Leaving the screen mid-recording (or mid-delay) must not leave the mic
  // hot or a stray timer running.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    return () => {
      cancelRef.current();
    };
  }, []);

  return {
    phase,
    durationMs:
      phase === 'preview' ? (previewClip?.durationMs ?? 0) : recorderState.durationMillis,
    previewUri: previewClip?.uri ?? null,
    error,
    clearError: () => setError(null),
    tapMic,
    stopRecording,
    discard,
    /** Call once previewClip has been successfully sent. */
    reset,
    /** The finished clip, valid only while phase === 'preview'. */
    previewClip,
  };
}
