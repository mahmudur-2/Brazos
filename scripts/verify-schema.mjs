#!/usr/bin/env node
/**
 * Schema proof (ledger B7): is a database built exactly like the migrations say?
 *
 *   node scripts/verify-schema.mjs print   <source> [--json]
 *   node scripts/verify-schema.mjs compare <source> <source>
 *
 * A source is `local` (the local stack, through `npx supabase status`), `hosted` (FINGERPRINT_URL
 * and FINGERPRINT_KEY, inside GitHub Actions only) or a file saved by `print … --json`.
 *
 * It calls public.schema_fingerprint() (20261112000200_schema_fingerprint.sql), a plain catalog
 * reader, over POST /rest/v1/rpc. The RULES below remove the differences every correct hosted
 * project has from a local build, section by section, and say why; what is left is sorted into
 * lines and digested with sha256. `compare` prints PASS or FAIL per section and at most 20
 * differing lines per failed section.
 *
 * Exit: 0 PASS (or printed), 1 FAIL, 2 usage, refusal or connection error.
 *
 * Never printed: a URL, a key, a function body, a timer command (only their md5), a response body.
 * Plain fetch, no dependency, no psql.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED_PRODUCTION_REF, refFromJwt, refFromRestUrl } from './supabase-ref.mjs';

export const FORMAT = 'brazos-schema-fingerprint/1';

/** The extensions the schema itself depends on (or must not have); the platform installs others. */
export const APP_EXTENSIONS = Object.freeze(['pg_cron', 'pg_net', 'vector']);
/** The roles the app's grants are about; grants to platform roles and owners are the platform's. */
export const APP_ROLES = Object.freeze(['PUBLIC', 'anon', 'authenticated', 'service_role']);

const md5 = (text) => createHash('md5').update(String(text ?? '').replace(/\r/g, '')).digest('hex');
const sorted = (list) => (Array.isArray(list) ? [...list].sort() : list);
const without = (row, ...keys) => {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
};
const notExtension = (row) => row.extension !== true;
const appRole = (row) => APP_ROLES.includes(row.grantee);

/**
 * One rule per section: `why` names what a correct hosted project always has that a local build
 * has not (or the reverse), `keep` drops those rows, `line` drops those fields.
 */
export const RULES = Object.freeze({
  server: {
    why: 'major version only: the platform sets and changes the minor version',
    keep: () => true,
    line: (r) => ({ major: Math.floor(Number(r.version_num) / 10000) }),
  },
  extensions: {
    why: `only ${APP_EXTENSIONS.join(', ')}, by name: the platform installs its own extensions and sets every version and schema`,
    keep: (r) => APP_EXTENSIONS.includes(r.name),
    line: (r) => ({ name: r.name }),
  },
  enums: { why: 'nothing removed', keep: () => true, line: (r) => r },
  tables: {
    why: 'owner and extension-owned tables removed: platform roles own objects by history',
    keep: notExtension,
    line: (r) => without(r, 'owner', 'extension'),
  },
  columns: {
    why: 'extension-owned removed; no column position is read (columns differ in order by history)',
    keep: notExtension,
    line: (r) => without(r, 'extension'),
  },
  constraints: { why: 'extension-owned removed', keep: notExtension, line: (r) => without(r, 'extension') },
  indexes: { why: 'extension-owned removed', keep: notExtension, line: (r) => without(r, 'extension') },
  functions: {
    why: 'owner and extension-owned functions removed; the body is compared by md5 (CR removed), never as text',
    keep: notExtension,
    line: (r) => ({ ...without(r, 'owner', 'extension', 'body'), body_md5: md5(r.body) }),
  },
  function_grants: {
    why: `grantees other than ${APP_ROLES.join(', ')} removed (owners and platform roles); extension-owned removed`,
    keep: (r) => notExtension(r) && appRole(r),
    line: (r) => without(r, 'extension'),
  },
  table_grants: {
    why: `grantees other than ${APP_ROLES.join(', ')} removed (owners and platform roles); extension-owned removed`,
    keep: (r) => notExtension(r) && appRole(r),
    line: (r) => without(r, 'extension'),
  },
  default_privileges: {
    why: `role postgres only, grantees ${APP_ROLES.join(', ')} only: the platform keeps its own roles' defaults`,
    keep: (r) => r.role === 'postgres' && appRole(r),
    line: (r) => r,
  },
  policies: { why: 'role lists sorted', keep: () => true, line: (r) => ({ ...r, roles: sorted(r.roles) }) },
  triggers: { why: 'nothing removed (only triggers that call a public function are read)', keep: () => true, line: (r) => r },
  views: { why: 'owner and extension-owned views removed', keep: notExtension, line: (r) => without(r, 'owner', 'extension') },
  realtime: {
    why: 'members outside public removed (the platform may publish its own); column lists sorted',
    keep: (r) => r.member === undefined || String(r.member).startsWith('public.'),
    line: (r) => (r.member === undefined ? r : { ...r, columns: sorted(r.columns) }),
  },
  schedules: {
    why: 'job ids, user, database and node are never read; the command is compared by md5, never as text',
    keep: () => true,
    line: (r) => ({ ...without(r, 'command'), command_md5: md5(r.command) }),
  },
  buckets: { why: 'mime lists sorted', keep: () => true, line: (r) => ({ ...r, allowed_mime_types: sorted(r.allowed_mime_types) }) },
  storage_policies: { why: 'role lists sorted', keep: () => true, line: (r) => ({ ...r, roles: sorted(r.roles) }) },
  migrations: { why: 'version only: file names may differ by history', keep: () => true, line: (r) => ({ version: r.version }) },
});

