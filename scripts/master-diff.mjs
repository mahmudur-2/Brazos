#!/usr/bin/env node
// lit(1) — home-diff GENERALIZED, PLUS THE COLOUR QUESTION IT COULD NOT ASK.
//
// scripts/home-diff.mjs measured WHERE things are. It could not say what
// COLOUR they are, so the largest non-typographic gap between master 44 and
// the phone — the promo card and the "Post a job" pill are LIT in the master
// and FLAT in the app — was invisible to it. This file is that tool with the
// screen-specific defaults lifted out and a colour pass added; home-diff.mjs
// is now a thin shim over it and prints byte-identically to what it always
// printed (the colour pass is off for it).
//
//   node scripts/master-diff.mjs
//   node scripts/master-diff.mjs --render .shots/customer-home-dark.png \
//                                --master docs/mockups/44_customer_home_dark.png
//   node scripts/master-diff.mjs --master-inset 59 --render-inset 0
//
// Output goes to stdout only. Nothing is written to disk, so nothing can be
// committed by accident; `.shots/` is gitignored and this never touches it.
//
// -------------------------------------------------------------------------
// WHY IT NORMALISES TO THE MASTER'S PIXEL WIDTH.
//
// The master is an iPhone screenshot at 853x1844; the harness renders at
// 393x852 with deviceScaleFactor 1. Comparing them pixel-for-pixel is
// meaningless until one is resampled onto the other, and the master is the
// reference, so the RENDER moves. The resampling is nearest-neighbour and
// deliberately so: this tool measures EDGES, and a smoothing filter would move
// the very thing being measured. Both images are then reported in POINTS —
// master pixels x 393/853, render pixels x 393/393 — because points are the
// only unit a stylesheet can be edited in.
//
// WHY THE TWO INSETS.
//
// The master carries iOS chrome: a 59pt safe-area inset at the top and the
// home indicator at the bottom. The web harness has neither — insets resolve
// to 0 there. Comparing raw Y would then report a ~59pt error on every element
// on the screen, which is a fact about the harness, not about the layout. So
// each side declares its own inset and everything vertical is reported
// CONTENT-RELATIVE: y = 0 is the top of the app's own content box on both.
// `--master-inset 59` is the iPhone 15 Pro value and is derived, not assumed:
// master 44's "Switch to Worker" pill is the tallest thing in the first row,
// so its top IS the content top, and it measures 67.2pt from the screen top
// against the screen's own 8pt of content padding.
//
// WHAT IT CANNOT SEE. The harness's jobs fixture is empty, so no Live Nearby
// card renders and no card geometry can be compared here; master 44 draws none
// either (the dock covers that band), so the two agree by accident rather than
// by measurement. That band is masked in the difference summary and named in
// the output.
//
// -------------------------------------------------------------------------
// THE COLOUR PASS, AND THE THREE THINGS IT HAS TO GET RIGHT.
//
// 1. IT MUST SAMPLE THE FILL, NOT THE BORDER. Every patch centre is placed on
//    the diagonal of the box INSET by the hairline allowance plus half a
//    patch, so a 7x7 patch can never overlap the very hairline the edge pass
//    found. The inset is computed in each image's own pixels from a 2pt
//    allowance, because the two images are at different scales.
//
// 2. IT MUST NOT MEASURE TYPE. A patch that lands on the eyebrow, the
//    headline or the gold drape reports that ink's luminance, not the
//    surface's. Ink is detected by SPREAD, not by threshold — a flat fill and
//    a slow gradient both have a luminance standard deviation near zero over
//    49 adjacent pixels, and anything with an edge in it does not. A rejected
//    patch steps INWARD along the diagonal (toward t = 0.5) until it is clean.
//    If no clean patch exists within the cap the LEAST inky one is reported
//    with its spread and an `ink` flag, because a silent substitution here
//    would be a fabricated colour.
//
// 3. IT MUST SURVIVE A CONTROL THAT ONE IMAGE CANNOT SEE. The dark "Post a
//    job" pill sets `borderColor: 'transparent'`, so the render has no
//    hairline there and the edge pass finds no box — while master 44, which
//    draws a faint lighter top edge, does. Falling back to "no data" would
//    hide exactly the difference this run exists to measure, so a control
//    found in one image is PROJECTED into the other through content-relative
//    points and reported as `projected`. It is the same region of the same
//    screen either way; only the evidence for its bounds differs.
//
// The median is taken per channel over the 49 pixels rather than the mean:
// one stray antialiased pixel at the edge of a patch moves a mean and does
// not move a median.
// -------------------------------------------------------------------------

