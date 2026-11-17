// Test helper (not a test file): small, hand-built photo and video files with a known place in every
// spot a phone or an editor can put one. Each builder also returns the absolute byte ranges ("marks")
// that must come out of the cleaner byte for byte (picture data, colour profile, Orientation, ...).

export const PLACE = Object.freeze({
  xmpLatitude: '40,26.7807N',
  city: 'Pittsburgh',
  comment: 'Shot at 40.4463 N',
  iso6709: '+40.4463-079.9822+300.000/',
});

export const text = (s) => Array.from(s, (c) => c.charCodeAt(0));
const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];
export const be32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** Bytes that look like compressed picture data: no 0xFF except stuffed (FF 00) and one restart marker. */
export function entropy(length, seed = 11) {
  const out = [];
  for (let k = 0; out.length < length; k += 1) {
    const v = (k * 37 + seed) & 0xff;
    if (v === 0xff) out.push(0xff, 0x00);
    else out.push(v);
    if (k === Math.floor(length / 2)) out.push(0xff, 0xd0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exif (TIFF) — big-endian ('MM', as an iPhone writes it) or little-endian
// ---------------------------------------------------------------------------

/**
 * A TIFF block with IFD0 (Make, Orientation, Exif and GPS pointers), an Exif IFD
 * (DateTimeOriginal), a GPS IFD with a full place, and optionally IFD1 with a
 * JPEG thumbnail. Returns { bytes, marks } with marks RELATIVE to the TIFF start.
 */
export function tiff({ le = false, orientation = 6, gps = true, thumbnail = null, ifd0Override = null } = {}) {
  const u16 = (n) => (le ? [n & 0xff, (n >> 8) & 0xff] : be16(n));
  const u32 = (n) => (le ? le32(n) : be32(n));
  const rational = (pairs) => pairs.flatMap(([a, b]) => [...u32(a), ...u32(b)]);
  const ascii = (s) => [...text(s), 0];

  const ifd0 = ifd0Override ?? [
    { tag: 0x010f, type: 2, count: 6, data: ascii('Apple') },
    ...(orientation == null ? [] : [{ tag: 0x0112, type: 3, count: 1, data: [...u16(orientation), 0, 0] }]),
    { tag: 0x8769, type: 4, count: 1, ref: 'exif' },
    ...(gps ? [{ tag: 0x8825, type: 4, count: 1, ref: 'gps' }] : []),
  ];
  const blocks = [
    ['ifd0', ifd0],
    ['exif', [{ tag: 0x9003, type: 2, count: 20, data: ascii('2026:11:16 10:00:00') }]],
    ...(gps
      ? [[
          'gps',
          [
            { tag: 0x0000, type: 1, count: 4, data: [2, 3, 0, 0] },
            { tag: 0x0001, type: 2, count: 2, data: [...ascii('N'), 0, 0] },
            { tag: 0x0002, type: 5, count: 3, data: rational([[40, 1], [26, 1], [467807, 10000]]) },
            { tag: 0x0003, type: 2, count: 2, data: [...ascii('W'), 0, 0] },
            { tag: 0x0004, type: 5, count: 3, data: rational([[79, 1], [58, 1], [559912, 10000]]) },
            { tag: 0x0006, type: 5, count: 1, data: rational([[3051, 10]]) },
          ],
        ]]
      : []),
    ...(thumbnail
      ? [['ifd1', [
          { tag: 0x0201, type: 4, count: 1, ref: 'thumb' },
          { tag: 0x0202, type: 4, count: 1, data: u32(thumbnail.length) },
        ]]]
      : []),
  ];
  const outOfLine = (e) => (e.data && e.data.length > 4 ? e.data.length : 0);
  const sizeOf = (entries) => 2 + 12 * entries.length + 4 + entries.reduce((s, e) => s + outOfLine(e), 0);
  const offsets = {};
  let next = 8;
  for (const [name, entries] of blocks) {
    offsets[name] = next;
    next += sizeOf(entries);
  }
  offsets.thumb = next;

  const out = [...(le ? text('II') : text('MM')), ...u16(42), ...u32(8)];
  const marks = { gpsValues: [] };
  for (const [name, entries] of blocks) {
    const at = offsets[name];
    let valueAt = at + 2 + 12 * entries.length + 4;
    const values = [];
    out.push(...u16(entries.length));
    entries.forEach((e, k) => {
      const entryAt = at + 2 + 12 * k;
      out.push(...u16(e.tag), ...u16(e.type), ...u32(e.count));
      if (e.ref) out.push(...u32(offsets[e.ref]));
      else if (e.data.length <= 4) out.push(...e.data, ...Array(4 - e.data.length).fill(0));
      else {
        out.push(...u32(valueAt));
        if (name === 'gps') marks.gpsValues.push([valueAt, valueAt + e.data.length]);
        if (name === 'ifd0' && e.tag === 0x010f) marks.make = [valueAt, valueAt + e.data.length];
        if (name === 'exif') marks.dateTime = [valueAt, valueAt + e.data.length];
        values.push(...e.data);
        valueAt += e.data.length;
      }
      if (name === 'ifd0' && e.tag === 0x0112) marks.orientationEntry = [entryAt, entryAt + 12];
    });
    out.push(...u32(name === 'ifd0' && offsets.ifd1 ? offsets.ifd1 : 0), ...values);
  }
  if (thumbnail) {
    marks.thumbnail = [out.length, out.length + thumbnail.length];
    out.push(...thumbnail);
  }
  marks.ifd0 = offsets.ifd0;
  return { bytes: out, marks, le };
}

const segment = (marker, payload) => [0xff, marker, ...be16(payload.length + 2), ...payload];

/** A minimal picture: SOI, an Exif block with a place, a scan, EOI. Used as a thumbnail and as an appended gain map. */
export function smallJpeg({ le = false, seed = 3 } = {}) {
  return [
    0xff, 0xd8,
    ...segment(0xe1, [...text('Exif\0\0'), ...tiff({ le, orientation: 1 }).bytes]),
    ...segment(0xdb, Array(65).fill(1)),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...entropy(120, seed),
    0xff, 0xd9,
  ];
}

const XMP_WITH_PLACE = (orientation) =>
  `<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""` +
  ` xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"` +
  ` xmlns:tiff="http://ns.adobe.com/tiff/1.0/" exif:GPSLatitude="${PLACE.xmpLatitude}"` +
  ` exif:GPSLongitude="79,58.9991W" photoshop:City="${PLACE.city}"` +
  (orientation == null ? '' : ` tiff:Orientation="${orientation}"`) +
  `/></rdf:RDF></x:xmpmeta>${' '.repeat(200)}<?xpacket end="w"?>`;

/**
 * A JPEG with a place in the Exif GPS block, in the Exif thumbnail's own Exif, in XMP, in an
 * extended-XMP chunk, in IPTC (APP13), in a comment, in an unknown APP segment, and in an
 * appended second picture (as a gain map is). Marks are absolute.
 */
export function jpegWithPlace({
  le = false,
  orientation = 6,
  xmpOrientation = orientation,
  withThumbnail = true,
  appended = true,
  exifOrientation = orientation,
} = {}) {
  const thumbnail = withThumbnail ? smallJpeg({ le }) : null;
  const exif = tiff({ le, orientation: exifOrientation, thumbnail });
  const icc = [...text('ICC_PROFILE\0'), 1, 1, ...Array.from({ length: 200 }, (_, k) => (k * 7) & 0xff)];
  const iptcCity = [0x1c, 0x02, 0x5a, ...be16(PLACE.city.length), ...text(PLACE.city)];
  const iptc = [
    ...text('Photoshop 3.0\0'), ...text('8BIM'), 0x04, 0x04, 0, 0, ...be32(iptcCity.length), ...iptcCity,
  ];
  const out = [0xff, 0xd8];
  const marks = {};
  const add = (bytes, name) => {
    if (name) marks[name] = [out.length, out.length + bytes.length];
    out.push(...bytes);
  };
  add(segment(0xe0, [...text('JFIF\0'), 1, 2, 0, 0, 1, 0, 1, 0, 0]), 'jfif');
  const exifSegmentAt = out.length;
  add(segment(0xe1, [...text('Exif\0\0'), ...exif.bytes]));
  const tiffAt = exifSegmentAt + 4 + 6;
  add(segment(0xe1, [...text('http://ns.adobe.com/xap/1.0/\0'), ...text(XMP_WITH_PLACE(xmpOrientation))]));
  add(segment(0xe1, [...text('http://ns.adobe.com/xmp/extension/\0'), ...text('0123456789ABCDEF0123456789ABCDEF'), 0, 0, 0, 40, 0, 0, 0, 0, ...text(`<exif:GPSLatitude>${PLACE.xmpLatitude}</exif:GPSLatitude>`).slice(0, 40)]));
  add(segment(0xe2, icc), 'icc');
  add(segment(0xe2, [...text('MPF\0'), ...Array(16).fill(0)]), 'mpf');
  add(segment(0xed, iptc));
  add(segment(0xe9, text(`vendor-note ${PLACE.iso6709}`)));
  add(segment(0xfe, text(PLACE.comment)));
  add(segment(0xee, [...text('Adobe'), 0, 100, 0, 0, 0, 0, 1]), 'adobe');
  const imageStart = out.length;
  add(segment(0xdb, Array(65).fill(2)));
  add(segment(0xc0, [8, 0, 16, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
  add(segment(0xc4, Array(30).fill(5)));
  add(segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]));
  add(entropy(1000));
  add([0xff, 0xd9]);
  marks.imageData = [[imageStart, out.length]];
  if (appended) {
    const secondAt = out.length;
    const second = smallJpeg({ le, seed: 9 });
    add(second);
    // The second picture's own scan and data (after its Exif segment) stay byte for byte too.
    const exifLength = (second[4] << 8) | second[5];
    marks.imageData.push([secondAt + 4 + exifLength, out.length]);
  }
  const shift = (r) => [tiffAt + r[0], tiffAt + r[1]];
  marks.orientationEntry = exif.marks.orientationEntry ? shift(exif.marks.orientationEntry) : null;
  marks.make = shift(exif.marks.make);
  marks.dateTime = shift(exif.marks.dateTime);
  marks.gpsValues = exif.marks.gpsValues.map(shift);
  marks.tiffAt = tiffAt;
  marks.ifd0 = tiffAt + exif.marks.ifd0;
  return { bytes: Uint8Array.from(out), marks, le };
}

// ---------------------------------------------------------------------------
// PNG and WebP
// ---------------------------------------------------------------------------

const pngChunk = (type, data) => [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];

export function png(extraChunks = []) {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...extraChunks.flatMap(([type, data]) => pngChunk(type, data)),
    ...pngChunk('IDAT', [120, 156, 99, 0, 1, 0, 0, 5, 0, 1]),
    ...pngChunk('IEND', []),
  ]);
}

export const pngExifWithPlace = () => png([['eXIf', tiff().bytes]]);
export const pngXmpWithPlace = () =>
  png([['iTXt', [...text('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...text(XMP_WITH_PLACE(null))]]]);

const riffChunk = (type, data) => [...text(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];

export function webp(extraChunks = []) {
  const body = [
    ...text('WEBP'),
    ...riffChunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...riffChunk('VP8 ', Array(21).fill(7)),
    ...extraChunks.flatMap(([type, data]) => riffChunk(type, data)),
  ];
  return Uint8Array.from([...text('RIFF'), ...le32(body.length), ...body]);
}

export const webpXmpWithPlace = () => webp([['XMP ', text(XMP_WITH_PLACE(null))]]);
export const webpExifWithPlace = () => webp([['EXIF', tiff({ le: true }).bytes]]);

export const heic = () => Uint8Array.from([...be32(24), ...text('ftypheic'), 0, 0, 0, 0, ...text('mif1heic'), ...Array(64).fill(0)]);
export const gif = () => Uint8Array.from([...text('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x3b]);

// ---------------------------------------------------------------------------
// MOV and MP4
// ---------------------------------------------------------------------------

export const box = (type, ...parts) => {
  const body = parts.flat();
  return [...be32(8 + body.length), ...text(type), ...body];
};
const full = (type, ...parts) => box(type, [0, 0, 0, 0], ...parts);
const hdlr = (handler, name) => full('hdlr', text('mhlr'), text(handler), Array(12).fill(0), text(name));
const stbl = ({ sizes, chunkOffsets, perChunk, wide }) =>
  box(
    'stbl',
    full('stsd', be32(1), box('test', Array(8).fill(0))),
    full('stts', be32(1), be32(sizes.length), be32(1)),
    full('stsc', be32(1), be32(1), be32(perChunk), be32(1)),
    full('stsz', be32(0), be32(sizes.length), sizes.flatMap(be32)),
    wide
      ? full('co64', be32(chunkOffsets.length), chunkOffsets.flatMap((o) => [0, 0, 0, 0, ...be32(o)]))
      : full('stco', be32(chunkOffsets.length), chunkOffsets.flatMap(be32))
  );

const QT_PLACE_KEY = 'com.apple.quicktime.location.ISO6709';

/**
 * A clip with a place in moov/udta (©xyz), moov/meta (keys + ilst), the video track's
 * udta, a timed-metadata track (its samples in mdat), and a top-level uuid (XMP).
 * Marks: the picture and sound samples, the video track's tables, and every box that
 * may change.
 */
export function movieWithPlace({ brand = 'qt  ', extraMoov = [], metaOffsetShift = 0, extraTop = [] } = {}) {
  const ftyp = box('ftyp', text(brand), be32(0), text(brand));
  const wide = box('wide');
  const video = Array.from({ length: 100 }, (_, k) => (k * 13 + 5) & 0xff);
  const metaSample = (k) => [...text(PLACE.iso6709), ...Array(30 - PLACE.iso6709.length).fill(k)];
  const audio = Array.from({ length: 40 }, (_, k) => (k * 29 + 1) & 0xff);
  const mdatAt = ftyp.length + wide.length;
  const payloadAt = mdatAt + 8;
  const mdat = box('mdat', video, metaSample(1), metaSample(2), audio);
  const videoAt = payloadAt;
  const metaAt = payloadAt + video.length;
  const audioAt = metaAt + 60;

  const xyz = box('©xyz', be16(PLACE.iso6709.length), be16(0x15c7), text(PLACE.iso6709));
  const videoTrak = box(
    'trak',
    box('tkhd', Array(84).fill(0)),
    box('mdia', box('mdhd', Array(24).fill(0)), hdlr('vide', 'Core Media Video'),
      box('minf', box('vmhd', Array(12).fill(0)), stbl({ sizes: [60, 40], chunkOffsets: [videoAt], perChunk: 2 }))),
    box('udta', xyz)
  );
  const metaTrak = box(
    'trak',
    box('tkhd', Array(84).fill(0)),
    box('mdia', box('mdhd', Array(24).fill(0)), hdlr('meta', 'Core Media Metadata'),
      box('minf', box('nmhd', Array(4).fill(0)), stbl({
        sizes: [30, 30],
        chunkOffsets: [metaAt + metaOffsetShift, metaAt + 30 + metaOffsetShift],
        perChunk: 1,
        wide: true,
      })))
  );
  const audioTrak = box(
    'trak',
    box('tkhd', Array(84).fill(0)),
    box('mdia', box('mdhd', Array(24).fill(0)), hdlr('soun', 'Core Media Audio'),
      box('minf', box('smhd', Array(8).fill(0)), stbl({ sizes: [40], chunkOffsets: [audioAt], perChunk: 1 })))
  );
  const qtMeta = box(
    'meta',
    hdlr('mdta', ''),
    full('keys', be32(1), be32(8 + QT_PLACE_KEY.length), text('mdta'), text(QT_PLACE_KEY)),
    box('ilst', box('\u0000\u0000\u0000\u0001', box('data', be32(1), be32(0), text(PLACE.iso6709))))
  );
  const mvhd = box('mvhd', Array(100).fill(3));
  const moovParts = [mvhd, videoTrak, metaTrak, audioTrak, qtMeta, box('udta', xyz), ...extraMoov];
  const uuid = box('uuid', Array(16).fill(0xbe), text(`<exif:GPSLatitude>${PLACE.xmpLatitude}</exif:GPSLatitude>`));

  const out = [...ftyp, ...wide, ...mdat];
  const moovAt = out.length;
  const moov = box('moov', ...moovParts);
  out.push(...moov, ...uuid, ...extraTop.flat());

  // Absolute positions of the parts inside moov.
  let at = moovAt + 8;
  const placed = {};
  ['mvhd', 'videoTrak', 'metaTrak', 'audioTrak', 'qtMeta', 'udta'].forEach((name, k) => {
    placed[name] = [at, at + moovParts[k].length];
    at += moovParts[k].length;
  });
  const videoUdta = [placed.videoTrak[1] - (8 + xyz.length), placed.videoTrak[1]];
  const uuidAt = moovAt + moov.length;
  const marks = {
    kept: [
      [0, mdatAt + 8],
      [videoAt, videoAt + 100],
      [audioAt, audioAt + 40],
      placed.mvhd,
      [placed.videoTrak[0], videoUdta[0]],
      placed.audioTrak,
    ],
    mayChange: [
      [ftyp.length + 8, ftyp.length + 8],
      [metaAt, metaAt + 60],
      placed.metaTrak,
      placed.qtMeta,
      placed.udta,
      videoUdta,
      [uuidAt, uuidAt + uuid.length],
    ],
    freed: [placed.metaTrak[0], placed.qtMeta[0], placed.udta[0], videoUdta[0], uuidAt],
  };
  return { bytes: Uint8Array.from(out), marks };
}

/** Index of `needle` (an array of bytes or a string) in `hay`, or -1. */
export function find(hay, needle) {
  const n = typeof needle === 'string' ? text(needle) : needle;
  outer: for (let i = 0; i + n.length <= hay.length; i += 1) {
    for (let k = 0; k < n.length; k += 1) if (hay[i + k] !== n[k]) continue outer;
    return i;
  }
  return -1;
}

/** Every index where a and b differ (same length). */
export function differences(a, b) {
  const list = [];
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) list.push(i);
  return list;
}

export const inside = (i, ranges) => ranges.some(([s, e]) => i >= s && i < e);
