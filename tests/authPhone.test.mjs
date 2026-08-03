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
  assert.equal(toE164(US, '3473200610'), '+13473200610');
  // Typed with the reference's own display grouping.
  assert.equal(toE164(US, '347 320 0610'), '+13473200610');
  // Typed with a leading trunk 1.
  assert.equal(toE164(US, '13473200610'), '+13473200610');
  // Pasted in every common US shape.
  for (const pasted of [
    '+1 347 320 0610',
    '+1 (347) 320-0610',
    '+13473200610',
    '1-347-320-0610',
    '(347) 320-0610',
  ]) {
    const split = splitInternational(pasted);
    const [country, national] = split ? [split.country, split.national] : [US, pasted];
    assert.equal(toE164(country, national), '+13473200610', `failed for ${pasted}`);
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
  assert.equal(splitInternational('+13473200610').country.code, 'US');
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
  assert.equal(phoneValidationError(US, '347320'), 'Enter a 10-digit phone number.');
  assert.equal(phoneValidationError(US, '3473200610'), null);
  assert.equal(phoneValidationError(US, '347 320 0610'), null);
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
  assert.equal(formatNational(US, '3473200610'), '347 320 0610');
  assert.equal(formatNational(US, '347'), '347');
  assert.equal(formatNational(US, '3473'), '347 3');
  // Nothing is invented for a country whose grouping we don't know.
  assert.equal(formatNational(GB, '7911123456'), '7911123456');
});

test('a stored E.164 value round-trips back into the field', () => {
  const parsed = fromE164('+13473200610');
  assert.equal(parsed.country.code, 'US');
  assert.equal(parsed.national, '3473200610');
  assert.equal(toE164(parsed.country, parsed.national), '+13473200610');

  // Anything that isn't E.164 falls back to the default rather than guessing.
  assert.equal(fromE164('347-320-0610').country.code, 'US');
});

// ---------------------------------------------------------------------------
// Wiring: the screens have to actually use all of the above
// ---------------------------------------------------------------------------

test('the phone field is the only path from the auth flow to the backend', () => {
  const createAccount = read('screens/CreateAccountScreen.tsx');
  const input = read('components/PhoneNumberInput.tsx');

  // Normalised before it is handed over — never the raw field value.
  assert.match(createAccount, /const phone = toE164\(country, phoneDigits\)/);
  assert.match(createAccount, /signUp\(trimmedEmail, password, trimmedName, phone\)/);
  assert.match(createAccount, /phoneValidationError\(country, phoneDigits\)/);
  assert.match(createAccount, /useState<Country>\(DEFAULT_COUNTRY\)/);

  // The national field peels a pasted calling code off rather than keeping it.
  assert.match(input, /splitInternational\(text\)/);
  assert.match(input, /onChangeCountry\(international\.country\)/);
});

test('both submit handlers refuse to run twice concurrently', () => {
  for (const path of ['screens/SignInScreen.tsx', 'screens/CreateAccountScreen.tsx']) {
    assert.match(read(path), /if \(loading\) return;/, `${path} must guard double submission`);
  }
});