export const SECTIONS = Object.freeze(Object.keys(RULES));

/** JSON with keys sorted at every level, so one object always prints as one line. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Raw schema_fingerprint() output → { section: sorted lines }. A missing section is an error. */
export function normalize(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('the fingerprint is not an object');
  }
  const sections = {};
  for (const name of SECTIONS) {
    if (!Array.isArray(raw[name])) throw new Error(`the fingerprint has no "${name}" section`);
    const rule = RULES[name];
    sections[name] = raw[name].filter(rule.keep).map((row) => canonical(rule.line(row))).sort();
  }
  return sections;
}

export function digest(lines) {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Per section: PASS when the two line sets are equal; `onlyA` and `onlyB` hold the differences. */
export function compare(a, b) {
  const sections = SECTIONS.map((name) => {
    const left = new Set(a[name]);
    const right = new Set(b[name]);
    const onlyA = a[name].filter((line) => !right.has(line));
    const onlyB = b[name].filter((line) => !left.has(line));
    return { name, pass: onlyA.length === 0 && onlyB.length === 0, onlyA, onlyB };
  });
  return { pass: sections.every((s) => s.pass), sections };
}

const MAX_LINES = 20;
const MAX_CHARS = 300;
const clip = (line) => (line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS)}…` : line);

export function formatPrint(sections) {
  const out = [`${'section'.padEnd(20)}${'lines'.padStart(6)}  digest`];
  for (const name of SECTIONS) {
    out.push(`${name.padEnd(20)}${String(sections[name].length).padStart(6)}  ${digest(sections[name])}`);
  }
  out.push(`${'fingerprint'.padEnd(26)}  ${digest(SECTIONS.map((name) => digest(sections[name])))}`);
  return out.join('\n');
}

export function formatCompare(result, labelA, labelB) {
  const out = [`compare ${labelA} with ${labelB}`];
  for (const s of result.sections) {
    if (s.pass) {
      out.push(`PASS  ${s.name}`);
      continue;
    }
    out.push(`FAIL  ${s.name}  (${s.onlyA.length} only in ${labelA}, ${s.onlyB.length} only in ${labelB})`);
    const diff = [...s.onlyA.map((l) => `  - ${labelA}: ${clip(l)}`), ...s.onlyB.map((l) => `  + ${labelB}: ${clip(l)}`)];
    out.push(...diff.slice(0, MAX_LINES));
    if (diff.length > MAX_LINES) out.push(`  … ${diff.length - MAX_LINES} more`);
  }
  const failed = result.sections.filter((s) => !s.pass).map((s) => s.name);
  out.push(failed.length === 0 ? 'SCHEMA: PASS' : `SCHEMA: FAIL (${failed.join(', ')})`);
  return out.join('\n');
}

/** A refusal or usage error: exit 2, message only. */
export class StopError extends Error {}

export function parseArgs(argv) {
  const args = argv.filter((a) => a !== '--json');
  const json = argv.includes('--json');
  const [command, ...sources] = args;
  if (command === 'print' && sources.length === 1) return { command, sources, json };
  if (command === 'compare' && sources.length === 2 && !json) return { command, sources, json };
  throw new StopError(
    'usage: node scripts/verify-schema.mjs print <local|hosted|file.json> [--json]\n' +
      '       node scripts/verify-schema.mjs compare <local|hosted|file.json> <local|hosted|file.json>'
  );
}

/**
 * The hosted target, or a refusal before any request is built: outside GitHub Actions, without
 * both variables, not https, or naming the retired project.
 */
export function hostedTarget(env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    throw new StopError('refused: a hosted database is read only from inside GitHub Actions');
  }
  const url = String(env.FINGERPRINT_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(env.FINGERPRINT_KEY ?? '').trim();
  if (url === '' || key === '') throw new StopError('refused: FINGERPRINT_URL and FINGERPRINT_KEY must both be set');
  if (refFromRestUrl(url) === RETIRED_PRODUCTION_REF || url.includes(RETIRED_PRODUCTION_REF) || refFromJwt(key) === RETIRED_PRODUCTION_REF) {
    throw new StopError('refused: the retired project is never contacted');
  }
  if (!/^https:\/\//i.test(url)) throw new StopError('refused: FINGERPRINT_URL must be https');
  return { url, key };
}

/** The local stack's API URL and service key, from `npx supabase status -o env`; local hosts only. */
export function localTarget(statusEnvText) {
  const value = (name) => statusEnvText.match(new RegExp(`^${name}="?([^"\\r\\n]*)"?\\s*$`, 'm'))?.[1] ?? '';
  const url = value('API_URL').replace(/\/+$/, '');
  const key = value('SERVICE_ROLE_KEY') || value('SECRET_KEY');
  if (url === '' || key === '') throw new StopError('refused: `npx supabase status` gave no API URL or service key (is the local stack running?)');
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new StopError('refused: the local source must be the local stack (127.0.0.1 or localhost)');
  }
  return { url, key };
}

