#!/usr/bin/env node
/**
 * THE PRODUCTION BUTTON'S LOGIC. .github/workflows/production.yml only orchestrates: each of its
 * steps runs one command here, and every decision lives in this file, tested with a fake fetch in
 * tests/productionDeploy.test.mjs. The owner's guide is docs/production/owner-steps.md.
 *
 *   node scripts/production-deploy.mjs <command> [argument]
 *
 *   guards                       branch, the seven secrets, the refs, sk_test_, the approval rule
 *   status                       the project is running
 *   keys                         the server key in use and the legacy keys (types only, never values)
 *   plan <migration list>        what apply will do, written to the run summary; changes nothing
 *   check <migration list>       the plan is unchanged since the owner approved it
 *   secrets                      the function secret STRIPE_SECRET_KEY
 *   webhook                      the Stripe TEST webhook and STRIPE_WEBHOOK_SECRET, found by its URL
 *   vault                        set_drain_secrets(): the URL and the key the timers call functions with
 *   smoke <push|status|webhook>  one function refuses a call without a user (see SMOKE)
 *   timers                       one test call from the database to each drain gets HTTP 200
 *   auth                         the sign-in settings: scripts/production-auth.json plus Twilio
 *   fingerprint <file>           the hosted database matches the local build of the same commit
 *   summary <plan|apply|prove>   the PASS/FAIL table
 *
 * Every command exits 0 on PASS and 1 on FAIL; a FAIL writes one plain sentence to the step output
 * `reason`, and a PASS may write a short `note`. The table prints both. Every command is safe to
 * run again, so pressing the button again is always safe.
 *
 * PUBLIC OUTPUT. The repository is public, so the log, the step outputs and the run summary are
 * public. Nothing here prints the value of a key, token, password, sign-in code or phone number,
 * in any form. Each key fetched from Supabase or Stripe is masked (::add-mask::) the moment it
 * arrives, before any other use. A failure prints a fixed sentence and an HTTP status, never a URL
 * or a response body.
 *
 * DEPENDENCY-FREE ON PURPOSE. The jobs that hold production secrets never run npm ci or code from
 * node_modules, so this file imports Node built-ins and repository files only.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED_PRODUCTION_REF, STAGING_REF } from './supabase-ref.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = path.join(ROOT, 'scripts', 'staging-scan.sh');
const MANAGEMENT = 'https://api.supabase.com/v1';
const STRIPE = 'https://api.stripe.com/v1';
const GITHUB = 'https://api.github.com';
const TRUNK = 'refs/heads/mainexpo';

export const REQUIRED_SECRETS = Object.freeze([
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_PASSWORD',
  'STRIPE_SECRET_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
]);

const SAY = Object.freeze({
  notRef: 'SUPABASE_PROJECT_REF is not a project ref (20 small letters).',
  staging: 'SUPABASE_PROJECT_REF names the staging project. Production must be its own project.',
  retired: 'SUPABASE_PROJECT_REF names the retired production project. Use the new project.',
  testOnly: 'STRIPE_SECRET_KEY is not a Stripe test key (it must start with sk_test_). The button takes test money only.',
  noServerKey:
    'The project has no secret key named default and no legacy service_role key. Create a secret key in the Supabase dashboard (Project Settings, API Keys), then press the button again.',
});

/** A planned stop: its message is the plain sentence the table prints. */
export class Stop extends Error {}
const stop = (reason) => {
  throw new Stop(reason);
};

// ---- output ------------------------------------------------------------------------------------

const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ').trim();

function setOutput(io, name, value) {
  if (io.env.GITHUB_OUTPUT) appendFileSync(io.env.GITHUB_OUTPUT, `${name}=${oneLine(value)}\n`);
}
const note = (io, text) => setOutput(io, 'note', text);

function addSummary(io, markdown) {
  if (io.env.GITHUB_STEP_SUMMARY) appendFileSync(io.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

/** Registers a value with the runner so no later log line can show it. */
function mask(io, value) {
  if (typeof value === 'string' && value !== '') io.log(`::add-mask::${value}`);
}

// ---- HTTP --------------------------------------------------------------------------------------

/** status 0 means the request never got an answer. The body is parsed, never printed. */
async function call(io, url, { method = 'GET', headers = {}, json, form } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  if (form !== undefined) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = form.toString();
  }
  let res;
  try {
    res = await io.fetch(url, init);
  } catch {
    return { status: 0, ok: false, json: null };
  }
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, json: body };
}

function refProblem(ref, { allowStaging = false } = {}) {
  if (ref === RETIRED_PRODUCTION_REF) return SAY.retired;
  if (ref === STAGING_REF) return allowStaging ? null : SAY.staging;
  if (!/^[a-z]{20}$/.test(ref ?? '')) return SAY.notRef;
  return null;
}

/** The project this run works on. Only the staging proof's read-only commands accept staging. */
function projectRef(io, options) {
  const ref = io.env.SUPABASE_PROJECT_REF ?? '';
  const problem = refProblem(ref, options);
  if (problem) stop(problem);
  return ref;
}

