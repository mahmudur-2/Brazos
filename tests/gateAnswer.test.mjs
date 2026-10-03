import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * m1-mode-race (2026-09-05): the gate hooks answer for the CURRENT user,
 * synchronously.
 *
 * THE BUG. A user who finished Setup with "Find work" landed in the customer
 * tree. hooks/useSetupStatus.ts and hooks/useLegalGate.ts flipped to
 * 'loading' inside a useEffect, and effects run AFTER the render in which the
 * user first appears; for that one render they still answered 'complete' and
 * 'accepted' from their signed-out branches, App.tsx mounted MainTabs for one
 * commit, ModeShell armed the mode resolution and ModeProvider resolved and
 * stamped the mode before Setup could park its landing — which was then
 * never consumed (`resolvedFor === userId`). The walk that showed it:
 * MAESTRO RED 01a07320-6419-7e1a-b440-8913e9184e5d, `Assertion is false:
 * "Search for jobs or areas" is visible`, customer Home on screen after
 * "Find work".
 *
 * THE FIX (D1). Each hook keeps its stored answer tagged with the user id it
 * belongs to, and the value it returns is DERIVED at render time by
 * lib/gateAnswer.ts: signed out → the signed-out answer; signed in and the
 * stored answer is tagged with this user → the stored value; tagged with
 * another user or with signed-out → 'loading'.
 *
 * This file executes the helper for each of those rows, executes both hooks
 * through the render that used to lie, and fences the hooks as text so
 * neither can return a state that did not come through the derivation.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const helperUrl = pathToFileURL(join(root, 'lib/gateAnswer.ts')).href;
const { deriveGateAnswer } = await import(helperUrl);

/** file → its signed-out answer, the value the hook reports with no user. */
const HOOKS = {
  'hooks/useSetupStatus.ts': 'complete',
  'hooks/useLegalGate.ts': 'accepted',
};

const SETUP_VALUES = ['loading', 'complete', 'incomplete'];
const LEGAL_VALUES = ['loading', 'accepted', 'needs_acceptance', 'unknown'];

// ---------------------------------------------------------------------------
// The helper, executed
// ---------------------------------------------------------------------------

test('(1) signed out → the signed-out answer, whatever is stored', () => {
  for (const [signedOut, values] of [
    ['complete', SETUP_VALUES],
    ['accepted', LEGAL_VALUES],
  ]) {
    for (const forUser of [null, 'user-a', 'user-b']) {
      for (const value of values) {
        assert.equal(
          deriveGateAnswer(null, { forUser, value }, signedOut),
          signedOut,
          `signed out with { forUser: ${forUser}, value: ${value} } stored`
        );
      }
    }
  }
});

test("(2) THE BUG: a stored answer tagged signed-out is 'loading' for a signed-in user — never 'complete' or 'accepted'", () => {
  // The exact record each hook holds after a signed-out render, read in the
  // render where a user first appears — the one-render lie this removes.
  assert.equal(deriveGateAnswer('user-a', { forUser: null, value: 'complete' }, 'complete'), 'loading');
  assert.equal(deriveGateAnswer('user-a', { forUser: null, value: 'accepted' }, 'accepted'), 'loading');

  for (const value of [...SETUP_VALUES, ...LEGAL_VALUES]) {
    for (const signedOut of ['complete', 'accepted']) {
      const answer = deriveGateAnswer('user-a', { forUser: null, value }, signedOut);
      assert.equal(answer, 'loading', `stored { forUser: null, value: ${value} }`);
      assert.notEqual(answer, 'complete');
      assert.notEqual(answer, 'accepted');
    }
  }
});

test('(3) a stored answer tagged with this user is returned as stored — including an in-flight loading', () => {
  for (const value of SETUP_VALUES) {
    assert.equal(deriveGateAnswer('user-a', { forUser: 'user-a', value }, 'complete'), value);
  }
  for (const value of LEGAL_VALUES) {
    assert.equal(deriveGateAnswer('user-a', { forUser: 'user-a', value }, 'accepted'), value);
  }
});

test("(4) a stored answer tagged with another user is 'loading'", () => {
  for (const value of SETUP_VALUES) {
    assert.equal(deriveGateAnswer('user-b', { forUser: 'user-a', value }, 'complete'), 'loading');
  }
  for (const value of LEGAL_VALUES) {
    assert.equal(deriveGateAnswer('user-b', { forUser: 'user-a', value }, 'accepted'), 'loading');
  }
});

