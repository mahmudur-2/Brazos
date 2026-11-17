import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './loadModule.mjs';
import {
  PLACE,
  be32,
  box,
  differences,
  find,
  gif,
  heic,
  inside,
  jpegWithPlace,
  movieWithPlace,
  png,
  pngExifWithPlace,
  pngXmpWithPlace,
  text,
  webp,
  webpExifWithPlace,
  webpXmpWithPlace,
} from './mediaFixtures.mjs';

/**
 * R7-b / R7-c (A4-M3) — no photo or video leaves the phone with its location.
 * The OUTPUT is parsed here with the test's own reader (not the module's), and
 * every byte outside the overwritten ranges must be the input's byte.
 */

const media = await loadModule('lib/mediaMetadata.ts', {});

/** The test's own Exif reader: Orientation and the GPS block's tags, straight from IFD0. */
function readExif(bytes, tiffAt, le) {
  const u16 = (i) => (le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  const u32 = (i) => (le ? u16(i) + u16(i + 2) * 65536 : u16(i) * 65536 + u16(i + 2));
  const ifd0 = tiffAt + u32(tiffAt + 4);
  let orientation = null;
  let gpsTags = [];
  for (let k = 0; k < u16(ifd0); k += 1) {
    const e = ifd0 + 2 + 12 * k;
    if (u16(e) === 0x0112) orientation = u16(e + 8);
    if (u16(e) === 0x8825) {
      const gps = tiffAt + u32(e + 8);
      gpsTags = Array.from({ length: u16(gps) }, (_, j) => u16(gps + 2 + 12 * j));
    }
  }
  return { orientation, gpsTags };
}

function assertOnlyOverwrittenChanged(input, output, overwritten) {
  assert.equal(output.length, input.length, 'the same length: no offset can move');
  const changed = differences(input, output);
  assert.ok(changed.length > 0, 'something was cleaned');
  const stray = changed.filter((i) => !inside(i, overwritten));
  assert.deepEqual(stray, [], 'every changed byte lies inside a range the cleaner reports');
}

const bytesEqual = (a, b, [s, e]) => a.subarray(s, e).every((v, i) => v === b[s + i]);

for (const le of [false, true]) {
  test(`R7-b: a JPEG (${le ? 'little' : 'big'}-endian Exif) loses every place and keeps its picture, Orientation and colour profile`, () => {
    const { bytes, marks } = jpegWithPlace({ le });
    assert.equal(media.photoFacts(bytes).mayHoldPlace, true, 'the input holds a place (anti-vacuity)');
    assert.deepEqual(readExif(bytes, marks.tiffAt, le).gpsTags, [0, 1, 2, 3, 4, 6]);

    const result = media.cleanPhoto(bytes);
    assert.equal(result.ok, true);
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.extension, 'jpg');
    const out = result.bytes;
    assertOnlyOverwrittenChanged(bytes, out, result.overwritten);

    // The output, read by this test: no place anywhere, the same Orientation.
    const exif = readExif(out, marks.tiffAt, le);
    assert.equal(exif.orientation, 6, 'the picture still turns the same way');
    assert.deepEqual(exif.gpsTags, [0], 'the GPS block keeps only its version number');
    for (const [s, e] of marks.gpsValues) assert.ok(out.subarray(s, e).every((v) => v === 0), 'GPS values are zero');
    for (const word of [PLACE.xmpLatitude, PLACE.city, PLACE.comment, PLACE.iso6709, 'GPSLatitude', 'photoshop:City']) {
      assert.equal(find(out, word), -1, `"${word}" is gone`);
    }
    // The thumbnail's and the appended picture's own GPS blocks are emptied too: the latitude
    // seconds (467807/10000 as a RATIONAL) appear nowhere in the output.
    assert.ok(find(bytes, le ? [0x5f, 0x23, 0x07, 0x00] : be32(467807)) !== -1);
    assert.equal(find(out, le ? [0x5f, 0x23, 0x07, 0x00] : be32(467807)), -1);

    // What must never be written: picture data, colour profile, JFIF, Adobe, MPF, Orientation, Make, date.
    for (const range of [...marks.imageData, marks.icc, marks.jfif, marks.adobe, marks.mpf, marks.orientationEntry, marks.make, marks.dateTime]) {
      assert.ok(bytesEqual(bytes, out, range), `bytes ${range} are untouched`);
    }
    // The XMP packet is now a valid empty packet.
    assert.notEqual(find(out, '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>'), -1);
    assert.notEqual(find(out, '<?xpacket end="w"?>'), -1);
    // The module agrees when it reads its own output.
    assert.deepEqual(media.photoFacts(out), { orientation: 6, mayHoldPlace: false });
  });
}

test('R7-b: a clean JPEG is cleaned again without change, and a second pass changes nothing', () => {
  const first = media.cleanPhoto(jpegWithPlace().bytes);
  const second = media.cleanPhoto(first.bytes);
  assert.equal(second.ok, true);
  assert.deepEqual(differences(first.bytes, second.bytes), []);
});

