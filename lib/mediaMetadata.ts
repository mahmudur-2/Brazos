/**
 * R7-b / R7-c (A4-M3) — NO PHOTO OR VIDEO LEAVES THE PHONE WITH ITS LOCATION.
 *
 * A pure module (no imports): it works on the file's bytes, so the node tests
 * run it as it ships.
 *
 * Every change is an overwrite IN PLACE at the same length. Nothing is
 * inserted, removed or moved, so no offset inside the file can point to the
 * wrong place afterwards:
 *
 * - JPEG: the Exif GPS block keeps one harmless entry (its version number) and
 *   every other GPS byte becomes 0; the XMP packet becomes an empty packet;
 *   IPTC (APP13), comments and every APP segment Brazos does not know are
 *   blanked. The Orientation tag, the colour profile (ICC_PROFILE), the JFIF
 *   and Adobe segments, the multi-picture index and the image data are never
 *   written. Appended pictures (a gain map) and the Exif thumbnail get the
 *   same treatment.
 * - PNG and WebP: read only. A file that holds a location, or a block that
 *   cannot be read, is refused (there is no in-place way to clean them that
 *   this module can prove).
 * - MOV and MP4: every user-data, metadata and uuid box (where the phone puts
 *   the place a clip was filmed) becomes a 'free' box of the same size with
 *   zeroed content, and every timed-metadata track has its samples zeroed and
 *   its own box freed. Video and audio samples are never written.
 * - Anything else (HEIC, GIF, TIFF, AVIF, …) is refused as the wrong kind.
 *
 * After a change the output is read again from scratch; a file that cannot be
 * read again, still holds a location, or has a different Orientation is
 * refused. A file whose structure cannot be walked is refused.
 */

export type Range = readonly [start: number, end: number];

export type MediaKind = 'jpeg' | 'png' | 'webp' | 'mp4' | 'quicktime' | 'heic' | 'other';

/**
 * ok: the bytes to upload (the same length as the input), their content type
 * and file extension, and every byte range that was overwritten.
 * 'wrong-kind': not a kind Brazos uploads. 'unreadable': the location could
 * not be removed (or proven absent), so the file must not be uploaded.
 */
export type Cleaned =
  | { ok: true; bytes: Uint8Array; contentType: string; extension: string; overwritten: Range[] }
  | { ok: false; failure: 'wrong-kind' | 'unreadable' };

class Unreadable extends Error {}

function need(condition: unknown): asserts condition {
  if (!condition) throw new Unreadable('unreadable');
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

function u16(b: Uint8Array, i: number, le = false): number {
  need(i >= 0 && i + 2 <= b.length);
  return le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1];
}

function u32(b: Uint8Array, i: number, le = false): number {
  need(i >= 0 && i + 4 <= b.length);
  return le
    ? b[i + 3] * 0x1000000 + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i])
    : b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
}

function put16(b: Uint8Array, i: number, value: number, le: boolean): void {
  b[i] = le ? value & 0xff : value >> 8;
  b[i + 1] = le ? value >> 8 : value & 0xff;
}

function put32(b: Uint8Array, i: number, value: number, le: boolean): void {
  for (let k = 0; k < 4; k += 1) b[i + (le ? k : 3 - k)] = (value >>> (8 * k)) & 0xff;
}

const bytesOf = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

function ascii(b: Uint8Array, at: number, length: number): string {
  need(at >= 0 && at + length <= b.length);
  return String.fromCharCode(...b.subarray(at, at + length));
}

function latin1(b: Uint8Array, start: number, end: number): string {
  let text = '';
  for (let i = start; i < end; i += 4096) text += String.fromCharCode(...b.subarray(i, Math.min(end, i + 4096)));
  return text;
}

function hasText(b: Uint8Array, start: number, end: number, text: string): boolean {
  if (end - start < text.length) return false;
  for (let k = 0; k < text.length; k += 1) if (b[start + k] !== text.charCodeAt(k)) return false;
  return true;
}

function allZero(b: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) if (b[i] !== 0) return false;
  return true;
}