const mgmt = (io, ref, route, init = {}) =>
  call(io, `${MANAGEMENT}/projects/${ref}${route}`, {
    ...init,
    headers: { Authorization: `Bearer ${io.env.SUPABASE_ACCESS_TOKEN ?? ''}` },
  });

const stripe = (io, route, init = {}) =>
  call(io, `${STRIPE}${route}`, { ...init, headers: { Authorization: `Bearer ${io.env.STRIPE_SECRET_KEY ?? ''}` } });

// ---- keys: the one place that decides which key is used --------------------------------------------

const usable = (value) => typeof value === 'string' && /^[\x21-\x7e]{20,}$/.test(value);

/** The server key: the secret key named default; without one, the legacy service_role key. */
export function pickServerKey(keys) {
  const secret = keys.find((k) => k?.type === 'secret' && k.name === 'default' && usable(k.api_key));
  if (secret) return { type: 'secret', value: secret.api_key };
  const legacy = keys.find((k) => k?.name === 'service_role' && usable(k.api_key));
  if (legacy) return { type: 'legacy service_role', value: legacy.api_key };
  return null;
}

/** The public key the app ships with: the publishable key named default. */
export function pickPublishableKey(keys) {
  return keys.find((k) => k?.type === 'publishable' && k.name === 'default' && usable(k.api_key))?.api_key ?? null;
}

/** A secret key travels in apikey alone (it is not a JWT); a legacy key also as the bearer. */
export function keyHeaders(key) {
  return key.type === 'secret' ? { apikey: key.value } : { apikey: key.value, Authorization: `Bearer ${key.value}` };
}

async function fetchKeys(io, ref) {
  const res = await mgmt(io, ref, '/api-keys?reveal=true');
  if (!res.ok || !Array.isArray(res.json)) stop(`The project's API keys could not be read (HTTP ${res.status}).`);
  for (const key of res.json) mask(io, key?.api_key);
  return res.json;
}

async function serverKey(io, ref) {
  const key = pickServerKey(await fetchKeys(io, ref));
  if (!key) stop(SAY.noServerKey);
  return key;
}

