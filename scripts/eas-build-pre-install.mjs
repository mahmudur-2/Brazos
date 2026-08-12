#!/usr/bin/env node
/**
 * EAS Build gate (package.json "eas-build-pre-install") — refuses to build a
 * `production` binary against anything but the production Supabase project.
 *
 * Why this can work at all: .env is gitignored and therefore never uploaded
 * to EAS, and react-native-dotenv merges process.env OVER the .env file — so
 * on a build worker the bundle's SUPABASE_URL / SUPABASE_KEY come exclusively
 * from the EAS environment selected by the profile's `environment` field.
 * This hook runs on that same worker with those same variables, BEFORE
 * dependencies install (so it must stay dependency-free), and a non-zero
 * exit fails the whole build.
 *
 * What it enforces, refs only (never printing a URL or key):
 *   - SUPABASE_URL and SUPABASE_KEY are both present, and
 *   - every resolvable project ref is exactly PRODUCTION_REF.
 * Non-production profiles are exempt — their environments legitimately point
 * elsewhere.
 */
import { refFromRestUrl, refFromJwt } from './supabase-ref.mjs';

const PRODUCTION_REF = 'avkighsiufeefyycbebf';

const profile = process.env.EAS_BUILD_PROFILE ?? '';
if (profile !== 'production') {
  console.log(`eas-build-pre-install: profile "${profile || '(none)'}" — production gate not applicable, skipping.`);
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const urlRef = refFromRestUrl(url);
const keyRef = refFromJwt(key);

console.log('production build gate');
console.log(`  SUPABASE_URL ref : ${url ? (urlRef ?? 'UNRESOLVED') : 'ABSENT'}`);
console.log(`  SUPABASE_KEY ref : ${key ? (keyRef ?? 'not a JWT key (no embedded ref)') : 'ABSENT'}`);
console.log(`  required ref     : ${PRODUCTION_REF}`);

const problems = [];
if (!url) problems.push('SUPABASE_URL is not set in the EAS production environment');
if (!key) problems.push('SUPABASE_KEY is not set in the EAS production environment');
if (url && !urlRef) problems.push('SUPABASE_URL does not look like a Supabase project URL');
if (urlRef && urlRef !== PRODUCTION_REF) {
  problems.push(`SUPABASE_URL points at ${urlRef}, not the production project ${PRODUCTION_REF}`);
}
if (keyRef && keyRef !== PRODUCTION_REF) {
  problems.push(`SUPABASE_KEY belongs to ${keyRef}, not the production project ${PRODUCTION_REF}`);
}

if (problems.length > 0) {
  console.error('\nPRODUCTION BUILD GATE FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nRefusing to build a production binary against the wrong database.');
  process.exit(1);
}
console.log('  gate: OK — building against production.');
