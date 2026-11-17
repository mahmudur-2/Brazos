import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './loadModule.mjs';

/**
 * C8 (A4-M4) — a NANP entry whose listed dial carries its area code ('1868'
 * for Trinidad and Tobago) is still country code +1: its numbers are stored
 * as '+1' and ten digits, never as '+1868' and ten more.
 *
 * Every number here is a synthetic 555-01xx number (the NANP range kept for
 * fiction in every area code), never a real person's.
 */

const countries = await loadModule('lib/countries.ts', {});
const phone = await loadModule('lib/phoneNumber.ts', { './countries': countries });
const { fromE164, formatNational, maskE164, phoneValidationError, splitInternational, toE164 } = phone;

const LOCAL = '5550123';
const withArea = countries.COUNTRIES.filter((c) => c.dial.startsWith('1') && c.dial.length === 4);
const BS = countries.findCountry('BS');
const US = countries.DEFAULT_COUNTRY;
const CA = countries.findCountry('CA');

test('C8: every NANP entry with its area code in the dial stores +1 and ten digits, however the number is typed or pasted', () => {
  assert.ok(withArea.length >= 19, `the list holds the NANP territories (saw ${withArea.length})`);
  for (const country of withArea) {
    const area = country.dial.slice(1);
    const stored = `+1${area}${LOCAL}`;
    assert.equal(stored.length, 12, '+1 and ten digits');
    const shapes = {
      'the 7 digits after the pill': LOCAL,
      'the 7 digits grouped': '555 0123',
      'the whole 10-digit number': `${area}${LOCAL}`,
      'the whole number with a leading 1': `1${area}${LOCAL}`,
      'the whole number with punctuation': `(${area}) 555-0123`,
    };
    for (const [shape, typed] of Object.entries(shapes)) {
      assert.equal(phoneValidationError(country, typed), null, `${country.code}: ${shape} is accepted`);
      assert.equal(toE164(country, typed), stored, `${country.code}: ${shape} is stored as +1 and ten digits`);
    }

    // Pasted with its calling code: the country control moves to this entry, the field keeps the 7 digits.
    const pasted = splitInternational(`+1 ${area} 555 0123`);
    assert.equal(pasted.country.code, country.code, `${country.code}: a pasted number finds its entry by area code`);
    assert.equal(pasted.national, LOCAL);
    assert.equal(toE164(pasted.country, pasted.national), stored);

    // Read back from a profile, then saved again: the same value.
    const back = fromE164(stored);
    assert.equal(back.country.code, country.code, `${country.code}: the stored value comes back on its own entry`);
    assert.equal(toE164(back.country, back.national), stored);

    // Shown the way it is dialled there, and named back with the pill's own code.
    assert.equal(formatNational(country, LOCAL), '555 0123');
    assert.equal(maskE164(stored), `+${country.dial} ••• 0123`);
  }
});

test('C8: +1242 followed by ten more digits is refused, never sent as some other number', () => {
  const pasted = splitInternational('+1242 555 012 3456');
  assert.equal(pasted.country.code, 'BS');
  assert.equal(pasted.national, '5550123456');
  assert.equal(phoneValidationError(pasted.country, pasted.national), 'Enter a 7-digit phone number.');
  assert.equal(toE164(pasted.country, pasted.national), null);

  // Ten digits under the Bahamas pill are taken only when they carry the Bahamas area code.
  assert.equal(toE164(BS, '2425550123'), '+12425550123');
  assert.equal(toE164(BS, '7185550123'), null);
  // Neither 7 nor 10: refused, with the sentence that fits the pill.
  for (const typed of ['555012', '55501234', '242555012']) {
    assert.equal(phoneValidationError(BS, typed), 'Enter a 7-digit phone number.', `${typed.length} digits`);
    assert.equal(toE164(BS, typed), null);
  }
});

test('C8: the US and Canada still take exactly ten digits, and a half-typed number is never sent', () => {
  for (const country of [US, CA]) {
    assert.equal(toE164(country, '7185550123'), '+17185550123');
    assert.equal(phoneValidationError(country, '718555'), 'Enter a 10-digit phone number.');
    assert.equal(toE164(country, '718555'), null);
    assert.equal(toE164(country, '5550123'), null, 'a 7-digit number has no area code to add on plain +1');
    assert.equal(toE164(country, '447911123456'), null, 'twelve digits are not a NANP number');
  }
  assert.equal(formatNational(US, '5550123'), '555 012 3', 'plain +1 keeps the 3-3-4 grouping while typing');
});
