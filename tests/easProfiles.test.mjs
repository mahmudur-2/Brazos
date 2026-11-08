// lean E4, docs/lean/SECURITY-VERDICT.md B4: every build profile pins its phone-auth and payments
// modes in eas.json, so a build never inherits them from whatever the EAS environment holds. Only
// development may run the mock phone provider. Secrets (Supabase URL and key, Stripe key) stay in
// the EAS environment and never appear here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const text = readFileSync(join(import.meta.dirname, '..', 'eas.json'), 'utf8');
const profiles = JSON.parse(text).build;

const EXPECTED = {
  development: { EXPO_PUBLIC_PHONE_AUTH_MODE: 'mock', EXPO_PUBLIC_PAYMENTS_MODE: 'disabled' },
  preview: { EXPO_PUBLIC_PHONE_AUTH_MODE: 'supabase', EXPO_PUBLIC_PAYMENTS_MODE: 'stripe' },
  production: { EXPO_PUBLIC_PHONE_AUTH_MODE: 'supabase', EXPO_PUBLIC_PAYMENTS_MODE: 'stripe' },
  testflight: { EXPO_PUBLIC_PHONE_AUTH_MODE: 'supabase', EXPO_PUBLIC_PAYMENTS_MODE: 'stripe' },
  'e2e-test': { EXPO_PUBLIC_PHONE_AUTH_MODE: 'supabase', EXPO_PUBLIC_PAYMENTS_MODE: 'stripe' },
};

test('B4 · eas.json declares exactly the five profiles this fence pins', () => {
  assert.deepEqual(Object.keys(profiles).sort(), Object.keys(EXPECTED).sort());
});

// lean G0, D-20260905-1: TestFlight is a store build of the production bundle id that talks to
// STAGING with Stripe test money. Its EAS environment is `preview` (staging values); the
// `production` environment holds production values, so "correcting" it to match the name is wrong.
test('G0 · testflight is a store build of the production bundle on the staging environment', () => {
  const tf = profiles.testflight;
  assert.equal(tf.distribution, 'store');
  assert.equal(tf.environment, 'preview', 'testflight must use the staging (preview) EAS environment');
  assert.equal(tf.env.APP_VARIANT, 'production');
  assert.equal(tf.env.EXPO_PUBLIC_APP_VARIANT, 'production');
});

test('G0 · only production and testflight build the production bundle id', () => {
  const prodVariant = Object.entries(profiles)
    .filter(([, profile]) => profile.env?.APP_VARIANT === 'production')
    .map(([name]) => name)
    .sort();
  assert.deepEqual(prodVariant, ['production', 'testflight']);
});

test('G0 · release:testflight builds the testflight profile, never production', () => {
  const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.match(scripts['release:testflight'], /--profile testflight --auto-submit$/);
  assert.match(scripts['release:production'], /--profile production --auto-submit$/);
});

test('B4 · every profile pins both modes, with exactly these values', () => {
  for (const [name, modes] of Object.entries(EXPECTED)) {
    for (const [key, value] of Object.entries(modes)) {
      assert.equal(profiles[name].env?.[key], value, `${name}: ${key} must be ${value}`);
    }
  }
});

test('B4 · only development says mock', () => {
  const mock = Object.entries(profiles)
    .filter(([, profile]) => Object.values(profile.env ?? {}).some((v) => String(v).toLowerCase() === 'mock'))
    .map(([name]) => name);
  assert.deepEqual(mock, ['development']);
});

test('B4 · no profile holds a key-shaped value', () => {
  for (const [name, profile] of Object.entries(profiles)) {
    for (const [key, value] of Object.entries(profile.env ?? {})) {
      assert.doesNotMatch(String(value), /pk_|sk_|rk_|eyJ|sb_/, `${name}: ${key} looks like a key`);
    }
  }
  assert.doesNotMatch(text, /\b(pk|sk|rk)_(test|live)_|\beyJ/, 'nothing key-shaped anywhere in eas.json');
});
