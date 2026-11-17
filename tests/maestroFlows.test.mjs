// LEAN F2 — THE MAESTRO FLOWS ARE FENCED OFFLINE.
//
// .maestro/ holds one flow per screen group (01-auth … 10-account-delete) plus
// the shared subflows/ they call, run in config.yaml's order against a
// simulator build of the e2e-test profile (eas.json) by
// .github/workflows/e2e-ios.yml. None of that runs in `npm run verify`, so what
// CAN be proven offline is pinned here, as strings:
//
//   1. Every flow launches the app the profile builds: its appId is the preview
//      bundle identifier, DERIVED from app.config.ts by regex, never retyped.
//   2. config.yaml lists every top-level flow exactly once, in file order.
//   3. No credential shape reaches .maestro/: no email-shaped literal, no
//      pk_ / sk_ / eyJ, no 10+ digit run (a phone, an OTP pair, a card), no
//      production ref; only the five allowed MAESTRO_* names are read.
//   4. Every runFlow target exists, every flow starts clean and ends signed
//      out, and each F group of docs/lean/MAESTRO-COVERAGE.md is named in a
//      flow's header.
//   5. The e2e-test profile is a credential-less simulator build (D2).
//
// Files are read as text, CRLF normalised, so the checks read the same on a
// Windows checkout and on the runner. No YAML parser: the repo declares none.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RETIRED_PRODUCTION_REF } from '../scripts/supabase-ref.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const ALLOWED_ENV = [
  'MAESTRO_E2E_PHONE',
  'MAESTRO_E2E_OTP',
  'MAESTRO_E2E_PHONE_2',
  'MAESTRO_E2E_OTP_2',
  'MAESTRO_RUN_ID',
];

const isFlow = (name) => /\.ya?ml$/.test(name) && name !== 'config.yaml';

/** Top-level flows, in name order — the whole set, not a hand-kept list. */
function topFlows() {
  return readdirSync(join(root, '.maestro'))
    .filter(isFlow)
    .sort()
    .map((name) => ({ rel: `.maestro/${name}`, name, text: read(`.maestro/${name}`) }));
}

/** Every flow, subflows included. */
function allFlows() {
  const subs = readdirSync(join(root, '.maestro/subflows'))
    .filter(isFlow)
    .sort()
    .map((name) => ({ rel: `.maestro/subflows/${name}`, name, text: read(`.maestro/subflows/${name}`) }));
  return [...topFlows(), ...subs];
}

/** Every file under .maestro/ (flows, config, README). */
function allFiles() {
  return [...allFlows(), { rel: '.maestro/config.yaml' }, { rel: '.maestro/README.md' }].map((f) => ({
    rel: f.rel,
    text: f.text ?? read(f.rel),
  }));
}

/**
 * The preview variant's bundle identifier, from app.config.ts by regex: the
 * template literal that builds every identifier, plus BUNDLE_SUFFIX's
 * `preview` entry — the same two facts tests/appConfig.test.mjs pins.
 */
function previewBundleIdentifier() {
  const source = read('app.config.ts');
  const base = source.match(/bundleIdentifier: `([a-z0-9.]+)\$\{BUNDLE_SUFFIX\[VARIANT\]\}`/);
  assert.ok(base, 'app.config.ts builds bundleIdentifier from BUNDLE_SUFFIX[VARIANT]');
  const block = source.match(/const BUNDLE_SUFFIX: Record<Variant, string> = \{([\s\S]*?)\};/);
  assert.ok(block, 'app.config.ts declares BUNDLE_SUFFIX');
  const suffix = block[1].match(/preview: '([^']*)',/);
  assert.ok(suffix, 'BUNDLE_SUFFIX carries a preview entry');
  return base[1] + suffix[1];
}

/** The `- item` lines directly under `key:` at the given indent. */
function yamlList(text, key, indent) {
  const pad = ' '.repeat(indent);
  const block = text.match(new RegExp(`^${pad}${key}:\\n((?:${pad}  - .+\\n?)+)`, 'm'));
  assert.ok(block, `config.yaml has a ${key} list`);
  return block[1].trim().split('\n').map((line) => line.replace(/^\s*- /, '').trim());
}

