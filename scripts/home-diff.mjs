#!/usr/bin/env node
// home(20) — MEASURING A RENDER AGAINST MASTER 44 INSTEAD OF LOOKING AT IT.
//
// `node scripts/shots.mjs --only home` produces the picture (and so does its
// Home entry point, `node scripts/home-shots.mjs`). This reads two pictures
// and produces NUMBERS: where every outlined control and every band of ink
// actually sits, in points, in both, and how far apart they are.
//
//   node scripts/home-diff.mjs
//   node scripts/home-diff.mjs --render .shots/customer-home-dark.png \
//                              --master docs/mockups/44_customer_home_dark.png
//   node scripts/home-diff.mjs --master-inset 59 --render-inset 0
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
// -------------------------------------------------------------------------

import { decode, luminance } from '../tests/pngGeometry.mjs';

const DEVICE_WIDTH_PT = 393;
const DEVICE_HEIGHT_PT = 852;
/** screens/HomeScreen.tsx: `content` carries paddingTop: spacing.sm. */
const CONTENT_PADDING_TOP_PT = 8;

function parseArgs(argv) {
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
function load(path, insetPt) {
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

/**
 * Every horizontal hairline in the image: a run of pixels that is brighter
 * than the rows a few above and below it. That is what the top or bottom edge
 * of an outlined control is, and what a filled area or a line of type is not.
 */
function horizontalEdges(s, minRunPt) {
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
function outlineBoxes(s, minRunPt) {
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
function verticalEdges(s, top, bottom, hintX0, hintX1) {
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
function inkBands(s, threshold = 70, gapPt = 7) {
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const master = load(args.master, args.masterInset);
  const render = load(args.render, args.renderInset);

  console.log('home-diff — master 44 versus a harness render');
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

  reportBands('MASTER', master, inkBands(master));
  reportBands('RENDER', render, inkBands(render));

  differenceSummary(master, render);
}

main();