/** Words that name a place in XMP, PNG text or a video's boxes. Case-sensitive, so encoded data rarely matches. */
const LOCATION_TEXT =
  /GPS[A-Z]|[Ll]atitude|[Ll]ongitude|[Ll]ocation|ISO6709|photoshop:(?:City|State|Country)|Iptc4xmp(?:Core|Ext):(?:CountryCode|Location|Sublocation|City|ProvinceState|CountryName|WorldRegion)/;

/**
 * The same, plus the two QuickTime boxes that hold a place in binary (©xyz, loci) and a bare
 * ISO 6709 point ("+40.4463-079.9822"), the form a phone writes the place in.
 */
const VIDEO_LOCATION_TEXT = new RegExp(`${LOCATION_TEXT.source}|©xyz|loci|[+-]\\d{2}\\.\\d+[+-]\\d{3}\\.\\d+`);

// ---------------------------------------------------------------------------
// Kind, from the bytes (never from the file name or the picker's word)
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ']);
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2', 'avif', 'avis']);

export function sniffMedia(b: Uint8Array): MediaKind {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'qt  ') return 'quicktime';
    if (MP4_BRANDS.has(brand)) return 'mp4';
    if (HEIF_BRANDS.has(brand)) return 'heic';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Exif (TIFF structure)
// ---------------------------------------------------------------------------

const EXIF_POINTER = 0x8769;
const GPS_POINTER = 0x8825;
const INTEROP_POINTER = 0xa005;
const ORIENTATION = 0x0112;
const THUMBNAIL_OFFSET = 0x0201;
const THUMBNAIL_LENGTH = 0x0202;
/** Bytes per value of each TIFF field type (index = type; 0 = not a type). */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
/** More entries than any real IFD has: a larger count means the bytes are not an IFD. */
const MAX_IFD_ENTRIES = 512;

type Entry = { tag: number; type: number; count: number; at: number; value: Range | null; inline: boolean };
type Ifd = { kind: 'chain' | 'exif' | 'gps' | 'interop'; at: number; end: number; entries: Entry[]; next: number };
type Tiff = { le: boolean; ifds: Ifd[]; orientation: number | null; thumbnail: Range | null };

function readIfd(b: Uint8Array, le: boolean, start: number, end: number, rel: number, kind: Ifd['kind']): Ifd {
  need(rel >= 8);
  const at = start + rel;
  need(at + 2 <= end);
  const count = u16(b, at, le);
  need(count <= MAX_IFD_ENTRIES);
  const tableEnd = at + 2 + count * 12 + 4;
  need(tableEnd <= end);
  const entries: Entry[] = [];
  for (let k = 0; k < count; k += 1) {
    const e = at + 2 + k * 12;
    const type = u16(b, e + 2, le);
    const n = u32(b, e + 4, le);
    const size = TYPE_SIZE[type] ?? 0;
    let value: Range | null = null;
    let inline = true;
    if (size > 0) {
      const length = size * n;
      need(length <= end - start);
      if (length <= 4) {
        value = [e + 8, e + 8 + length];
      } else {
        const offset = u32(b, e + 8, le);
        need(offset >= 8 && start + offset + length <= end);
        value = [start + offset, start + offset + length];
        inline = false;
      }
    }
    entries.push({ tag: u16(b, e, le), type, count: n, at: e, value, inline });
  }
  return { kind, at, end: tableEnd, entries, next: u32(b, tableEnd - 4, le) };
}