import { pathToFileURL } from 'node:url';
import { decode, luminance } from '../tests/pngGeometry.mjs';

const DEVICE_WIDTH_PT = 393;
const DEVICE_HEIGHT_PT = 852;
/** screens/HomeScreen.tsx: `content` carries paddingTop: spacing.sm. */
const CONTENT_PADDING_TOP_PT = 8;

/** Patch edge, in each image's OWN pixels. */
const PATCH_PX = 7;
/** Hairline allowance, in points, kept between a patch and the box edge. */
const HAIRLINE_ALLOWANCE_PT = 2;
/**
 * Luminance standard deviation, 0..255, above which a patch is judged to
 * contain ink. A flat fill and a slow gradient both sit well under one unit
 * over seven adjacent pixels; type and artwork are an order of magnitude above.
 */
const INK_SD = 6;
/** Diagonal step taken per rejection, and how many are allowed. */
const INK_STEP = 0.01;
/** 45 x 0.01 reaches t = 0.5 from either 0.10 or 0.90, which is the far end. */
const INK_MAX_STEPS = 45;

export function parseArgs(argv) {
  const out = {
    render: '.shots/customer-home-dark.png',
    master: 'docs/mockups/44_customer_home_dark.png',
    masterInset: 59,
    renderInset: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--render') out.render = value;
    else if (flag === '--master') out.master = value;
    else if (flag === '--master-inset') out.masterInset = Number(value);
    else if (flag === '--render-inset') out.renderInset = Number(value);
    else continue;
    i += 1;
  }
  return out;
}

/**
 * A decoded image plus everything the measurements below need to talk about it
 * in points: `sx`/`sy` are points per pixel, `origin` is the pixel row the app's
 * own content box starts on.
 */
export function load(path, insetPt) {
  const img = decode(path);
  // The two axes are NOT one number: master 44 is 853x1844 (0.46258) against
  // the device's 393x852 (0.46127), a 0.28% difference. Carrying both is what
  // makes height fractions transfer at all.
  const sx = DEVICE_WIDTH_PT / img.width;
  const sy = DEVICE_HEIGHT_PT / img.height;
  return {
    img,
    path,
    sx,
    sy,
    lum: (x, y) => luminance(...img.at(x, y)),
    insetPt,
  };
}

/** Content-relative point coordinates. */
const toPtX = (s, px) => px * s.sx;
const toPtY = (s, px) => px * s.sy - (s.insetPt + CONTENT_PADDING_TOP_PT);
/** The inverses, for projecting a control found in the other image. */
const fromPtX = (s, pt) => pt / s.sx;
const fromPtY = (s, pt) => (pt + s.insetPt + CONTENT_PADDING_TOP_PT) / s.sy;

/**
 * Every horizontal hairline in the image: a run of pixels that is brighter
 * than the rows a few above and below it. That is what the top or bottom edge
 * of an outlined control is, and what a filled area or a line of type is not.
 */
export function horizontalEdges(s, minRunPt) {
  const { img } = s;
  const minRun = Math.round(minRunPt / s.sx);
  const found = [];
  for (let y = 4; y < img.height - 4; y += 1) {
    let runStart = null;
    for (let x = 0; x <= img.width; x += 1) {
      const here = x < img.width ? s.lum(x, y) : 0;
      const above = x < img.width ? Math.max(s.lum(x, y - 3), s.lum(x, y - 4)) : 255;
      const below = x < img.width ? Math.max(s.lum(x, y + 3), s.lum(x, y + 4)) : 255;
      const isEdge = x < img.width && here > 26 && here > above + 8 && here > below + 8;
      if (isEdge) {
        if (runStart === null) runStart = x;
      } else if (runStart !== null) {
        if (x - runStart >= minRun) found.push({ y, x0: runStart, x1: x - 1 });
        runStart = null;
      }
    }
  }
  // Collapse the 2-3 rows one antialiased hairline spans into its widest row.
  // The comparison walks BACK through the recent entries rather than checking
  // only the previous one: two chips on the same row interleave in scan order,
  // and comparing only the last entry reports each pill twice.
  const merged = [];
  for (const edge of found) {
    let hit = -1;
    for (let k = merged.length - 1; k >= 0 && edge.y - merged[k].y <= 3; k -= 1) {
      if (edge.x0 <= merged[k].x1 && edge.x1 >= merged[k].x0) { hit = k; break; }
    }
    if (hit >= 0) {
      if (edge.x1 - edge.x0 > merged[hit].x1 - merged[hit].x0) merged[hit] = edge;
      continue;
    }
    merged.push(edge);
  }
  return merged;
}

