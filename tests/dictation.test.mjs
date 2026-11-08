// 2026-09-30 (the build run, idea 18) — TWO MICS, DICTATION IN PLACE: a 26pt mic at the far right
// inside Post a job's title and at the bottom-right inside its description; the phone's on-device
// speech-to-text fills the field. No sheet, no big button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dictateBeforeLine, joinDictation } from '../lib/dictation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[executed] spoken words join the end of the field, a space between, never past its limit', () => {
  assert.equal(joinDictation('', 'Assemble a bookcase', 80), 'Assemble a bookcase');
  assert.equal(joinDictation('Assemble', '  a bookcase ', 80), 'Assemble a bookcase');
  assert.equal(joinDictation('Assemble ', 'a bookcase', 80), 'Assemble a bookcase');
  assert.equal(joinDictation('Assemble', '   ', 80), 'Assemble', 'silence adds nothing');
  assert.equal(joinDictation('x'.repeat(78), 'hello', 80), `${'x'.repeat(78)} h`);
});

test("[executed] the description's words go above idea 23's answers line, which stays last", () => {
  const line = '2 pieces · Bring tools';
  assert.equal(dictateBeforeLine(`Two bookcases.\n${line}`, line, 'The study is upstairs.', 500), `Two bookcases. The study is upstairs.\n${line}`);
  assert.equal(dictateBeforeLine(line, line, 'The study is upstairs.', 500), `The study is upstairs.\n${line}`);
  assert.equal(dictateBeforeLine('Two bookcases.', '', 'Upstairs.', 500), 'Two bookcases. Upstairs.', 'no line: the end');
  assert.equal(dictateBeforeLine(`${line}\nMy words after it.`, line, 'More.', 500), `${line}\nMy words after it. More.`, 'a moved line: the end');
  // The line is never cut to make room.
  const head = 'x'.repeat(470);
  const out = dictateBeforeLine(`${head}\n${line}`, line, 'a long sentence of spoken words', 500);
  assert.ok(out.endsWith(`\n${line}`) && out.length <= 500, out);
});

test('[static] the mic listens through the voice boundary only, and renders only where it may', () => {
  const mic = read('components/DictationMic.tsx');
  assert.match(mic, /import \{ voiceSearch, type VoiceSession \} from '\.\.\/lib\/voiceSearch';/);
  assert.doesNotMatch(mic, /expo-speech-recognition/, 'only lib/voiceSearch/index.ts loads the vendor');
  assert.match(mic, /if \(alive\) setAvailable\(availability\.status === 'available'\);/);
  assert.match(mic, /accessory: available \? <DictationMicButton/, 'unavailable leaves it unrendered, never disabled');
  // One entry point; the final phrase is the only thing committed, once, through onChangeText.
  assert.equal(mic.match(/beginSession\(/g)?.length, 1);
  assert.equal(mic.match(/onChangeText\(/g)?.length, 1);
  assert.match(flat(mic), /onTranscript: \(phrase\) => \{ const next = join\(baseRef\.current, phrase\); committedRef\.current = next; setInterim\(null\); onChangeText\(next\);/);
  // The provisional phrase is a display, never written to the form.
  assert.match(mic, /onInterimTranscript: \(phrase\) => setInterim\(phrase\),/);
  assert.match(mic, /value: listening && interim \? join\(baseRef\.current, interim\) : value,/);
  // Never an open microphone the person cannot see.
  assert.match(mic, /if \(!focused\) sessionRef\.current\?\.cancel\(\);/);
  assert.match(mic, /if \(state !== 'active'\) sessionRef\.current\?\.cancel\(\);/);
  assert.match(mic, /subscription\.remove\(\);\s*sessionRef\.current\?\.cancel\(\);/);
  // Typing while it listens ends the session and keeps what was typed.
  assert.match(mic, /if \(!listening \|\| value === baseRef\.current \|\| value === committedRef\.current\) return;\s*sessionRef\.current\?\.cancel\(\);/);
  assert.match(mic, /accessibilityLabel=\{listening \? 'Stop dictating' : `Dictate the \$\{field\}`\}/);
  // Group 2's review: ONE live dictation at a time — the recognizer runs one session, and a second
  // start cancels the first inside the vendor, ending both. The other mic is stopped (its words kept)
  // and this one starts only after it has ended.
  assert.match(mic, /let liveDictation: \{ owner: number; stop: \(\) => void; ended: Promise<void> \} \| null = null;/);
  assert.match(mic, /if \(other && other\.owner !== ownerRef\.current\) \{\s*other\.stop\(\);\s*await other\.ended;/);
  assert.match(mic, /if \(finished\) return;\s*sessionRef\.current = session;\s*liveDictation = \{ owner, stop: \(\) => session\.stop\(\), ended \};/);
});

test('[static] both fields carry their mic, and the text keeps clear of it', () => {
  const screen = flat(read('screens/PostJobScreen.tsx'));
  assert.match(screen, /label="Title" value=\{titleDictation\.value\} onChangeText=\{setTitle\} accessory=\{titleDictation\.accessory\}/);
  assert.match(screen, /label="Description" value=\{descriptionDictation\.value\} onChangeText=\{setDescription\} accessory=\{descriptionDictation\.accessory\}/);
  assert.match(screen, /join: \(base, spoken\) => dictateBeforeLine\(base, answersLine, spoken, MAX_DESCRIPTION_LENGTH\),/);
  const field = read('components/TextField.tsx');
  assert.match(field, /accessory \? \(multiline \? styles\.roomBottom : styles\.roomEnd\) : null,/);
  const tokens = read('ui/tokens.ts');
  assert.match(tokens, /export const fieldAccessory = \{\s*size: 26,/, 'the operator\'s smaller circles: 26');
});

test('[static] the usage strings name dictation, one microphone sentence for both plugins', async () => {
  const config = read('app.config.ts');
  // FIX-RUN B12: nothing films a video, so the sentence no longer says it.
  // Lean D3a: no voice messages and no expo-audio, so it no longer says that either.
  // Lean D5: no search mic, so it no longer says "search".
  const sentence = 'Brazos uses your microphone only while you dictate a job by voice, and stops listening when you finish.';
  assert.equal(config.split(`'${sentence}'`).length - 1, 2, 'expo-image-picker and expo-speech-recognition');
  assert.match(config, /into the words of a job you post\. Nothing is sent to a server\./);
});
