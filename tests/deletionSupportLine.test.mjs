import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * B4 (production-36h, the lane's ticket T4) — A BLOCKER THE APP CANNOT SETTLE NAMES SUPPORT. A
 * payment the person SENT (payment_outgoing) has no screen to open, and neither has a kind the app
 * does not know. Such a row carries the server's own last sentence of a refused deletion
 * (20261116410000_account_deletion_process.sql, delete_my_account's detail: ' Contact support if
 * you need help.') and the support address from lib/appLinks.ts, opened as a mailto.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

const { CONTACT_SUPPORT_LINE, formatBlockerList } = await import(
  pathToFileURL(join(root, 'lib/accountDeletionBlockers.ts')).href
);

test('a payment the person sent, and an unknown kind, carry the support line; a routed row does not', () => {
  assert.equal(CONTACT_SUPPORT_LINE, 'Contact support if you need help.');
  const { rows } = formatBlockerList([
    { kind: 'payment_outgoing', ref_id: 'p1', label: 'Payment you sent', detail: 'Part of your refund has not reached your card yet.' },
    { kind: 'refund_pending', ref_id: null, label: 'A refund', detail: 'Not finished.' },
    { kind: 'job', ref_id: 'j1', label: 'Move a sofa', detail: 'A worker is assigned to this job.' },
    { kind: 'payment_incoming', ref_id: 'p2', label: 'Payment owed to you', detail: 'This tip has not reached your payout account yet.' },
    { kind: 'dispute', ref_id: 'j2', label: 'Open dispute', detail: 'A dispute on this job has to be resolved before this account can be deleted.' },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.route, r.support]),
    [[null, true], [null, true], ['Job', false], ['Earnings', false], ['Job', false]]
  );
});

test('[static] the row shows the line and the address, opened as a mailto with no canOpenURL', () => {
  const screen = flat(read('screens/DeleteAccountScreen.tsx'));
  assert.match(screen, /\{row\.support \? \( <> <Text style=\{styles\.blockerDetail\}>\{CONTACT_SUPPORT_LINE\}<\/Text> <Button title=\{SUPPORT_EMAIL\} variant="ghost"/);
  assert.match(screen, /onPress=\{\(\) => void openSupportMail\(\)\}/);
  // T3: the one opener in lib/appLinks.ts (executed in tests/supportContact.test.mjs).
  assert.match(screen, /import \{ openSupportMail, SUPPORT_EMAIL \} from '\.\.\/lib\/appLinks';/);
  assert.match(screen, /import \{ Button \} from '\.\.\/ui\/primitives';/);
  assert.doesNotMatch(screen, /canOpenURL|brazosmvp/);
  // The support line never makes a row pressable: only a routed row is.
  assert.match(screen, /if \(!row\.route\) return <Card level="well" style=\{styles\.blockerRow\}>\{body\}<\/Card>;/);
});
