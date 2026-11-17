import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, read, root } from './loadModule.mjs';

/**
 * R7-b / B10 (A4-M3) — every picker opens with ONE shared option set
 * (lib/pickerOptions.ts), and the native lines that set is chosen for are
 * still the installed ones.
 */

const pickerEnums = await import('../node_modules/expo-image-picker/build/ImagePicker.types.js');
const rules = await loadModule('lib/uploadRules.ts', {});
const { PICKER_MEDIA_OPTIONS, PICKER_OWNED_KEYS } = await loadModule('lib/pickerOptions.ts', {
  'expo-image-picker': pickerEnums,
  './uploadRules': rules,
});

test('R7-b/B10: the shared option set is the one the native source shows gives JPEG photos and small clips', () => {
  assert.deepEqual({ ...PICKER_MEDIA_OPTIONS }, {
    preferredAssetRepresentationMode: 'compatible',
    quality: 0.7,
    videoExportPreset: pickerEnums.VideoExportPreset.H264_960x540,
    videoQuality: pickerEnums.UIImagePickerControllerQualityType.Medium,
    videoMaxDuration: 30,
    exif: false,
    base64: false,
  });
  assert.ok(PICKER_MEDIA_OPTIONS.quality < 1, 'below 1, the copy-the-original fast path is off');
  assert.equal(PICKER_MEDIA_OPTIONS.videoMaxDuration * 1000, rules.MAX_VIDEO_DURATION_MS);
  assert.ok(Object.isFrozen(PICKER_MEDIA_OPTIONS));
  assert.deepEqual([...PICKER_OWNED_KEYS], Object.keys(PICKER_MEDIA_OPTIONS));
});

test('R7-b: the installed picker still has the native lines this option set relies on (an upgrade re-opens the proof)', () => {
  const pkg = JSON.parse(read('node_modules/expo-image-picker/package.json'));
  assert.equal(pkg.version, '17.0.11', 'a new picker version: read its ios/ source again before changing this');
  const ios = (file) => read(`node_modules/expo-image-picker/ios/${file}`);
  const handler = ios('MediaHandler.swift');
  // The fast path that copies the original (HEIC with its place) needs quality >= 1 and mode 'current'.
  assert.match(handler, /let fastPath =\s*!options\.allowsEditing && options\.quality >= 1\s*&& options\.preferredAssetRepresentationMode == \.current/);
  assert.match(handler, /let imageModified = options\.allowsEditing \|\| options\.quality < 1/);
  // A non-passthrough preset exports again as MP4.
  assert.match(handler, /let transcodeFileType: AVFileType = \.mp4/);
  const utils = ios('ImageUtils.swift');
  assert.match(utils, /case UTType\.heic\.identifier:\s*return \(rawData, "\.heic"\)/);
  assert.match(utils, /default:\s*if options\.quality >= 1\.0 \{\s*return \(rawData, "\.jpg"\)\s*\}\s*let data = image\.jpegData\(compressionQuality: options\.quality\)/);
  const module = ios('ImagePickerModule.swift');
  assert.match(module, /if !options\.allowsEditing && sourceType != \.camera \{\s*self\.launchMultiSelectPicker/);
  assert.match(module, /configuration\.preferredAssetRepresentationMode = options\.preferredAssetRepresentationMode\.toAssetRepresentationMode\(\)/);
  assert.match(ios('VideoUtils.swift'), /exportSession\.outputFileType = outputFileType/);
});

// ---------------------------------------------------------------------------
// The sweep: no picker opens without the shared set.
// ---------------------------------------------------------------------------

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Each picker call's argument text, found by bracket depth. */
function pickerCalls(code) {
  const calls = [];
  for (const match of code.matchAll(/\b(?:launchImageLibraryAsync|launchCameraAsync)\(/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const from = i;
    for (; i < code.length && depth > 0; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') depth -= 1;
    }
    calls.push(code.slice(from, i - 1));
  }
  return calls;
}

/** Wired: the argument is an object literal that spreads PICKER_MEDIA_OPTIONS first and sets none of its keys. */
function isWired(args) {
  const literal = args.trim();
  if (!/^\{\s*\.\.\.PICKER_MEDIA_OPTIONS\s*[,}]/.test(literal)) return false;
  return !PICKER_OWNED_KEYS.some((key) => new RegExp(`\\b${key}\\s*:`).test(literal));
}

/**
 * Call sites not wired yet, per file. The screen files belong to the look groups until "screens merged";
 * the A4 wiring milestone then wires each one and lowers its number here to 0 (so a newly wired site
 * must be removed from this list, and a NEW unwired site anywhere fails).
 */
const UNWIRED = {};

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(entry)) yield rel;
  }
}

test('R7-b: the sweep tells a wired call from an unwired one', () => {
  const wired = pickerCalls(stripComments(`
    await ImagePicker.launchImageLibraryAsync({ ...PICKER_MEDIA_OPTIONS, mediaTypes: ['images'], allowsMultipleSelection: true });
    await ImagePicker.launchCameraAsync({ ...PICKER_MEDIA_OPTIONS, allowsEditing: true, aspect: [1, 1] });
  `));
  assert.deepEqual(wired.map(isWired), [true, true]);
  const unwired = pickerCalls(`
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    ImagePicker.launchCameraAsync();
    ImagePicker.launchCameraAsync({ ...PICKER_MEDIA_OPTIONS, quality: 1 });
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], ...PICKER_MEDIA_OPTIONS });
    ImagePicker.launchImageLibraryAsync(options);
  `);
  assert.deepEqual(unwired.map(isWired), [false, false, false, false, false]);
});

test('R7-b: no picker call opens without PICKER_MEDIA_OPTIONS, except the listed sites still waiting for the wiring milestone', () => {
  const files = ['App.tsx'];
  for (const dir of ['screens', 'components', 'ui', 'hooks', 'lib', 'modes', 'navigation']) files.push(...walk(dir));
  let total = 0;
  const unwired = {};
  for (const file of files) {
    const calls = pickerCalls(stripComments(read(file)));
    total += calls.length;
    const count = calls.filter((args) => !isWired(args)).length;
    if (count > 0) unwired[file] = count;
  }
  assert.ok(total >= 8, `the sweep must find the picker calls (saw ${total})`);
  assert.deepEqual(unwired, UNWIRED);
});
