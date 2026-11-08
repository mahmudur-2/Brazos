import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// ===========================================================================
// Running the real module, not a restatement of it
// ===========================================================================
// lib/phoneNumber.ts and lib/countries.ts are pure TypeScript with no React
// Native imports, so they can be executed directly rather than asserted about
// as text. Node strips the types; the only rewrite is the extensionless
// './countries' specifier, which ESM won't resolve on its own — the module
// body itself is byte-for-byte what the app imports.
// base64, not percent-encoding: encodeURIComponent leaves apostrophes raw and
// several country names contain one, which would close the import's string
// literal. Types are stripped before the specifier is rewritten, because the
// encoded blob is not something the TypeScript parser can be run over.
const strip = (path) => stripTypeScriptTypes(read(path), { mode: 'strip' });
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const countriesUrl = toDataUrl(strip('lib/countries.ts'));
const phoneUrl = toDataUrl(
  strip('lib/phoneNumber.ts').replaceAll("from './countries'", `from '${countriesUrl}'`)
);

const {
  DEFAULT_COUNTRY,
  clampNational,
  findCountry,
  formatNational,
  fromE164,
  isNanp,
  maskE164,
  nationalDigits,
  phoneValidationError,
  splitInternational,
  toE164,
} = await import(phoneUrl);

const US = DEFAULT_COUNTRY;
const GB = findCountry('GB');
const NL = findCountry('NL');

// ---------------------------------------------------------------------------
// Default country
// ---------------------------------------------------------------------------

test('the default country is the United States on +1', () => {
  assert.equal(US.code, 'US');
  assert.equal(US.dial, '1');
  assert.equal(isNanp(US), true);
  assert.equal(isNanp(GB), false);
});

test('every country carries a usable ISO code and calling code', async () => {
  const { COUNTRIES } = await import(countriesUrl);
  assert.ok(COUNTRIES.length > 150, 'the list should actually be international');
  for (const country of COUNTRIES) {
    assert.match(country.code, /^[A-Z]{2}$/, `${country.name} needs an ISO alpha-2 code`);
    assert.match(country.dial, /^[1-9][0-9]{0,3}$/, `${country.name} needs a calling code`);
    assert.ok(country.name.length > 1);
  }
  // The picker opens on the default, so it has to be the first row.
  assert.equal(COUNTRIES[0].code, 'US');
});

// ---------------------------------------------------------------------------
// The duplicated-+1 defect this component exists to make impossible
// ---------------------------------------------------------------------------

test('a calling code is never emitted twice, however the number arrives', () => {
  // Typed plainly.
  assert.equal(toE164(US, '7185550123'), '+17185550123');
  // Typed with the reference's own display grouping.
  assert.equal(toE164(US, '718 555 0123'), '+17185550123');
  // Typed with a leading trunk 1.
  assert.equal(toE164(US, '17185550123'), '+17185550123');
  // Pasted in every common US shape.
  for (const pasted of [
    '+1 718 555 0123',
    '+1 (718) 555-0123',
    '+17185550123',
    '1-718-555-0123',
    '(718) 555-0123',
  ]) {
    const split = splitInternational(pasted);
    const [country, national] = split ? [split.country, split.national] : [US, pasted];
    assert.equal(toE164(country, national), '+17185550123', `failed for ${pasted}`);
  }
});

test('a pasted international number moves the country control instead of stacking codes', () => {
  const split = splitInternational('+44 7911 123456');
  assert.equal(split.country.code, 'GB');
  assert.equal(split.national, '7911123456');
  assert.equal(toE164(split.country, split.national), '+447911123456');

  // Longest match wins, so NANP territories with their own four-digit code
  // resolve to themselves rather than to the US.
  assert.equal(splitInternational('+18681234567').country.code, 'TT');
  // …but a plain +1 number stays on the default rather than on whichever
  // NANP entry happens to sort first.
  assert.equal(splitInternational('+17185550123').country.code, 'US');
});

test('a leading zero is a trunk prefix, not part of the E.164 number', () => {
  assert.equal(toE164(GB, '07911123456'), '+447911123456');
  assert.equal(nationalDigits(NL, '0612345678'), '612345678');
});

