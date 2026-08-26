/**
 * RUN S2 (C5) — PURE COLOUR MATH FOR THE DESIGN STUDIO.
 *
 * Hex parsing (3/6/8 digit, '#' optional), hex↔HSL for the studio's
 * steppers, and the WCAG relative-luminance / contrast-ratio formulas —
 * the SAME formulas the G1 material fence executes in
 * tests/themeTokens.test.mjs, surfaced once for the app; the studio's live
 * contrast readout and that fence must never disagree, and the executed
 * fence in tests/designStudio.test.mjs holds the two to the same answers.
 *
 * Import-free so the fences execute this file directly.
 */

export type ParsedHex = {
  r: number;
  g: number;
  b: number;
  /** 0–1, or null when the value carries no alpha channel. */
  alpha: number | null;
};

export function parseHex(raw: string): ParsedHex | null {
  if (typeof raw !== 'string') return null;
  const bare = raw.trim().replace(/^#/, '');
  const full =
    bare.length === 3
      ? bare
          .split('')
          .map((c) => c + c)
          .join('')
      : bare;
  if (!/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : null,
  };
}

const toByteHex = (value: number): string =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export function formatHex(r: number, g: number, b: number, alpha: number | null): string {
  const base = `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
  return alpha == null ? base : `${base}${toByteHex(alpha * 255)}`;
}

export type Hsl = { h: number; s: number; l: number };

/** r/g/b 0–255 → h 0–360, s/l 0–100. */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** h wraps 0–360, s/l clamp 0–100 → r/g/b 0–255. */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = (((h % 360) + 360) % 360) / 60;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const [r1, g1, b1] =
    hue < 1
      ? [c, x, 0]
      : hue < 2
        ? [x, c, 0]
        : hue < 3
          ? [0, c, x]
          : hue < 4
            ? [0, x, c]
            : hue < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = ln - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** HSL (wrapped/clamped) straight to an upper-case hex, alpha preserved. */
export function hslToHex(h: number, s: number, l: number, alpha: number | null): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return formatHex(r, g, b, alpha);
}

/** WCAG relative luminance of a hex colour (alpha, if any, is ignored). */
export function relativeLuminance(hex: string): number | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
}

/** WCAG contrast ratio between two hex colours; null when either is unreadable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