/**
 * Pairs those edges into boxes: a top edge and the next edge below it whose
 * horizontal extent overlaps by most of its length. An outlined control has
 * exactly one such partner; a stray edge has none and is reported as unpaired.
 */
export function outlineBoxes(s, minRunPt) {
  const edges = horizontalEdges(s, minRunPt);
  const used = new Set();
  const boxes = [];
  for (let i = 0; i < edges.length; i += 1) {
    if (used.has(i)) continue;
    const top = edges[i];
    for (let j = i + 1; j < edges.length; j += 1) {
      if (used.has(j)) continue;
      const bottom = edges[j];
      const overlap = Math.min(top.x1, bottom.x1) - Math.max(top.x0, bottom.x0);
      const shorter = Math.min(top.x1 - top.x0, bottom.x1 - bottom.x0);
      const longer = Math.max(top.x1 - top.x0, bottom.x1 - bottom.x0);
      if (overlap < shorter * 0.9) continue;
      // A control's two edges are the SAME width. Without this, a card's top
      // edge happily pairs with the top edge of the button inside it.
      if (shorter < longer * 0.9) continue;
      const heightPt = (bottom.y - top.y) * s.sy;
      if (heightPt < 20 || heightPt > 420) continue;
      used.add(i);
      used.add(j);
      const hintX0 = Math.min(top.x0, bottom.x0);
      const hintX1 = Math.max(top.x1, bottom.x1);
      const side = verticalEdges(s, top.y, bottom.y, hintX0, hintX1);
      // A rounded rectangle's straight top edge is SYMMETRIC about the box's
      // own centre, so the run above gives that centre exactly. Ink inside the
      // control — the gold B beside the promo copy, a chip's glyph — can only
      // pull a side edge inward, never outward, so the more outboard of the two
      // sides is the honest half-width and the other is a near miss.
      const centre = (hintX0 + hintX1) / 2;
      const half = Math.max(centre - side.left, side.right - centre);
      boxes.push({
        top: top.y,
        bottom: bottom.y,
        left: Math.round(centre - half),
        right: Math.round(centre + half),
      });
      break;
    }
  }
  return boxes.sort((a, b) => a.top - b.top);
}

/**
 * A box's left and right edges — the same test as `horizontalEdges` turned
 * ninety degrees. A VERTICAL hairline is a column that is brighter than the
 * columns a few either side of it, held over most of the box's height; the
 * outermost two such columns are the control's own side borders.
 *
 * Scanning for where the fill "stops" instead does not survive both images:
 * master 44's card fill reads 15.9/255 against a ground that reaches 13.4, and
 * no single floor separates them. An edge is a gradient, and a gradient is what
 * this looks for.
 */