function parseTiff(b: Uint8Array, start: number, end: number): Tiff {
  need(end - start >= 8 && end <= b.length);
  const le = b[start] === 0x49 && b[start + 1] === 0x49;
  need(le || (b[start] === 0x4d && b[start + 1] === 0x4d));
  need(u16(b, start + 2, le) === 42);
  const ifds: Ifd[] = [];
  const seen = new Set<number>();
  const visit = (rel: number, kind: Ifd['kind']): Ifd => {
    need(!seen.has(rel));
    seen.add(rel);
    const ifd = readIfd(b, le, start, end, rel, kind);
    ifds.push(ifd);
    return ifd;
  };
  const pointer = (entry: Entry): number => {
    need((entry.type === 4 || entry.type === 13) && entry.count === 1);
    return u32(b, entry.at + 8, le);
  };

  const chain: Ifd[] = [];
  for (let rel = u32(b, start + 4, le); rel !== 0; rel = chain[chain.length - 1].next) {
    need(chain.length < 4);
    chain.push(visit(rel, 'chain'));
  }
  need(chain.length > 0);
  for (const ifd of chain) {
    for (const entry of ifd.entries) {
      if (entry.tag === GPS_POINTER) visit(pointer(entry), 'gps');
      if (entry.tag !== EXIF_POINTER) continue;
      const exif = visit(pointer(entry), 'exif');
      for (const sub of exif.entries) {
        if (sub.tag === INTEROP_POINTER) visit(pointer(sub), 'interop');
        if (sub.tag === GPS_POINTER) visit(pointer(sub), 'gps');
      }
    }
  }

  const tag = (ifd: Ifd | undefined, id: number) => ifd?.entries.find((e) => e.tag === id);
  const orientationEntry = tag(chain[0], ORIENTATION);
  const orientation =
    orientationEntry && orientationEntry.type === 3 && orientationEntry.count === 1
      ? u16(b, orientationEntry.at + 8, le)
      : null;

  // The thumbnail's offset and length are one SHORT or LONG each.
  const scalar = (entry: Entry): number => {
    need((entry.type === 3 || entry.type === 4) && entry.count === 1);
    return entry.type === 3 ? u16(b, entry.at + 8, le) : u32(b, entry.at + 8, le);
  };
  let thumbnail: Range | null = null;
  const thumbOffset = tag(chain[1], THUMBNAIL_OFFSET);
  const thumbLength = tag(chain[1], THUMBNAIL_LENGTH);
  if (thumbOffset && thumbLength) {
    const offset = scalar(thumbOffset);
    const length = scalar(thumbLength);
    need(start + offset + length <= end);
    if (length > 0) thumbnail = [start + offset, start + offset + length];
  }
  return { le, ifds, orientation, thumbnail };
}

/** A GPS block holds a place when it has any entry besides its version number (tag 0). */
const gpsHoldsPlace = (tiff: Tiff): boolean =>
  tiff.ifds.some((ifd) => ifd.kind === 'gps' && ifd.entries.some((e) => e.tag !== 0));

function emptyGps(b: Uint8Array, tiff: Tiff, gps: Ifd, overwritten: Range[]): void {
  // Everything that is not GPS must stay byte for byte: the other tables, their
  // values (Orientation among them) and the thumbnail.
  const guarded: Range[] = [];
  for (const ifd of tiff.ifds) {
    if (ifd.kind === 'gps') continue;
    guarded.push([ifd.at, ifd.end]);
    for (const e of ifd.entries) if (e.value && !e.inline) guarded.push(e.value);
  }
  if (tiff.thumbnail) guarded.push(tiff.thumbnail);

  const wipe: Range[] = [[gps.at, gps.end]];
  for (const e of gps.entries) {
    need(e.value !== null);
    if (!e.inline) wipe.push(e.value);
  }
  for (const [ws, we] of wipe) for (const [gs, ge] of guarded) need(we <= gs || ws >= ge);
  for (const range of wipe) {
    b.fill(0, range[0], range[1]);
    overwritten.push(range);
  }
  if (gps.entries.length > 0) {
    // One entry left, GPSVersionID 2.3.0.0 (inline): a valid GPS block that names no place.
    // Its next-block offset (gps.at + 14) is inside the zeroed table, so it reads 0.
    put16(b, gps.at, 1, tiff.le);
    put16(b, gps.at + 2, 0x0000, tiff.le);
    put16(b, gps.at + 4, 1, tiff.le);
    put32(b, gps.at + 6, 4, tiff.le);
    b.set([2, 3, 0, 0], gps.at + 10);
  }
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const EXIF_HEADER = 'Exif\0\0';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXTENSION_HEADER = 'http://ns.adobe.com/xmp/extension/\0';
/** An empty, valid XMP packet; the rest of the old packet's room becomes spaces (XMP's own padding). */
const EMPTY_XMP_HEAD = [
  ...bytesOf('<?xpacket begin="'),
  0xef,
  0xbb,
  0xbf,
  ...bytesOf('" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>'),
];
const EMPTY_XMP_TAIL = bytesOf('<?xpacket end="w"?>');
/** Appended pictures (a gain map, a depth map) after the main one; more than this is not a phone photo. */
const MAX_JPEG_IMAGES = 8;

type Segment = { marker: number; body: Range };
type JpegImage = { segments: Segment[]; end: number };
type Role = 'image' | 'keep' | 'exif' | 'xmp' | 'xmp-extension' | 'blank' | 'comment';

function afterScan(b: Uint8Array, from: number, limit: number): number {
  let j = from;
  for (;;) {
    j = b.indexOf(0xff, j);
    need(j !== -1 && j + 1 < limit);
    const next = b[j + 1];
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) j += 2;
    else if (next === 0xff) j += 1;
    else return j;
  }
}

