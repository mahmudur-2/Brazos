#!/usr/bin/env node
// ground(3) — THE DARK HOME'S GROUND AND ITS HERO, MADE TO READ AS ONE SCENE.
//
//   node scripts/home-ground-blend.mjs --mockup <dir>   the mockup's copies (2x ground, feathered hero)
//   node scripts/home-ground-blend.mjs --apply          rewrite the two assets in place, once
//   node scripts/home-ground-blend.mjs --measure        the seam, before and after, on the assets
//
// The operator's question (2026-09-20, sitting 3, docs/DECISIONS.md that
// date): "create a background that blends in with the chair lamp tree photo
// so everything looks natural". On the phone the hero
// (assets/prestige/hero_armchair_customer.png, 400x351, a HARD trim — 35
// partial samples in the whole frame, tests/themeResolution.test.mjs's
// 'baked-trimmed') sits as an opaque rectangle on the atmosphere raster
// (home-atmosphere-dark.png), and the ground around that rectangle is a few
// levels brighter than the photo's own night: measured on the reference
// render, rgb(2,11,10) just outside the top edge against rgb(2,7,7) just
// inside, 4 levels below and 4 to the left. On an OLED that is a rectangle.
//
// Nothing is painted. Two measured transforms of the files the app already
// draws, chosen from four honest renders (NOW / a / b / c — the operator
// picked c):
//
//   THE FEATHER. The approved Home mockup fades the hero with a CSS mask —
//   radial-gradient(ellipse 82% 88% at 60% 48%, solid to 50%, gone at 100%)
//   — which React Native's Image cannot draw. The same falloff is multiplied
//   into the file's own alpha, so the phone gets the edge the mockup shows.
//   The light hero already carries a feathered edge of its own ('baked-
//   feathered') and is not touched.
//
//   THE POOL. The ground is pulled toward the photo's own edge tone,
//   rgb(2,6,6), under the hero's box — 184x162 at right -13 / top 137 of the
//   393x852 frame, x 222..406, y 137..299 — at strength .85 inside the box,
//   falling off as (1 - d / 90)^2 to nothing 90pt outside it. The mid-screen
//   glow the card sits on is untouched (the pool never reaches y > 389).
//
// Seam after c on the reference render: 1-2 levels at every edge.
//
// The codec is the repository's own — tests/pngGeometry.mjs decode() and
// scripts/atmosphere-tune.mjs encodePng() — because no image library is
// installed here and none may be. `--apply` is guarded: it records what it
// did in assets/prestige/home-ground-blend.json and refuses to run over a
// file it already transformed, because the feather and the pool compound.
// The originals are one `git show c59d2aa:<path>` away.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decode } from '../tests/pngGeometry.mjs';
import { encodePng } from './atmosphere-tune.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GROUND = 'assets/prestige/home-atmosphere-dark.png';
export const HERO = 'assets/prestige/hero_armchair_customer.png';
const MARKER = 'assets/prestige/home-ground-blend.json';

/** The phone frame the box is measured on, and the hero's box in it. */
export const FRAME = { w: 393, h: 852 };
export const HERO_BOX = { x0: 222, y0: 137, x1: 406, y1: 299 };
/** The pool: the hero's measured edge tone, its strength inside the box, its reach outside it (frame points). */
export const POOL = { tone: [2, 6, 6], strength: 0.85, reach: 90 };
/** The feather: the mockup's mask — centre and radii as fractions of the box, solid inside `solid`, gone at 1. */
export const FEATHER = { cx: 0.6, cy: 0.48, rx: 0.82, ry: 0.88, solid: 0.5 };

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** The ground with the pool, at the raster's own size: every pixel maps to the frame by scale. */
export function pooled(img) {
  if (img.bpp !== 3) throw new Error(`${GROUND}: expected RGB, got ${img.bpp} channels`);
  const out = Buffer.from(img.pixels);
  const sx = FRAME.w / img.width, sy = FRAME.h / img.height;
  for (let y = 0; y < img.height; y++) {
    const py = (y + 0.5) * sy;
    const dy = Math.max(HERO_BOX.y0 - py, 0, py - HERO_BOX.y1);
    if (dy >= POOL.reach) continue;
    for (let x = 0; x < img.width; x++) {
      const px = (x + 0.5) * sx;
      const dx = Math.max(HERO_BOX.x0 - px, 0, px - HERO_BOX.x1);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= POOL.reach) continue;
      const t = (1 - d / POOL.reach) ** 2 * POOL.strength;
      const i = (y * img.width + x) * 3;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(out[i + k] * (1 - t) + POOL.tone[k] * t);
    }
  }
  return { width: img.width, height: img.height, pixels: out, bpp: 3 };
}

