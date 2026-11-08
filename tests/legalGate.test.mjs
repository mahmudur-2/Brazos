import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const gate = read('screens/LegalGateScreen.tsx');
const legalIndex = read('lib/legal/index.ts');

// ===========================================================================
// The document set, executed rather than restated
// ===========================================================================
// lib/legal/index.ts imports the Supabase client, so only the parts that are
// pure data can be run here: the two document modules and the version
// constants are read as text and checked for the properties the gate relies
// on.

test('there is exactly one copy of each legal document, and the gate owns none of it', () => {
  // The bodies live in their own modules and are re-exported once.
  assert.match(legalIndex, /import \{ PRIVACY_POLICY \} from '\.\/privacyPolicy'/);
  assert.match(legalIndex, /import \{ TERMS_OF_SERVICE \} from '\.\/termsOfService'/);

  // The gate renders them, never restates them. Anything long and quoted in
  // this screen would be a second, drifting copy of the legal text.
  // Single-line literals only — a multi-line backtick pattern pairs the
  // closing tick of one template with the opening tick of the next and
  // "matches" ordinary code in between.
  const longLiterals = (gate.match(/'[^'\n]{200,}'|"[^"\n]{200,}"|`[^`\n]{200,}`/g) ?? []).length;
  assert.equal(longLiterals, 0, 'the gate must not carry its own legal prose');
  assert.match(gate, /import \{\s*[\s\S]*?\} from '\.\.\/lib\/legal'/);
});

test('both required documents are driven from the shared list', () => {
  // Not two hardcoded rows: adding a third required document must light up a
  // third row without touching this screen.
  assert.match(gate, /REQUIRED_DOCUMENTS\.map\(/);
  assert.match(legalIndex, /export const REQUIRED_DOCUMENTS/);
  assert.match(legalIndex, /LEGAL_DOCUMENTS\.terms,\s*\n\s*LEGAL_DOCUMENTS\.privacy,/);
});

// ===========================================================================
// The status row cannot be completed by hand
// ===========================================================================

test('the status indicator is a status, not a switch', () => {
  // A Switch here would say "you may turn this on", which is exactly what the
  // user must not be able to do.
  assert.doesNotMatch(gate, /<Switch/, 'a togglable control would misrepresent the gate');
  // Two branches, and neither is a control: a check once done, an empty ring
  // until then.
  assert.match(gate, /name="checkmark-circle"/);
  assert.match(gate, /name="ellipse-outline"/);
  assert.doesNotMatch(gate, /onPress=\{\(\) => setSeen/, 'nothing may complete a document by tap');
  // Announced as a button that opens the document, not as a checkbox.
  assert.match(gate, /accessibilityHint="Opens this document"/);
});

test('opening a document does not complete it — only reaching its end does', () => {
  // Completion is written in exactly one place, and only two things call it —
  // both of them measurements of the document, not of a press.
  const writes = gate.match(/setSeen\(\(prev\)/g) ?? [];
  assert.equal(writes.length, 1, `completion should have one writer, saw ${writes.length}`);

  const callers = gate.match(/markSeen\(/g) ?? [];
  assert.equal(callers.length, 3, 'markSeen: one definition, two call sites');

  for (const fn of ['onScroll', 'onContentSizeChange']) {
    const body = gate.slice(gate.indexOf(`function ${fn}(`));
    assert.match(
      body.slice(0, body.indexOf('\n  }')),
      /markSeen\(/,
      `${fn} should be one of the two callers`
    );
  }

  // Switching document is navigation only.
  const switchBody = gate.slice(gate.indexOf('function switchTab('));
  assert.doesNotMatch(
    switchBody.slice(0, switchBody.indexOf('\n  }')),
    /setSeen|setAgreed/,
    'opening a document must not complete or agree to anything'
  );
});

test('a jump never completes the document it passes over', () => {
  // 2026-09-30 (the build run, group 1's review): tapping Privacy scrolled straight past Terms' end,
  // and the landing's scroll event completed Terms unread. A jumped-past document is held until the
  // reader's OWN scroll (a drag) brings its end into view.
  const switchBody = gate.slice(gate.indexOf('function switchTab('));
  assert.match(
    switchBody.slice(0, switchBody.indexOf('\n  }')),
    /blockTop\.current\[required\.key\] < blockTop\.current\[next\] && !seenNow\.current\[required\.key\]\) \{\s*skippedByJump\.current\.add\(required\.key\);/
  );
  assert.match(gate, /skippedByJump\.current\.has\(required\.key\) && !\(dragged\.current && contentOffset\.y <= end\)/);
  assert.match(gate, /if \(reached && !jumpedPast && !seen\[required\.key\]\) \{/);
  assert.match(gate, /onScrollBeginDrag=\{\(\) => \{\s*dragged\.current = true;/);
  // Two scroll events can land before a re-render: the completion is written once, synchronously.
  assert.match(gate, /function markSeen\(key: LegalDocumentKey\) \{\s*if \(seenNow\.current\[key\]\) return;\s*seenNow\.current\[key\] = true;/);
});

test('reaching the end is measured with a tolerance, not pixel equality', () => {
  // 2026-09-30 (decision F): both documents are ONE scroll now, so the end is each document's own
  // block end — the same forgiving 48pt, and an unmeasured block (end 0) can complete nothing.
  assert.match(
    gate,
    /const reached = end > 0 && layoutMeasurement\.height \+ contentOffset\.y >= end - 48;/,
    'a forgiving threshold, so a rounding error cannot make the gate unpassable'
  );
  // Documents shorter than the viewport can never be scrolled, so they count on sight rather than
  // trapping the user — both at once, since both are in view.
  assert.match(gate, /h <= viewportHeight\.current\) \{\s*for \(const required of REQUIRED_DOCUMENTS\) if \(!seen\[required\.key\]\) markSeen\(required\.key\);/);
});

test('each document is tracked separately', () => {
  assert.match(gate, /useState<Record<LegalDocumentKey, boolean>>\(\{\s*\n\s*terms: false,\s*\n\s*privacy: false,/);
  // Only the named document is written, never both.
  assert.match(gate, /\.\.\.prev, \[key\]: true/);
  assert.match(gate, /const bothSeen = seen\.terms && seen\.privacy;/);
});

// ===========================================================================
// Scrolling both is necessary but not sufficient
// ===========================================================================

test('reading both documents still does not accept them', () => {
  // The checkbox is a separate, explicit act. bothSeen only unlocks it.
  assert.match(gate, /const canCheck = bothSeen;/);
  assert.match(gate, /onPress=\{\(\) => canCheck && setAgreed\(\(v\) => !v\)\}/);
  assert.match(gate, /disabled=\{!canCheck\}/);
});

test('the CTA needs the explicit agreement AND both documents', () => {
  // 2026-09-28 (LUX-LIST-64 #10): one button — while both are not read it offers
  // the document still owed; once both are, it agrees, and only with the box ticked.
  assert.match(gate, /disabled=\{bothSeen \? !agreed : !reviewReady\}/);
  assert.match(gate, /bothSeen \|\| !reviewTarget \? handleContinue :/);
  // …and the handler re-checks rather than trusting the disabled prop alone.
  const handler = gate.slice(gate.indexOf('async function handleContinue()'));
  assert.match(handler.slice(0, 200), /if \(!agreed \|\| !bothSeen \|\| saving\) return;/);
});

test('a double tap cannot record acceptance twice', () => {
  const handler = gate.slice(gate.indexOf('async function handleContinue()'));
  assert.match(handler.slice(0, 200), /\|\| saving\) return;/);
  assert.match(gate, /loading=\{saving\}/);
});

test('backing out before agreeing leaves nothing recorded', () => {
  // The only exit that is not acceptance signs the user out; it records
  // nothing on the way.
  const signOut = gate.slice(gate.indexOf('async function handleSignOut()'));
  const body = signOut.slice(0, signOut.indexOf('\n  }'));
  assert.doesNotMatch(body, /acceptCurrentDocuments|onAccepted/);
  assert.match(body, /await logout\(\)/);
});

// ===========================================================================
// Persistence: the existing versioned record, and nothing new
// ===========================================================================

test('acceptance goes through the existing versioned RPC only', () => {
  assert.match(gate, /await acceptCurrentDocuments\(\)/);
  // No second store, no local mirror, no direct table write from the screen.
  assert.doesNotMatch(gate, /AsyncStorage|from\('legal_acceptances'\)|\.insert\(/);
  assert.doesNotMatch(gate, /supabase/, 'the screen goes through lib/legal, not the client');

  // The record is per document AND per version, timestamped by the database.
  assert.match(legalIndex, /supabase\.rpc\('accept_legal_documents'/);
  assert.match(legalIndex, /document: doc\.key,\s*\n\s*version: doc\.version,/);

  // Scoped to what the call actually sends — the LegalAcceptance row type
  // declares accepted_at, which is the column, not a client-supplied value.
  const call = legalIndex.slice(legalIndex.indexOf('export async function acceptCurrentDocuments'));
  assert.doesNotMatch(call, /accepted_at:/, 'the DB clock owns the timestamp');
});

test('nothing is written for a user who is not authenticated', () => {
  const hook = read('hooks/useLegalGate.ts');
  // The gate is only ever mounted for a signed-in user (App.tsx), and the
  // check short-circuits without one.
  assert.match(hook, /if \(!user\) \{\s*\n\s*setState\('accepted'\);/);
  assert.match(read('App.tsx'), /if \(!user\) return <AuthFlow \/>;/);
  // The RPC carries no user id: the database takes it from the caller's JWT,
  // so one user can never record acceptance for another. Scoped to the call
  // itself — the LegalAcceptance row type names the column, as it should.
  const call = legalIndex.slice(legalIndex.indexOf('export async function acceptCurrentDocuments'));
  assert.doesNotMatch(call, /p_user_id|user_id/);
  // No service-role path anywhere near it.
  assert.doesNotMatch(legalIndex, /service_role|auth\.admin/);
});

test('a version bump re-prompts, which is what makes this a gate and not a flag', () => {
  assert.match(legalIndex, /const accepted = new Set\(\(data \?\? \[\]\)\.map\(\(r\) => `\$\{r\.document\}:\$\{r\.version\}`\)\)/);
  assert.match(legalIndex, /!accepted\.has\(`\$\{doc\.key\}:\$\{doc\.version\}`\)/);
});

// ===========================================================================
// The polish must not have cost anything
// ===========================================================================

test('completion is spelled out, never carried by colour alone', () => {
  // Visible state, including which document to read next.
  assert.match(gate, /done \? 'Read to the end' : isNext \? 'Read this next' : 'Not finished'/);
  // …and the same thing again for a screen reader.
  assert.match(gate, /done \? 'Read to the end\.' : 'Not finished\.'/);
  assert.match(gate, /`\$\{LEGAL_DOCUMENTS\[key\]\.title\} review complete`/);
});

// ---------------------------------------------------------------------------
// Guidance, unlock and the announcements that carry them
// ---------------------------------------------------------------------------

test('the scroll hint appears, then leaves on its own and on first scroll', () => {
  assert.match(gate, /Scroll to the end to continue/);
  // Two ways out, so it can never become something to get past.
  assert.match(gate, /setTimeout\(\(\) => \{\s*\n\s*if \(mounted\.current\) setGuidanceDismissed\(true\);/);
  const onScroll = gate.slice(gate.indexOf('function onScroll('));
  assert.match(onScroll.slice(0, onScroll.indexOf('\n  }')), /setGuidanceDismissed\(true\)/);
  // It must never take a touch away from the document underneath it.
  assert.match(gate, /pointerEvents="none"/);
  assert.match(gate, /accessibilityElementsHidden/);
});

test('the agreement unlock is announced, and only once', () => {
  assert.match(gate, /Both documents reviewed\. Agreement is now available\./);
  assert.match(gate, /if \(!bothSeen \|\| wasUnlocked\.current\) return;/);
  // Reaching the end of a document announces that document by name.
  assert.match(gate, /review complete/);
});

test('the next document is offered explicitly, never forced', () => {
  // 2026-09-28 (LUX-LIST-64 #10): offered by the one bottom button, which names
  // the document still owed; still a button, still never automatic.
  assert.match(gate, /`Review \$\{reviewTarget\.title\}`/);
  assert.match(gate, /\(\) => switchTab\(reviewTarget\.key\)/);
  // The offer is a button; nothing navigates on its own.
  assert.doesNotMatch(gate, /useEffect\([^)]*switchTab/);
});

test('reduced motion still completes every state', () => {
  // Each animation has a reduced-motion branch that jumps to the end value
  // rather than being skipped, so no state is only reachable by animating.
  assert.match(gate, /if \(reducedMotion\) \{\s*\n\s*unlock\.setValue\(1\);/);
  assert.match(gate, /if \(reducedMotion\) \{\s*\n\s*check\.setValue\(1\);/);
});

test('the gate is on the auth palette and hardcodes no colour of its own', () => {
  assert.match(gate, /from '\.\.\/lib\/authTheme'/);
  assert.doesNotMatch(gate, /#[0-9A-Fa-f]{6}/, 'colours come from tokens, never hex literals');
  // 2026-09-27 (the Lux remake, ruling 15): the gate follows the scheme —
  // "There is no dark mode" — so every colour is a palette role resolved at
  // render through the one palette read, and the Lux ground rides its root.
  assert.match(gate, /from '\.\.\/lib\/theme'/, 'the palette is the resolved one');
  assert.match(gate, /const \{ palette: colors, isDark \} = useThemeColors\(\);/);
  assert.match(gate, /screenGround\(colors, isDark\)/);
  assert.doesNotMatch(gate, /authColors\./, 'no Heritage literal survives');
});

test('the screen still owns its safe area and stays readable on a wide window', () => {
  assert.match(gate, /edges=\{\['top', 'bottom', 'left', 'right'\]\}/);
  assert.match(gate, /maxWidth: authSizes\.maxContentWidth/);
  // Touch targets survive the tighter layout: the roomy row is 48, and the
  // compact variant sits exactly on the 44pt floor, never under it.
  assert.match(gate, /minHeight: 48/);
  assert.match(gate, /statusRowCompact: \{\s*\n\s*minHeight: 44/);
  assert.ok((gate.match(/minHeight: 44/g) ?? []).length >= 2);
});

test('the reader is what grows, and the chrome is what gives way', () => {
  // The document container takes whatever the fixed blocks leave, so the fix
  // for a cramped reader is tightening them — not resizing the reader.
  assert.match(gate, /docWrapper: \{\s*\n\s*flex: 1,/);
  // Below the height where everything cannot fit, the intro line and some
  // type scale are dropped rather than letting the reader collapse.
  assert.match(gate, /const compact = windowHeight < 700;/);
  assert.match(gate, /\{compact \? null : \(/);
  assert.match(gate, /compact && styles\.titleCompact/);
  assert.match(gate, /compact && styles\.statusRowCompact/);
  assert.match(gate, /compact && styles\.footerCompact/);
});

test('shared components used by other screens were not repainted for this one', () => {
  // The in-app palette still belongs to the in-app surface: SegmentedControl
  // has four other consumers and MarkdownText one, so neither was touched.
  for (const path of ['components/SegmentedControl.tsx', 'components/MarkdownText.tsx']) {
    assert.match(read(path), /from '\.\.\/lib\/theme'/, `${path} keeps the in-app palette`);
  }
  assert.doesNotMatch(gate, /SegmentedControl/, 'the status rows replaced it here only');
});

// ===========================================================================
// Privacy-policy factual contract (2026-08-18 corrections)
// ===========================================================================

test('the privacy policy states the deletion and media facts the code proves', () => {
  const policy = read('lib/legal/privacyPolicy.ts');

  // The working-draft banner survives every edit until counsel reviews it.
  assert.match(policy, /Working draft — pending legal review/);

  // Deletion is the real in-app control (ProfileStack registers
  // DeleteAccount), not the old reporting-tool workaround.
  assert.match(policy, /You can delete your account in the app: Profile → Delete Account\./);
  assert.doesNotMatch(
    policy,
    /request deletion of your account at any time through the in-app\s*reporting tool/
  );

  // What deletion actually does (phase67): deactivate + delete the sign-in
  // identity + scrub the profile; job content may be retained; storage files
  // are NOT yet auto-removed (phase67 header: "No storage cleanup").
  assert.match(policy, /deactivate your account, permanently delete your sign-in\s*identity/);
  assert.match(policy, /not yet automatically removed from storage/);
  assert.doesNotMatch(
    policy,
    /On deletion we remove your profile, your photos/,
    'the old photos-are-removed claim must not return'
  );

  // Completion media honesty: the shared job-photos bucket is public
  // (lib/storage.ts), so the policy must say a direct file link could reach
  // the file until private storage lands.
  assert.match(policy, /public storage bucket/);
  assert.match(policy, /private storage for completion media is planned/);

  // The Terms module still exports the one document the gate renders. (The
  // old "COMMIT 11 — do not touch termsOfService.ts" rule ended with FIX-RUN
  // B1, which rewrote its payment facts; the test below pins those.)
  assert.match(read('lib/legal/termsOfService.ts'), /TERMS_OF_SERVICE/);
});

// ===========================================================================
// FIX-RUN B1 (2026-10-03, pick B1a) — the legal facts match the app
// ===========================================================================

test('B1 · Terms and Privacy state the payment facts, name every processor, and publish the contact', async () => {
  const terms = read('lib/legal/termsOfService.ts');
  const policy = read('lib/legal/privacyPolicy.ts');

  for (const [name, doc] of [['terms', terms], ['privacy', policy]]) {
    // The draft notice stays until counsel signs off (B1a).
    assert.match(doc, /Working draft — pending legal review/, `${name} keeps the draft notice`);
    // The old false sentence never returns.
    assert.doesNotMatch(doc, /does not (currently )?process payments/i, `${name} no longer denies processing payments`);
    // The contact is the published support address, through the one constant.
    assert.match(doc, /import \{ SUPPORT_EMAIL \} from '\.\.\/appLinks';/, `${name} imports the address`);
    assert.match(doc, /email \$\{SUPPORT_EMAIL\}/, `${name} names it as the contact`);
    assert.doesNotMatch(doc, /in-app reporting tool until a published/, `${name} drops the old placeholder contact`);
    // The defined term is "Customer" (C3).
    assert.doesNotMatch(doc, /\bClients?\b/, `${name} says Customer, not Client`);
  }

  // Terms §4: Stripe, accept = fund, held until approval, the 72-hour release,
  // cancellation as cancel_job() decides it, payouts, tips, saved cards.
  assert.match(terms, /Payments in Brazos are processed by Stripe/);
  assert.match(terms, /Accepting a bid books and pays for the job/);
  assert.match(terms, /Brazos holds the payment, through Stripe,\s+until the Customer approves the finished work/);
  assert.match(terms, /within 72\s+hours of being told the work is complete, the payment is released\s+automatically/);
  assert.match(terms, /Cancelling is free more than\s+24 hours before the arrival window starts, within 15 minutes of hiring/);
  assert.match(terms, /The Protection fee is refunded in full whenever a job is\s+cancelled/);
  assert.match(terms, /payout\s+account the Worker sets up with Stripe/);
  // C4 review: one fee name — the app says "Protection fee" and "after the fee", never "service fee".
  assert.doesNotMatch(terms, /service fee/i, 'the Terms name no fee the app never shows');
  // B1 review: the card path with Stripe test keys shows no "Test mode" label (that is sandbox
  // copy), so the Terms may not promise the app announces test mode.
  assert.match(terms, /payments may run in a test mode, in which test cards are used\s+and no real money moves/);
  assert.doesNotMatch(terms, /says so wherever that applies/);

  // Privacy: every processor by name, on-device speech, the 90-day prune, and
  // deletion as A18a built it (live location left with lean D3b).
  for (const processor of ['Supabase', 'Expo', 'Stripe', 'Resend', 'OpenStreetMap Nominatim', 'Sentry', 'PostHog']) {
    assert.ok(policy.includes(processor), `the policy names ${processor}`);
  }
  assert.match(policy, /turned into\s+text on your device/);
  assert.match(policy, /removed after 90 days/);
  assert.match(policy, /Any card you saved is removed from Stripe before the account\s+goes/);
  assert.match(policy, /payout account stays open until every payment still owed to\s+them has reached\s+it/);

  // Both versions moved, in the exact shape scripts/shots.mjs parses.
  const index = read('lib/legal/index.ts');
  const pick = (name) => index.match(new RegExp(`export const ${name} = '([^']+)';`))?.[1];
  for (const name of ['TERMS_VERSION', 'PRIVACY_VERSION']) {
    assert.ok(pick(name), `${name} keeps the export const shape`);
    assert.notEqual(pick(name), '2026-07-26-draft1', `${name} was bumped`);
  }
});
