#!/usr/bin/env node
/**
 * EAS Build gate (package.json "eas-build-pre-install") — pins EVERY build
 * profile to the one Supabase project it is allowed to bundle, and fails
 * closed on anything it cannot prove.
 *
 * Why this can work at all: .env is gitignored and therefore never uploaded
 * to EAS, so on a build worker the bundle's EXPO_PUBLIC_SUPABASE_URL /
 * EXPO_PUBLIC_SUPABASE_KEY come from the EAS environment the profile selects
 * (eas.json itself now carries neither value). This hook runs on that same
 * worker with those same variables, BEFORE dependencies install (so it must
 * stay dependency-free), and a non-zero exit fails the whole build.
 *
 * THE VARIABLES ARE EXPO_PUBLIC_ AS OF R1, and the .env cross-check below
 * matters MORE after that change, not less. It is tempting to read the file
 * sweep as a defence against the Babel dotenv plugin, which is gone. It never
 * was: the Expo CLI itself loads .env files into the process and inlines every
 * EXPO_PUBLIC_ value at bundle time. A stray .env beside a local build runner
 * (`eas build --local`) is still a live path from a developer's own project
 * into a shipped binary, and it is the only path this gate can see.
 *
 * Fail-closed contract — exit 1 with a one-line named reason on stderr:
 *   - EAS_BUILD_PROFILE unset                  → "not an EAS build"
 *   - profile not in EXPECTED_REF              → "unknown profile"
 *   - EXPO_PUBLIC_SUPABASE_URL / _KEY absent   → named absence
 *   - a ref-bearing source that parses to no
 *     project ref                              → named parse failure
 *   - sources disagreeing, or any source not equal to the profile's expected
 *     ref                                      → named, listing every ref found
 *   - a key that is neither a legacy eyJ… JWT nor a new-format publishable
 *     key (sb_secret_… included)               → named refusal
 *
 * THE URL IS THE AUTHORITATIVE REF SOURCE: refFromRestUrl of the URL variable
 * must resolve and equal the profile's expected ref, or the build fails. Key
 * handling follows its format (keyKind in supabase-ref.mjs): a legacy eyJ…
 * key embeds the ref and is decoded and cross-checked; a new-format
 * sb_publishable_… / sb_pu_… key carries NO ref by design and is accepted as
 * a format — the app's own live control probe is what verifies key/project
 * pairing at runtime; anything else fails closed. Every dotenv-style file the
 * Expo CLI could consult in the build directory is checked the same way —
 * none should exist on an EAS worker, but a local runner has the developer's
 * .env in view and it must agree too.
 * Refs only are ever compared and printed — never a URL or key value.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyKind, refFromRestUrl, refFromJwt, PRODUCTION_REF, STAGING_REF } from './supabase-ref.mjs';

/**
 * The one Supabase project each EAS BUILD PROFILE (EAS_BUILD_PROFILE) may build
 * against; a profile absent here is refused, and tests/buildGate.test.mjs keeps
 * this map and eas.json's `build` keys identical. development, preview,
 * e2e-test and testflight build against STAGING. `production` builds against
 * the new production project (PRODUCTION_REF, D-20261111-1) and nothing else,
 * and the retired project (RETIRED_PRODUCTION_REF) is expected by no profile
 * at all.
 * `testflight` is the store-distributed STAGING build for the TestFlight cohort
 * (D-20260905-1): bundle id app.brazos.mobile, Stripe test key. Its EAS
 * ENVIRONMENT is `preview`, which holds staging values (verified 2026-11-08);
 * the `production` environment holds production values — never point
 * testflight at it to "match" the bundle id.
 */
export const EXPECTED_REF = Object.freeze({
  development: STAGING_REF,
  preview: STAGING_REF,
  'e2e-test': STAGING_REF,
  testflight: STAGING_REF,
  production: PRODUCTION_REF,
});

/**
 * Every dotenv-style file the Expo CLI could consult for any mode this process
 * could run under. The fixed pair plus the per-mode names are what the CLI's
 * own env loading looks for; APP_ENV / BABEL_ENV / NODE_ENV add whatever mode
 * the build actually selects. The list is unchanged by R1's move to
 * EXPO_PUBLIC_ names — the FILES the CLI reads are the same files; only the
 * variable names inside them changed.
 */
export function envFileCandidates(env = {}) {
  const modes = new Set(['development', 'production', 'test']);
  for (const key of ['APP_ENV', 'BABEL_ENV', 'NODE_ENV']) {
    const mode = env[key];
    if (typeof mode === 'string' && mode !== '') modes.add(mode);
  }
  const names = ['.env', '.env.local'];
  for (const mode of modes) names.push(`.env.${mode}`, `.env.${mode}.local`);
  return [...new Set(names)];
}

/**
 * Minimal dotenv parser: KEY=value, optional `export`, quotes, comments.
 * Returns a null-prototype map so a hostile key like __proto__ stays inert.
 * Parsed values never leave this module — callers only ever see refs.
 */
export function parseEnvText(text) {
  const vars = Object.create(null);
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    vars[match[1]] = value;
  }
  return vars;
}

/**
 * Read every candidate env file under `dir`. A file that exists but cannot
 * be read reports vars: null, which evaluateGate treats as a failure —
 * never as "probably fine".
 */
export function loadEnvFiles(dir, env = {}) {
  const files = [];
  for (const name of envFileCandidates(env)) {
    const filePath = path.join(dir, name);
    if (!existsSync(filePath)) continue;
    try {
      files.push({ name, vars: parseEnvText(readFileSync(filePath, 'utf8')) });
    } catch {
      files.push({ name, vars: null });
    }
  }
  return files;
}