export function verticalEdges(s, top, bottom, hintX0, hintX1) {
  // The box's VERTICAL MIDDLE, and only that, because half the controls here
  // are full pills — the "Post a job" button is 48pt tall on a 24pt radius, so
  // its side "border" is an arc that never occupies one column for long. At the
  // middle row every shape, pill or rectangle, is at its true full width.
  const mid = Math.round((top + bottom) / 2);
  const band = Math.max(1, Math.round((bottom - top) * 0.08));
  // 40pt of slack covers the largest corner radius on this screen (the search
  // pill's 35) without reaching the next control: the widest gap it has to
  // cross is a chip row's 6pt.
  const slack = Math.round(40 / s.sx);
  // Two probe distances, and the surface step has to hold at BOTH. 2pt alone
  // mistakes the search field's magnifier for its left edge; 4pt alone
  // overshoots a pill's own border into the gap beyond it. A real border keeps
  // one surface outside and another inside at every distance; a glyph does not.
  const steps = [Math.max(3, Math.round(2 / s.sx)), Math.max(4, Math.round(4 / s.sx))];
  /**
   * A border, not a glyph. Both are bright lines; only a border has DIFFERENT
   * surfaces on its two sides. The search field's magnifier and the pill's
   * label both sit a few points inside their control's edge and would
   * otherwise be mistaken for it — they have the same fill on both sides, so
   * the surface-step test throws them out and keeps the border.
   */
  const isBorder = (x, dir) => {
    const reach = steps[steps.length - 1] * 2;
    if (x < reach + 1 || x >= s.img.width - reach - 1) return false;
    let hits = 0;
    let rows = 0;
    for (let y = mid - band; y <= mid + band; y += 1) {
      rows += 1;
      const here = s.lum(x, y);
      if (here <= 26) continue;
      let stepped = true;
      for (const step of steps) {
        const outside = s.lum(x + dir * step, y);
        const inside = s.lum(x - dir * step, y);
        if (!(here > Math.max(inside, outside) + 4 && Math.abs(inside - outside) > 4)) stepped = false;
      }
      // A border is THIN: 8pt inside it the surface is back to the fill. The
      // gold B's shaded highlights step the same way a border does over 2-4pt,
      // and this is what tells them apart. Only the inside is probed — 8pt
      // OUTSIDE a chip lands in the next chip along.
      if (!(here > s.lum(x - dir * steps[1] * 2, y) + 4)) stepped = false;
      if (stepped) hits += 1;
    }
    return hits >= Math.max(2, Math.round(rows * 0.6));
  };
  // The hint is where the STRAIGHT top edge stops, which is inside the corner
  // arc — so walking outward from it, the FIRST border met is this control's
  // own. Taking the outermost within reach instead swallows the next chip.
  let left = hintX0;
  for (let x = hintX0; x >= hintX0 - slack; x -= 1) if (isBorder(x, -1)) { left = x; break; }
  let right = hintX1;
  for (let x = hintX1; x <= hintX1 + slack; x += 1) if (isBorder(x, +1)) { right = x; break; }
  return { left, right };
}

/** Contiguous bands of type/artwork ink, with the bounding box of each. */
export function inkBands(s, threshold = 70, gapPt = 7) {
  const { img } = s;
  const gap = Math.round(gapPt / s.sy);
  const rows = [];
  for (let y = 0; y < img.height; y += 1) {
    let count = 0;
    for (let x = 0; x < img.width; x += 1) if (s.lum(x, y) > threshold) count += 1;
    rows.push(count);
  }
  const bands = [];
  let start = null;
  let lastHit = null;
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y] >= 2) {
      if (start === null) start = y;
      lastHit = y;
    } else if (start !== null && y - lastHit > gap) {
      bands.push([start, lastHit]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, lastHit]);
  return bands.map(([y0, y1]) => {
    let x0 = img.width;
    let x1 = -1;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        if (s.lum(x, y) <= threshold) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
    return { y0, y1, x0, x1 };
  });
}

const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1).padStart(7) : '      -');
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2).padStart(7) : '      -');
const i3 = (n) => String(Math.round(n)).padStart(3);

function reportBoxes(label, s, boxes) {
  console.log(`\n${label} — outlined boxes (points, y content-relative)`);
  console.log('   x       y       w       h    right-inset');
  for (const b of boxes) {
    const x = toPtX(s, b.left);
    const w = toPtX(s, b.right - b.left + 1);
    const y = toPtY(s, b.top);
    const h = (b.bottom - b.top + 1) * s.sy;
    console.log(`${f1(x)} ${f1(y)} ${f1(w)} ${f1(h)}   ${f1(DEVICE_WIDTH_PT - x - w)}`);
  }
}

function reportBands(label, s, bands) {
  console.log(`\n${label} — ink bands (points, y content-relative)`);
  console.log('   x       y       w       h');
  for (const b of bands) {
    console.log(
      `${f1(toPtX(s, b.x0))} ${f1(toPtY(s, b.y0))} ` +
        `${f1(toPtX(s, b.x1 - b.x0 + 1))} ${f1((b.y1 - b.y0 + 1) * s.sy)}`,
    );
  }
}

