#!/usr/bin/env node
// ground(2) — THE ATMOSPHERE RASTER, RE-WRITTEN BY MEASUREMENT.
//
//   node scripts/atmosphere-tune.mjs --selftest     encoder round-trip only
//   node scripts/atmosphere-tune.mjs                rewrite the asset in place
//   node scripts/atmosphere-tune.mjs --in a.png --out b.png
//   node scripts/atmosphere-tune.mjs --determinism  two runs on one copy
//
// Two operator-reported defects live in assets/prestige/home-atmosphere-dark.png
// rather than in any stylesheet, so no amount of token work can reach them:
// the layer's BANDING, and the question of whether its ground is too bright.
// This is the transform that answers both, and it is deterministic and
// re-runnable so the answer can be re-derived rather than believed.
//
// -------------------------------------------------------------------------
// WHY THERE IS A PNG ENCODER IN HERE.
//
// This machine has no image library — no sharp, no jimp, no ImageMagick, no
// Python — and none may be installed. That is a fixed condition, not a
// blocker: PNG's baseline is small enough to write. What is below builds
// IHDR / IDAT / IEND with their own CRC32s, filters the scanlines and
// deflates them with node:zlib, and nothing else. tests/pngGeometry.mjs's
// decode() is the exact inverse, so `--selftest` encodes a buffer, decodes it
// back through THAT decoder and compares every pixel and the colour type. It
// runs before the real asset is touched, on every invocation.
//
// THE FILTER CHOICE IS NOT COSMETIC. Filter 0 on every row is correct and is
// what the spec calls None, but a dithered near-black frame stored that way
// deflates to about three times the size of the same frame stored with the
// standard minimum-sum-of-absolute-differences heuristic, because the
// residuals a Sub/Up/Paeth row produces cluster on zero and the raw values do
// not. The decoder handles all five filter types already, so the heuristic
// costs nothing to read back.
//
// -------------------------------------------------------------------------
// (a) BRIGHTNESS — DARKENED ONLY WHERE IT MEASURED ABOVE THE MASTER.
//
// The premise this replaces: an earlier analysis called this layer "4.9x too
// bright" by comparing its CENTRE box against master 44's SIDE GUTTERS. Those
// are different regions of a screen and the ratio was a number about two
// different places. `node scripts/master-diff.mjs --ground <master> <render>`
// exists to ask the question properly — the same normalised patch in both
// images — and MEASURED is what it returned against master 44 and the harness
// render at bfb4c52. Three of the four positions it could measure show the
// render at or BELOW the master; one is above, by 1.57/255.
//
// So the gain map below is 1.0 — no change whatever — everywhere except a
// smooth well around that one position. It is not a scale on the frame. A
// uniform scale calibrated on one corner would take the other three further
// below a master they already sit under, and would move the vignette this
// layer exists to carry.
//
// WHY A RASTER FRACTION IS A SCREEN FRACTION HERE. The layer mounts with
// resizeMode="cover" and the raster is 1290x2796 (0.46137) against the device's
// 393x852 (0.46127), so once the layer spans the full screen the two map one
// to one and a fraction of the file is a fraction of the screen. Before the
// nav pill floats it spans the scene only, about 90% of the height, which
// shifts a sampled band by under 5% of the frame — an order of magnitude
// inside the falloff below, which is why the falloff is that wide.
//
// (b) BANDING — DITHERED UNCONDITIONALLY, AT THE LEAST AMPLITUDE THAT HOLDS.
//
// The metric is the one scripts/master-diff.mjs --asset prints: plateaus
// longer than 8px down the centre column, where a plateau is a run whose luma
// never leaves the value it started on by more than one level. Master 44's own
// is 44. This raster measured 33 before the transform — already under it — and
// ±1 takes it to 19 while ±2 takes it to 3. The least amplitude that holds the
// metric is therefore ±1, and that is what ships; the target was met at
// baseline and this lowers it further rather than rescuing it. Amplitude is
// the one lever here that costs file size, so it is not spent on taste.
// -------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decode } from '../tests/pngGeometry.mjs';

const ASSET = 'assets/prestige/home-atmosphere-dark.png';

/**
 * The input this transform is calibrated against, so an in-place re-run cannot
 * silently apply the gain twice. `--force` is the deliberate override.
 */
const SOURCE_SHA256 = '4875916018ca84b97dfdd68170f400e57978350cc44a18ca3ff80d6c841a388b';

// ===========================================================================
// PNG ENCODER — colour type 2, 8-bit, non-interlaced
// ===========================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** length + type + data + CRC32 of (type + data), which is what a chunk is. */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * One scanline under one filter type, written into `out`. The five are PNG's
 * own None / Sub / Up / Average / Paeth, byte for byte the inverse of the
 * unfilter loop in tests/pngGeometry.mjs.
 */
