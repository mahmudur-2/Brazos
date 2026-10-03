/**
 * Hex → rgba() with an explicit opacity — the ONE way a translucent colour is
 * derived from a palette token in this codebase.
 *
 * Scrims, chrome pills and on-fill translucencies used to be written as
 * `rgba(...)` literals that silently restated a palette hex (31,46,34 was
 * colors.text, 19,32,27 was brand.ink, 244,241,232 was colors.onPrimary).
 * Restated channels can never follow a palette swap, so the 4D dark theme
 * would have left every scrim light-coloured. `withAlpha(token, alpha)` keeps
 * the COLOUR a palette read while the alpha stays what it is — a per-surface
 * opacity parameter, not a colour.
 *
 * Deliberately free of React Native imports so `node --test` executes it
 * directly (the lib/conversationResolver.ts pattern); ui/tokens.ts and
 * lib/theme.ts re-export it for app code.
 *
 * Output is byte-stable (`rgba(r,g,b,a)`, no spaces) because tests assert
 * exact equality against the values the migrated screens used to hardcode.
 */
export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * FIX-RUN F12 — the same colour with its alpha at 0, so a colour fade to or from "nothing" keeps
 * its hue instead of passing through transparent black (components/Selection.shared.tsx). Takes a
 * hex or an rgb()/rgba() string; anything else (a name) comes back as it was.
 */
export function clearAlpha(color: string): string {
  if (color.startsWith('#')) return withAlpha(color, 0);
  const channels = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(color.replace(/\s+/g, ''));
  return channels ? `rgba(${channels[1]},${channels[2]},${channels[3]},0)` : color;
}