/** POST /rest/v1/rpc/<name>, waiting up to 60 s while PostgREST learns a function it has not seen. */
async function rpc(io, ref, key, name, args) {
  const deadline = io.now() + 60_000;
  for (;;) {
    const res = await call(io, `https://${ref}.supabase.co/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: keyHeaders(key),
      json: args,
    });
    if (res.status !== 404 || io.now() >= deadline) return res;
    await io.sleep(5_000);
  }
}

// ---- guards ------------------------------------------------------------------------------------

export function guardProblems(env) {
  const problems = [];
  if (env.GITHUB_REF !== TRUNK) problems.push('The button runs only from the mainexpo branch, and this run did not start from it.');
  const missing = REQUIRED_SECRETS.filter((name) => !env[name]);
  if (missing.length > 0) problems.push(`These secrets are missing from the production environment: ${missing.join(', ')}.`);
  if (env.SUPABASE_PROJECT_REF) {
    const problem = refProblem(env.SUPABASE_PROJECT_REF);
    if (problem) problems.push(problem);
  }
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith('sk_test_')) problems.push(SAY.testOnly);
  return problems;
}

/** The production environment must hold a required-reviewer rule, read with the run's own token. */
async function approvalProblem(io) {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_EVENT_PATH: eventPath } = io.env;
  if (eventPath && existsSync(eventPath)) {
    let event = null;
    try {
      event = JSON.parse(readFileSync(eventPath, 'utf8'));
    } catch {
      event = null;
    }
    if (event?.repository?.private === true) {
      return 'The repository is private. On GitHub Free, Pro and Team the approval rule works only on a public repository, so the button stops.';
    }
  }
  if (!repo || !token) return 'The workflow token is missing, so the approval rule cannot be checked.';
  const res = await call(io, `${GITHUB}/repos/${repo}/environments/production`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (res.status === 404) return 'The repository has no environment named production. Create it as docs/production/owner-steps.md says.';
  if (!res.ok) return `The workflow token could not read the production environment's rules (HTTP ${res.status}).`;
  const rules = Array.isArray(res.json?.protection_rules) ? res.json.protection_rules : [];
  const rule = rules.find((r) => r?.type === 'required_reviewers');
  if (!rule || !Array.isArray(rule.reviewers) || rule.reviewers.length === 0) {
    return 'The production environment has no required reviewer, so nothing waited for your approval. Add yourself as the required reviewer, then press the button again.';
  }
  if (res.json?.can_admins_bypass === true) {
    return 'The production environment lets an admin skip the approval. Turn off "Allow administrators to bypass configured protection rules", then press the button again.';
  }
  return null;
}

async function guards(io) {
  const problems = guardProblems(io.env);
  const approval = await approvalProblem(io);
  if (approval) problems.push(approval);
  if (problems.length > 0) stop(problems.join(' '));
  io.log('Guards: mainexpo, seven secrets present, a new project, a Stripe test key, an approval rule.');
  note(io, 'mainexpo; seven secrets; new project; test key; approval rule');
}

// ---- status and keys ----------------------------------------------------------------------------

async function status(io) {
  const ref = projectRef(io);
  const res = await mgmt(io, ref, '');
  if (res.status === 401) stop('Supabase refused SUPABASE_ACCESS_TOKEN. Make a new access token and save it as the secret again.');
  if (res.status === 403 || res.status === 404) stop('The access token cannot see a project with this ref. Check SUPABASE_PROJECT_REF.');
  if (!res.ok) stop(`Supabase answered HTTP ${res.status} when asked for the project's status. Press the button again later.`);
  const state = typeof res.json?.status === 'string' && /^[A-Z_]{1,40}$/.test(res.json.status) ? res.json.status : 'unknown';
  if (state !== 'ACTIVE_HEALTHY') {
    stop(`The production project is not running (status ${state}). If it is paused, restore it in the Supabase dashboard, then press the button again.`);
  }
  io.log('Project status: ACTIVE_HEALTHY');
  note(io, 'running');
}

async function keys(io) {
  const ref = projectRef(io);
  const list = await fetchKeys(io, ref);
  const server = pickServerKey(list);
  const legacyRes = await mgmt(io, ref, '/api-keys/legacy');
  const enabled = legacyRes.ok && typeof legacyRes.json?.enabled === 'boolean' ? legacyRes.json.enabled : null;
  const listed = list.some((k) => k?.type === 'legacy' || k?.name === 'anon' || k?.name === 'service_role');
  let legacy = 'no';
  if (enabled === true) legacy = 'yes, active';
  else if (listed && enabled === false) legacy = 'yes, switched off';
  else if (listed) legacy = 'yes, state unknown';
  if (!server) stop(SAY.noServerKey);
  if (server.type !== 'secret' && enabled === false) {
    stop('The project has no secret key named default, and its legacy keys are switched off. Create a secret key in the Supabase dashboard (Project Settings, API Keys), then press the button again.');
  }
  if (!pickPublishableKey(list)) {
    stop('The project has no publishable key named default, which the app needs. Create it in the Supabase dashboard (Project Settings, API Keys), then press the button again.');
  }
  const text = `server key: ${server.type}; legacy keys: ${legacy}`;
  io.log(`Keys: ${text}`);
  note(io, text);
}

// ---- plan, check and the destructive gate ------------------------------------------------------------

function scan(io, args) {
  const r = io.spawn('bash', [SCAN, ...args], { cwd: io.cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function logLines(io, text) {
  for (const line of String(text).split('\n')) if (line.trim() !== '') io.log(line);
}

/** The commit, the files the database lacks, which of them the scan flags, and the applied count. */
async function makePlan(io, listFile) {
  if (!listFile || !existsSync(path.resolve(io.cwd, listFile))) stop('The migration list was not handed to this step. Nothing was applied.');
  const unreadable = 'The migration list could not be read; the lines above say why. Nothing was applied.';
  const pending = scan(io, ['--pending-files', listFile]);
  logLines(io, pending.stderr);
  if (pending.status !== 0) stop(unreadable);
  const files = pending.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const counted = scan(io, ['--applied-count', listFile]);
  logLines(io, counted.stderr);
  if (counted.status !== 0 || !/^\d+$/.test(counted.stdout.trim())) stop(unreadable);
  const applied = Number(counted.stdout.trim());
  const flagged = [];
  for (const file of files) {
    const r = scan(io, ['false', file]);
    if (r.status === 1) {
      flagged.push(file);
      for (const line of r.stdout.split('\n')) if (/^\s+(FLAG |line \d+:)/.test(line)) io.log(line);
    } else if (r.status !== 0) {
      stop(`The safety scan could not read ${path.posix.basename(file)}. Nothing was applied.`);
    }
  }
  const sha = io.env.GITHUB_SHA ?? '';
  return { sha, files, flagged, applied, code: planCode({ sha, files, flagged, applied }) };
}

/** The first 8 hex characters of sha256 over the commit, the files, the flags and the applied count. */
export function planCode({ sha, files, flagged, applied }) {
  const names = (list) => list.map((file) => path.posix.basename(file));
  const text = JSON.stringify({ sha, files: names(files), flagged: names(flagged), applied });
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * On an empty database nothing can break, so flagged files are listed and applied. Once anything is
 * applied, a flagged file stops the run unless allow_destructive is checked, as on staging.
 */
export function destructiveVerdict({ applied, flagged, allowDestructive }) {
  if (flagged.length === 0) return { ok: true, note: 'no file to apply removes or renames anything' };
  if (applied === 0) return { ok: true, note: 'the database is empty, so nothing can break: the flagged files are listed and will be applied' };
  if (allowDestructive) return { ok: true, note: 'allow_destructive is checked: the flagged files will be applied' };
  return {
    ok: false,
    note: 'A migration to apply removes or renames something (the FLAG lines above). Nothing was applied. Read those lines, then press the button again with allow_destructive checked.',
  };
}

function allowDestructive(io) {
  const value = io.env.ALLOW_DESTRUCTIVE;
  if (value !== 'true' && value !== 'false') stop('ALLOW_DESTRUCTIVE must be exactly true or false.');
  return value === 'true';
}

function planMarkdown(p, verdict) {
  const flagged = new Set(p.flagged);
  const list = p.files.map((file) => `- \`${file}\`${flagged.has(file) ? ' (FLAGGED)' : ''}`);
  return [
    `### Production plan \`${p.code}\``,
    '',
    '| | |',
    '|---|---|',
    `| Commit | \`${p.sha.slice(0, 7)}\` |`,
    `| Database before | ${p.applied === 0 ? 'empty (first run)' : `${p.applied} migrations applied`} |`,
    `| Migrations to apply | ${p.files.length} |`,
    `| Flagged (remove or rename something) | ${p.flagged.length} |`,
    `| Decision | ${verdict.ok ? verdict.note : 'STOP: nothing will be applied'} |`,
    '',
    p.files.length === 0
      ? 'Nothing to apply. The apply job still deploys the functions and checks every setting.'
      : `<details><summary>Files to apply, in order</summary>\n\n${list.join('\n')}\n\n</details>`,
    '',
    'If this is what you expect, approve the apply job. It applies exactly this plan, and it stops by itself if the database or the commit changed after this plan.',
    '',
  ].join('\n');
}

async function plan(io, listFile) {
  const allow = allowDestructive(io);
  const p = await makePlan(io, listFile);
  const verdict = destructiveVerdict({ ...p, allowDestructive: allow });
  setOutput(io, 'plan_code', p.code);
  addSummary(io, planMarkdown(p, verdict));
  const before = p.applied === 0 ? 'empty database' : `${p.applied} applied before`;
  note(io, `plan ${p.code}: ${p.files.length} to apply, ${p.flagged.length} flagged, ${before}`);
  if (!verdict.ok) stop(verdict.note);
  io.log(`Plan ${p.code}: ${verdict.note}.`);
}

async function check(io, listFile) {
  const expected = io.env.PLAN_CODE ?? '';
  if (!/^[0-9a-f]{8}$/.test(expected)) stop('The plan code from the plan job is missing. Nothing was applied. Press the button again.');
  const allow = allowDestructive(io);
  const p = await makePlan(io, listFile);
  if (p.code !== expected) {
    stop(`The database or the commit changed after the plan you approved (plan ${expected}, now ${p.code}). Nothing was applied. Press the button again for a new plan.`);
  }
  const verdict = destructiveVerdict({ ...p, allowDestructive: allow });
  if (!verdict.ok) stop(verdict.note);
  io.log(`Plan ${p.code} is unchanged.`);
  note(io, `plan ${p.code} unchanged`);
}

// ---- function secrets and the Stripe webhook ------------------------------------------------------

async function secretNames(io, ref) {
  const res = await mgmt(io, ref, '/secrets');
  if (!res.ok || !Array.isArray(res.json)) stop(`The project's function secret names could not be read (HTTP ${res.status}).`);
  return res.json.map((secret) => secret?.name).filter((name) => typeof name === 'string');
}

async function secrets(io) {
  const ref = projectRef(io);
  const value = io.env.STRIPE_SECRET_KEY ?? '';
  if (!value.startsWith('sk_test_')) stop(SAY.testOnly);
  const res = await mgmt(io, ref, '/secrets', { method: 'POST', json: [{ name: 'STRIPE_SECRET_KEY', value }] });
  if (!res.ok) stop(`Supabase refused the function secret STRIPE_SECRET_KEY (HTTP ${res.status}).`);
  if (!(await secretNames(io, ref)).includes('STRIPE_SECRET_KEY')) stop('STRIPE_SECRET_KEY is not on the project after it was set.');
  io.log('Function secret set: STRIPE_SECRET_KEY');
  note(io, 'STRIPE_SECRET_KEY set');
}

/** The events and the Stripe API version, read from the functions themselves: one source. */
export function webhookContract(root = ROOT) {
  const dir = path.join(root, 'supabase', 'functions');
  const source = readFileSync(path.join(dir, 'stripe-webhook', 'index.ts'), 'utf8');
  const block = source.match(/const HANDLED_EVENTS = new Set\(\[([\s\S]*?)\]\)/);
  const events = block ? [...block[1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]) : [];
  if (events.length === 0) stop('HANDLED_EVENTS was not found in supabase/functions/stripe-webhook/index.ts, so the webhook events are unknown.');
  const versions = new Set();
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name, 'index.ts');
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/const STRIPE_(?:V2_)?VERSION = '([^']+)'/g)) versions.add(m[1]);
  }
  if (versions.size !== 1) {
    stop(`The edge functions name ${versions.size} Stripe API versions; the webhook needs exactly one. Make them agree first.`);
  }
  return { events, apiVersion: [...versions][0] };
}

/** keep: exactly one enabled endpoint with the same events and version, and its secret is stored. */
export function webhookAction({ matches, events, apiVersion, secretSet }) {
  if (matches.length === 0) return 'create';
  const [one] = matches;
  const same =
    matches.length === 1 &&
    secretSet &&
    one.status === 'enabled' &&
    one.api_version === apiVersion &&
    Array.isArray(one.enabled_events) &&
    one.enabled_events.length === events.length &&
    events.every((event) => one.enabled_events.includes(event));
  return same ? 'keep' : 'recreate';
}

async function webhook(io) {
  const ref = projectRef(io);
  if (!(io.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')) stop(SAY.testOnly);
  const { events, apiVersion } = webhookContract(ROOT);
  const url = `https://${ref}.supabase.co/functions/v1/stripe-webhook`;

  const matches = [];
  let after = null;
  for (let page = 0; page < 50; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('starting_after', after);
    const res = await stripe(io, `/webhook_endpoints?${query}`);
    if (res.status === 401) stop('Stripe refused STRIPE_SECRET_KEY. Copy the test secret key again and save it as the secret.');
    if (!res.ok || !Array.isArray(res.json?.data)) stop(`Stripe's webhook list could not be read (HTTP ${res.status}).`);
    matches.push(...res.json.data.filter((endpoint) => endpoint?.url === url));
    if (!res.json.has_more || res.json.data.length === 0) break;
    after = res.json.data[res.json.data.length - 1].id;
  }

  const names = await secretNames(io, ref);
  const action = webhookAction({ matches, events, apiVersion, secretSet: names.includes('STRIPE_WEBHOOK_SECRET') });
  if (action === 'keep') {
    io.log('Stripe webhook: already right, kept.');
    note(io, 'kept');
    return;
  }

  // From here the stored signing secret is wrong or unknown. Its name goes first, so a press that
  // stops half-way leaves the next press a missing name, which always makes the webhook anew.
  if (names.includes('STRIPE_WEBHOOK_SECRET')) {
    const removed = await mgmt(io, ref, '/secrets', { method: 'DELETE', json: ['STRIPE_WEBHOOK_SECRET'] });
    if (!removed.ok) stop(`The old STRIPE_WEBHOOK_SECRET could not be removed (HTTP ${removed.status}).`);
  }
  for (const endpoint of matches) {
    const removed = await stripe(io, `/webhook_endpoints/${encodeURIComponent(endpoint.id)}`, { method: 'DELETE' });
    if (!removed.ok) stop(`Stripe refused to delete the old webhook (HTTP ${removed.status}).`);
  }
  const form = new URLSearchParams({ url, api_version: apiVersion, description: 'Brazos production (made by the Production button)' });
  for (const event of events) form.append('enabled_events[]', event);
  const made = await stripe(io, '/webhook_endpoints', { method: 'POST', form });
  const secret = made.json?.secret;
  mask(io, secret);
  if (!made.ok) stop(`Stripe refused to make the webhook (HTTP ${made.status}).`);
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    stop('Stripe made the webhook but returned no signing secret. Press the button again: it makes the webhook anew.');
  }
  const stored = await mgmt(io, ref, '/secrets', { method: 'POST', json: [{ name: 'STRIPE_WEBHOOK_SECRET', value: secret }] });
  if (!stored.ok) {
    stop(`The webhook was made, but Supabase refused its signing secret (HTTP ${stored.status}). Press the button again: it makes the webhook anew.`);
  }
  io.log(`Stripe webhook: ${action === 'create' ? 'made' : 'made anew'}, ${events.length} events, signing secret stored.`);
  note(io, action === 'create' ? 'made' : 'made anew');
}

// ---- the key the timers use, and the smoke checks -------------------------------------------------

async function vault(io) {
  const ref = projectRef(io);
  const key = await serverKey(io, ref);
  const res = await rpc(io, ref, key, 'set_drain_secrets', {
    p_functions_base_url: `https://${ref}.supabase.co/functions/v1`,
    p_service_key: key.value,
  });
  if (!res.ok) stop(`set_drain_secrets() failed (HTTP ${res.status}), so the timers cannot call the functions.`);
  io.log(`Vault: the timers now call the functions with the ${key.type} key.`);
  note(io, `timer key stored: ${key.type}`);
}

/**
 * Each function's answer to a call without a user, word for word from its source. send-push and
 * stripe-webhook have verify_jwt = false, so their own code must answer, in its own words.
 * connect-status keeps verify_jwt = true (two checks: the gateway's and its own), so its 401 may
 * come from either; the row proves only that a caller who is not signed in is refused, and never
 * matches the gateway's words, which a new project may change.
 */
export const SMOKE = Object.freeze({
  push: Object.freeze({ fn: 'send-push', status: 403, error: 'forbidden', key: null, gatewayToo: false }),
  status: Object.freeze({ fn: 'connect-status', status: 401, error: 'Sign in to check your payouts.', key: 'publishable', gatewayToo: true }),
  webhook: Object.freeze({ fn: 'stripe-webhook', status: 400, error: 'invalid signature', key: null, gatewayToo: false }),
});

/** Whether an answer passes the row: the status always, the function's own words only where required. */
function smokePasses(s, res) {
  return res.status === s.status && (s.gatewayToo || res.json?.error === s.error);
}

function smokeReason(s, res) {
  const own = res.json?.error;
  if (res.status === 401 && s.status !== 401) {
    return `${s.fn} was refused by the gateway (HTTP 401) before its code ran: verify_jwt is on, and supabase/config.toml says it must be off.`;
  }
  if (res.status === s.status) return `${s.fn} answered HTTP ${res.status}, but not in its own words: the gateway refused the call before its code ran.`;
  if (res.status === 404) return `${s.fn} is not deployed (HTTP 404).`;
  if (own === 'not configured') return `${s.fn} answers "not configured": a secret or key it needs is missing on the project.`;
  if (s.gatewayToo && res.status >= 200 && res.status < 300) {
    return `${s.fn} answered HTTP ${res.status}, so a caller who is not signed in was not refused.`;
  }
  if (res.status === 0 || res.status >= 500) return `${s.fn} failed (HTTP ${res.status}) instead of refusing the call.`;
  return `${s.fn} answered HTTP ${res.status}, not the ${s.status} that refuses this call.`;
}

async function smoke(io, which) {
  const s = Object.hasOwn(SMOKE, which ?? '') ? SMOKE[which] : null;
  if (!s) stop('smoke needs one of: push, status, webhook.');
  const ref = projectRef(io);
  const headers = {};
  if (s.key === 'publishable') {
    const publishable = pickPublishableKey(await fetchKeys(io, ref));
    if (!publishable) stop('The project has no publishable key named default.');
    headers.apikey = publishable;
  }
  const url = `https://${ref}.supabase.co/functions/v1/${s.fn}`;
  const deadline = io.now() + 60_000;
  let res;
  for (;;) {
    res = await call(io, url, { method: 'POST', headers, json: {} });
    if (smokePasses(s, res)) {
      const who = !s.gatewayToo
        ? "the function's own answer"
        : res.json?.error === s.error
          ? 'refused in its own words'
          : 'refused by the gateway';
      io.log(`${s.fn}: HTTP ${s.status}, ${who}.`);
      note(io, `HTTP ${s.status}, ${who}`);
      return;
    }
    if (io.now() >= deadline) break;
    await io.sleep(5_000);
  }
  stop(smokeReason(s, res));
}

// The timer proof (the keys builder's migration): drain_probe() makes one real call of each timer
// function, from the database, with the stored URL and key, and returns one request id per drain;
// drain_probe_status(p_probe) gives each call's HTTP status (null: no answer yet; 0: no HTTP answer).
export const DRAINS = Object.freeze(['send_push', 'process_settlements', 'send_receipts']);
const PROBE_WAIT_MS = 180_000;
const fnName = (drain) => drain.replace(/_/g, '-');
const DRAIN_OF = Object.freeze({
  drain_notification_outbox: 'send-push',
  drain_settlements: 'process-settlements',
  drain_receipts: 'send-receipts',
});

async function timers(io) {
  const ref = projectRef(io);
  const key = await serverKey(io, ref);

  const started = await rpc(io, ref, key, 'drain_probe', {});
  if (!started.ok) {
    // Each drain raises "<its own SQL name>: vault secrets missing" (lean K1).
    const missing = String(started.json?.message ?? '').match(/^(drain_notification_outbox|drain_settlements|drain_receipts): vault secrets missing/);
    if (missing) {
      stop(`The Vault lacks the URL or the key for ${DRAIN_OF[missing[1]]}, so the timers cannot call it. Press the button again.`);
    }
    stop(`drain_probe() failed (HTTP ${started.status}), so the timers were not tested.`);
  }
  const probe = started.json;
  if (!probe || typeof probe !== 'object' || DRAINS.some((drain) => probe[drain] === undefined || probe[drain] === null)) {
    stop('drain_probe() answered in a shape this script does not know.');
  }

  const deadline = io.now() + PROBE_WAIT_MS;
  for (;;) {
    const res = await rpc(io, ref, key, 'drain_probe_status', { p_probe: probe });
    if (!res.ok) stop(`drain_probe_status() failed (HTTP ${res.status}).`);
    const waiting = [];
    for (const drain of DRAINS) {
      const answer = res.json?.[drain];
      if (answer === null || answer === undefined) {
        waiting.push(fnName(drain));
        continue;
      }
      const code = Number(answer);
      if (code === 200) continue;
      if (code === 0) stop(`The database called ${fnName(drain)} with the stored key and got no HTTP answer.`);
      stop(
        `The database called ${fnName(drain)} with the stored key and got HTTP ${Number.isFinite(code) ? code : '?'}, not 200` +
          (code === 401 || code === 403
            ? ': the stored key is not the key the function expects. Press the button again after any key change.'
            : '.')
      );
    }
    if (waiting.length === 0) {
      const text = `${DRAINS.map(fnName).join(', ')} answered the database with HTTP 200`;
      io.log(text);
      note(io, text);
      return;
    }
    if (io.now() >= deadline) stop(`${waiting.join(', ')} did not answer the database's test call within 3 minutes.`);
    await io.sleep(5_000);
  }
}

// ---- sign-in settings ----------------------------------------------------------------------------

const TEST_OTP_DAYS = 7;

/**
 * The PATCH body, and the part of it that is read back (never the Twilio token). The optional
 * PRODUCTION_TEST_OTP adds one test sign-in number for 7 days; its value is never printed.
 */
export function authWanted(env, now, root = ROOT) {
  const file = JSON.parse(readFileSync(path.join(root, 'scripts', 'production-auth.json'), 'utf8'));
  const compare = {
    ...file,
    sms_twilio_verify_account_sid: env.TWILIO_ACCOUNT_SID,
    sms_twilio_verify_message_service_sid: env.TWILIO_VERIFY_SERVICE_SID,
  };
  const body = { ...compare, sms_twilio_verify_auth_token: env.TWILIO_AUTH_TOKEN };
  const otp = env.PRODUCTION_TEST_OTP;
  if (!otp) return { body, compare, testUntil: null };
  if (!/^\d{8,15}=\d{6}$/.test(otp)) {
    stop('PRODUCTION_TEST_OTP is not one phone number in digits, an equals sign and a 6-digit code.');
  }
  const testUntil = new Date(now + TEST_OTP_DAYS * 86_400_000).toISOString();
  compare.sms_test_otp = otp;
  return { body: { ...body, sms_test_otp: otp, sms_test_otp_valid_until: testUntil }, compare, testUntil };
}

/** Names of the wanted settings the project does not hold. Names only, never values. */
export function authDiff(wanted, got) {
  return Object.keys(wanted).filter((name) => String(got?.[name] ?? '') !== String(wanted[name]));
}

async function auth(io) {
  const ref = projectRef(io);
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']) {
    if (!io.env[name]) stop(`${name} is missing from the production environment.`);
  }
  const { body, compare, testUntil } = authWanted(io.env, io.now());
  const res = await mgmt(io, ref, '/config/auth', { method: 'PATCH', json: body });
  if (!res.ok) stop(`Supabase refused the sign-in settings (HTTP ${res.status}).`);
  const back = await mgmt(io, ref, '/config/auth');
  if (!back.ok) stop(`The sign-in settings could not be read back (HTTP ${back.status}).`);
  const differ = authDiff(compare, back.json);
  if (differ.length > 0) stop(`These sign-in settings did not take: ${differ.join(', ')}.`);
  io.log(`Sign-in settings: ${Object.keys(compare).length} read back as wanted.`);
  note(
    io,
    'phone sign-in through Twilio Verify; email sign-in off' +
      (testUntil ? `; one test sign-in number until ${testUntil.slice(0, 10)}` : '')
  );
}

// ---- fingerprint ---------------------------------------------------------------------------------

async function fingerprint(io, file) {
  const local = file ? path.resolve(io.cwd, file) : '';
  if (!local || !existsSync(local)) stop('The local fingerprint from the local job is missing.');
  const ref = projectRef(io, { allowStaging: true });
  const key = await serverKey(io, ref);
  const child = io.spawn(process.execPath, [path.join(ROOT, 'scripts', 'verify-schema.mjs'), 'compare', local, 'hosted'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      PATH: io.env.PATH ?? '',
      GITHUB_ACTIONS: io.env.GITHUB_ACTIONS ?? '',
      FINGERPRINT_URL: `https://${ref}.supabase.co`,
      FINGERPRINT_KEY: key.value,
    },
  });
  for (const line of `${child.stdout ?? ''}${child.stderr ?? ''}`.split('\n')) {
    if (line.trim() !== '' && !line.includes(key.value) && !line.includes(ref)) io.log(line);
  }
  if (child.status === 1) stop('The database differs from the local build of this commit: the sections marked FAIL above say where.');
  if (child.status !== 0) stop('The fingerprint tool could not compare; its line above says why.');
  note(io, 'every section matches the local build');
}

// ---- the table -----------------------------------------------------------------------------------

const ROWS = Object.freeze({
  plan: [
    ['guards', 'Safety checks'],
    ['status', 'Project is running'],
    ['keys', 'Project keys'],
    ['link', 'Link the project'],
    ['list', 'Read the migration list'],
    ['plan', 'Plan and safety scan'],
  ],
  apply: [
    ['download', 'Local fingerprint from the local job'],
    ['guards', 'Safety checks'],
    ['status', 'Project is running'],
    ['keys', 'Project keys'],
    ['link', 'Link the project'],
    ['list_before', 'Read the migration list'],
    ['check', 'Plan unchanged since your approval'],
    ['push', 'Apply the migrations'],
    ['list_after', 'Migration list after applying'],
    ['fingerprint', 'Database matches the local build'],
    ['deploy', 'Deploy the edge functions'],
    ['functions_list', 'List the edge functions'],
    ['secrets', 'Function secret STRIPE_SECRET_KEY'],
    ['webhook', 'Stripe test webhook'],
    ['vault', 'Timer key stored'],
    ['smoke_push', 'send-push refuses a stranger'],
    ['smoke_status', 'connect-status refuses a caller who is not signed in'],
    ['smoke_webhook', 'stripe-webhook checks the signature'],
    ['timers', 'Timers reach the functions'],
    ['auth', 'Sign-in settings'],
  ],
  prove: [
    ['download', 'Local fingerprint from the local job'],
    ['fingerprint', 'Staging database matches the local build'],
  ],
});

const TITLE = Object.freeze({ plan: 'PRODUCTION PLAN', apply: 'PRODUCTION', prove: 'STAGING PROOF' });

const CLI_REASON = Object.freeze({
  download: 'The local job did not hand over its fingerprint; its log says why.',
  link: 'The Supabase CLI could not link the project. Check SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD.',
  list: "The Supabase CLI could not read the migration list; this step's log says why.",
  list_before: "The Supabase CLI could not read the migration list; this step's log says why.",
  list_after: "The Supabase CLI could not read the migration list after applying; this step's log says why.",
  push: "Applying the migrations failed; this step's log names the file. Fix it, then press the button again.",
  deploy: "Deploying the edge functions failed; this step's log names the function.",
  functions_list: 'Listing the edge functions failed.',
});

const NOT_RUN = 'This check did not run, so it proves nothing; the first FAIL above says why.';

const cell = (text) => oneLine(text ?? '').replace(/\|/g, '/').slice(0, 300);

/** One row per check. A check that did not run is a FAIL too: nothing is PASS unless it ran. */
export function summarize(kind, steps) {
  const rows = ROWS[kind];
  const title = TITLE[kind];
  const lines = [`### ${title}`, '', '| Result | Check | |', '|---|---|---|'];
  let first = null;
  for (const [id, label] of rows) {
    const step = steps?.[id];
    if (step?.outcome === 'success') {
      lines.push(`| PASS | ${label} | ${cell(step.outputs?.note)} |`);
    } else if (step?.outcome === 'failure' || step?.outcome === 'cancelled') {
      const reason = cell(step.outputs?.reason) || CLI_REASON[id] || "This step failed; its log says why.";
      lines.push(`| FAIL | ${label} | ${reason} |`);
      first ??= label;
    } else {
      lines.push(`| FAIL | ${label} | ${NOT_RUN} |`);
      first ??= label;
    }
  }
  const last = first ? `${title}: FAIL at ${first}` : `${title}: PASS`;
  lines.push('', `**${last}**`, '');
  return { ok: first === null, markdown: lines.join('\n'), last };
}

async function summary(io, kind) {
  if (!Object.hasOwn(ROWS, kind ?? '')) stop('summary needs one of: plan, apply, prove.');
  let steps = {};
  try {
    steps = JSON.parse(io.env.STEPS_JSON ?? '{}');
  } catch {
    steps = {};
  }
  const table = summarize(kind, steps);
  addSummary(io, table.markdown);
  logLines(io, table.markdown);
  return table.ok;
}

// ---- entry ---------------------------------------------------------------------------------------

const COMMANDS = Object.freeze({
  guards,
  status,
  keys,
  plan,
  check,
  secrets,
  webhook,
  vault,
  smoke,
  timers,
  auth,
  fingerprint,
  summary,
});

export async function run(argv, io) {
  const [name, arg] = argv;
  if (!Object.hasOwn(COMMANDS, name ?? '')) {
    io.log(`usage: node scripts/production-deploy.mjs <${Object.keys(COMMANDS).join('|')}> [argument]`);
    return 2;
  }
  try {
    const result = await COMMANDS[name](io, arg);
    return result === false ? 1 : 0;
  } catch (err) {
    // An unplanned error prints its kind only: its message may hold a URL with the project in it.
    const reason = err instanceof Stop ? err.message : `The ${name} step stopped on an unexpected error (${err?.name ?? 'Error'}).`;
    io.log(`FAIL: ${reason}`);
    setOutput(io, 'reason', reason);
    return 1;
  }
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  scriptPath !== '' &&
  (process.platform === 'win32' ? scriptPath.toLowerCase() === selfPath.toLowerCase() : scriptPath === selfPath);

if (isMain) {
  const io = {
    env: process.env,
    fetch: (url, init) => fetch(url, init),
    log: (line) => console.log(line),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    spawn: spawnSync,
    cwd: process.cwd(),
  };
  run(process.argv.slice(2), io).then((code) => {
    process.exitCode = code;
  });
}