/** Pairs master and render entries by nearest content-relative Y. */
function pairUp(master, render, keyMaster, keyRender) {
  const rows = [];
  const taken = new Set();
  for (const m of master) {
    let best = -1;
    let bestGap = Infinity;
    for (let i = 0; i < render.length; i += 1) {
      if (taken.has(i)) continue;
      const gap = Math.abs(keyRender(render[i]) - keyMaster(m));
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    if (best >= 0 && bestGap < 90) { taken.add(best); rows.push([m, render[best]]); }
    else rows.push([m, null]);
  }
  for (let i = 0; i < render.length; i += 1) if (!taken.has(i)) rows.push([null, render[i]]);
  return rows;
}

/**
 * Mean absolute luminance difference over the normalised overlap, after the
 * render is resampled onto the master's grid and both are put on the same
 * content origin. Masked: the status bar and the home indicator (iOS chrome,
 * never app UI), the greeting string and the Live Nearby band (dynamic
 * content — the harness's jobs fixture is empty by design).
 */
function differenceSummary(m, r) {
  const rowsPt = [];
  const maskedPt = [
    ['status bar / safe area', -Infinity, 0],
    ['greeting string', 0, 46],
  ];
  const height = m.img.height;
  let total = 0;
  let counted = 0;
  for (let y = 0; y < height; y += 1) {
    const yPt = toPtY(m, y);
    if (yPt < 0 || yPt > DEVICE_HEIGHT_PT) continue;
    const ry = Math.round((yPt + r.insetPt + CONTENT_PADDING_TOP_PT) / r.sy);
    if (ry < 0 || ry >= r.img.height) continue;
    let sum = 0;
    let n = 0;
    for (let x = 0; x < m.img.width; x += 1) {
      const rx = Math.round((x * m.sx) / r.sx);
      if (rx < 0 || rx >= r.img.width) continue;
      sum += Math.abs(m.lum(x, y) - r.lum(rx, ry));
      n += 1;
    }
    if (!n) continue;
    const masked = maskedPt.some(([, a, b]) => yPt >= a && yPt < b);
    rowsPt.push({ yPt, mean: sum / n, masked });
    if (!masked) { total += sum / n; counted += 1; }
  }
  console.log('\nabsolute difference (render resampled onto the master grid)');
  console.log(`  mean |Δ luminance| over unmasked rows: ${(total / counted).toFixed(2)} / 255`);
  const strips = [];
  for (let i = 0; i < rowsPt.length; i += 1) {
    const strip = Math.floor(rowsPt[i].yPt / 20);
    strips[strip] ??= { sum: 0, n: 0, masked: rowsPt[i].masked };
    strips[strip].sum += rowsPt[i].mean;
    strips[strip].n += 1;
  }
  const ranked = strips
    .map((v, i) => (v ? { y: i * 20, mean: v.sum / v.n, masked: v.masked } : null))
    .filter((v) => v && !v.masked)
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 8);
  console.log('  worst 20pt strips (content-relative y):');
  for (const s of ranked) console.log(`    y ${String(s.y).padStart(4)}..${String(s.y + 20).padStart(4)}  ${s.mean.toFixed(1)}`);
  console.log('  masked: status bar, home indicator, greeting string, Live Nearby cards');
}

// ===========================================================================
// THE COLOUR PASS
// ===========================================================================

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One PATCH_PX x PATCH_PX patch centred on (cx, cy): the per-channel median
 * sRGB, the relative luminance OF THAT MEDIAN COLOUR, and the standard
 * deviation of the 49 individual luminances — which is the ink detector.
 */
export function patchStats(s, cx, cy) {
  const half = (PATCH_PX - 1) / 2;
  const r = [];
  const g = [];
  const b = [];
  const lums = [];
  for (let y = cy - half; y <= cy + half; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) {
      const px = Math.min(s.img.width - 1, Math.max(0, Math.round(x)));
      const py = Math.min(s.img.height - 1, Math.max(0, Math.round(y)));
      const [pr, pg, pb] = s.img.at(px, py);
      r.push(pr);
      g.push(pg);
      b.push(pb);
      lums.push(luminance(pr, pg, pb));
    }
  }
  const mean = lums.reduce((a, v) => a + v, 0) / lums.length;
  const sd = Math.sqrt(lums.reduce((a, v) => a + (v - mean) ** 2, 0) / lums.length);
  const mr = median(r);
  const mg = median(g);
  const mb = median(b);
  return { r: mr, g: mg, b: mb, y: luminance(mr, mg, mb), sd };
}

/**
 * The box inset by the hairline allowance plus half a patch, in this image's
 * own pixels — the rectangle a patch centre may legally sit in.
 */
