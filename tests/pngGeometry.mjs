// home(11) — MEASURING RENDERED ART INSTEAD OF THE BOX AROUND IT.
//
// Not a test file (node --test only collects tests/*.test.mjs); a helper the
// fences import.
//
// WHY IT EXISTS. Several "share of the screen" fences were green while the art
// they describe rendered a third smaller, because they measured the CONTAINER.
// `hero_armchair_customer.png` is a 1200x1053 canvas whose visible pixels span
// x 184..1015 — 69.3% of its own width, with 184px of transparent margin on
// each side — and `brazos_b_drape.png` covers 60.7% of its canvas. With
// `resizeMode="contain"` and a box the same aspect as the canvas, the CANVAS
// fills the box and the INK fills 69.3% (or 60.7%) of it. So a box declared at
// 18.3% of the screen draws a mark 11.1% of the screen wide, and the fence that
// checked 18.3% never saw the difference.
//
// A fence that wants to talk about what the eye sees has to multiply the box by
// this fraction. That is the only thing here.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/**
 * The visible-pixel bounding box of a PNG, as fractions of its own canvas.
 *
 * "Visible" means alpha above `alphaFloor` for an RGBA/grey-alpha image. An
 * image with no alpha channel has nothing to be inset by, so it reports a full
 * canvas — which is the correct answer for a room-baked scene: its box IS its
 * art.
 *
 * @returns {{ width: number, height: number, left: number, right: number,
 *             top: number, bottom: number, hasAlphaChannel: boolean,
 *             pixelWidth: number, pixelHeight: number }}
 *   `width`/`height` are the ink's share of the canvas; `left`/`right`/`top`/
 *   `bottom` are the empty margins, also as shares of the canvas.
 */
export function inkBounds(path, alphaFloor = 12) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path} is not a PNG`);

  const pixelWidth = bytes.readUInt32BE(16);
  const pixelHeight = bytes.readUInt32BE(20);
  const depth = bytes[24];
  const colourType = bytes[25];
  const interlace = bytes[28];

  const full = {
    width: 1,
    height: 1,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    hasAlphaChannel: false,
    pixelWidth,
    pixelHeight,
  };
  if (colourType !== 6 && colourType !== 4) return full;
  if (depth !== 8 || interlace !== 0) {
    throw new Error(`${path}: only 8-bit non-interlaced PNGs can be measured here`);
  }

  const idat = [];
  for (let off = 8; off + 8 <= bytes.length; ) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = colourType === 6 ? 4 : 2;
  const stride = pixelWidth * bpp;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  const img = Buffer.alloc(pixelHeight * stride);
  for (let y = 0, cursor = 0; y < pixelHeight; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const cur = img.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? cur[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= bpp ? prev[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`${path}: unknown PNG filter ${filter}`);
      cur[x] = value & 0xff;
    }
  }

  let minX = pixelWidth;
  let maxX = -1;
  let minY = pixelHeight;
  let maxY = -1;
  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      if (img[y * stride + x * bpp + (bpp - 1)] <= alphaFloor) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { ...full, width: 0, height: 0, hasAlphaChannel: true };

  return {
    width: (maxX - minX + 1) / pixelWidth,
    height: (maxY - minY + 1) / pixelHeight,
    left: minX / pixelWidth,
    right: (pixelWidth - 1 - maxX) / pixelWidth,
    top: minY / pixelHeight,
    bottom: (pixelHeight - 1 - maxY) / pixelHeight,
    hasAlphaChannel: true,
    pixelWidth,
    pixelHeight,
  };
}