// ---------------------------------------------------------------------------
// Switching country keeps the digits the user typed
// ---------------------------------------------------------------------------

test('switching country re-hangs the same digits on a new calling code', () => {
  const digits = '7911123456';
  assert.equal(toE164(GB, digits), '+447911123456');
  assert.equal(clampNational(GB, digits), digits, 'no digits may be dropped on switch');
  assert.equal(clampNational(NL, digits), digits);
});

test('the national part can never overflow E.164', () => {
  // 15 digits total, calling code included.
  const long = '9'.repeat(20);
  assert.equal(clampNational(GB, long).length, 13);
  assert.equal(toE164(GB, clampNational(GB, long)).length, 16); // '+' plus 15
  // NANP is fixed at ten, so a longer paste is truncated rather than accepted.
  assert.equal(clampNational(US, long).length, 10);
});

// ---------------------------------------------------------------------------
// Validation is specific where the rule is knowable, loose where it isn't
// ---------------------------------------------------------------------------

test('validation names the actual problem', () => {
  assert.equal(phoneValidationError(US, ''), 'Enter your phone number.');
  assert.equal(phoneValidationError(US, '718555'), 'Enter a 10-digit phone number.');
  assert.equal(phoneValidationError(US, '7185550123'), null);
  assert.equal(phoneValidationError(US, '718 555 0123'), null);
  // Non-NANP countries have no single national length to assert, so only
  // obvious nonsense is rejected.
  assert.equal(phoneValidationError(GB, '7911123456'), null);
  assert.equal(phoneValidationError(GB, '12'), 'Enter a valid phone number.');
});