function safeRect(s, box) {
  const inset = Math.ceil(HAIRLINE_ALLOWANCE_PT / s.sx) + (PATCH_PX - 1) / 2;
  const l = box.left + inset;
  const r = box.right - inset;
  const t = box.top + inset;
  const b = box.bottom - inset;
  // A control too small to hold a patch collapses to its own centre rather
  // than inverting; nothing on this screen does, but a caller's box might.
  if (r <= l || b <= t) {
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    return { l: cx, r: cx, t: cy, b: cy };
  }
  return { l, r, t, b };
}

/**
 * Whether a patch centred on (cx, cy) touches a control NESTED inside the one
 * being sampled, plus the hairline allowance so it cannot graze that control's
 * own border either.
 *
 * WHY THIS IS NOT OPTIONAL. The "Post a job" pill sits at the BOTTOM of the
 * promo card, so the card's own diagonal at 90% lands squarely inside the
 * pill — in BOTH images. Without this the card's reported delta is its
 * top-left against the PILL'S fill, which is a number about two different
 * surfaces and would calibrate a gradient against the wrong one. The ink test
 * cannot catch it: a flat pill fill has a standard deviation of zero, so it
 * reads as perfectly clean surface. It just is not the surface being asked
 * about.
 */
function hitsNested(s, cx, cy, nested) {
  const pad = Math.ceil(HAIRLINE_ALLOWANCE_PT / s.sx) + (PATCH_PX - 1) / 2;
  return nested.some(
    (b) =>
      cx >= b.left - pad && cx <= b.right + pad && cy >= b.top - pad && cy <= b.bottom + pad,
  );
}

/**
 * One diagonal sample at fraction `t0` from the safe rect's top-left to its
 * bottom-right, stepped INWARD (toward t = 0.5) while the patch reads as ink
 * or overlaps a nested control. Returns the accepted patch plus how far it had
 * to move, and never silently substitutes: `ink: true` means no clean patch
 * existed within the cap and the least inky one is being reported.
 */
export function diagonalSample(s, box, t0, nested = []) {
  const rect = safeRect(s, box);
  const dir = t0 < 0.5 ? +1 : -1;
  let best = null;
  for (let step = 0; step <= INK_MAX_STEPS; step += 1) {
    const t = t0 + dir * step * INK_STEP;
    if (dir > 0 ? t > 0.5 : t < 0.5) break;
    const cx = rect.l + t * (rect.r - rect.l);
    const cy = rect.t + t * (rect.b - rect.t);
    if (hitsNested(s, cx, cy, nested)) continue;
    const patch = { ...patchStats(s, cx, cy), t, cx, cy, steps: step };
    if (patch.sd <= INK_SD) return { ...patch, ink: false };
    if (!best || patch.sd < best.sd) best = patch;
  }
  // Every position on the inward half of the diagonal was either inky or
  // inside a nested control. Reporting nothing is the honest answer.
  if (!best) return null;
  return { ...best, ink: true };
}

/**
 * The promo card and the CTA, by SHAPE rather than by coordinate.
 *
 * The card is the tallest outlined box on the screen; the CTA is the widest
 * box whose top and bottom both lie strictly inside it. Neither test names a
 * pixel, so both survive the layout moving — which is the whole point of a
 * tool that is run again after a change.
 */
export function identifyControls(s, boxes) {
  let card = null;
  for (const b of boxes) {
    const h = (b.bottom - b.top + 1) * s.sy;
    if (h < 100) continue;
    if (!card || b.bottom - b.top > card.bottom - card.top) card = b;
  }
  let cta = null;
  if (card) {
    for (const b of boxes) {
      if (b === card) continue;
      if (b.top <= card.top || b.bottom >= card.bottom) continue;
      if (!cta || b.right - b.left > cta.right - cta.left) cta = b;
    }
  }
  return { card, cta };
}

/** Content-relative point rectangle, so a control can cross between images. */
const boxToPt = (s, b) => ({
  x: toPtX(s, b.left),
  y: toPtY(s, b.top),
  w: toPtX(s, b.right - b.left + 1),
  h: (b.bottom - b.top + 1) * s.sy,
});

const boxFromPt = (s, p) => ({
  left: Math.round(fromPtX(s, p.x)),
  right: Math.round(fromPtX(s, p.x + p.w)) - 1,
  top: Math.round(fromPtY(s, p.y)),
  bottom: Math.round(fromPtY(s, p.y + p.h)) - 1,
});

