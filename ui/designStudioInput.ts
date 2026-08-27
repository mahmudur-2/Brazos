/**
 * RUN S3 (C4) — DIRECT NUMERIC ENTRY FOR THE DESIGN STUDIO, PURE.
 *
 * The [✎] beside a numeric dial swaps its value text for a decimal-pad
 * TextInput. What the operator types has to become a number the schema will
 * accept, or nothing at all — and "or nothing at all" is the important half:
 * a half-typed value, a stray minus sign or a cleared field must leave the
 * dial exactly where it was rather than writing a NaN into the override
 * store, where every reader downstream would have to defend against it.
 *
 * So this returns `number | null` and the caller REVERTS on null: no write,
 * no crash, no error state to dismiss. The clamp is the schema's own
 * [min, max] and the rounding is two decimals for BOTH numeric kinds —
 * `kind` does not branch, and that is deliberate rather than an omission:
 * the steppers already round through the same two-decimal rule
 * (`round2(current + direction * step)`), so typing 17.5 into an integer
 * dial and stepping to 17.5 must land on the same number.
 *
 * Import-free, exactly like ui/colorMath.ts, so tests/designStudio.test.mjs
 * executes it directly rather than reasoning about it.
 */

export type DirectEntryKind = 'number' | 'decimal';

export type DirectEntryBounds = {
  /** The schema's floor, when it declares one. */
  min?: number;
  /** The schema's ceiling, when it declares one. */
  max?: number;
  /** Which numeric kind the dial is. Recorded, never branched on — see above. */
  kind: DirectEntryKind;
};

/**
 * The typed text as a writable number, or null when there is nothing safe to
 * write. Trims first, so " 24 " is 24; accepts "17.5", ".25" and "-3";
 * rejects empty, whitespace-only, unparseable and non-finite input.
 */
export function parseDirectEntry(text: string, bounds: DirectEntryBounds): number | null {
  const trimmed = text.trim();
  // Number('') is 0, which would silently zero a dial the operator merely
  // cleared — so the empty case is answered before any parsing happens.
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  let next = Math.round(parsed * 100) / 100;
  if (bounds.min != null && next < bounds.min) next = bounds.min;
  if (bounds.max != null && next > bounds.max) next = bounds.max;
  return next;
}
