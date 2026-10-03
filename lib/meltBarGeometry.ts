/**
 * 2026-09-30 (the build run, `docs/dispatch/MELT-TAB-BAR.md`) — THE MELT-THROUGH BAR'S ARITHMETIC,
 * pure: no React Native and no React, so `tests/meltTabBar.test.mjs` executes it, and every
 * function the frame loop calls is a worklet, so the 120 Hz path runs it on the UI thread. Every
 * number comes in as an argument from `meltBar` in ui/tokens.ts; nothing here restates one.
 */

/** A circle on the pill's centre line: its centre x and its radius. */
export type LineCircle = { x: number; r: number };

/** The neck between two circles: a connector box and two cut-out circles at (xc, ±yo). */
export type Neck = { rc: number; xc: number; yo: number; x0: number; x1: number; top: number };

/** Where each of `count` equal slots centres on a pill `width` wide. */
export function slotCentres(width: number, count: number): number[] {
  const slot = width / count;
  const centres: number[] = [];
  for (let i = 0; i < count; i++) centres.push(slot * i + slot / 2);
  return centres;
}

/** The pill's bottom edge above the screen's: max(inset − tuck, min). */
export function pillBottomOffset(insetBottom: number, tuck: number, min: number): number {
  return Math.max(insetBottom - tuck, min);
}

/** What content has to clear: the pill, its offset, and the breathing room above it. */
export function pillFootprint(
  insetBottom: number,
  m: { height: number; bottomTuck: number; bottomMin: number; breathing: number }
): number {
  return m.height + pillBottomOffset(insetBottom, m.bottomTuck, m.bottomMin) + m.breathing;
}

/**
 * The soft fade behind the bar (fix run D13): its height and the percent from its top where it
 * turns solid. Its clear top edge sits exactly on the line a scroller's content clears
 * (`pillFootprint`), so a list scrolled to its end is never washed; it is solid from the pill's
 * centre line down, so rows behind the pill's margins end in the ground.
 */
export function underBarFade(
  insetBottom: number,
  m: { height: number; bottomTuck: number; bottomMin: number; breathing: number }
): { height: number; solidAt: number } {
  const height = pillFootprint(insetBottom, m);
  const solidAt = Math.round(((m.breathing + m.height / 2) / height) * 1000) / 10;
  return { height, solidAt };
}

/** The slot nearest `x`. */
export function nearestSlot(x: number, centres: readonly number[]): number {
  'worklet';
  let best = 0;
  for (let i = 1; i < centres.length; i++) {
    if (Math.abs(centres[i] - x) < Math.abs(centres[best] - x)) best = i;
  }
  return best;
}

/** Smoothstep from a to b (either order). */
export function smooth(a: number, b: number, t: number): number {
  'worklet';
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * The fillet between two circles P and Q on the centre line, of radius rc. Null when there is
 * nothing to draw: no fillet, one circle inside the other, too far apart, or a waist that has
 * pinched shut — the snap.
 */
export function neckShape(xp: number, rp: number, xq: number, rq: number, rc: number): Neck | null {
  'worklet';
  const d = Math.abs(xq - xp);
  const s = Math.sign(xq - xp) || 1;
  if (rc < 0.3 || d <= Math.abs(rp - rq) + 0.3) return null;
  const r1 = rp + rc;
  const r2 = rq + rc;
  if (d >= r1 + r2) return null;
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const yo = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  if (yo - rc < 0.6) return null;
  const xc = xp + s * a;
  const tp = { x: xp + ((xc - xp) * rp) / r1, y: (yo * rp) / r1 };
  const tq = { x: xq + ((xc - xq) * rq) / r2, y: (yo * rq) / r2 };
  return { rc, xc, yo, x0: Math.min(tp.x, tq.x), x1: Math.max(tp.x, tq.x), top: Math.max(tp.y, tq.y) };
}

/**
 * The + joint's fillet for a `gap` between the + and the bubble end facing it (negative when they
 * overlap). It forms from `reach` away, holds `plus` while joined — so the two stay joined as they
 * part until the waist pinches shut — and eases from `over` to `plus` across `overlap` of overlap.
 */
export function plusFillet(
  gap: number,
  joined: boolean,
  f: { plus: number; over: number },
  reach: number,
  overlap: number
): number {
  'worklet';
  if (gap <= 0) return f.over + (f.plus - f.over) * smooth(-overlap, 0, gap);
  return joined ? f.plus : f.plus * smooth(reach, 0, gap);
}

/**
 * The join-and-snap rule. Not joined and touching (gap under half a point) → joined, with the
 * join kick. Joined, apart, and the neck gone → snapped, with the snap kick. Otherwise no change.
 */
export function stepPlusJoin(
  joined: boolean,
  gap: number,
  neck: Neck | null,
  kicks: { join: number; snap: number }
): { joined: boolean; kick: number } {
  'worklet';
  if (!joined && gap < 0.5) return { joined: true, kick: kicks.join };
  if (joined && gap > 0 && neck === null) return { joined: false, kick: kicks.snap };
  return { joined, kick: 0 };
}

/**
 * The stretched lead circle's cap nearest `toward`: a capsule `w` wide and `h` tall centred at x
 * joins as the circle of radius h / 2 at its end.
 */
export function leadCap(x: number, w: number, h: number, toward: number): LineCircle {
  'worklet';
  const reach = Math.max(0, (w - h) / 2);
  return { x: toward >= x ? x + reach : x - reach, r: h / 2 };
}

/**
 * THE FACING-END RULE. Which circle of the moving bubble the + joins: the one whose edge reaches
 * furthest toward the +, never a small circle tucked inside the lead. While the + sits between the
 * circles' centres there is no + joint — the bubble's own shape carries it — and null says so.
 * `circles[0]` is the lead.
 */
export function facingCircle(circles: readonly LineCircle[], plusX: number): LineCircle | null {
  'worklet';
  const lead = circles[0];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < circles.length; i++) {
    lo = Math.min(lo, circles[i].x);
    hi = Math.max(hi, circles[i].x);
  }
  if (plusX > lo && plusX < hi) return null;
  const right = plusX >= hi;
  let best: LineCircle | null = null;
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    const nested = i > 0 && Math.abs(c.x - lead.x) + c.r <= lead.r + 0.01;
    if (nested) continue;
    if (best === null) {
      best = c;
      continue;
    }
    if (right ? c.x + c.r > best.x + best.r : c.x - c.r < best.x - best.r) best = c;
  }
  return best;
}

/** The gap between the + (radius plusR at plusX) and a circle's edge; negative when they overlap. */
export function plusGap(plusX: number, plusR: number, c: LineCircle): number {
  'worklet';
  return Math.abs(plusX - c.x) - (plusR + c.r);
}

/** The lead circle's stretch while it moves: min(|v| / velocity, max). */
export function stretchOf(v: number, velocity: number, max: number): number {
  'worklet';
  return Math.min(Math.abs(v) / velocity, max);
}

/**
 * One spring step of `dt` seconds, semi-implicit Euler in `substep` slices — the integrator the
 * handoff page runs, so the device feels the page. Mass 1. Returns [position, velocity].
 */
export function springStep(
  x: number,
  v: number,
  target: number,
  k: number,
  c: number,
  dt: number,
  substep: number
): [number, number] {
  'worklet';
  const n = Math.ceil(dt / substep) || 1;
  const h = dt / n;
  let px = x;
  let pv = v;
  for (let i = 0; i < n; i++) {
    const acc = -k * (px - target) - c * pv;
    pv += acc * h;
    px += pv * h;
  }
  return [px, pv];
}