/**
 * The page ground, from the blank band immediately above the search pill.
 *
 * The search pill is the first near-full-width outlined box below the
 * greeting; the band is what is left between the last ink above it and its own
 * top edge. The sample walks outward from the horizontal centre until a patch
 * comes back clean, so a stray glyph in the middle of the band cannot become
 * "the ground".
 */
export function groundSample(s, boxes, bands) {
  const pill = boxes.find(
    (b) => toPtY(s, b.top) > 100 && toPtX(s, b.right - b.left + 1) > 250,
  );
  if (!pill) return null;
  let inkBottom = 0;
  for (const band of bands) if (band.y1 < pill.top) inkBottom = Math.max(inkBottom, band.y1);
  const gapTop = inkBottom + Math.round(2 / s.sy);
  const gapBottom = pill.top - Math.round(2 / s.sy);
  if (gapBottom - gapTop < PATCH_PX) return null;
  const cy = (gapTop + gapBottom) / 2;
  const centre = s.img.width / 2;
  const reach = Math.floor(s.img.width / 2) - PATCH_PX;
  for (let d = 0; d <= reach; d += Math.max(1, Math.round(4 / s.sx))) {
    for (const cx of d === 0 ? [centre] : [centre - d, centre + d]) {
      if (cx < PATCH_PX || cx > s.img.width - PATCH_PX) continue;
      const patch = patchStats(s, cx, cy);
      if (patch.sd <= INK_SD) {
        return { ...patch, cx, cy, yPt: toPtY(s, cy), xPt: toPtX(s, cx) };
      }
    }
  }
  return null;
}