function filterRow(type, cur, prev, bpp, out) {
  for (let x = 0; x < cur.length; x += 1) {
    const left = x >= bpp ? cur[x - bpp] : 0;
    const up = prev ? prev[x] : 0;
    const upLeft = prev && x >= bpp ? prev[x - bpp] : 0;
    let v = cur[x];
    if (type === 1) v -= left;
    else if (type === 2) v -= up;
    else if (type === 3) v -= (left + up) >> 1;
    else if (type === 4) v -= paeth(left, up, upLeft);
    out[x] = v & 0xff;
  }
}

/**
 * Encodes an RGB pixel buffer (3 bytes per pixel, row-major) as a PNG.
 *
 * The filter for each row is chosen by the minimum-sum-of-absolute-differences
 * heuristic the PNG specification itself recommends: the filtered bytes are
 * read as signed and the type with the smallest total magnitude wins.
 */
export function encodePng({ width, height, pixels }) {
  const bpp = 3;
  const stride = width * bpp;
  if (pixels.length !== height * stride) {
    throw new Error(`encodePng: expected ${height * stride} bytes, got ${pixels.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB, no alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  const raw = Buffer.alloc(height * (stride + 1));
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type <= 4; type += 1) {
      filterRow(type, cur, prev, bpp, candidate);
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const b = candidate[x];
        score += b < 128 ? b : 256 - b;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    raw[y * (stride + 1)] = bestType;
    filterRow(bestType, cur, prev, bpp, raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The encoder proved against the decoder the rest of the repo already trusts.
 * The fixture is deliberately awkward: a diagonal gradient so Sub, Up and
 * Paeth each win somewhere, a flat plateau so None can win, and a fixed
 * pseudo-random channel so no filter is trivially perfect.
 */
export function selfTest() {
  const width = 61;
  const height = 43;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 0x2545f491;
  const next = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      pixels[i] = (x * 4 + y * 3) & 0xff;
      pixels[i + 1] = x < 20 ? 17 : (y * 6) & 0xff;
      pixels[i + 2] = next() & 0xff;
    }
  }
  const path = join(tmpdir(), 'brazos-atmosphere-tune-selftest.png');
  writeFileSync(path, encodePng({ width, height, pixels }));
  const back = decode(path);
  if (back.width !== width || back.height !== height) {
    throw new Error(`self-test: decoded ${back.width}x${back.height}, expected ${width}x${height}`);
  }
  if (back.colourType !== 2) throw new Error(`self-test: colour type ${back.colourType}, expected 2`);
  if (back.bpp !== 3) throw new Error(`self-test: ${back.bpp} bytes per pixel, expected 3`);
  let checked = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const [r, g, b] = back.at(x, y);
      if (r !== pixels[i] || g !== pixels[i + 1] || b !== pixels[i + 2]) {
        throw new Error(`self-test: pixel ${x},${y} came back ${r},${g},${b}`);
      }
      checked += 1;
    }
  }
  return { width, height, checked, path };
}

// ===========================================================================
// THE TRANSFORM
// ===========================================================================

/**
 * scripts/master-diff.mjs --ground, run against
 * docs/mockups/44_customer_home_dark.png and the harness render at bfb4c52.
 * `above search pill` and `below last card` are absent because that run
 * rejected them: the master carries 59pt of iOS status bar the web harness has
 * none of, so those two bands land on the render's own content.
 */
const MEASURED = [
  { name: 'upper gutter L', rect: [0.0, 0.08, 0.045, 0.3], master: 11.44, render: 5.01 },
  { name: 'lower gutter L', rect: [0.0, 0.55, 0.045, 0.85], master: 12.3, render: 11.59 },
  { name: 'upper gutter R', rect: [0.955, 0.08, 1.0, 0.3], master: 8.58, render: 6.08 },
  { name: 'lower gutter R', rect: [0.955, 0.55, 1.0, 0.85], master: 9.94, render: 11.52 },
];

/**
 * How far, as a fraction of the frame's diagonal-ish scale, a correction fades
 * back to no change at all. 0.30 is not a taste: the nearest point of the one
 * rectangle that needs correcting is 0.458 from the frame's centre, so a
 * falloff under that leaves the vignette's centre box untouched and the
 * corner-to-centre ratio the home(13) fence reads can only rise.
 */
const FALLOFF = 0.3;

/** Uniform ±1 per channel — the least amplitude that holds the metric. */
const DITHER_AMPLITUDE = 1;

/** Fixed, so the same input always produces the same bytes. */
const DITHER_SEED = 0x5bf03635;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 3t² − 2t³ — zero slope at both ends, so no correction leaves a seam. */
const smoothstep = (t) => t * t * (3 - 2 * t);

/** Distance from a normalised point to a normalised rectangle; 0 inside it. */
function distanceToRect(fx, fy, [x0, y0, x1, y1]) {
  const dx = Math.max(x0 - fx, 0, fx - x1);
  const dy = Math.max(y0 - fy, 0, fy - y1);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The corrections this measurement actually asks for. A position where the
 * render already sits at or below the master asks for nothing and is absent
 * from the list, so it can never contribute a change.
 */
export function corrections(measured = MEASURED) {
  return measured
    .filter((p) => p.render > p.master)
    .map((p) => ({ name: p.name, rect: p.rect, gain: p.master / p.render }));
}

/** 1.0 everywhere except inside and around the rectangles that asked. */
export function gainAt(fx, fy, list) {
  let gain = 1;
  for (const c of list) {
    const u = clamp01(distanceToRect(fx, fy, c.rect) / FALLOFF);
    const local = 1 - (1 - c.gain) * (1 - smoothstep(u));
    if (local < gain) gain = local;
  }
  return gain;
}

/**
 * Gain, then dither, in that order: the gain re-quantises and can lay down new
 * plateaus of its own, and the dither is what breaks them.
 */
export function transform(img, list) {
  const stride = img.width * 3;
  const out = Buffer.alloc(img.height * stride);
  let seed = DITHER_SEED >>> 0;
  const next = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed;
  };
  const span = DITHER_AMPLITUDE * 2 + 1;
  for (let y = 0; y < img.height; y += 1) {
    const fy = (y + 0.5) / img.height;
    for (let x = 0; x < img.width; x += 1) {
      const fx = (x + 0.5) / img.width;
      const gain = list.length ? gainAt(fx, fy, list) : 1;
      const px = img.at(x, y);
      for (let c = 0; c < 3; c += 1) {
        const jitter = (next() % span) - DITHER_AMPLITUDE;
        const v = Math.round(px[c] * gain) + jitter;
        out[y * stride + x * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return out;
}

// ===========================================================================

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function parse(argv) {
  const out = { in: ASSET, out: null, force: false, selftest: false, determinism: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--in') out.in = argv[i + 1];
    else if (argv[i] === '--out') out.out = argv[i + 1];
    else if (argv[i] === '--force') { out.force = true; continue; }
    else if (argv[i] === '--selftest') { out.selftest = true; continue; }
    else if (argv[i] === '--determinism') { out.determinism = true; continue; }
    else continue;
    i += 1;
  }
  out.out ??= out.in;
  return out;
}

function rewrite(inPath, outPath) {
  const img = decode(inPath);
  if (img.colourType !== 2) {
    throw new Error(`${inPath} is PNG colour type ${img.colourType}; this writes colour type 2 only`);
  }
  const list = corrections();
  const pixels = transform(img, list);
  writeFileSync(outPath, encodePng({ width: img.width, height: img.height, pixels }));
  return { img, list };
}

function main() {
  const args = parse(process.argv.slice(2));

  const proof = selfTest();
  console.log(
    `encoder round-trip: ${proof.width}x${proof.height}, ${proof.checked} pixels re-read through ` +
      'tests/pngGeometry.mjs decode() — every channel and the colour type match',
  );
  if (args.selftest) return;

  if (args.determinism) {
    const a = join(tmpdir(), 'brazos-atmosphere-determinism-a.png');
    const b = join(tmpdir(), 'brazos-atmosphere-determinism-b.png');
    copyFileSync(args.in, a);
    rewrite(a, a);
    copyFileSync(args.in, b);
    rewrite(b, b);
    const ha = sha256(a);
    const hb = sha256(b);
    console.log(`determinism: run A ${ha}`);
    console.log(`determinism: run B ${hb}`);
    console.log(ha === hb ? 'determinism: IDENTICAL' : 'determinism: DIFFERENT — the transform is not seeded');
    if (ha !== hb) process.exitCode = 1;
    return;
  }

  const before = sha256(args.in);
  if (SOURCE_SHA256 && before !== SOURCE_SHA256 && args.in === args.out && !args.force) {
    console.log(
      `refusing: ${args.in} is not the input this transform is calibrated against ` +
        `(${before.slice(0, 16)}… vs ${SOURCE_SHA256.slice(0, 16)}…). It has already been ` +
        'rewritten, or it was replaced. Pass --force to run anyway.',
    );
    process.exitCode = 1;
    return;
  }

  const beforeBytes = statSync(args.in).size;
  const { img, list } = rewrite(args.in, args.out);
  const afterBytes = statSync(args.out).size;

  console.log(`\n${args.in} -> ${args.out}   ${img.width}x${img.height}, PNG colour type 2`);
  console.log(`  bytes   ${beforeBytes} -> ${afterBytes}`);
  console.log(`  sha256  ${before}`);
  console.log(`          ${sha256(args.out)}`);
  if (!list.length) {
    console.log('  gain    SKIPPED — every measured ground position already sits at or below the master');
  } else {
    for (const c of list) {
      console.log(
        `  gain    ${c.name} [${c.rect.join(', ')}] x ${c.gain.toFixed(4)}, ` +
          `fading to 1.0 over ${FALLOFF} of the frame`,
      );
    }
  }
  console.log(`  dither  ±${DITHER_AMPLITUDE} per channel, xorshift32 seeded 0x${DITHER_SEED.toString(16)}`);
  console.log('\n  re-measure with: node scripts/master-diff.mjs --asset ' + args.out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
