#!/usr/bin/env node
/**
 * THE PRODUCTION BUTTON'S LOGIC. .github/workflows/production.yml only orchestrates: each of its
 * steps runs one command here, and every decision lives in this file, tested with a fake fetch in
 * tests/productionDeploy.test.mjs. The owner's guide is docs/production/owner-steps.md.
 *
 *   node scripts/production-deploy.mjs <command> [argument]
 *
 *   guards                       branch, the seven secrets, PRODUCTION_REF, sk_test_, the approval rule
 *   status                       the project is running
 *   keys                         the server key in use and the legacy keys (types only, never values)
 *   webhook-plan                 the Stripe webhook decision and its inputs (see webhookAction); changes nothing
 *   cli-fetch <folder>           the Supabase CLI for Linux, only from the bytes package-lock.json pins (sha512)
 *   plan <migration list>        what apply will do, written to the run summary; changes nothing
 *   check <migration list>       the plan is unchanged since the owner approved it
 *   secrets                      the function secret STRIPE_SECRET_KEY
 *   webhook                      the Stripe TEST webhook and STRIPE_WEBHOOK_SECRET, found by its URL; never deleted
 *   webhook-event                one canceled test payment's event reaches stripe-webhook signed and matches no payment
 *   vault                        set_drain_secrets(): the URL and the key the timers call functions with
 *   smoke <push|status|webhook|return>  one function answers a call without a user (see SMOKE)
 *   timers                       one test call from the database to each drain gets HTTP 200
 *   auth                         the sign-in settings: scripts/production-auth.json plus Twilio
 *   admin                        the optional PRODUCTION_ADMIN_USER_ID account gets is_admin (never removed)
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
 * node_modules, so this file imports Node built-ins and repository files only. The Supabase CLI
 * those jobs run comes from cli-fetch, checked against package-lock.json before its first use; npx
 * would fetch it by version alone and run whatever the registry hands back.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PRODUCTION_REF, RETIRED_PRODUCTION_REF, STAGING_REF } from './supabase-ref.mjs';

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
  notProduction:
    'SUPABASE_PROJECT_REF is not the production project that scripts/supabase-ref.mjs names (PRODUCTION_REF). The button works on that project only.',
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
async function call(io, url, { method = 'GET', headers = {}, json, form, redirect } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (redirect !== undefined) init.redirect = redirect;
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
    return { status: 0, ok: false, json: null, location: null };
  }
  const location = res.headers?.get?.('location') ?? null;
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, json: body, location };
}

function refProblem(ref, { allowStaging = false } = {}) {
  if (ref === RETIRED_PRODUCTION_REF) return SAY.retired;
  if (ref === STAGING_REF) return allowStaging ? null : SAY.staging;
  if (!/^[a-z]{20}$/.test(ref ?? '')) return SAY.notRef;
  if (ref !== PRODUCTION_REF) return SAY.notProduction;
  return null;
}

/** The project this run works on: production's only; the staging proof's read-only commands also accept staging. */
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
  io.log('Guards: mainexpo, seven secrets present, the production project, a Stripe test key, an approval rule.');
  note(io, 'mainexpo; seven secrets; the production project; test key; approval rule');
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
  if (flagged.length === 0) return { ok: true, note: 'the scan flags no file to apply' };
  if (applied === 0) return { ok: true, note: 'the database is empty, so nothing can break: the flagged files are listed and will be applied' };
  if (allowDestructive) return { ok: true, note: 'allow_destructive is checked: the flagged files will be applied' };
  return {
    ok: false,
    note: 'A migration to apply has a statement that needs review (the FLAG lines above): it may remove, rename or change something an installed app uses, or run code at once. Nothing was applied. Read those lines, then press the button again with allow_destructive checked.',
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
    `| Flagged (review required) | ${p.flagged.length} |`,
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

const sameEvents = (list, events) =>
  Array.isArray(list) && list.length === events.length && events.every((event) => list.includes(event));

/**
 * F02, F07: THE BUTTON NEVER DELETES A WEBHOOK OR A STORED SIGNING SECRET. In this order: no
 * endpoint at the address: create. Several, or one whose API version the functions do not read:
 * stop, Stripe untouched. One whose secret is not stored: stop with the owner's steps (Stripe
 * shows a signing secret to the button only when it makes the webhook). One enabled with the
 * same events: keep. Otherwise: update its events and enabled state in place.
 */
export function webhookAction({ matches, events, apiVersion, secretSet }) {
  if (matches.length === 0) return 'create';
  if (matches.length > 1) return 'several';
  const [one] = matches;
  if (one.api_version !== apiVersion) return 'version';
  if (!secretSet) return 'pairing';
  return one.status === 'enabled' && sameEvents(one.enabled_events, events) ? 'keep' : 'update';
}

const WEBHOOK_STOPS = Object.freeze(['several', 'version', 'pairing']);
const yesNo = (value) => (value ? 'yes' : 'no');
const versionText = (v) => {
  if (v === null || v === undefined) return 'none (the account default)';
  return /^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(String(v)) ? v : 'unreadable';
};

/** The decision's inputs as counts, yes/no and the version string: never a secret, an id or the address. */
export function webhookInputs({ matches, events, apiVersion, secretSet }) {
  const one = matches.length === 1 ? matches[0] : null;
  const on = Array.isArray(one?.enabled_events) ? one.enabled_events.length : 0;
  return [
    `endpoints at this project's address: ${matches.length}`,
    `STRIPE_WEBHOOK_SECRET stored: ${yesNo(secretSet)}`,
    `enabled: ${one ? yesNo(one.status === 'enabled') : 'n/a'}`,
    `events match: ${one ? `${yesNo(sameEvents(one.enabled_events, events))} (${events.length} wanted, ${on} on the endpoint)` : 'n/a'}`,
    `API version: ${one ? versionText(one.api_version) : 'n/a'} (the functions read ${apiVersion})`,
  ].join('; ');
}

const PAIR =
  'In Stripe (test mode), open Developers, Webhooks, the webhook whose address ends in /functions/v1/stripe-webhook, and reveal its signing secret. In Supabase, open the production project, Edge Functions, Secrets, and save it as STRIPE_WEBHOOK_SECRET. Then press the button again.';

export function webhookStop(action, { matches, events, apiVersion }) {
  if (action === 'several') {
    return `Stripe has ${matches.length} webhooks for this project's address, so the button cannot tell which one the signing secret saved in Supabase belongs to. Nothing in Stripe was changed. In Stripe (test mode), open Developers, Webhooks. Keep one of them (one that lists all ${events.length} events, if there is one), reveal its signing secret, and in Supabase (the production project, Edge Functions, Secrets) save it as STRIPE_WEBHOOK_SECRET. Then delete the other ${matches.length - 1} and press the button again.`;
  }
  if (action === 'version') {
    return `The Stripe webhook for this project sends events in API version ${versionText(matches[0].api_version)}, and the functions of this commit read ${apiVersion}. Nothing in Stripe was changed. Stripe cannot change a webhook's version in place, so choose one: a builder moves the functions to that version, or you delete the webhook in Stripe (test mode, Developers, Webhooks, the webhook whose address ends in /functions/v1/stripe-webhook, Delete) and press the button again, which makes a new one with ${apiVersion} and saves its signing secret.`;
  }
  return `Stripe already has the webhook for this project, but no STRIPE_WEBHOOK_SECRET is saved in Supabase, and Stripe hands the button a signing secret only when it makes a webhook. Nothing in Stripe was changed. ${PAIR}`;
}

/** Reads Stripe and the secret names, logs the inputs and the decision. Changes nothing. */
async function webhookDecide(io) {
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

  const state = { url, events, apiVersion, matches, secretSet: (await secretNames(io, ref)).includes('STRIPE_WEBHOOK_SECRET') };
  const action = webhookAction(state);
  io.log(`Stripe webhook inputs: ${webhookInputs(state)}.`);
  io.log(`Stripe webhook decision: ${action}.`);
  return { ref, state, action, halt: WEBHOOK_STOPS.includes(action) ? webhookStop(action, state) : null };
}

/** Before any change in the press: the target and the webhook decision, in the run summary. */
async function webhookPlan(io) {
  const { action, halt } = await webhookDecide(io);
  addSummary(io, `**Target:** the production project (\`PRODUCTION_REF\` in scripts/supabase-ref.mjs). **Stripe webhook:** ${halt ? 'stop' : action}.\n`);
  if (halt) stop(halt);
  note(io, `the production project; webhook: ${action}`);
}

async function webhook(io) {
  const { ref, state, action, halt } = await webhookDecide(io);
  if (halt) stop(halt);
  const { url, events, apiVersion, matches } = state;
  if (action === 'keep') {
    io.log('Stripe webhook: already right, kept unchanged.');
    note(io, 'kept');
    return;
  }
  if (action === 'update') {
    const form = new URLSearchParams({ disabled: 'false' });
    for (const event of events) form.append('enabled_events[]', event);
    const res = await stripe(io, `/webhook_endpoints/${encodeURIComponent(matches[0].id)}`, { method: 'POST', form });
    if (!res.ok) {
      stop(`Stripe did not confirm the webhook update (HTTP ${res.status}). Press the button again: it reads the webhook again and changes only what still differs.`);
    }
    if (webhookAction({ matches: [res.json ?? {}], events, apiVersion, secretSet: true }) !== 'keep') {
      stop('Stripe answered the webhook update, but the webhook still differs from what the functions need. Press the button again.');
    }
    io.log(`Stripe webhook: updated in place (enabled, ${events.length} events); its signing secret is unchanged.`);
    note(io, 'updated in place');
    return;
  }
  const form = new URLSearchParams({ url, api_version: apiVersion, description: 'Brazos production (made by the Production button)' });
  for (const event of events) form.append('enabled_events[]', event);
  const made = await stripe(io, '/webhook_endpoints', { method: 'POST', form });
  const secret = made.json?.secret;
  mask(io, secret);
  if (!made.ok) {
    stop(`Stripe did not confirm the new webhook (HTTP ${made.status}). Press the button again; if Stripe made it anyway, the next press stops and says how to save its signing secret.`);
  }
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) stop(`Stripe made the webhook but returned no signing secret. ${PAIR}`);
  const stored = await mgmt(io, ref, '/secrets', { method: 'POST', json: [{ name: 'STRIPE_WEBHOOK_SECRET', value: secret }] });
  if (!stored.ok) stop(`The webhook was made, but Supabase refused its signing secret (HTTP ${stored.status}). ${PAIR}`);
  io.log(`Stripe webhook: made, ${events.length} events, signing secret stored.`);
  note(io, 'made');
}