test('every flow launches the preview variant the e2e-test profile builds', () => {
  const expected = previewBundleIdentifier();
  assert.equal(expected, 'app.brazos.mobile.preview', 'the preview identifier reads as expected');
  const flows = allFlows();
  assert.ok(flows.length >= 16, `only ${flows.length} flow files — check the read`);
  for (const { rel, text } of flows) {
    assert.equal(text.split('\n')[0], `appId: ${expected}`, `${rel} starts with the preview appId`);
  }
});

test('config.yaml lists every top-level flow exactly once, in file order', () => {
  const names = topFlows().map((f) => f.name);
  assert.equal(names.length, 10, 'ten screen-group flows');
  const config = read('.maestro/config.yaml');
  assert.deepEqual(yamlList(config, 'flows', 0), names);
  assert.deepEqual(
    yamlList(config, 'flowsOrder', 2),
    names.map((n) => n.replace(/\.ya?ml$/, ''))
  );
  assert.match(config, /^executionOrder:\n {2}continueOnFailure: false\n/m);
});

test('no credential shape reaches .maestro/, and only the allowed MAESTRO_* names are read', () => {
  const files = allFiles();
  for (const { rel, text } of files) {
    assert.doesNotMatch(text, /@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/, `${rel}: email-shaped literal`);
    assert.doesNotMatch(text, /\bpk_/, `${rel}: publishable-key prefix`);
    assert.doesNotMatch(text, /\bsk_/, `${rel}: secret-key prefix`);
    assert.doesNotMatch(text, /eyJ/, `${rel}: JWT-shaped literal`);
    assert.doesNotMatch(text, /\d{10,}/, `${rel}: a 10+ digit run (phone, code or card)`);
    assert.ok(!text.includes(RETIRED_PRODUCTION_REF), `${rel} names the retired production ref`);
  }
  const flowText = allFlows().map((f) => f.text).join('\n');
  const used = new Set(flowText.match(/\bMAESTRO_[A-Z0-9_]+/g) ?? []);
  for (const name of used) assert.ok(ALLOWED_ENV.includes(name), `${name} is not an allowed env name`);
  for (const name of ALLOWED_ENV) assert.ok(used.has(name), `the flow set reads ${name}`);
});