function jpegImage(b: Uint8Array, start: number, limit: number): JpegImage {
  need(start + 2 <= limit && b[start] === 0xff && b[start + 1] === 0xd8);
  const segments: Segment[] = [];
  let i = start + 2;
  for (;;) {
    need(i < limit && b[i] === 0xff);
    while (i < limit && b[i] === 0xff) i += 1;
    need(i < limit);
    const marker = b[i];
    i += 1;
    if (marker === 0xd9) return { segments, end: i };
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    need(marker !== 0x00 && marker !== 0xd8 && i + 2 <= limit);
    const length = (b[i] << 8) | b[i + 1];
    need(length >= 2 && i + length <= limit);
    segments.push({ marker, body: [i + 2, i + length] });
    i += length;
    if (marker === 0xda) i = afterScan(b, i, limit);
  }
}

function jpegImages(b: Uint8Array): JpegImage[] {
  const images: JpegImage[] = [];
  let i = 0;
  while (i < b.length) {
    if (b[i] === 0x00) {
      i += 1;
      continue;
    }
    need(images.length < MAX_JPEG_IMAGES);
    const image = jpegImage(b, i, b.length);
    images.push(image);
    i = image.end;
  }
  need(images.length > 0);
  return images;
}

function roleOf(b: Uint8Array, segment: Segment): Role {
  const { marker } = segment;
  const [p, q] = segment.body;
  const starts = (text: string) => hasText(b, p, q, text);
  if (marker === 0xe0) return starts('JFIF\0') ? 'keep' : 'blank';
  if (marker === 0xe1) {
    if (starts(EXIF_HEADER)) return 'exif';
    if (starts(XMP_HEADER)) return 'xmp';
    if (starts(XMP_EXTENSION_HEADER)) return 'xmp-extension';
    return 'blank';
  }
  if (marker === 0xe2) {
    return starts('ICC_PROFILE\0') || starts('MPF\0') || starts('urn:iso:std:iso:ts:21496:-1\0') ? 'keep' : 'blank';
  }
  if (marker === 0xee) return starts('Adobe') ? 'keep' : 'blank';
  if (marker >= 0xe0 && marker <= 0xef) return 'blank';
  if (marker === 0xfe) return 'comment';
  return 'image';
}

const isJpegAt = (b: Uint8Array, range: Range): boolean =>
  range[1] - range[0] >= 3 && b[range[0]] === 0xff && b[range[0] + 1] === 0xd8 && b[range[0] + 2] === 0xff;