test('an incomplete number never reaches the backend as a half-value', () => {
  assert.equal(toE164(US, ''), null);
  assert.equal(toE164(US, '   '), null);
  assert.equal(toE164(US, 'abc'), null);
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

test('NANP numbers use the reference grouping and other countries are left alone', () => {
  assert.equal(formatNational(US, '7185550123'), '718 555 0123');
  assert.equal(formatNational(US, '347'), '347');
  assert.equal(formatNational(US, '3473'), '347 3');
  // Nothing is invented for a country whose grouping we don't know.
  assert.equal(formatNational(GB, '7911123456'), '7911123456');
});

test('a stored E.164 value round-trips back into the field', () => {
  const parsed = fromE164('+17185550123');
  assert.equal(parsed.country.code, 'US');
  assert.equal(parsed.national, '7185550123');
  assert.equal(toE164(parsed.country, parsed.national), '+17185550123');

  // Anything that isn't E.164 falls back to the default rather than guessing.
  assert.equal(fromE164('718-555-0123').country.code, 'US');
});

// ---------------------------------------------------------------------------
// Wiring: the screens have to actually use all of the above
// ---------------------------------------------------------------------------

test('the phone field is the only path from the auth flow to the backend', () => {
  // Both create-account halves: the phone-first screen that requests a code,
  // and the email screen that still performs the real signUp().
  const createAccount = read('screens/CreateAccountScreen.tsx');
  const emailCreateAccount = read('screens/EmailCreateAccountScreen.tsx');
  const input = read('components/PhoneNumberInput.tsx');

  // Normalised before it is handed over — never the raw field value.
  for (const source of [createAccount, emailCreateAccount]) {
    assert.match(source, /const phone = toE164\(country, phoneDigits\)/);
    assert.match(source, /phoneValidationError\(country, phoneDigits\)/);
    // 2026-09-26 (the refresh, audit M-18): the email form may start on the
    // country the phone form already had, handed over by "Use Email Instead".
    assert.match(source, /useState<Country>\((?:params\?\.country \?\? )?DEFAULT_COUNTRY\)/);
  }
  assert.match(emailCreateAccount, /signUp\(trimmedEmail, password, trimmedName, phone\)/);

  // The national field peels a pasted calling code off rather than keeping it.
  assert.match(input, /splitInternational\(text\)/);
  assert.match(input, /onChangeCountry\(international\.country\)/);

  // The national input has to be allowed to shrink. Without minWidth its
  // intrinsic width wins over flex and the number overflows the row at 320pt.
  assert.match(input, /minWidth: 0/);
});

test('every screen with a phone field starts on the default country', () => {
  for (const path of [
    'screens/SignInScreen.tsx',
    'screens/CreateAccountScreen.tsx',
    'screens/EmailCreateAccountScreen.tsx',
  ]) {
    const source = read(path);
    // M-18: arriving fresh it is still the default; from the phone form, the
    // country already chosen there.
    assert.match(source, /useState<Country>\((?:params\?\.country \?\? )?DEFAULT_COUNTRY\)/, `${path} must default to US`);
    // The shared field, not a bare TextInput — that is what keeps the calling
    // code out of the national digits.
    assert.match(source, /<PhoneNumberInput/, `${path} must use the shared field`);
    assert.match(
      source,
      /phoneValidationError\(country, phoneDigits\)/,
      `${path} must validate before it acts`
    );
  }
});

test('the async submit handlers refuse to run twice concurrently', () => {
  for (const path of [
    'screens/SignInScreen.tsx',
    'screens/EmailSignInScreen.tsx',
    'screens/CreateAccountScreen.tsx',
    'screens/EmailCreateAccountScreen.tsx',
  ]) {
    assert.match(read(path), /if \(loading\) return;/, `${path} must guard double submission`);
  }
});

// ---------------------------------------------------------------------------
// The phone-first sign-in flow, and the honesty of its interim state
// ---------------------------------------------------------------------------

test('sign-in is phone first, with email as a routed alternate', () => {
  const phone = read('screens/SignInScreen.tsx');
  const email = read('screens/EmailSignInScreen.tsx');
  const flow = read('screens/AuthFlow.tsx');
  const routes = read('lib/navigation.ts');

  // Both halves are registered routes, so each keeps its own back behaviour.
  assert.match(routes, /EmailSignIn: undefined;/);
  assert.match(flow, /name="SignIn" component=\{SignInScreen\}/);
  assert.match(flow, /name="EmailSignIn" component=\{EmailSignInScreen\}/);

  // …and each offers the other.
  assert.match(phone, /title="Use Email Instead"/);
  assert.match(phone, /navigation\.navigate\('EmailSignIn'\)/);
  assert.match(email, /title="Use Phone Number Instead"/);
  // popTo, not navigate: under React Navigation 7 navigate() pushes when the
  // target isn't current, which would stack a second SignIn over the first and
  // discard the number already typed there.
  assert.match(email, /navigation\.popTo\('SignIn'\)/);
  assert.doesNotMatch(email, /navigation\.navigate\('SignIn'\)/);
});

test('the phone screen never fakes a session, and email still does the real sign-in', () => {
  const phone = read('screens/SignInScreen.tsx');
  const email = read('screens/EmailSignInScreen.tsx');

  // The phone screen requests a code and routes; it authenticates nobody
  // itself, and it goes through the provider boundary rather than reaching for
  // supabase.auth — which is what lets the mock stand in for the real thing.
  assert.doesNotMatch(phone, /\blogin\(|\bsignUp\(/, 'the phone screen must not authenticate');
  assert.doesNotMatch(phone, /supabase\.auth/, 'it must go through lib/phoneAuth, not the client');
  assert.match(phone, /phoneAuth\.requestOtp\(/);

  // The one screen that does authenticate still goes through AuthContext.
  assert.match(email, /const \{ login, bannedNotice \} = useAuth\(\)/);
  assert.match(email, /await login\(trimmedEmail, password\)/);
});

// ---------------------------------------------------------------------------
// Masking, for the verify screen's "Sent to …" line
// ---------------------------------------------------------------------------

test('a number is named back with only its last four digits', () => {
  // Enough to recognise your own number and catch a typo; not enough to be
  // worth reading over a shoulder.
  assert.equal(maskE164('+17185550123'), '+1 ••• ••• 0123');
  assert.equal(maskE164('+447911123456'), '+44 ••••••3456');

  // The visible tail is always exactly the last four digits.
  for (const value of ['+17185550123', '+447911123456', '+3161234567']) {
    const masked = maskE164(value);
    assert.ok(masked.endsWith(value.slice(-4)), `${masked} should end in the real last four`);
    const revealed = masked.replace(/[^\d]/g, '');
    assert.equal(
      revealed.length,
      // calling code + four; nothing else survives.
      value.slice(-4).length + masked.slice(1, masked.indexOf(' ')).length,
      `${masked} must reveal only the dial code and the last four`
    );
  }

  // Not E.164 in the first place: shown as-is rather than mangled.
  assert.equal(maskE164('718-555-0123'), '718-555-0123');
});

// ===========================================================================
// FIX-RUN B2 — the signed-out entry buttons never dead-end
// ===========================================================================
// lib/phoneAuth/mode.ts executed for real (its one import is type-only, which
// stripping removes). Only the real provider is live; every other mode sends
// "Continue with phone" to the email sign-up and "I already have an account"
// to email sign-in, and hides "Use Phone Number Instead".

const { phoneEntryRoutes } = await import(toDataUrl(strip('lib/phoneAuth/mode.ts')));

test('B2 · phoneEntryRoutes: only supabase reaches the phone screens', () => {
  for (const mode of ['disabled', 'mock']) {
    assert.deepEqual(phoneEntryRoutes(mode), {
      live: false,
      createAccount: 'EmailCreateAccount',
      signIn: 'EmailSignIn',
    });
  }
  assert.deepEqual(phoneEntryRoutes('supabase'), {
    live: true,
    createAccount: 'CreateAccount',
    signIn: 'SignIn',
  });
});

test('B2 · Welcome routes through PHONE_ENTRY and the email screens gate their phone button on it', () => {
  const welcome = read('screens/WelcomeScreen.tsx');
  assert.match(welcome, /import \{ PHONE_ENTRY \} from '\.\.\/lib\/phoneAuth';/);
  assert.doesNotMatch(welcome, /navigation\.navigate\('(CreateAccount|SignIn)'\)/);
  assert.match(read('lib/phoneAuth/index.ts'), /export const PHONE_ENTRY = phoneEntryRoutes\(resolution\.mode\);/);
  for (const path of ['screens/EmailSignInScreen.tsx', 'screens/EmailCreateAccountScreen.tsx']) {
    const src = read(path);
    assert.match(src, /\{PHONE_ENTRY\.live && \(\s*<AuthButton\s+title="Use Phone Number Instead"/, `${path} hides the phone button while SMS is off`);
  }
});

// ===========================================================================
// FIX-RUN B15 — the env schema accepts every value the resolver accepts
// ===========================================================================

test('B15 · EXPO_PUBLIC_PHONE_AUTH_MODE: the schema enum is the resolver\'s recognised set, normalised the same way', () => {
  const env = read('config/env.ts');
  const schema = env.match(/EXPO_PUBLIC_PHONE_AUTH_MODE: z\.preprocess\(normalized, z\.enum\(\[([^\]]+)\]\)\.optional\(\)\)/);
  assert.ok(schema, 'the phone-auth entry is a normalised, optional enum with no default of its own');
  const accepted = [...schema[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  const resolver = read('lib/phoneAuth/mode.ts');
  const recognised = [...resolver.matchAll(/raw === '([a-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(accepted, recognised);
  assert.deepEqual(accepted, ['disabled', 'mock', 'supabase']);
  // Both read the value trimmed and lower-cased.
  assert.match(resolver, /\.trim\(\)\.toLowerCase\(\)/);
  assert.match(env, /function normalized\(value: unknown\): unknown \{\s*return typeof value === 'string' \? value\.trim\(\)\.toLowerCase\(\) : value;/);
});

test('C7 · no tracked file shows a real phone number — the placeholder and every fixture use 555-01xx', async () => {
  const { execFileSync } = await import('node:child_process');
  const placeholder = read('components/PhoneNumberInput.tsx');
  assert.match(placeholder, /placeholder=\{isNanp\(country\) \? '718 555 0123' : 'Phone number'\}/);
  // Built from pieces so this file never carries the number it hunts for.
  const real = new RegExp(['347', '320', '0610'].join('[ -]?') + '|' + ['347', '320', '0610'].join(''));
  // Nothing is left out: the mockup tree, the dispatch briefs and the recorded patch it once
  // excluded moved to _archive/ in D8 and are no longer tracked.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
  assert.ok(tracked.length > 100, `expected a populated tracked-file list, got ${tracked.length}`);
  const hits = [];
  for (const file of tracked) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    if (real.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});