test('every runFlow target exists, relative to the file that calls it', () => {
  let targets = 0;
  for (const { rel, text } of allFlows()) {
    for (const m of text.matchAll(/^\s*-?\s*(?:runFlow|file):\s*([^\s#]+\.ya?ml)\s*$/gm)) {
      targets += 1;
      const target = join(dirname(rel), m[1]);
      assert.ok(existsSync(join(root, target)), `${rel} runs ${m[1]}, which does not exist`);
    }
  }
  assert.ok(targets >= 40, `only ${targets} runFlow targets — check the regex`);
});

test('each top-level flow has a 2-line header, starts clean and ends signed out', () => {
  for (const { rel, text } of topFlows()) {
    const lines = text.trimEnd().split('\n');
    assert.match(lines[1], /^# F\d /, `${rel}: line 2 names its coverage group`);
    assert.match(lines[2], /^# \S/, `${rel}: line 3 says what it proves`);
    assert.equal(lines[3], '---', `${rel}: the header ends at line 3`);
    assert.equal(lines[4], '- launchApp:', `${rel}: the first command launches the app`);
    assert.equal(lines[5], '    clearState: true', `${rel}: from a clean state`);
    // Signed out last: nothing but assertions after the final sign-out.
    const signOut = lines.lastIndexOf('- runFlow: subflows/sign-out.yml');
    assert.ok(signOut > 5, `${rel}: signs out`);
    for (const line of lines.slice(signOut + 1)) {
      assert.match(line, /^- assert(Not)?Visible: /, `${rel}: "${line}" runs after the final sign-out`);
    }
  }
});

test('every F group of the coverage map is named in a flow header', () => {
  const groups = [...read('docs/lean/MAESTRO-COVERAGE.md').matchAll(/^## (F\d+) /gm)].map((m) => m[1]);
  assert.deepEqual(groups, ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  const headers = topFlows()
    .map((f) => f.text.split('\n').slice(1, 3).join('\n'))
    .join('\n');
  for (const group of groups) {
    assert.match(headers, new RegExp(`\\b${group}\\b`), `${group} is named in no flow header`);
  }
});

test('the e2e-test profile is a credential-less simulator build in the Beta shape (D2)', () => {
  const eas = JSON.parse(read('eas.json'));
  const profile = eas.build['e2e-test'];
  assert.ok(profile, 'eas.json declares e2e-test');
  assert.equal(profile.withoutCredentials, true);
  assert.equal(profile.ios?.simulator, true);
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.distribution, 'internal');
  assert.equal(profile.channel, undefined, 'no update channel: a simulator build never takes an OTA');
  // The Beta's shape: both variant variables say preview, which is what makes
  // the appId the flows launch the binary this profile installs.
  assert.equal(profile.env.APP_VARIANT, 'preview');
  assert.equal(profile.env.EXPO_PUBLIC_APP_VARIANT, 'preview');
});

test('B12 · flow 01 walks the live-phone build: no email sign-up is offered, and the empty phone form is refused', () => {
  // The e2e build has phone sign-in live, so Welcome and the phone form offer no email sign-up.
  assert.equal(JSON.parse(read('eas.json')).build['e2e-test'].env.EXPO_PUBLIC_PHONE_AUTH_MODE, 'supabase');
  const flow = read('.maestro/01-auth.yml');
  assert.match(flow, /^- assertNotVisible: "Continue with Email"$/m);
  for (const { rel, text } of allFlows()) {
    assert.doesNotMatch(text, /(TAP|tapOn): "Continue with Email"/, `${rel} taps a button the e2e build does not show`);
  }
  // On the phone form: no "Use Email Instead", and Create with empty fields names both.
  const form = flow.slice(flow.indexOf('TAP: "Continue with Phone"'));
  const at = (s) => form.indexOf(s);
  assert.ok(at('- assertNotVisible: "Use Email Instead"') > 0, 'the phone form offers no email sign-up');
  assert.ok(at('- assertNotVisible: "Use Email Instead"') < at('- assertVisible: "Enter your full name."'));
  assert.ok(at('- assertVisible: "Enter your full name."') < at('- assertVisible: "Enter your phone number."'));
});

// FLOW-R (phone run 4): the repairs below are pinned as text.
const PITCH = 'I have a dolly and can do it tomorrow morning.';
const BID_WAIT = `- extendedWaitUntil:\n    visible: 'Bid sent|Get notified\\?|Could not send bid'\n    timeout: 60000\n- assertNotVisible: "Could not send bid"\n`;

/** The text from the end of line `i` to the next top-level command. */
function nextTopLevel(lines, i) {
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith('- ')) j += 1;
  return lines.slice(j).join('\n');
}

// FLOW-R3b: Maestro's iOS UP swipe starts at 90 % of the screen, on a keyboard that is up; this drag starts at the
// screen's centre, on the sheet's scroller with the keyboard up or down.
const SWIPE_CLOSE = '- swipe:\n    start: 50%, 50%\n    end: 50%, 30%\n    duration: 250\n- runFlow: subflows/keyboard-settle.yml\n';

test('FLOW-R3 · flow 03: every written Send Bid follows a centre drag that closes the keyboard, and each is ONE plain tap after a wait', () => {
  const flow = read('.maestro/03-worker-discover-bid.yml');
  // The pitch-less send still proves the pitch rule.
  assert.match(flow, /^- tapOn: "Send Bid"\n- extendedWaitUntil:\n {4}visible: "Add a pitch"\n/m);
  assert.doesNotMatch(flow, /TAP: "Send Bid"/, 'no Send Bid goes through home-tap.yml (a repeated tap can type into the pitch)');
  // The main job's one-tap bid confirms in a dialog (no typing); the sheet's sends follow "Write a Bid".
  const sheet = flow.indexOf('- tapOn: "Write a Bid"');
  const taps = [...flow.matchAll(/^- tapOn: "Send Bid"$/gm)].map((m) => m.index).filter((at) => at > sheet);
  assert.equal(taps.length, 3, 'the pitch-less send and the two written sends');
  // FLOW-R3b: the pitch-less send reads as before FLOW-R3 (run 5 passed it with the eyebrow tap alone).
  assert.ok(
    flow.includes('- inputText: "40"\n- tapOn: "YOU.RE BIDDING ON"\n- runFlow: subflows/keyboard-settle.yml\n# A bid needs a pitch (components/OfferComposer.tsx).\n- scrollUntilVisible:\n'),
    'the amount block is the one of 62b4efe'
  );
  assert.doesNotMatch(flow.slice(flow.indexOf('- inputText:')), /- swipe:\n\s+direction: UP/, 'no UP swipe after a typed field');
  for (const at of taps.slice(1)) {
    const typed = flow.lastIndexOf('- inputText:', at);
    assert.ok(flow.indexOf(SWIPE_CLOSE, typed) > typed && flow.indexOf(SWIPE_CLOSE, typed) < at, 'a swipe closes the keyboard between the typing and the tap');
  }
  const afterPitch = flow.slice(flow.indexOf(`inputText: "${PITCH}"`));
  const sends = afterPitch.match(
    /- extendedWaitUntil:\n {4}visible: "Send Bid"\n {4}timeout: 30000\n- tapOn: "Send Bid"\n- extendedWaitUntil:\n {4}visible: 'Bid sent\|Get notified\\\?\|Could not send bid\|Add a pitch\|Check the amount'\n {4}timeout: 60000\n {4}optional: true\n/g
  );
  assert.equal(sends?.length, 2, 'both written sends: a wait for the button, one tap, an optional wait for the answer');
  assert.doesNotMatch(afterPitch, /tapOn: "OK"/, 'no block closes an alert after a typed pitch');
  assert.doesNotMatch(afterPitch, /visible: "Add a pitch"\n\s+commands:\n\s+- (tapOn|inputText)/, 'no recovery block on "Add a pitch"');
  // The keyboard facts live outside probe03, which the NOTE at the end reads.
  assert.match(flow, /^- evalScript: "\$\{output\.kb03 = ''\}"$/m);
  assert.doesNotMatch(flow, /probe03 \+ ' kb/);
  for (const fact of ['kbSeenAfterTyping', 'kbUpBeforeSend', 'pitchGrew', 'bidStored']) assert.ok(flow.includes(` ${fact}`), fact);
});

test('FLOW-R3 · flow 02: Save Changes by text, else by id with a NOTE at the end; the save proof stays mandatory', () => {
  const flow = read('.maestro/02-customer-post-job.yml');
  assert.match(flow, /- runFlow:\n {4}when:\n {6}true: \$\{output\.byId02 !== 'yes'\}\n {4}commands:\n {6}- tapOn: "Save Changes"\n/);
  assert.match(flow, /- runFlow:\n {4}when:\n {6}true: \$\{output\.byId02 === 'yes'\}\n {4}commands:\n {6}- runFlow:\n {10}when:\n {12}visible: "STEP 4 OF 4"\n {10}commands:\n {12}- takeScreenshot: probe-plain-02a\n {6}- tapOn:\n {10}id: "post-job-primary"\n/);
  // FLOW-R3b (T3): the id path needs a positive read: 'yes' until "Save Changes" is seen once.
  assert.match(flow, /- evalScript: "\$\{output\.byId02 = 'yes'\}"\n- runFlow:\n {4}when:\n {6}visible: "Save Changes"\n {4}commands:\n {6}- evalScript: "\$\{output\.byId02 = 'no'\}"\n/);
  assert.doesNotMatch(flow, /notVisible: "Save Changes"/);
  const note = flow.indexOf('NOTE 02 every proof step passed - Save Changes was found by id and not by text');
  assert.ok(note > flow.indexOf("- assertVisible: 'Your job is updated\\.'"), 'the NOTE comes after the save proof');
  assert.ok(flow.indexOf('- runFlow: subflows/sign-out.yml') > note);
  for (const fact of ['saveChangesAnywhere', 'livePage', 'draftLabel', 'noteAfterSwipe', 'tap90saved', 'tap94saved', 'tap97saved']) assert.ok(flow.includes(` ${fact}`), fact);
});

test("FLOW-R · flow 05: the worker's sent counter is found by scrolling up to its card", () => {
  const flow = read('.maestro/05-worker-start-complete.yml');
  const rest = flow.slice(flow.indexOf('text: "Send Counter-Offer"'));
  const at = (s) => rest.indexOf(s);
  assert.ok(at('notVisible: "Send Counter-Offer"') > 0, 'waits for the form to close');
  assert.ok(at('notVisible: "Send Counter-Offer"') < at("- assertNotVisible: 'No counter-offers left|Could not send.*'"));
  assert.match(rest, /- assertNotVisible: 'No counter-offers left\|Could not send\.\*'\n- scrollUntilVisible:\n {4}element:\n {6}text: "Your Counter-Offer"\n {4}direction: UP\n/);
  assert.ok(!flow.includes("visible: 'Your counter-offer|"), 'the old wait on the card is gone');
});

test('FLOW-R · T1 · flow 08 scrolls UP to "Switch to Worker" before it leaves Profile for Home', () => {
  const flow = read('.maestro/08-notifications-settings.yml');
  const last = flow.lastIndexOf('- tapOn: "Account & Safety"');
  const home = flow.indexOf('- tapOn: "Home"', last);
  assert.ok(last > 0 && home > last);
  assert.match(
    flow.slice(last, home),
    /- scrollUntilVisible:\n {4}element:\n {6}text: "Switch to Worker"\n {4}direction: UP\n/
  );
});

test('FLOW-R · T2 · flow 06 picks no sheet control the page behind shares, and every id is a testID in the app', () => {
  const flow = read('.maestro/06-customer-approve-review.yml');
  const lines = flow.slice(flow.indexOf('- tapOn: "Review & approve.*"'), flow.indexOf('visible: "Review & Tip"')).split('\n').slice(1);
  const sheet = read('screens/ApproveOrDisputeScreen.tsx');
  const page = read('screens/ClientJobDetailScreen.tsx');
  let taps = 0;
  lines.forEach((line, i) => {
    let label = line.match(/^- tapOn: ["'](.+)["']$/)?.[1];
    if (line === '- tapOn:') {
      const keys = [];
      for (let j = i + 1; j < lines.length && lines[j].startsWith('    '); j += 1) keys.push(lines[j].trim());
      if (keys.some((k) => /^(rightOf|below):/.test(k))) return;
      label = keys.find((k) => k.startsWith('text:'))?.match(/^text: ["'](.+)["']$/)?.[1];
    }
    if (label === undefined) return;
    taps += 1;
    assert.notEqual(label, 'Close', 'a plain "Close" can hit the sheet\'s backdrop');
    assert.ok(!(sheet.includes(label) && page.includes(label)), `"${label}" is on the sheet and on the page behind it`);
  });
  assert.ok(taps >= 3, `only ${taps} plain taps read — check the parse`);

  const sources = [];
  const walk = (dir) => {
    if (!existsSync(join(root, dir))) return;
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) sources.push(read(rel));
    }
  };
  ['screens', 'components', 'ui', 'navigation'].forEach(walk);
  const exact = new Set();
  const prefixes = [];
  for (const m of sources.join('\n').matchAll(/testID=(?:"([^"]+)"|\{`([^`$]*)(\$\{)?)/g)) {
    if (m[1]) exact.add(m[1]);
    else if (m[3]) prefixes.push(m[2]);
    else exact.add(m[2]);
  }
  const ids = allFlows().flatMap((f) => [...f.text.matchAll(/^\s+id: "([^"]+)"$/gm)].map((m) => m[1]));
  assert.ok(ids.length >= 3, 'the flows pick by id');
  for (const id of ids) {
    assert.ok(exact.has(id) || prefixes.some((p) => p && id.startsWith(p)), `id "${id}" is no testID in the app`);
  }
});

test('FLOW-R · probes: each PROBE assert runs only on a failure path, the proofs follow it unchanged, and its words are plain', () => {
  const probes = [];
  for (const rel of ['.maestro/02-customer-post-job.yml', '.maestro/03-worker-discover-bid.yml']) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      if (!/^\s+- assertVisible: "PROBE /.test(line)) return;
      const indent = line.indexOf('-');
      let c = i - 1;
      while (c >= 0 && (lines[c].trim() === '' || lines[c].search(/\S/) >= indent)) c -= 1;
      assert.equal(lines[c], `${' '.repeat(indent - 2)}commands:`, `${rel}:${i + 1} sits in a commands list`);
      assert.match(lines[c - 1], /^\s+notVisible: /, `${rel}:${i + 1} runs only when a text is not visible`);
      assert.match(lines[c - 2], /^\s+when:$/, `${rel}:${i + 1} sits in a when block`);
      probes.push({ rel, text: line.match(/"(.*)"/)[1], after: nextTopLevel(lines, i) });
    });
  }
  assert.deepEqual(probes.map((p) => p.rel), [
    '.maestro/02-customer-post-job.yml',
    '.maestro/03-worker-discover-bid.yml',
    '.maestro/03-worker-discover-bid.yml',
  ]);
  assert.ok(
    probes[0].after.startsWith(
      `- extendedWaitUntil:\n    visible: 'Your job is updated\\.|Could not save changes'\n    timeout: 60000\n- assertVisible: 'Your job is updated\\.'\n`
    ),
    'flow 02: the wait and the proof follow the probe unchanged'
  );
  for (const p of probes.slice(1)) assert.ok(p.after.startsWith(BID_WAIT), 'flow 03: the wait (not optional) and the refusal check follow');
  for (const p of probes) {
    assert.match(p.text.replace(/(\$\{output\.\w+\})+$/, ''), /^[A-Za-z0-9 :-]+$/, `"${p.text}" has a regex-special character`);
  }
});

test('FLOW-R3b · flow 04: the eyebrow tap closes the counter keypad (a tap no child handles, in the Sheet scroller), no swipe', () => {
  const flow = read('.maestro/04-customer-accept-pay.yml');
  const typed = flow.indexOf('- inputText: "45"');
  const send = flow.indexOf('- tapOn: "Send Counter-Offer"');
  assert.ok(typed > 0 && send > typed);
  assert.ok(!flow.slice(typed, send).includes('- swipe:'), 'no swipe between the typing and the tap');
  assert.match(flow.slice(typed, send), /- tapOn: "COUNTERING"\n(#.*\n)*- runFlow: subflows\/keyboard-settle\.yml\n$/);
});

test('FLOW-R3b · plain pictures: only flow 02 takes them, twice, each alone under a guard that proves the edit form step 4', () => {
  const others = allFlows().filter((f) => f.rel !== '.maestro/02-customer-post-job.yml' && f.text.includes('takeScreenshot: probe-plain-'));
  assert.deepEqual(others.map((f) => f.rel), []);
  const flow = read('.maestro/02-customer-post-job.yml');
  const lines = flow.split('\n');
  const shots = [];
  lines.forEach((line, i) => {
    const m = line.match(/^( +)- takeScreenshot: (probe-plain-\S+)$/);
    if (!line.includes('probe-plain-')) return;
    assert.ok(m, `02:${i + 1} a plain picture is a nested takeScreenshot`);
    const indent = m[1].length;
    assert.equal(lines[i - 1], `${' '.repeat(indent - 2)}commands:`, `02:${i + 1} is the first command of its block`);
    assert.match(lines[i - 2], /^ +visible: ("STEP 4 OF 4"|'STEP 4 OF 4\|Saving updates this existing job for workers nearby\\\.')$/, `02:${i + 1} guard`);
    assert.match(lines[i - 3], /^ +when:$/);
    assert.ok(lines[i + 1].search(/\S/) < indent, `02:${i + 1} stands alone in its guard`);
    shots.push({ name: m[2], at: lines.slice(0, i).join('\n').length });
  });
  assert.deepEqual(shots.map((s) => s.name), ['probe-plain-02a', 'probe-plain-02b']);
  // a: on the id path, before the id tap; b: in the probe, after its swipe, before the point taps.
  assert.ok(shots[0].at > flow.indexOf("true: ${output.byId02 === 'yes'}") && shots[0].at < flow.indexOf('id: "post-job-primary"'));
  const probeSwipe = flow.indexOf('      - swipe:\n          direction: UP\n');
  assert.ok(probeSwipe > 0 && shots[1].at > probeSwipe && shots[1].at < flow.indexOf('point: "50%,90%"'));
});