/**
 * Pure fail-closed verdict over an environment plus the env files visible to
 * the build. The URL is the authoritative ref source and must resolve and
 * equal the profile's expected ref. A key contributes a ref only when it is
 * a legacy JWT (decoded and cross-checked); a new-format publishable key is
 * accepted as a format and recorded in `notes` (the live control probe
 * verifies key/project pairing); any other key format is a named failure.
 * An unset or unknown profile, an absent variable, or an unreadable file is
 * a named failure. Returns { ok, profile, expected, sources, notes,
 * problems } — refs only, never a URL or key value.
 */
export function evaluateGate(env, envFiles = []) {
  const profile = env.EAS_BUILD_PROFILE;
  if (typeof profile !== 'string' || profile === '') {
    return {
      ok: false,
      profile: null,
      expected: null,
      sources: [],
      notes: [],
      problems: ['not an EAS build: EAS_BUILD_PROFILE is unset'],
    };
  }
  // hasOwnProperty, not a bare lookup: a profile named after an inherited
  // member ("toString") must read as unknown, not as a match.
  if (!Object.prototype.hasOwnProperty.call(EXPECTED_REF, profile)) {
    return {
      ok: false,
      profile,
      expected: null,
      sources: [],
      notes: [],
      problems: [`unknown profile "${profile}"`],
    };
  }
  const expected = EXPECTED_REF[profile];
  const problems = [];
  const sources = [];
  const notes = [];

  // A key source contributes by format: legacy JWTs carry the ref and join
  // `sources` for the resolve/agree/expected checks; publishable keys carry
  // none by design and are noted, not failed; anything else is refused.
  function addKeySource(name, key) {
    const kind = keyKind(key);
    if (kind === 'legacy-jwt') {
      sources.push({ name, ref: refFromJwt(key) });
    } else if (kind === 'publishable') {
      notes.push(
        `${name} is a new-format publishable key (no embedded ref); the URL ref is ` +
          'authoritative and the live control probe verifies key/project pairing'
      );
    } else {
      problems.push(
        `${name} is neither a legacy eyJ… anon key nor an sb_ publishable key — refused`
      );
    }
  }

  if (!env.EXPO_PUBLIC_SUPABASE_URL) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL is absent from the build environment');
  } else {
    sources.push({
      name: 'env:EXPO_PUBLIC_SUPABASE_URL',
      ref: refFromRestUrl(env.EXPO_PUBLIC_SUPABASE_URL),
    });
  }
  if (!env.EXPO_PUBLIC_SUPABASE_KEY) {
    problems.push('EXPO_PUBLIC_SUPABASE_KEY is absent from the build environment');
  } else {
    addKeySource('env:EXPO_PUBLIC_SUPABASE_KEY', env.EXPO_PUBLIC_SUPABASE_KEY);
  }

  for (const file of envFiles) {
    if (!file || typeof file.name !== 'string') {
      problems.push('malformed env file entry');
      continue;
    }
    if (file.vars === null || typeof file.vars !== 'object') {
      problems.push(`${file.name} exists but could not be read`);
      continue;
    }
    if (file.vars.EXPO_PUBLIC_SUPABASE_URL !== undefined) {
      sources.push({
        name: `${file.name}:EXPO_PUBLIC_SUPABASE_URL`,
        ref: refFromRestUrl(file.vars.EXPO_PUBLIC_SUPABASE_URL),
      });
    }
    if (file.vars.EXPO_PUBLIC_SUPABASE_KEY !== undefined) {
      addKeySource(`${file.name}:EXPO_PUBLIC_SUPABASE_KEY`, file.vars.EXPO_PUBLIC_SUPABASE_KEY);
    }
  }

  for (const source of sources) {
    if (!source.ref) {
      problems.push(`${source.name} does not resolve to a Supabase project ref`);
    } else if (source.ref !== expected) {
      problems.push(`${source.name} resolves to ${source.ref}, expected ${expected}`);
    }
  }
  const distinct = [...new Set(sources.map((s) => s.ref).filter(Boolean))];
  if (distinct.length > 1) {
    problems.push(`project refs disagree: ${distinct.join(' vs ')}`);
  }

  return { ok: problems.length === 0, profile, expected, sources, notes, problems };
}

// ---- CLI — what `npm run eas-build-pre-install` actually executes ----------
// The isMain guard exists so tests can import the pure pieces above without
// running the gate; tests/buildGate.test.mjs also spawns this file for real
// and asserts the exit codes, which is what keeps this guard honest.
const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  scriptPath !== '' &&
  (process.platform === 'win32'
    ? scriptPath.toLowerCase() === selfPath.toLowerCase()
    : scriptPath === selfPath);

if (isMain) {
  const verdict = evaluateGate(process.env, loadEnvFiles(process.cwd(), process.env));
  console.log(
    `eas-build-pre-install: profile "${verdict.profile ?? '(unset)'}", expected ref ${verdict.expected ?? '(none)'}`
  );
  for (const source of verdict.sources) {
    console.log(`  ${source.name} → ${source.ref ?? 'UNRESOLVED'}`);
  }
  for (const note of verdict.notes) {
    console.log(`  note: ${note}`);
  }
  if (!verdict.ok) {
    console.error(`BUILD GATE FAILED: ${verdict.problems.join('; ')}`);
    process.exit(1);
  }
  console.log(`  gate: OK — "${verdict.profile}" builds against ${verdict.expected}.`);
}
