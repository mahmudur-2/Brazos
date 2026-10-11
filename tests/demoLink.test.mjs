// The demo link (scripts/demo-link/) — the shareable browser copy. Fences what
// it may point at, what it ships, and what it may never touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_ENV, assertStagingConfig, configScript, exportDir, siteDir, workDir } from '../scripts/demo-link/lib.mjs';
import { PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';

const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const url = (ref) => `https://${ref}.supabase.co`;

test('the link may name staging, with its anon or publishable key, and nothing else', () => {
  assert.doesNotThrow(() => assertStagingConfig({ SUPABASE_URL: url(STAGING_REF), SUPABASE_KEY: jwt({ ref: STAGING_REF, role: 'anon' }) }));
  assert.doesNotThrow(() => assertStagingConfig({ SUPABASE_URL: url(STAGING_REF), SUPABASE_KEY: 'sb_publishable_abc123' })); // key-guard: allow, a publishable (public) key fixture
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: url(PRODUCTION_REF), SUPABASE_KEY: 'sb_publishable_abc123' }), /production/); // key-guard: allow, a publishable (public) key fixture
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: url('abcdefghijklmnopqrst'), SUPABASE_KEY: 'sb_publishable_abc123' }), /not staging/); // key-guard: allow, a publishable (public) key fixture
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_KEY: 'sb_publishable_abc123' }), /no Supabase project URL/); // key-guard: allow, a publishable (public) key fixture
});

test('a secret-shaped key never reaches the public /config.js', () => {
  const stagingUrl = url(STAGING_REF);
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: stagingUrl, SUPABASE_KEY: 'sb_secret_abc123' }), /not a publishable/);
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: stagingUrl, SUPABASE_KEY: jwt({ ref: STAGING_REF, role: 'service_role' }) }), /not the anon key/);
  assert.throws(() => assertStagingConfig({ SUPABASE_URL: stagingUrl, SUPABASE_KEY: jwt({ ref: 'abcdefghijklmnopqrst', role: 'anon' }) }), /different project/);
});

test('the export carries no server at all — only /config.js names one', () => {
  assert.match(DEMO_ENV.EXPO_PUBLIC_SUPABASE_URL, /\.invalid$/);
  for (const value of Object.values(DEMO_ENV)) {
    assert.ok(!value.includes(STAGING_REF) && !value.includes(PRODUCTION_REF));
  }
  assert.match(configScript({ SUPABASE_URL: 'u', SUPABASE_KEY: 'k' }), /^globalThis\.__BRAZOS_CONFIG__ = \{"SUPABASE_URL":"u","SUPABASE_KEY":"k"\};\n$/);
});

test('practice money only, and no vendor keys, in the copy', () => {
  assert.equal(DEMO_ENV.EXPO_PUBLIC_PAYMENTS_MODE, 'sandbox');
  assert.equal(DEMO_ENV.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, '');
  assert.equal(DEMO_ENV.EXPO_PUBLIC_SENTRY_DSN, '');
  assert.equal(DEMO_ENV.EXPO_PUBLIC_POSTHOG_KEY, '');
});

test('the copy is built outside the frozen web surface', () => {
  const norm = (p) => p.replace(/\\/g, '/');
  for (const dir of [workDir, exportDir, siteDir]) {
    assert.match(norm(dir), /\/\.shots\/demo-link(\/|$)/);
    assert.doesNotMatch(norm(dir), /\/(dist|public|hosting)(\/|$)/);
  }
  const lib = readFileSync(new URL('../scripts/demo-link/lib.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /writeFileSync\([^)]*(public|hosting|dist)\//);
});

test('the deploy is gated on a robot pass for the same bundle, and on staging', () => {
  const refresh = readFileSync(new URL('../scripts/demo-link/refresh.mjs', import.meta.url), 'utf8');
  const robotAt = refresh.indexOf("'robot.mjs'");
  const deployAt = refresh.indexOf("'deploy'");
  assert.ok(robotAt > 0 && deployAt > robotAt, 'the robot runs before the deploy');
  assert.match(refresh, /stamp\.bundle !== bundleHash\(exportDir\)/);
  assert.match(refresh, /bundleHash\(siteDir\) !== stamp\.bundle/);
  assert.match(refresh, /STAGING_REF\}\.supabase\.co/);
});

test('the robot walks the local stack only and refuses any remote Supabase host', () => {
  const robot = readFileSync(new URL('../scripts/demo-link/robot.mjs', import.meta.url), 'utf8');
  assert.match(robot, /assembleSite\(localConfig\(\)\)/);
  assert.match(robot, /\\\.supabase\\\.\(co\|in\)\$\/i\.test\(url\.hostname\)/);
  assert.match(robot, /route\.abort\(\)/);
});

test('the phone frame loads nothing from another host', () => {
  const frame = readFileSync(new URL('../scripts/demo-link/frame.html', import.meta.url), 'utf8');
  assert.doesNotMatch(frame, /(src|href)="https?:\/\//);
  assert.match(frame, /padding:59px 0 34px 0/);
});
