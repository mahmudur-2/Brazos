import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '../ui/tokens';
import { useDesignDial } from '../lib/designOverrides';

/**
 * RUN G1 (C4/C6) — THE INSET CONTRACT, in one place.
 *
 * The attached bar is flush to the physical bottom edge and carries its
 * bottom padding INSIDE — and since the flush fix that padding is no longer
 * the whole safe-area inset. The operator's complaint was that the bar's
 * content sat too high; the fix is
 *
 *     navBottomPad = max(insetBottom − NAV_FLUSH_TUCK, NAV_FLUSH_MIN_PAD)
 *
 * — the icon/label row tucks 16pt into the inset zone and never sits closer
 * than 6pt to the edge. The design studio's navBottomPad dial REPLACES the
 * formula outright when set, so the operator can tune the real bar live.
 *
 * `useNavInset()` is the height CONTENT must clear:
 *
 *     bar content height + navBottomPad + safe-area remainder
 *
 * where the remainder is whatever part of the device inset the bar's own
 * padding no longer absorbs (max(0, inset − pad)). With no dial set that sum
 * is exactly the bar's old footprint (content + inset), so every screen's
 * clearance is unchanged on launch; content never sinks into the
 * home-indicator zone even when the dial shortens the bar, because the bar
 * is translucent chrome and what shows through it must still end above the
 * indicator. Everything reads the same override, so one dial moves the bar
 * and every clearance at once.
 *
 * These constants and this arithmetic are the ONE home of the bar's flush
 * numbers — tests/layout.test.mjs fences bar-height literals from appearing
 * anywhere else.
 */

/** How far the icon/label row tucks into the safe-area inset zone. */
export const NAV_FLUSH_TUCK = 16;

/** The least padding the row keeps above the physical edge. */
export const NAV_FLUSH_MIN_PAD = 6;

/** The flush formula — the dial replaces it entirely when set. */
export function navBottomPadFor(insetBottom: number, override?: number): number {
  return override ?? Math.max(insetBottom - NAV_FLUSH_TUCK, NAV_FLUSH_MIN_PAD);
}

/** The bar's live bottom padding: the studio dial, or the flush formula. */
export function useNavBottomPad(): number {
  const insets = useSafeAreaInsets();
  const navBottomPad = useDesignDial('navBottomPad');
  return navBottomPadFor(insets.bottom, navBottomPad);
}

/** The height content must clear — see the header. */
export function useNavInset(): number {
  const insets = useSafeAreaInsets();
  const navBottomPad = useDesignDial('navBottomPad');
  const pad = navBottomPadFor(insets.bottom, navBottomPad);
  return layout.floatingNavHeight + pad + Math.max(0, insets.bottom - pad);
}