test('R7-b: refused, never uploaded — when blanking XMP would turn the picture, or the Exif cannot be walked', () => {
  // XMP alone says "turn 90°" (Exif has no Orientation): blanking it would put the photo on its side.
  const sideways = jpegWithPlace({ exifOrientation: null, xmpOrientation: 6 });
  assert.deepEqual(media.cleanPhoto(sideways.bytes), { ok: false, failure: 'unreadable' });
  // The same file with XMP saying 1 (upright) is fine.
  assert.equal(media.cleanPhoto(jpegWithPlace({ exifOrientation: null, xmpOrientation: 1 }).bytes).ok, true);

  // IFD0's offset points past the Exif segment.
  const truncated = jpegWithPlace({ le: true }).bytes.slice();
  const { marks } = jpegWithPlace({ le: true });
  truncated.set([0xff, 0xff, 0x00, 0x00], marks.tiffAt + 4);
  assert.deepEqual(media.cleanPhoto(truncated), { ok: false, failure: 'unreadable' });

  // Bytes after the last picture that are not a picture.
  const tail = Uint8Array.from([...jpegWithPlace().bytes, ...text('trailer'), 1, 2, 3]);
  assert.deepEqual(media.cleanPhoto(tail), { ok: false, failure: 'unreadable' });

  // A file cut short inside its picture data.
  const cut = jpegWithPlace().bytes.slice(0, marks.imageData[0][0] + 40);
  assert.deepEqual(media.cleanPhoto(cut), { ok: false, failure: 'unreadable' });
});

test('R7-b: HEIC, GIF and anything else is the wrong kind; the kind comes from the bytes', () => {
  assert.equal(media.sniffMedia(heic()), 'heic');
  for (const bytes of [heic(), gif(), Uint8Array.from(text('II*\0........')), new Uint8Array(0)]) {
    assert.deepEqual(media.cleanPhoto(bytes), { ok: false, failure: 'wrong-kind' });
  }
  assert.equal(media.sniffMedia(jpegWithPlace().bytes), 'jpeg');
  assert.equal(media.sniffMedia(png()), 'png');
  assert.equal(media.sniffMedia(webp()), 'webp');
});

test('R7-b: PNG and WebP pass unchanged when they hold no place, and are refused when they do or cannot be read', () => {
  for (const [bytes, contentType] of [[png(), 'image/png'], [webp(), 'image/webp']]) {
    const result = media.cleanPhoto(bytes);
    assert.equal(result.ok, true);
    assert.equal(result.contentType, contentType);
    assert.deepEqual(result.overwritten, []);
    assert.deepEqual(differences(bytes, result.bytes), []);
  }
  const refused = [
    pngExifWithPlace(),
    pngXmpWithPlace(),
    png([['zTXt', [...text('Comment'), 0, 0, 120, 156]]]),
    png([['tEXt', [...text('Raw profile type exif'), 0, ...text('exif 10 4d4d')]]]),
    png().slice(0, 40),
    webpXmpWithPlace(),
    webpExifWithPlace(),
    webp([['ABCD', [1, 2, 3, 4]]]),
  ];
  refused.forEach((bytes, k) =>
    assert.deepEqual(media.cleanPhoto(bytes), { ok: false, failure: 'unreadable' }, `case ${k} is refused`)
  );
});

test('R7-c: a MOV loses its place by in-place overwrites; picture and sound bytes are untouched', () => {
  const { bytes, marks } = movieWithPlace();
  assert.notEqual(find(bytes, PLACE.iso6709), -1, 'the input holds a place (anti-vacuity)');
  const result = media.cleanVideo(bytes);
  assert.equal(result.ok, true);
  assert.equal(result.contentType, 'video/quicktime');
  assert.equal(result.extension, 'mov');
  const out = result.bytes;
  assertOnlyOverwrittenChanged(bytes, out, result.overwritten);

  for (const word of [PLACE.iso6709, PLACE.xmpLatitude, 'ISO6709', '©xyz', 'location']) {
    assert.equal(find(out, word), -1, `"${word}" is gone`);
  }
  for (const range of marks.kept) assert.ok(bytesEqual(bytes, out, range), `bytes ${range} are untouched`);
  // Every overwritten byte is inside a box that may hold a place, or the metadata track's samples.
  for (const [s, e] of result.overwritten) {
    for (let i = s; i < e; i += 1) assert.ok(inside(i, marks.mayChange), `byte ${i} may change`);
  }
  for (const at of marks.freed) assert.equal(String.fromCharCode(...out.subarray(at + 4, at + 8)), 'free');
  assert.equal(media.cleanVideo(out).ok, true, 'the output walks again');
});

test('R7-c: an MP4 is cleaned the same way and keeps its own content type', () => {
  const result = media.cleanVideo(movieWithPlace({ brand: 'mp42' }).bytes);
  assert.equal(result.ok, true);
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.extension, 'mp4');
  assert.equal(find(result.bytes, PLACE.iso6709), -1);
});

test('R7-c: refused, never uploaded — a box that cannot be walked, a fragmented movie, a sample outside the data', () => {
  const whole = movieWithPlace().bytes;
  const cases = {
    'cut short': whole.slice(0, whole.length - 10),
    fragmented: movieWithPlace({ extraMoov: [box('mvex', box('trex', Array(24).fill(0)))] }).bytes,
    'sample outside mdat': movieWithPlace({ metaOffsetShift: 100000 }).bytes,
    'unknown top-level box': movieWithPlace({ extraTop: [box('junk', [1, 2, 3])] }).bytes,
    // A box this walk keeps as it is (moov/prfl) still may not name a place: the last scan refuses it.
    'a place in a kept box': movieWithPlace({ extraMoov: [box('prfl', text(PLACE.iso6709))] }).bytes,
  };
  for (const [name, bytes] of Object.entries(cases)) {
    assert.deepEqual(media.cleanVideo(bytes), { ok: false, failure: 'unreadable' }, name);
  }
  for (const bytes of [heic(), jpegWithPlace().bytes, Uint8Array.from(box('moov'))]) {
    assert.deepEqual(media.cleanVideo(bytes), { ok: false, failure: 'wrong-kind' });
  }
});