const RETRY_MS = 60_000;
const RETRY_STATUSES = new Set([404, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST /rest/v1/rpc/schema_fingerprint, retried up to 60 s while PostgREST learns the function. */
export async function fetchFingerprint({ url, key }, label, fetchImpl = fetch) {
  const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const deadline = Date.now() + RETRY_MS;
  let last = '';
  for (;;) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/rpc/schema_fingerprint`, {
        method: 'POST',
        headers,
        body: '{}',
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new StopError(`${label}: the fingerprint response is not JSON`);
        }
      }
      let code = '';
      try {
        code = String((await response.json())?.code ?? '');
      } catch {
        code = '';
      }
      last = `HTTP ${response.status}${code ? ` ${code}` : ''}`;
      if (!RETRY_STATUSES.has(response.status)) break;
    } catch (error) {
      if (error instanceof StopError) throw error;
      last = error?.name === 'TimeoutError' ? 'timed out' : 'connection failed';
    }
    if (Date.now() >= deadline) break;
    await sleep(2000);
  }
  throw new StopError(`${label}: the fingerprint call failed (${last})`);
}

/** A source name → its normalized sections. */
async function load(source, env) {
  if (source === 'local') {
    let status = '';
    try {
      status = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      throw new StopError('local: `npx supabase status` failed (is the local stack running?)');
    }
    return normalize(await fetchFingerprint(localTarget(status), 'local'));
  }
  if (source === 'hosted') return normalize(await fetchFingerprint(hostedTarget(env), 'hosted'));
  if (source.endsWith('.json')) return readSaved(source);
  throw new StopError(`unknown source "${source}": use local, hosted or a .json file saved by print --json`);
}

export function readSaved(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new StopError(`${path.basename(file)}: not a readable JSON file`);
  }
  if (parsed?.format === FORMAT && parsed.sections) {
    for (const name of SECTIONS) {
      if (!Array.isArray(parsed.sections[name])) throw new StopError(`${path.basename(file)}: no "${name}" section`);
    }
    return Object.fromEntries(SECTIONS.map((name) => [name, [...parsed.sections[name]].sort()]));
  }
  try {
    return normalize(parsed);
  } catch (error) {
    throw new StopError(`${path.basename(file)}: ${error.message}`);
  }
}

const labelOf = (source) => (source.endsWith('.json') ? path.basename(source) : source);

export async function main(argv, env) {
  const { command, sources, json } = parseArgs(argv);
  if (command === 'print') {
    const sections = await load(sources[0], env);
    return { code: 0, text: json ? JSON.stringify({ format: FORMAT, sections }, null, 1) : formatPrint(sections) };
  }
  const a = await load(sources[0], env);
  const b = await load(sources[1], env);
  const result = compare(a, b);
  return { code: result.pass ? 0 : 1, text: formatCompare(result, labelOf(sources[0]), labelOf(sources[1])) };
}

// ---- CLI ------------------------------------------------------------------
// The isMain guard lets tests import the pure pieces; tests/verifySchema.test.mjs also spawns this
// file and asserts the exit codes.
const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  scriptPath !== '' &&
  (process.platform === 'win32' ? scriptPath.toLowerCase() === selfPath.toLowerCase() : scriptPath === selfPath);

if (isMain) {
  main(process.argv.slice(2), process.env).then(
    ({ code, text }) => {
      console.log(text);
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof StopError ? error.message : `verify-schema: ${error?.message ?? 'failed'}`);
      process.exitCode = 2;
    }
  );
}