test('the helper is pure: no import, no React, no Supabase — one function and its types', () => {
  const code = stripComments(read('lib/gateAnswer.ts'));
  assert.doesNotMatch(code, /^\s*import\b/m, 'lib/gateAnswer.ts imports nothing');
  assert.doesNotMatch(code, /\brequire\(/, 'lib/gateAnswer.ts requires nothing');
  assert.doesNotMatch(code, /react|supabase|AsyncStorage|fetch\(/i, 'no runtime dependency of any kind');
  assert.deepEqual(
    code.match(/^export .*$/gm).map((line) => line.trim()),
    ['export type GateAnswer<T extends string> = {', 'export function deriveGateAnswer<T extends string>('],
    'exactly one type and one function'
  );
  // The header says why it must be synchronous, so the next reader does not
  // move the derivation back into an effect.
  assert.match(read('lib/gateAnswer.ts'), /WHY IT MUST BE SYNCHRONOUS/);
});

// ---------------------------------------------------------------------------
// The hooks as text: every returned state comes through the derivation
// ---------------------------------------------------------------------------

test('both hooks import lib/gateAnswer and derive their state through it, once', () => {
  for (const [file, signedOut] of Object.entries(HOOKS)) {
    const src = read(file);
    const code = stripComments(src);
    assert.match(
      code,
      /^import \{ deriveGateAnswer \} from '\.\.\/lib\/gateAnswer';$/m,
      `${file} imports the derivation`
    );
    assert.match(
      code,
      /^import type \{ GateAnswer \} from '\.\.\/lib\/gateAnswer';$/m,
      `${file} types its stored answer with the helper's record`
    );
    assert.equal((code.match(/deriveGateAnswer\(/g) ?? []).length, 1, `${file} derives exactly once`);
    assert.match(
      code,
      /const state = deriveGateAnswer\(userId, answer, SIGNED_OUT\);/,
      `${file}: \`state\` IS the derivation, for the current user, from the tagged answer`
    );
    assert.match(
      code,
      new RegExp(`const SIGNED_OUT: \\w+ = '${signedOut}';`),
      `${file}: the signed-out answer is unchanged`
    );
  }
});

test('neither hook returns a state that is not derived through the helper', () => {
  for (const file of Object.keys(HOOKS)) {
    const code = stripComments(read(file));
    // The only React state of the gate's value is the tagged record. A raw
    // useState<SetupState | GateState> would be a second, untagged answer that
    // an effect could set one render late — the shape of the bug.
    assert.doesNotMatch(code, /useState<(SetupState|GateState)>/, `${file} holds no untagged gate state`);
    assert.match(code, /useState<GateAnswer<(SetupState|GateState)>>/, `${file} stores a tagged answer`);
    // `state` is assigned exactly once — by the derivation — and that is what
    // the hook returns.
    assert.equal((code.match(/\bstate\s*=/g) ?? []).length, 1, `${file}: one assignment to state`);
    assert.match(code, /return \{ state, /, `${file} returns the derived state`);
    // Every write is tagged: the tagging setter, or the one guarded functional
    // write in useLegalGate that keeps a late read off another account.
    for (const write of code.match(/setAnswer\([^;]*/g) ?? []) {
      assert.match(
        write,
        /setAnswer\(\{ forUser: userId, value \}\)|setAnswer\(\(prev\) =>/,
        `${file}: an untagged write — ${write.trim()}`
      );
    }
  }
});

test('the public API of both hooks is unchanged', () => {
  const setup = stripComments(read('hooks/useSetupStatus.ts'));
  assert.match(setup, /return \{ state, landing, markComplete \};/);
  const legal = stripComments(read('hooks/useLegalGate.ts'));
  assert.match(legal, /return \{ state, markAccepted, recheck: check \};/);
  assert.match(legal, /^export function gateStateForStatus\(status: string\): GateState \{/m);
  // App.tsx still holds its loader on BOTH gates — the derivation only works
  // because this condition reads the hooks' state in the same render.
  assert.match(
    read('App.tsx'),
    /if \(loading \|\| \(user && \(legal\.state === 'loading' \|\| setup\.state === 'loading'\)\)\)/
  );
});

// ---------------------------------------------------------------------------
// The hooks, executed through the render that used to lie
// ---------------------------------------------------------------------------
// The tests/errorHonesty.test.mjs arrangement: the hook source with its
// runtime imports replaced by stubs, loaded from a data URL, driven by a micro
// hook runtime that lets one render happen WITHOUT running its effects — which
// is exactly the render React performs when a user first appears.

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

globalThis.__gateHarness = { states: [], idx: 0, effects: [], user: null };
const reactStub =
  'const h = () => globalThis.__gateHarness;' +
  'export function useState(init) {' +
  '  const i = h().idx++;' +
  "  if (h().states.length <= i) h().states.push(typeof init === 'function' ? init() : init);" +
  "  const set = (v) => { h().states[i] = typeof v === 'function' ? v(h().states[i]) : v; };" +
  '  return [h().states[i], set];' +
  '}' +
  'export function useCallback(fn) { return fn; }' +
  'export function useEffect(fn) { h().effects.push(fn); }';

async function loadHook(file, extra) {
  let js = stripTypeScriptTypes(read(file), { mode: 'strip' });
  const replacements = [
    [
      "import { useCallback, useEffect, useState } from 'react';",
      `import { useCallback, useEffect, useState } from '${toDataUrl(reactStub)}';`,
    ],
    // A data: module cannot resolve a relative specifier; the helper is pure,
    // so it loads by absolute file URL.
    ["import { deriveGateAnswer } from '../lib/gateAnswer';", `import { deriveGateAnswer } from '${helperUrl}';`],
    ["import { useAuth } from './useAuth';", 'const useAuth = () => ({ user: globalThis.__gateHarness.user });'],
    ...extra,
  ];
  for (const [from, to] of replacements) {
    assert.ok(js.includes(from), `${file}: expected the runtime import: ${from}`);
    js = js.replace(from, to);
  }
  return import(toDataUrl(js));
}

/** One render: returns the hook's result and the effects it scheduled, unrun. */
function render(hook) {
  const h = globalThis.__gateHarness;
  h.idx = 0;
  h.effects = [];
  const out = hook();
  return { out, effects: h.effects };
}

/** Run the scheduled effects and let any read settle (two macrotask turns). */
async function runEffects(effects) {
  for (const fn of effects) fn();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetHarness(user) {
  const h = globalThis.__gateHarness;
  h.states = [];
  h.idx = 0;
  h.effects = [];
  h.user = user;
}

test('useSetupStatus: the render in which a user first appears already says loading', async () => {
  let js = stripTypeScriptTypes(read('hooks/useSetupStatus.ts'), { mode: 'strip' });
  const replacements = [
    [
      "import { useCallback, useEffect, useState } from 'react';",
      `import { useCallback, useEffect, useState } from '${toDataUrl(reactStub)}';`,
    ],
    ["import { deriveGateAnswer } from '../lib/gateAnswer';", `import { deriveGateAnswer } from '${helperUrl}';`],
    ["import { useAuth } from './useAuth';", 'const useAuth = () => ({ user: globalThis.__gateHarness.user });'],
    [
      "import { readSetupRecord, writeSetupRecord } from '../lib/setupStorage';",
      'const readSetupRecord = (id) => globalThis.__gateHarness.readSetup(id); const writeSetupRecord = async () => ({ error: null });',
    ],
    // B16: no server trace in this harness unless a test gives one.
    [
      "import { hasAnyLegalAcceptance } from '../lib/legal';",
      'const hasAnyLegalAcceptance = (id) => (globalThis.__gateHarness.hasAcceptance ?? (async () => false))(id);',
    ],
  ];
  for (const [from, to] of replacements) {
    assert.ok(js.includes(from), `expected the runtime import: ${from}`);
    js = js.replace(from, to);
  }
  // The strip leaves `import { DEFAULT_LANDING, <blank> } from '../lib/setupState';`
  // as a runtime import, which a data: module cannot resolve; lib/setupState.ts
  // is pure, so it loads by absolute file URL too.
  const setupStateUrl = pathToFileURL(join(root, 'lib/setupState.ts')).href;
  const before = js;
  js = js.replace(/from '\.\.\/lib\/setupState';/, `from '${setupStateUrl}';`);
  assert.notEqual(js, before, 'expected the setupState import');
  const { useSetupStatus } = await import(toDataUrl(js));

  // A signed-out render: the signed-out answer, and its effect stores it
  // tagged signed-out — the record the bug read from.
  resetHarness(null);
  globalThis.__gateHarness.readSetup = () => Promise.resolve(null);
  let r = render(useSetupStatus);
  assert.equal(r.out.state, 'complete');
  await runEffects(r.effects);
  assert.equal(render(useSetupStatus).out.state, 'complete');

  // THE render: a user appears; effects have NOT run yet.
  globalThis.__gateHarness.user = { id: 'user-a' };
  r = render(useSetupStatus);
  assert.equal(r.out.state, 'loading', 'must not say complete from the signed-out branch');

  // The effect runs and the read lands: this user's own answer.
  await runEffects(r.effects);
  assert.equal(render(useSetupStatus).out.state, 'incomplete');

  // Setup finishes: markComplete stores it for this user.
  render(useSetupStatus).out.markComplete('work');
  const done = render(useSetupStatus).out;
  assert.equal(done.state, 'complete');
  assert.equal(done.landing, 'work');

  // A second account on the same device: the first one's answer is not hers.
  globalThis.__gateHarness.user = { id: 'user-b' };
  r = render(useSetupStatus);
  assert.equal(r.out.state, 'loading');
  globalThis.__gateHarness.readSetup = () => Promise.resolve({ completed: true, landing: 'hire' });
  await runEffects(r.effects);
  assert.equal(render(useSetupStatus).out.state, 'complete');
});

test('useLegalGate: the render in which a user first appears already says loading', async () => {
  const { useLegalGate } = await loadHook('hooks/useLegalGate.ts', [
    ["import { fetchLegalStatus } from '../lib/legal';", 'const fetchLegalStatus = (id) => globalThis.__gateHarness.fetchLegal(id);'],
    // B6: no device record here, so every answer is the server's own.
    [
      "import { cachedAcceptanceFor, forgetAcceptance, rememberAcceptance } from '../lib/legalCache';",
      'const cachedAcceptanceFor = async () => false; const forgetAcceptance = async () => {}; const rememberAcceptance = async () => {};',
    ],
    ["import { Sentry } from '../lib/observability/sentry';", 'const Sentry = null;'],
  ]);

  resetHarness(null);
  globalThis.__gateHarness.fetchLegal = () => Promise.resolve({ status: 'needs_acceptance' });
  let r = render(useLegalGate);
  assert.equal(r.out.state, 'accepted');
  await runEffects(r.effects);
  assert.equal(render(useLegalGate).out.state, 'accepted');

  // THE render: a user appears; effects have NOT run yet.
  globalThis.__gateHarness.user = { id: 'user-a' };
  r = render(useLegalGate);
  assert.equal(r.out.state, 'loading', 'must not say accepted from the signed-out branch');

  await runEffects(r.effects);
  assert.equal(render(useLegalGate).out.state, 'needs_acceptance');

  // Accepting records it for this user.
  render(useLegalGate).out.markAccepted();
  assert.equal(render(useLegalGate).out.state, 'accepted');

  // A recheck for the SAME user shows loading while the read is in flight,
  // then the result.
  let settle;
  globalThis.__gateHarness.fetchLegal = () => new Promise((resolve) => { settle = resolve; });
  const pending = render(useLegalGate).out.recheck();
  assert.equal(render(useLegalGate).out.state, 'loading');
  settle({ status: 'accepted' });
  await pending;
  assert.equal(render(useLegalGate).out.state, 'accepted');

  // A read that lands after another account has taken over is dropped, not
  // tagged onto them: user-a's slow read resolves after user-b's answer.
  let slow;
  globalThis.__gateHarness.fetchLegal = () => new Promise((resolve) => { slow = resolve; });
  const slowRead = render(useLegalGate).out.recheck();
  globalThis.__gateHarness.user = { id: 'user-b' };
  r = render(useLegalGate);
  assert.equal(r.out.state, 'loading');
  globalThis.__gateHarness.fetchLegal = () => Promise.resolve({ status: 'accepted' });
  await runEffects(r.effects);
  assert.equal(render(useLegalGate).out.state, 'accepted');
  slow({ status: 'needs_acceptance' });
  await slowRead;
  assert.equal(render(useLegalGate).out.state, 'accepted', "user-a's late read must not become user-b's answer");
});