const hex = (p) =>
  '#' +
  [p.r, p.g, p.b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

function reportColour(master, render, controls) {
  console.log('\n' + '='.repeat(78));
  console.log(
    `COLOUR — ${PATCH_PX}x${PATCH_PX}px patches on each control's top-left→bottom-right diagonal`,
  );
  console.log(
    `  a patch covers ${(PATCH_PX * master.sx).toFixed(1)}pt on the master and ` +
      `${(PATCH_PX * render.sx).toFixed(1)}pt on the render; ink is rejected above sd ${INK_SD}`,
  );
  console.log(
    '\ncontrol      image   bounds     t     x pt    y pt  median      R   G   B       Y      sd  steps ink',
  );
  const rows = [];
  for (const [name, pair] of Object.entries(controls)) {
    for (const [imageName, s, entry] of [
      ['master', master, pair.master],
      ['render', render, pair.render],
    ]) {
      if (!entry) {
        console.log(`${name.padEnd(12)} ${imageName}  — not found in either image, nothing to project`);
        continue;
      }
      for (const t of [0.1, 0.9]) {
        const p = diagonalSample(s, entry.box, t, entry.nested);
        rows.push({ name, imageName, t, p });
        if (!p) {
          console.log(
            `${name.padEnd(12)} ${imageName}  ${entry.source.padEnd(9)} ${t.toFixed(2)}   ` +
              'no patch on this half of the diagonal is free of ink and nested controls',
          );
          continue;
        }
        console.log(
          `${name.padEnd(12)} ${imageName}  ${entry.source.padEnd(9)} ${p.t.toFixed(2)} ` +
            `${f1(toPtX(s, p.cx))} ${f1(toPtY(s, p.cy))} ${hex(p).padEnd(8)} ` +
            `${i3(p.r)} ${i3(p.g)} ${i3(p.b)} ${f2(p.y)} ${f2(p.sd)}  ${String(p.steps).padStart(3)}  ${p.ink ? 'YES' : 'no'}`,
        );
      }
    }
  }

  console.log(
    '\ndiagonal luminance delta (patch at 10% − patch at 90%; positive = lighter at top-left)',
  );
  console.log('control          master   render   render − master');
  const deltas = {};
  for (const name of Object.keys(controls)) {
    const pick = (imageName, t) =>
      rows.find((r) => r.name === name && r.imageName === imageName && r.t === t)?.p?.y;
    const m = pick('master', 0.1) - pick('master', 0.9);
    const r = pick('render', 0.1) - pick('render', 0.9);
    deltas[name] = { master: m, render: r };
    console.log(`${name.padEnd(14)} ${f2(m)}  ${f2(r)}          ${f2(r - m)}`);
  }
  return deltas;
}

function reportGround(label, s, ground) {
  if (!ground) {
    console.log(`  ${label}  no clean blank band was found above the search pill`);
    return;
  }
  console.log(
    `  ${label}  x ${f1(ground.xPt)}pt  y ${f1(ground.yPt)}pt  ${hex(ground)}  ` +
      `R ${i3(ground.r)} G ${i3(ground.g)} B ${i3(ground.b)}  Y ${f2(ground.y)}  sd ${f2(ground.sd)}`,
  );
}

// ===========================================================================

/**
 * The whole report. `title` and `colour` are what make scripts/home-diff.mjs a
 * shim over this file rather than a second copy of it: home-diff passes its
 * own banner and leaves the colour pass off, and its output is unchanged.
 */
export function run({ render: renderPath, master: masterPath, masterInset, renderInset, title, colour }) {
  const master = load(masterPath, masterInset);
  const render = load(renderPath, renderInset);

  console.log(title);
  console.log(
    `  master  ${master.path}  ${master.img.width}x${master.img.height}px  ` +
      `${master.sx.toFixed(4)} pt/px across, ${master.sy.toFixed(4)} down, inset ${master.insetPt}pt`,
  );
  console.log(
    `  render  ${render.path}  ${render.img.width}x${render.img.height}px  ` +
      `${render.sx.toFixed(4)} pt/px across, ${render.sy.toFixed(4)} down, inset ${render.insetPt}pt`,
  );
  console.log(`  normalisation: render x ${(master.img.width / render.img.width).toFixed(4)} to the master's pixel width`);

  const mBoxes = outlineBoxes(master, 40);
  const rBoxes = outlineBoxes(render, 40);
  reportBoxes('MASTER', master, mBoxes);
  reportBoxes('RENDER', render, rBoxes);

  console.log('\nbox deltas (render − master, points)');
  console.log('  master y  master w  master h |  render y  render w  render h |     Δy      Δw      Δh');
  for (const [m, r] of pairUp(mBoxes, rBoxes, (b) => toPtY(master, b.top), (b) => toPtY(render, b.top))) {
    const my = m ? toPtY(master, m.top) : NaN;
    const mw = m ? toPtX(master, m.right - m.left + 1) : NaN;
    const mh = m ? (m.bottom - m.top + 1) * master.sy : NaN;
    const ry = r ? toPtY(render, r.top) : NaN;
    const rw = r ? toPtX(render, r.right - r.left + 1) : NaN;
    const rh = r ? (r.bottom - r.top + 1) * render.sy : NaN;
    console.log(
      `${f1(my)} ${f1(mw)} ${f1(mh)} | ${f1(ry)} ${f1(rw)} ${f1(rh)} | ${f1(ry - my)} ${f1(rw - mw)} ${f1(rh - mh)}`,
    );
  }

  const mBands = inkBands(master);
  const rBands = inkBands(render);
  reportBands('MASTER', master, mBands);
  reportBands('RENDER', render, rBands);

  differenceSummary(master, render);

  if (!colour) return null;

  // A control the edge pass found in only one image is PROJECTED into the
  // other through content-relative points, and labelled as such. The dark
  // CTA's border is transparent, so this is not an edge case here — it is the
  // normal path for that control until it is given a lit top edge.
  const mFound = identifyControls(master, mBoxes);
  const rFound = identifyControls(render, rBoxes);
  const resolve = (own, other, self, peer) =>
    own ? { box: own, source: 'edges' } : other ? { box: boxFromPt(self, boxToPt(peer, other)), source: 'projected' } : null;
  const controls = {};
  for (const name of ['promo card', 'CTA']) {
    const key = name === 'CTA' ? 'cta' : 'card';
    controls[name] = {
      master: resolve(mFound[key], rFound[key], master, render),
      render: resolve(rFound[key], mFound[key], render, master),
    };
  }
  // The CTA is nested inside the promo card, so the card's own samples must
  // step around it — including when the CTA's bounds came from the other image.
  for (const image of ['master', 'render']) {
    const card = controls['promo card'][image];
    const cta = controls.CTA[image];
    if (card) {
      card.nested =
        cta && cta.box.top > card.box.top && cta.box.bottom < card.box.bottom ? [cta.box] : [];
    }
    if (cta) cta.nested = [];
  }

  const deltas = reportColour(master, render, controls);

  console.log('\nground (blank band above the search pill)');
  reportGround('master', master, groundSample(master, mBoxes, mBands));
  reportGround('render', render, groundSample(render, rBoxes, rBands));

  return deltas;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  run({ ...args, title: 'master-diff — a master versus a harness render', colour: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