/**
 * F08: THE SIGNED RECEIPT. A PaymentIntent with no card and no customer, canceled at once, so it
 * can never be charged. Its payment_intent.canceled event proves the pairing by a fact only Stripe
 * writes: the event's pending_webhooks reaches 0 only when every webhook subscribed to it answered
 * 2xx, and stripe-webhook answers 2xx only after verifyStripeSignature (index.ts:150). The step
 * first checks that this project's webhook is kept as is (so it is subscribed). Its payment_events
 * row must be processed with no payment: apply_payment_event's unmatched path sets processed_at and
 * a null payment_id and writes nothing else (20261115000600:168-191, 344-345); payment_attention
 * lists only unprocessed rows (:580-581), so nobody is told about it.
 */
const PROBE_DESCRIPTION = 'Brazos Production button check (never charged, canceled at once)';

async function webhookEvent(io) {
  const { ref, action } = await webhookDecide(io);
  if (action !== 'keep') stop(`The Stripe webhook is not ready (decision: ${action}), so no test event was sent. Press the button again.`);
  const key = await serverKey(io, ref);
  const form = new URLSearchParams({ amount: '50', currency: 'usd', description: PROBE_DESCRIPTION });
  form.append('payment_method_types[]', 'card');
  form.append('metadata[brazos_probe]', io.env.GITHUB_RUN_ID || 'button');
  const made = await stripe(io, '/payment_intents', { method: 'POST', form });
  const pi = typeof made.json?.id === 'string' && /^pi_\w+$/.test(made.json.id) ? made.json.id : null;
  if (!made.ok || !pi) stop(`Stripe did not confirm the test payment that proves the webhook (HTTP ${made.status}). Press the button again.`);
  const canceled = await stripe(io, `/payment_intents/${pi}/cancel`, { method: 'POST' });
  if (!canceled.ok) {
    stop(`Stripe did not confirm that the test payment was canceled (HTTP ${canceled.status}). It holds no card, so it can never be charged. Press the button again.`);
  }

  const lookup = `https://${ref}.supabase.co/rest/v1/payment_events?select=id,processed_at,attempts,payment_id&type=eq.payment_intent.canceled&payload->data->object->>id=eq.${pi}`;
  const deadline = io.now() + PROBE_WAIT_MS;
  let row = null;
  let pending = null;
  for (;;) {
    const res = await call(io, lookup, { headers: keyHeaders(key) });
    if (!res.ok) stop(`The test event could not be looked up in the database (HTTP ${res.status}). Press the button again.`);
    row = Array.isArray(res.json) && res.json.length === 1 ? res.json[0] : null;
    if (row?.processed_at && typeof row.id === 'string' && /^evt_\w+$/.test(row.id)) {
      const event = await stripe(io, `/events/${row.id}`);
      pending = event.ok && Number.isInteger(event.json?.pending_webhooks) ? event.json.pending_webhooks : null;
      if (pending === 0) break;
    }
    if (io.now() >= deadline) break;
    await io.sleep(5_000);
  }
  if (!row) {
    stop(`No signed test event reached stripe-webhook within 3 minutes, so the webhook is not proven: the signing secret saved in Supabase is most likely not this webhook's. ${PAIR}`);
  }
  if (!row.processed_at) {
    stop('stripe-webhook took the signed test event but could not apply it within 3 minutes; payment_attention lists its error. Press the button again.');
  }
  if (row.payment_id !== null) stop('The test event matched a payment, which a test payment never may, so the button stopped here.');
  if (pending === null) stop("Stripe's test event could not be read back, so its delivery is not proven. Press the button again.");
  if (pending !== 0) {
    stop('stripe-webhook took the signed test event, but Stripe still counts it as undelivered to another webhook on this account. In Stripe (test mode), open Developers, Webhooks, and fix or delete the webhook that shows failed deliveries; then press the button again.');
  }
  io.log('Stripe test event: delivered and signed to every webhook on the account; stripe-webhook recorded and applied it; it matched no payment.');
  note(io, 'a signed test event reached stripe-webhook and matched no payment');
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
 * matches the gateway's words, which a new project may change. connect-return (verify_jwt = false)
 * answers a GET from the browser with a 302 into the app: its row checks the exact Location, read
 * without following the redirect.
 */
export const SMOKE = Object.freeze({
  push: Object.freeze({ fn: 'send-push', status: 403, error: 'forbidden', key: null, gatewayToo: false }),
  status: Object.freeze({ fn: 'connect-status', status: 401, error: 'Sign in to check your payouts.', key: 'publishable', gatewayToo: true }),
  webhook: Object.freeze({ fn: 'stripe-webhook', status: 400, error: 'invalid signature', key: null, gatewayToo: false }),
  return: Object.freeze({ fn: 'connect-return', method: 'GET', status: 302, location: 'brazos://payouts?from=return', key: null, gatewayToo: false }),
});

/** Whether an answer passes the row: the status always, then the exact Location or the function's own words where required. */
function smokePasses(s, res) {
  if (s.location) return res.status === s.status && res.location === s.location;
  return res.status === s.status && (s.gatewayToo || res.json?.error === s.error);
}

function smokeReason(s, res) {
  const own = res.json?.error;
  if (res.status === 401 && s.status !== 401) {
    return `${s.fn} was refused by the gateway (HTTP 401) before its code ran: verify_jwt is on, and supabase/config.toml says it must be off.`;
  }
  if (s.location && res.status !== 404) return `${s.fn} answered HTTP ${res.status}, not a ${s.status} to ${s.location}.`;
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
  if (!s) stop('smoke needs one of: push, status, webhook, return.');
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
    res = s.method === 'GET' ? await call(io, url, { headers, redirect: 'manual' }) : await call(io, url, { method: 'POST', headers, json: {} });
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
  // Whole seconds, so a read-back that drops the milliseconds still compares equal.
  const testUntil = new Date(Math.floor((now + TEST_OTP_DAYS * 86_400_000) / 1000) * 1000).toISOString();
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
  // R6-f: the end date is compared when the answer holds it; an answer without it is a visible warning.
  const until = back.json?.sms_test_otp_valid_until;
  if (testUntil && until !== undefined && until !== null && Date.parse(until) !== Date.parse(testUntil)) differ.push('sms_test_otp_valid_until');
  if (differ.length > 0) stop(`These sign-in settings did not take: ${differ.join(', ')}.`);
  const unverified = testUntil !== null && (until === undefined || until === null);
  if (unverified) io.log("::warning::The sign-in settings answer holds no sms_test_otp_valid_until, so the test number's 7-day end is unverified.");
  io.log(`Sign-in settings: ${Object.keys(compare).length} read back as wanted.`);
  note(
    io,
    'phone sign-in through Twilio Verify; email sign-in off' +
      (testUntil ? `; one test sign-in number until ${testUntil.slice(0, 10)}${unverified ? ' (end date unverified)' : ''}` : '')
  );
}

// ---- the admin account ---------------------------------------------------------------------------

const ADMIN_STEPS =
  'In Supabase, open the production project, then Authentication, Users, and copy the User UID of your own account. In GitHub, open Settings, Environments, production, and save it as the secret PRODUCTION_ADMIN_USER_ID. Then press the button again.';

/**
 * F10: the optional PRODUCTION_ADMIN_USER_ID gets is_admin, only on an active account (a profile
 * row, not deleted, not banned), and only when the one row that comes back has that id and the
 * flag. An account that is already an admin is left unchanged. The step never removes admin from
 * anyone, and the id is never printed.
 */
async function admin(io) {
  const id = (io.env.PRODUCTION_ADMIN_USER_ID ?? '').trim().toLowerCase();
  if (!id) {
    io.log('Admin: PRODUCTION_ADMIN_USER_ID is not set, so no account was changed.');
    note(io, 'PRODUCTION_ADMIN_USER_ID not set: no change');
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    stop(`PRODUCTION_ADMIN_USER_ID is not a user id (36 characters: digits, the letters a to f, and four dashes). ${ADMIN_STEPS}`);
  }
  const ref = projectRef(io);
  const key = await serverKey(io, ref);
  const rows = `https://${ref}.supabase.co/rest/v1/profiles?id=eq.${id}`;
  const read = await call(io, `${rows}&select=id,is_admin,banned,deleted_at`, { headers: keyHeaders(key) });
  if (!read.ok || !Array.isArray(read.json)) stop(`The production accounts could not be read (HTTP ${read.status}). Press the button again.`);
  const [row] = read.json;
  if (read.json.length !== 1 || row?.id !== id) stop(`No account in the production project has the id saved in PRODUCTION_ADMIN_USER_ID. ${ADMIN_STEPS}`);
  if (row.deleted_at !== null || row.banned !== false) {
    stop(`The account saved in PRODUCTION_ADMIN_USER_ID is deleted or banned, so the button does not make it an admin. ${ADMIN_STEPS}`);
  }
  if (row.is_admin !== true) {
    const res = await call(io, `${rows}&deleted_at=is.null&banned=is.false&select=id,is_admin`, {
      method: 'PATCH',
      headers: { ...keyHeaders(key), Prefer: 'return=representation' },
      json: { is_admin: true },
    });
    const back = Array.isArray(res.json) ? res.json : [];
    if (!res.ok || back.length !== 1 || back[0]?.id !== id || back[0]?.is_admin !== true) {
      stop(`The account saved in PRODUCTION_ADMIN_USER_ID did not become an admin (HTTP ${res.status}). Press the button again.`);
    }
  }
  io.log('Admin: the account saved in PRODUCTION_ADMIN_USER_ID is an admin. The button never removes admin from anyone.');
  note(io, 'done: the saved account is an admin');
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

// ---- the Supabase CLI ----------------------------------------------------------------------------

const CLI_PACKAGE = 'node_modules/@supabase/cli-linux-x64';
const CLI_NOT_RUN = 'so the CLI was not run and nothing was changed.';

/** The regular files directly under package/bin/ of an npm tarball, by name. Pure. */
export function tarballBin(tgz) {
  const tar = gunzipSync(tgz);
  const files = {};
  let at = 0;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (from, to) => header.toString('utf8', from, to).replace(/\0[\s\S]*$/, '');
    const size = parseInt(field(124, 136).trim(), 8);
    if (!Number.isSafeInteger(size)) break;
    const type = field(156, 157);
    const bin = /^package\/bin\/(\w[\w.-]*)$/.exec(field(0, 100));
    if (bin && (type === '0' || type === '')) files[bin[1]] = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function cliFetch(io, folder) {
  if (!folder) stop('cli-fetch needs the folder to put the Supabase CLI in.');
  let entry = null;
  try {
    entry = JSON.parse(readFileSync(path.join(io.cwd, 'package-lock.json'), 'utf8')).packages?.[CLI_PACKAGE] ?? null;
  } catch {
    entry = null;
  }
  const sha512 = /^sha512-([A-Za-z0-9+/]{86}==)$/.exec(entry?.integrity ?? '')?.[1];
  if (!sha512 || !/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved ?? '') || !entry.version) {
    stop(`The Supabase CLI for Linux is not pinned in package-lock.json (an npm registry URL and a sha512 checksum), ${CLI_NOT_RUN}`);
  }
  let tgz = null;
  try {
    const res = await io.fetch(entry.resolved);
    if (res.ok) tgz = Buffer.from(await res.arrayBuffer());
  } catch {
    tgz = null;
  }
  if (!tgz) stop(`The Supabase CLI could not be downloaded from npm, ${CLI_NOT_RUN} Running again is safe.`);
  if (createHash('sha512').update(tgz).digest('base64') !== sha512) {
    stop(`The Supabase CLI downloaded from npm does not match the sha512 checksum in package-lock.json, ${CLI_NOT_RUN}`);
  }
  const files = tarballBin(tgz);
  if (!files.supabase) stop(`The Supabase CLI package holds no bin/supabase, ${CLI_NOT_RUN}`);
  const dir = path.resolve(io.cwd, folder);
  mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), bytes);
    chmodSync(path.join(dir, name), 0o755);
  }
  const child = io.spawn(path.join(dir, 'supabase'), ['--version'], { encoding: 'utf8' });
  if (child.status !== 0 || !String(child.stdout ?? '').split(/\s+/).includes(entry.version)) {
    stop(`The Supabase CLI did not report version ${entry.version}, so no CLI command reached the project and nothing was changed.`);
  }
  io.log(`Supabase CLI ${entry.version}: the download matches the sha512 checksum in package-lock.json.`);
  note(io, `Supabase CLI ${entry.version}, sha512 matches package-lock.json`);
}