/** The hero with the feather multiplied into its alpha. */
export function feathered(img) {
  if (img.bpp !== 4) throw new Error(`${HERO}: expected RGBA, got ${img.bpp} channels`);
  const out = Buffer.from(img.pixels);
  const cx = FEATHER.cx * img.width, cy = FEATHER.cy * img.height, rx = FEATHER.rx * img.width, ry = FEATHER.ry * img.height;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const d = Math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2);
    const m = d <= FEATHER.solid ? 1 : d >= 1 ? 0 : 1 - (d - FEATHER.solid) / (1 - FEATHER.solid);
    const i = (y * img.width + x) * 4 + 3;
    out[i] = Math.round(out[i] * m);
  }
  return { width: img.width, height: img.height, pixels: out, bpp: 4 };
}

/** A box-filter resample — the mockup's 2x frame is 786x1704. */
export function resample(img, W, H) {
  const bpp = img.bpp;
  const out = Buffer.alloc(W * H * bpp);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor((y * img.height) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / H));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * img.width) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / W));
      const s = new Array(bpp).fill(0); let n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.width + xx) * bpp; for (let k = 0; k < bpp; k++) s[k] += img.pixels[i + k]; n++; }
      const o = (y * W + x) * bpp;
      for (let k = 0; k < bpp; k++) out[o + k] = Math.round(s[k] / n);
    }
  }
  return { width: W, height: H, pixels: out, bpp };
}

const png = (img) => encodePng({ width: img.width, height: img.height, pixels: img.pixels, bpp: img.bpp });

function main() {
  const argv = process.argv.slice(2);
  const ground = decode(join(root, GROUND));
  const hero = decode(join(root, HERO));
  const at = argv.indexOf('--mockup');
  if (at >= 0) {
    const dir = argv[at + 1];
    if (!dir) throw new Error('--mockup needs a directory');
    writeFileSync(join(dir, 'home-ground-2x.png'), png(resample(pooled(ground), 786, 1704)));
    writeFileSync(join(dir, 'hero-feathered.png'), png(feathered(hero)));
    console.log(`wrote ${dir}/home-ground-2x.png (786x1704, pooled) and ${dir}/hero-feathered.png (${hero.width}x${hero.height})`);
    return;
  }
  if (argv.includes('--apply')) {
    const markerPath = join(root, MARKER);
    const groundBytes = readFileSync(join(root, GROUND)), heroBytes = readFileSync(join(root, HERO));
    if (existsSync(markerPath)) {
      const m = JSON.parse(readFileSync(markerPath, 'utf8'));
      if (m.output?.ground === sha(groundBytes) || m.output?.hero === sha(heroBytes)) {
        throw new Error(`${MARKER}: these assets were already transformed (${m.date}); the feather and the pool compound — restore the originals first`);
      }
    }
    const newGround = png(pooled(ground)), newHero = png(feathered(hero));
    writeFileSync(join(root, GROUND), newGround);
    writeFileSync(join(root, HERO), newHero);
    writeFileSync(
      markerPath,
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), pool: POOL, heroBox: HERO_BOX, feather: FEATHER, input: { ground: sha(groundBytes), hero: sha(heroBytes) }, output: { ground: sha(newGround), hero: sha(newHero) } }, null, 2) + '\n'
    );
    console.log(`rewrote ${GROUND} (${ground.width}x${ground.height}, RGB) and ${HERO} (${hero.width}x${hero.height}, RGBA); marker ${MARKER}`);
    return;
  }
  if (argv.includes('--measure')) {
    // the seam on the raster itself: the ground just outside the hero box against the hero's own edge, per side
    const sx = ground.width / FRAME.w, sy = ground.height / FRAME.h;
    const patch = (img, fx, fy) => { const s = [0, 0, 0]; let n = 0; for (let y = Math.round((fy - 3) * sy); y < (fy + 3) * sy; y++) for (let x = Math.round((fx - 3) * sx); x < (fx + 3) * sx; x++) { if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue; const c = img.at(x, y); for (let k = 0; k < 3; k++) s[k] += c[k]; n++; } return s.map((v) => Math.round(v / n)); };
    const after = pooled(ground); after.at = (x, y) => { const i = (y * after.width + x) * 3; return [after.pixels[i], after.pixels[i + 1], after.pixels[i + 2], 255]; };
    for (const [label, img] of [['before', ground], ['after ', after]]) {
      console.log(label, 'ground outside the hero — left', patch(img, 212, 218), 'top', patch(img, 300, 128), 'below', patch(img, 300, 309), '| the hero\'s edge tone', POOL.tone);
    }
    return;
  }
  console.log('usage: --mockup <dir> | --apply | --measure');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
