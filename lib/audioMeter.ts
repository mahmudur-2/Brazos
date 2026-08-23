/**
 * The recording meter's arithmetic, with nothing impure in it.
 *
 * Kept out of hooks/useVoiceRecorder.ts (which loads expo-audio) and out of
 * components/AudioMeterBars.tsx (which loads react-native) so the tests can
 * RUN it rather than read it — the same pure-sibling arrangement
 * lib/voiceSearch and lib/motion120 use for their boundaries.
 */

/**
 * How many samples the waveform shows. At the recorder's 100ms poll this is a
 * ~2.8 second window, long enough to see the shape of a phrase.
 */
export const METER_BAR_COUNT = 28;

/**
 * The dBFS reading treated as silence.
 *
 * iOS's AVAudioRecorder reports average power down to -160, but anything under
 * about -60 is room tone: mapping the full range would leave every ordinary
 * speaking voice pinned in the top sixth of the meter and every quiet room
 * still drawing bars. -60 is the floor that makes speech use the height.
 */
export const METER_FLOOR_DB = -60;

/**
 * dBFS -> 0..1, or NULL when there is no reading at all.
 *
 * NULL IS A REAL ANSWER and is never rounded down to zero. "This binary
 * reports no metering" and "the microphone is hearing silence" are different
 * facts about the world, and the meter draws them differently: an
 * indeterminate pulse for the first, a flat-but-live waveform for the second.
 * Collapsing them would mean a build with no metering silently claiming to
 * have measured a quiet room.
 */
export function normalizeMeter(db: number | null | undefined): number | null {
  if (db == null || !Number.isFinite(db)) return null;
  if (db <= METER_FLOOR_DB) return 0;
  if (db >= 0) return 1;
  return (db - METER_FLOOR_DB) / -METER_FLOOR_DB;
}

/**
 * Slide one sample into the rolling window, newest LAST.
 *
 * Returns a new array of the same length — the window is fixed-width by
 * definition (it is what the bars draw), so a caller can never grow it into an
 * unbounded recording of the take.
 */
export function advanceMeterWindow(window: readonly number[], level: number): number[] {
  return [...window.slice(1), level];
}

/** A silent window of the right width — what every take starts from. */
export function emptyMeterWindow(): number[] {
  return new Array(METER_BAR_COUNT).fill(0);
}
