import { useCallback, useEffect, useState } from 'react';

/**
 * A DOCKED SHEET'S PRESENCE — whether its Modal is mounted, and whether its dim shows.
 *
 * The dim covers the screen at once and leaves at once (LUX-LIST-2 #3); only the card moves, and
 * since 2026-09-30 (the build run, the smoothness pass) the card's motion is its own component,
 * components/SheetCard.tsx, on the 120 Hz path where the binary has it. So this hook is the state
 * machine alone: `mounted` turns true when the sheet opens and false only when the card says its
 * close has finished (`onClosed`), so the card is never unmounted mid-slide.
 */
export function useSheetPresence(visible: boolean): {
  mounted: boolean;
  dimVisible: boolean;
  onClosed: () => void;
} {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);
  const onClosed = useCallback(() => setMounted(false), []);
  return { mounted, dimVisible: visible, onClosed };
}