// ---- the table -----------------------------------------------------------------------------------

const ROWS = Object.freeze({
  plan: [
    ['guards', 'Safety checks'],
    ['status', 'Project is running'],
    ['keys', 'Project keys'],
    ['webhook_plan', 'Target project and Stripe webhook decision'],
    ['cli', 'Supabase CLI matches package-lock.json'],
    ['link', 'Link the project'],
    ['list', 'Read the migration list'],
    ['plan', 'Plan and safety scan'],
  ],
  apply: [
    ['download', 'Local fingerprint from the local job'],
    ['guards', 'Safety checks'],
    ['status', 'Project is running'],
    ['keys', 'Project keys'],
    ['webhook_plan', 'Target project and Stripe webhook decision'],
    ['cli', 'Supabase CLI matches package-lock.json'],
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
    ['webhook_event', 'A signed Stripe test event reaches stripe-webhook'],
    ['smoke_return', 'connect-return sends the browser back to the app'],
    ['timers', 'Timers reach the functions'],
    ['auth', 'Sign-in settings'],
    ['admin', 'Admin account'],
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
  'webhook-plan': webhookPlan,
  'cli-fetch': cliFetch,
  plan,
  check,
  secrets,
  webhook,
  'webhook-event': webhookEvent,
  vault,
  smoke,
  timers,
  auth,
  admin,
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
