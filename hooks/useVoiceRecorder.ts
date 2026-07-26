import { useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

/** Anything shorter than this is treated as a mis-tap, not a message. */
export const MIN_CLIP_MS = 700;

export type FinishedClip = { uri: string; durationMs: number };

/**
 * Press-and-hold voice recording for the chat composer.
 *
 * Wraps expo-audio's recorder with the bits the composer needs: permission
 * handling, the iOS audio-mode switch required for the mic to actually
 * engage, a live duration readout, and a too-short guard so a stray tap
 * doesn't post an empty clip.
 *
 * `stop()` resolves with the recorded file, or null when the clip was too
 * short or recording never started — callers can treat null as "nothing to
 * send" without special-casing.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // 100ms polling keeps the on-screen timer smooth without much overhead.
  const recorderState = useAudioRecorderState(recorder, 100);

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The last duration observed while recording. recorderState.durationMillis
  // resets once the recorder stops, so it has to be captured on the way past
  // or the sent clip would always report 0.
  const lastDurationRef = useRef(0);
  useEffect(() => {
    if (recorderState.isRecording) {
      lastDurationRef.current = recorderState.durationMillis;
    }
  }, [recorderState.isRecording, recorderState.durationMillis]);

  async function start(): Promise<boolean> {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone access is off. Enable it in Settings to send a voice message.');
        return false;
      }

      // Without allowsRecording the iOS session stays in playback mode and
      // the recorder captures silence.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      await recorder.prepareToRecordAsync();
      recorder.record();
      lastDurationRef.current = 0;
      setIsRecording(true);
      return true;
    } catch (err) {
      console.error('[useVoiceRecorder] start failed', err);
      setError(err instanceof Error ? err.message : 'Could not start recording.');
      setIsRecording(false);
      return false;
    }
  }

  async function stop(): Promise<FinishedClip | null> {
    if (!isRecording) return null;
    setIsRecording(false);

    try {
      const durationMs = lastDurationRef.current;
      await recorder.stop();
      // Hand the session back so playback isn't stuck in record mode.
      await setAudioModeAsync({ allowsRecording: false });

      const uri = recorder.uri;
      if (!uri) return null;
      if (durationMs < MIN_CLIP_MS) return null;

      return { uri, durationMs };
    } catch (err) {
      console.error('[useVoiceRecorder] stop failed', err);
      setError(err instanceof Error ? err.message : 'Could not finish recording.');
      return null;
    }
  }

  /** Abandon the take without producing a clip (used on unmount). */
  async function cancel() {
    if (!isRecording) return;
    setIsRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // Already stopped or never started — nothing to recover.
    }
  }

  // Leaving the screen mid-hold must not leave the mic hot.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    return () => {
      cancelRef.current();
    };
  }, []);

  return {
    isRecording,
    durationMs: recorderState.durationMillis,
    error,
    clearError: () => setError(null),
    start,
    stop,
    cancel,
  };
}