/** The Orientation the XMP packet declares, if any (tiff:Orientation, attribute or element form). */
function xmpOrientation(text: string): number | null {
  const found = /tiff:Orientation\s*(?:=\s*["']\s*(\d+)|>\s*(\d+))/.exec(text);
  return found ? Number(found[1] ?? found[2]) : null;
}

function cleanJpegImage(b: Uint8Array, image: JpegImage, overwritten: Range[], depth: number): void {
  let orientation: number | null = null;
  let sawExif = false;
  for (const segment of image.segments) {
    if (roleOf(b, segment) !== 'exif') continue;
    const tiff = parseTiff(b, segment.body[0] + EXIF_HEADER.length, segment.body[1]);
    if (!sawExif) orientation = tiff.orientation;
    sawExif = true;
    for (const ifd of tiff.ifds) if (ifd.kind === 'gps') emptyGps(b, tiff, ifd, overwritten);
    if (tiff.thumbnail && isJpegAt(b, tiff.thumbnail)) {
      need(depth < 2);
      cleanJpegImage(b, jpegImage(b, tiff.thumbnail[0], tiff.thumbnail[1]), overwritten, depth + 1);
    }
  }
  for (const segment of image.segments) {
    const [p, q] = segment.body;
    switch (roleOf(b, segment)) {
      case 'xmp': {
        const start = p + XMP_HEADER.length;
        // Blanking a packet that alone turns the picture would put it on its side: refuse instead.
        const declared = xmpOrientation(latin1(b, start, q));
        need(declared === null || declared === 1 || declared === (orientation ?? 1));
        b.fill(0x20, start, q);
        if (q - start >= EMPTY_XMP_HEAD.length + EMPTY_XMP_TAIL.length) {
          b.set(EMPTY_XMP_HEAD, start);
          b.set(EMPTY_XMP_TAIL, q - EMPTY_XMP_TAIL.length);
        }
        overwritten.push([start, q]);
        break;
      }
      case 'xmp-extension':
        b.fill(0x20, p + XMP_EXTENSION_HEADER.length, q);
        overwritten.push([p + XMP_EXTENSION_HEADER.length, q]);
        break;
      case 'comment':
        b.fill(0x20, p, q);
        overwritten.push([p, q]);
        break;
      case 'blank':
        b.fill(0, p, q);
        overwritten.push([p, q]);
        break;
      default:
        break;
    }
  }
}

type PhotoFacts = { orientation: number | null; mayHoldPlace: boolean };

function readJpegImage(b: Uint8Array, image: JpegImage, facts: PhotoFacts, first: boolean, depth: number): void {
  let sawExif = false;
  for (const segment of image.segments) {
    const [p, q] = segment.body;
    switch (roleOf(b, segment)) {
      case 'exif': {
        const tiff = parseTiff(b, p + EXIF_HEADER.length, q);
        if (first && !sawExif) facts.orientation = tiff.orientation;
        sawExif = true;
        if (gpsHoldsPlace(tiff)) facts.mayHoldPlace = true;
        if (tiff.thumbnail && isJpegAt(b, tiff.thumbnail)) {
          need(depth < 2);
          readJpegImage(b, jpegImage(b, tiff.thumbnail[0], tiff.thumbnail[1]), facts, false, depth + 1);
        }
        break;
      }
      case 'xmp':
      case 'xmp-extension':
      case 'comment':
        if (LOCATION_TEXT.test(latin1(b, p, q))) facts.mayHoldPlace = true;
        break;
      case 'blank':
        // A segment Brazos cannot read may hold anything; only an empty one is known to hold no place.
        if (!allZero(b, p, q)) facts.mayHoldPlace = true;
        break;
      default:
        break;
    }
  }
}

function jpegFacts(b: Uint8Array): PhotoFacts {
  const facts: PhotoFacts = { orientation: null, mayHoldPlace: false };
  jpegImages(b).forEach((image, index) => readJpegImage(b, image, facts, index === 0, 0));
  return facts;
}

// ---------------------------------------------------------------------------
// PNG and WebP (read only)
// ---------------------------------------------------------------------------

function exifHoldsPlace(b: Uint8Array, start: number, end: number): boolean {
  const tiffStart = hasText(b, start, end, EXIF_HEADER) ? start + EXIF_HEADER.length : start;
  return gpsHoldsPlace(parseTiff(b, tiffStart, end));
}

function pngMayHoldPlace(b: Uint8Array): boolean {
  let i = PNG_SIGNATURE.length;
  let chunks = 0;
  for (;;) {
    const length = u32(b, i);
    const type = ascii(b, i + 4, 4);
    const start = i + 8;
    const end = start + length;
    need(end + 4 <= b.length);
    need(chunks > 0 || type === 'IHDR');
    chunks += 1;
    if (type === 'IEND') {
      need(end + 4 === b.length);
      return false;
    }
    if (type === 'eXIf' && exifHoldsPlace(b, start, end)) return true;
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const keywordEnd = b.indexOf(0, start);
      need(keywordEnd !== -1 && keywordEnd < end);
      // Compressed text cannot be read here, so it may hold a place; so may a raw profile (hex Exif or XMP).
      if (type === 'zTXt' || /^Raw profile type/i.test(latin1(b, start, keywordEnd))) return true;
      if (type === 'iTXt') {
        need(keywordEnd + 1 < end);
        if (b[keywordEnd + 1] !== 0) return true;
      }
      if (LOCATION_TEXT.test(latin1(b, start, end))) return true;
    }
    i = end + 4;
  }
}

const WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP', 'EXIF', 'XMP ']);

function webpMayHoldPlace(b: Uint8Array): boolean {
  const riffEnd = 8 + u32(b, 4, true);
  need(riffEnd >= 12 && riffEnd <= b.length && allZero(b, riffEnd, b.length));
  let i = 12;
  while (i < riffEnd) {
    const type = ascii(b, i, 4);
    const length = u32(b, i + 4, true);
    const start = i + 8;
    const end = start + length;
    need(end <= riffEnd && WEBP_CHUNKS.has(type));
    if (type === 'EXIF' && exifHoldsPlace(b, start, end)) return true;
    if (type === 'XMP ' && LOCATION_TEXT.test(latin1(b, start, end))) return true;
    i = end + (length & 1);
  }
  return false;
}

const PHOTO_TYPES: Partial<Record<MediaKind, { contentType: string; extension: string }>> = {
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' },
};

/** R7-b: a photo's bytes, ready to upload, or the reason they must not be. */
export function cleanPhoto(input: Uint8Array): Cleaned {
  const kind = sniffMedia(input);
  const type = PHOTO_TYPES[kind];
  if (!type) return { ok: false, failure: 'wrong-kind' };
  try {
    if (kind === 'png' || kind === 'webp') {
      need(!(kind === 'png' ? pngMayHoldPlace(input) : webpMayHoldPlace(input)));
      return { ok: true, bytes: input, ...type, overwritten: [] };
    }
    const before = jpegFacts(input);
    const out = input.slice();
    const overwritten: Range[] = [];
    for (const image of jpegImages(out)) cleanJpegImage(out, image, overwritten, 0);
    // Read again from scratch: the output must parse, name no place and turn the same way.
    const after = jpegFacts(out);
    need(out.length === input.length && !after.mayHoldPlace && after.orientation === before.orientation);
    return { ok: true, bytes: out, ...type, overwritten };
  } catch {
    return { ok: false, failure: 'unreadable' };
  }
}

/** The facts the cleaner relies on, for a test or a caller that only needs to look. Null: cannot be read. */
export function photoFacts(input: Uint8Array): PhotoFacts | null {
  try {
    const kind = sniffMedia(input);
    if (kind === 'jpeg') return jpegFacts(input);
    if (kind === 'png') return { orientation: null, mayHoldPlace: pngMayHoldPlace(input) };
    if (kind === 'webp') return { orientation: null, mayHoldPlace: webpMayHoldPlace(input) };
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MOV and MP4 (ISO base media boxes)
// ---------------------------------------------------------------------------

type Box = { type: string; start: number; body: number; end: number };
type Mode = 'clean' | 'verify';

/** Tracks whose samples are pictures, sound or a frame counter; every other track is metadata. */
const KEPT_TRACKS = new Set(['vide', 'soun', 'tmcd']);
/** Boxes that hold user data or metadata (the place a clip was filmed lives in one of them). */
const PLACE_BOXES = new Set(['udta', 'meta', 'uuid']);
const FREE = bytesOf('free');
/** More boxes in one container, or samples in one track, than a 30-second phone clip has. */
const MAX_BOXES = 4096;
const MAX_SAMPLES = 1_000_000;

function boxAt(b: Uint8Array, at: number, limit: number, toEndAllowed: boolean): Box {
  need(at + 8 <= limit);
  let size = u32(b, at);
  const type = ascii(b, at + 4, 4);
  let body = at + 8;
  if (size === 1) {
    size = u32(b, at + 8) * 0x100000000 + u32(b, at + 12);
    body = at + 16;
  } else if (size === 0) {
    need(toEndAllowed);
    size = limit - at;
  }
  need(size >= body - at && at + size <= limit);
  return { type, start: at, body, end: at + size };
}

function childrenOf(b: Uint8Array, parent: Box): Box[] {
  const list: Box[] = [];
  for (let i = parent.body; i < parent.end; ) {
    need(list.length < MAX_BOXES);
    const child = boxAt(b, i, parent.end, false);
    list.push(child);
    i = child.end;
  }
  return list;
}

/** The box becomes 'free' with zeroed content; its size field stays, so nothing after it moves. */
function freeBox(b: Uint8Array, box: Box, overwritten: Range[]): void {
  b.set(FREE, box.start + 4);
  overwritten.push([box.start + 4, box.start + 8]);
  zeroBody(b, box, overwritten);
}

function zeroBody(b: Uint8Array, box: Box, overwritten: Range[]): void {
  if (box.end > box.body) {
    b.fill(0, box.body, box.end);
    overwritten.push([box.body, box.end]);
  }
}

/** free/skip/wide content is ignored by players but may still hold old bytes: clean zeroes it, verify demands zeros. */
function handleFree(b: Uint8Array, box: Box, mode: Mode, overwritten: Range[]): void {
  if (mode === 'clean') zeroBody(b, box, overwritten);
  else need(allZero(b, box.body, box.end));
}

/** Inside a kept container: place boxes are freed, free boxes zeroed, everything else kept as it is. */
function scrubChildren(b: Uint8Array, parent: Box, mode: Mode, overwritten: Range[]): Box[] {
  const parts = childrenOf(b, parent);
  for (const part of parts) {
    if (part.type === 'free' || part.type === 'skip') handleFree(b, part, mode, overwritten);
    else if (PLACE_BOXES.has(part.type)) {
      need(mode === 'clean');
      freeBox(b, part, overwritten);
    }
  }
  return parts;
}

/** Every sample of one track as a byte range, from its size, chunk and offset tables. */
function sampleRanges(b: Uint8Array, stbl: Box): Range[] {
  const parts = childrenOf(b, stbl);
  const find = (type: string) => parts.find((p) => p.type === type);
  const stsz = find('stsz');
  const stsc = find('stsc');
  const offsets = find('stco') ?? find('co64');
  need(stsz && stsc && offsets && !find('stz2'));
  const wide = offsets.type === 'co64';

  const fixedSize = u32(b, stsz.body + 4);
  const sampleCount = u32(b, stsz.body + 8);
  need(sampleCount <= MAX_SAMPLES);
  if (fixedSize === 0) need(stsz.body + 12 + 4 * sampleCount <= stsz.end);
  const chunkCount = u32(b, offsets.body + 4);
  need(chunkCount <= MAX_SAMPLES && offsets.body + 8 + chunkCount * (wide ? 8 : 4) <= offsets.end);
  const runCount = u32(b, stsc.body + 4);
  need(runCount <= MAX_SAMPLES && stsc.body + 8 + runCount * 12 <= stsc.end);

  const ranges: Range[] = [];
  let sample = 0;
  for (let run = 0; run < runCount; run += 1) {
    const first = u32(b, stsc.body + 8 + run * 12);
    const perChunk = u32(b, stsc.body + 12 + run * 12);
    const nextFirst = run + 1 < runCount ? u32(b, stsc.body + 8 + (run + 1) * 12) : chunkCount + 1;
    need(first >= 1 && (run > 0 || first === 1) && nextFirst > first && nextFirst <= chunkCount + 1);
    for (let chunk = first; chunk < nextFirst; chunk += 1) {
      const entry = offsets.body + 8 + (chunk - 1) * (wide ? 8 : 4);
      let at = wide ? u32(b, entry) * 0x100000000 + u32(b, entry + 4) : u32(b, entry);
      for (let k = 0; k < perChunk; k += 1) {
        need(sample < sampleCount);
        const size = fixedSize !== 0 ? fixedSize : u32(b, stsz.body + 12 + 4 * sample);
        ranges.push([at, at + size]);
        at += size;
        sample += 1;
      }
    }
  }
  need(sample === sampleCount);
  return ranges;
}

function walkTrak(b: Uint8Array, trak: Box, mode: Mode, overwritten: Range[], mdats: Range[]): void {
  const parts = childrenOf(b, trak);
  const mdia = parts.find((p) => p.type === 'mdia');
  need(mdia);
  const mdiaParts = childrenOf(b, mdia);
  const hdlr = mdiaParts.find((p) => p.type === 'hdlr');
  need(hdlr && hdlr.body + 12 <= hdlr.end);
  const handler = ascii(b, hdlr.body + 8, 4);

  if (!KEPT_TRACKS.has(handler)) {
    // A timed-metadata track (where a moving clip can log its place): zero its samples, free the track.
    need(mode === 'clean');
    const minf = mdiaParts.find((p) => p.type === 'minf');
    need(minf);
    const stbl = childrenOf(b, minf).find((p) => p.type === 'stbl');
    need(stbl);
    for (const range of sampleRanges(b, stbl)) {
      need(range[1] >= range[0] && mdats.some(([ms, me]) => range[0] >= ms && range[1] <= me));
      b.fill(0, range[0], range[1]);
      overwritten.push(range);
    }
    freeBox(b, trak, overwritten);
    return;
  }
  scrubChildren(b, trak, mode, overwritten);
  scrubChildren(b, mdia, mode, overwritten);
  const minf = mdiaParts.find((p) => p.type === 'minf');
  if (minf) scrubChildren(b, minf, mode, overwritten);
}

function walkVideo(b: Uint8Array, mode: Mode, overwritten: Range[]): void {
  const top: Box[] = [];
  for (let i = 0; i < b.length; ) {
    need(top.length < MAX_BOXES);
    const box = boxAt(b, i, b.length, true);
    top.push(box);
    i = box.end;
  }
  need(top[0]?.type === 'ftyp');
  const mdats: Range[] = top.filter((box) => box.type === 'mdat').map((box) => [box.body, box.end] as const);
  let moovs = 0;
  for (const box of top) {
    if (box.type === 'ftyp' || box.type === 'mdat') continue;
    if (box.type === 'free' || box.type === 'skip' || box.type === 'wide') {
      handleFree(b, box, mode, overwritten);
    } else if (PLACE_BOXES.has(box.type)) {
      need(mode === 'clean');
      freeBox(b, box, overwritten);
    } else {
      need(box.type === 'moov');
      moovs += 1;
      for (const child of scrubChildren(b, box, mode, overwritten)) {
        // A fragmented or compressed movie keeps its tables where this walk cannot follow them.
        need(child.type !== 'mvex' && child.type !== 'cmov');
        if (child.type === 'trak') walkTrak(b, child, mode, overwritten, mdats);
      }
    }
  }
  need(moovs === 1);

  if (mode === 'verify') {
    // Last check: no box outside the picture and sound data names a place.
    let from = 0;
    for (const [ms, me] of [...mdats].sort((x, y) => x[0] - y[0])) {
      need(!VIDEO_LOCATION_TEXT.test(latin1(b, from, ms)));
      from = me;
    }
    need(!VIDEO_LOCATION_TEXT.test(latin1(b, from, b.length)));
  }
}

/** R7-c: a video's bytes, ready to upload, or the reason they must not be. */
export function cleanVideo(input: Uint8Array): Cleaned {
  const kind = sniffMedia(input);
  if (kind !== 'mp4' && kind !== 'quicktime') return { ok: false, failure: 'wrong-kind' };
  try {
    const out = input.slice();
    const overwritten: Range[] = [];
    walkVideo(out, 'clean', overwritten);
    // Read again from scratch: every place box is gone, every free box is empty, nothing names a place.
    walkVideo(out, 'verify', []);
    need(out.length === input.length);
    return {
      ok: true,
      bytes: out,
      contentType: kind === 'mp4' ? 'video/mp4' : 'video/quicktime',
      extension: kind === 'mp4' ? 'mp4' : 'mov',
      overwritten,
    };
  } catch {
    return { ok: false, failure: 'unreadable' };
  }
}
