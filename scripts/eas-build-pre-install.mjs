#!/usr/bin/env node
/**
 * EAS Build gate (package.json "eas-build-pre-install") — pins EVERY build
 * profile to the one Supabase project it is allowed to bundle, and fails
 * closed on anything it cannot prove.
 *
 * Why this can work at all: .env is gitignored and therefore never uploaded
 * to EAS, and react-native-dotenv (babel.config.js: safe:false) reads
 * process.env first — dotenv never overrides a variable that already exists —
 * so on a build worker the bundle's SUPABASE_URL / SUPABASE_KEY come from the
 * eas.json profile `env` block and the EAS environment the profile selects.
 * This hook runs on that same worker with those same variables, BEFORE
 * dependencies install (so it must stay dependency-free), and a non-zero
 * exit fails the whole build.
 *
 * Fail-closed contract — exit 1 with a one-line named reason on stderr:
 *   - EAS_BUILD_PROFILE unset                  → "not an EAS build"
 *   - profile not in EXPECTED_REF              → "unknown profile"
 *   - SUPABASE_URL / SUPABASE_KEY absent       → named absence
 *   - a ref-bearing source that parses to no
 *     project ref                              → named parse failure
 *   - sources disagreeing, or any source not equal to the profile's expected
 *     ref                                      → named, listing every ref found
 *   - a key that is neither a legacy eyJ… JWT nor a new-format publishable
 *     key (sb_secret_… included)               → named refusal
 *
 * THE URL IS THE AUTHORITATIVE REF SOURCE: refFromRestUrl(SUPABASE_URL) must
 * resolve and equal the profile's expected ref, or the build fails. Key
 * handling follows its format (keyKind in supabase-ref.mjs): a legacy eyJ…
 * key embeds the ref and is decoded and cross-checked; a new-format
 * sb_publishable_… / sb_pu_… key carries NO ref by design and is accepted as
 * a format — the app's own live control probe is what verifies key/project
 * pairing at runtime; anything else fails closed. Every dotenv-style file
 * react-native-dotenv could see in the build directory is checked the same
 * way — none should exist on an EAS worker, but a local runner (`eas build
 * --local`) has the developer's .env in view and it must agree too.
 * Refs only are ever compared and printed — never a URL or key value.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  keyKind,
  refFromRestUrl,
  refFromJwt,
  STAGING_REF,
  PRODUCTION_REF,
} from './supabase-ref.mjs';

/**
 * The one Supabase project each EAS BUILD PROFILE may build against. testflight
 * deliberately shares the production project — TestFlight binaries reach real
 * testers with real data — while development, preview and share stay on staging.
 * `share` is an ad hoc build for registered testers; its eas.json env already
 * carries the staging URL and key, and it must never be pinned to production.
 * A profile absent from this map is refused outright.
 *
 * "preview" MEANS TWO DIFFERENT THINGS. Keys here are EAS_BUILD_PROFILE, i.e.
 * `eas.json`'s `build` block — which as of 2026-08-23 declares only
 * `development`, `share`, `testflight` and `production`. There is NO preview build
 * profile; the entry below is unreachable today and is kept only so adding one
 * cannot land unpinned. Separately, EAS *environments* are their own namespace,
 * and the environment named `preview` holds PRODUCTION credentials — it is what
 * the `testflight` profile selects (`"environment": "preview"` in eas.json).
 * So a testflight build is correctly pinned by EXPECTED_REF.testflight →
 * PRODUCTION_REF and never touches the `preview` row here. Reading the two
 * files together suggests preview means staging. It does not.
 */
export const EXPECTED_REF = Object.freeze({
  development: STAGING_REF,
  preview: STAGING_REF,
  share: STAGING_REF,
  testflight: PRODUCTION_REF,
  production: PRODUCTION_REF,
});

/**
 * Every dotenv-style file react-native-dotenv (babel.config.js: path '.env',
 * safe:false) could consult for any mode this process could run under. The
 * fixed trio covers babel's defaults; APP_ENV / BABEL_ENV / NODE_ENV add
 * whatever mode the build actually selects.
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

  if (!env.SUPABASE_URL) {
    problems.push('SUPABASE_URL is absent from the build environment');
  } else {
    sources.push({ name: 'env:SUPABASE_URL', ref: refFromRestUrl(env.SUPABASE_URL) });
  }
  if (!env.SUPABASE_KEY) {
    problems.push('SUPABASE_KEY is absent from the build environment');
  } else {
    addKeySource('env:SUPABASE_KEY', env.SUPABASE_KEY);
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
    if (file.vars.SUPABASE_URL !== undefined) {
      sources.push({ name: `${file.name}:SUPABASE_URL`, ref: refFromRestUrl(file.vars.SUPABASE_URL) });
    }
    if (file.vars.SUPABASE_KEY !== undefined) {
      addKeySource(`${file.name}:SUPABASE_KEY`, file.vars.SUPABASE_KEY);
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
