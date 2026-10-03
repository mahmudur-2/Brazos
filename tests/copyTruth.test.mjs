import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Tier A (C3, C5, C6) — the truth sweep, pinned so it cannot creep back
// ---------------------------------------------------------------------------
//
// Every sentence below was replaced because the app could not prove it, or
// because the brand sat mid-sentence where a plain word belonged. The new
// sentence is pinned present and the old one pinned absent, on the
// comment-stripped source, so a later edit that restores a claim fails here.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (path) => stripComments(read(path));

test('C3 · ApproveOrDispute in stripe mode: approving sends the payment on its way; the sandbox sentence is unchanged', () => {
  const approve = code('screens/ApproveOrDisputeScreen.tsx');
  assert.match(approve, /'Approving sends this payment on its way to the worker\. If something isn’t right, report the issue instead — release waits while a report is open\.'/);
  assert.doesNotMatch(approve, /Approving releases this payment/);
  assert.match(approve, /'Approving releases these funds to the worker\. If something isn’t right, report the issue instead — release waits while a report is open\. Test mode, no real money\.'/);
});

test('C5 · the brand is out of prose at the named sites', () => {
  const post = code('screens/PostJobScreen.tsx');
  assert.match(post, /'Saving updates this existing job for workers nearby\.'/);
  assert.match(post, /'Publishing makes this job visible to workers nearby\.'/);
  assert.doesNotMatch(post, /workers browsing BRAZOS/);
  for (const file of ['screens/JobDetailScreen.tsx', 'components/MarketJobPreview.tsx']) {
    assert.match(code(file), /poster\.full_name \?\? 'Customer'/, `${file}: the poster fallback is a plain word`);
    assert.doesNotMatch(code(file), /BRAZOS customer/);
  }
  // 2026-09-29 (LUX-LIST-2 #7): the Privacy Policy row moved to the Profile hub's Legal dropdown,
  // its line with it (the row's spoken hint).
  assert.match(code('screens/ProfileScreen.tsx'), /hint: 'How your data is protected\.'/);
  assert.match(code('screens/DeleteAccountScreen.tsx'), /'Your account has been deleted\. Reviews you wrote or received stay on the marketplace/);
  // n5 (2026-09-04): Welcome leads with email and keeps phone second; both
  // create-account hints stay brand-free (tests/firstSession.test.mjs pins the order).
  assert.match(code('screens/WelcomeScreen.tsx'), /accessibilityHint="Create an account with your email"/);
  assert.match(code('screens/WelcomeScreen.tsx'), /accessibilityHint="Create an account with your phone number"/);
});

/** Every .tsx under screens/ and components/. */
function clientScreens() {
  const files = [];
  for (const dir of ['screens', 'components']) {
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(join(root, dir));
  }
  return files;
}

test('C5 · no mid-sentence brand use remains in screens/ or components/ — what is left is chrome', () => {
  // The brand as a modifier or an object inside a sentence: "BRAZOS customer",
  // "browsing BRAZOS", "How BRAZOS …", "Your BRAZOS …", "a BRAZOS …".
  const midSentence = /\b(?:browsing|How|Your|a|the) BRAZOS\b|\bBRAZOS (?:customer|worker|account)\b/;
  const offenders = [];
  for (const file of clientScreens()) {
    for (const line of code(file).split('\n')) {
      if (midSentence.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
  // The chrome that stays, by name — a wordmark, a heading, a tagline, an
  // eyebrow, a public page's "get the app" line, the logo's label.
  const chrome = ['screens/LaunchScreen.tsx', 'screens/WelcomeScreen.tsx', 'screens/SignInScreen.tsx', 'screens/EmailSignInScreen.tsx', 'screens/HomeScreen.tsx', 'screens/CompareBidsScreen.tsx', 'screens/PublicProfileScreen.tsx', 'components/BrandLogo.tsx'];
  for (const file of clientScreens()) {
    if (chrome.includes(file)) continue;
    assert.doesNotMatch(code(file), /BRAZOS/, `${file} names the brand outside the chrome list`);
  }
});

test('C6 · the unprovable claims are gone: verification, the photo statistic, "Book", "Potential Earnings"', () => {
  const welcome = code('screens/WelcomeScreen.tsx');
  assert.match(welcome, />Local workers</);
  assert.doesNotMatch(welcome, /Verified workers/);

  const post = code('screens/PostJobScreen.tsx');
  // 2026-09-28 (LUX-LIST-64 #32): the photo nudge that carried the honest
  // sentence is gone entirely — and the statistic stays gone with it.
  assert.doesNotMatch(post, /Add photos so workers can see the work\./);
  assert.doesNotMatch(post, /Jobs with a photo get more bids/);

  const profile = code('screens/WorkerProfileScreen.tsx');
  assert.match(profile, /'Request at listed price'/);
  assert.doesNotMatch(profile, /'Book at listed price'/);

  const home = code('screens/WorkerHomeScreen.tsx');
  assert.match(home, />NEARBY DEMAND</);
  assert.doesNotMatch(home, /POTENTIAL EARNINGS/);
  // The pair beneath it stays a fact: the summed budgets and the real count.
  assert.match(home, /formatBudget\(potential\.cents\)/);
  assert.match(home, /across \$\{potential\.count\}/);
});

test('C6 · the seeded price range renders OFF behind PRICE_GUIDANCE, default false', () => {
  const flags = code('lib/featureFlags.ts');
  assert.match(flags, /export const PRICE_GUIDANCE = false as boolean;/);
  const post = code('screens/PostJobScreen.tsx');
  assert.match(post, /import \{ PRICE_GUIDANCE \} from '\.\.\/lib\/featureFlags';/);
  assert.match(post, /const guidanceLines = isFreshPost && PRICE_GUIDANCE \? priceGuidanceLines\(category\) : null;/);
  // The guidance module itself is untouched — its own fence (tests/conversion.test.mjs §3.2) still executes it.
  assert.match(read('lib/priceGuidance.ts'), /export function priceGuidanceLines\(/);
});

// ---------------------------------------------------------------------------
// FIX-RUN B5 (2026-10-03) — no developer sentence reaches a screen
// ---------------------------------------------------------------------------
// "this build", "ledger rows", "a database row you can audit", "simple
// declarations", "Run `eas init`", "SANDBOX", "simulated": all rewritten as
// product copy, and the sandbox notices say "Test mode" inside their own mode
// guards (tests/paymentsMode.test.mjs proves the guards). This sweep reads every
// string with a space in it, and every JSX text run, in the app's screens and
// components and the two message modules — comments stripped — and refuses the
// developer vocabulary anywhere in them.

const DEV_WORDS = /this build|ledger|database row|simple declaration|sandbox|eas init|simulat/i;

function appFiles(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) {
      out.push(...appFiles(rel));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

function renderedStrings(src) {
  const body = stripComments(src);
  const out = [];
  // String literals that read as words (a space inside) — identifiers like
  // 'sandbox' or 'sandbox_cash_out' are code, not copy.
  for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    if (/\s/.test(text.trim()) && /[A-Za-z]{3}/.test(text)) out.push(text);
  }
  // JSX text runs: between a tag's closing `>` and the next `<`, no braces.
  for (const m of body.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)) out.push(m[1]);
  return out;
}

test('B5 · no developer vocabulary in any rendered string', () => {
  const files = [
    ...appFiles('screens'),
    ...appFiles('components'),
    'lib/errorMessage.ts',
    'lib/adapters/payments.ts',
    'lib/offerCopy.ts',
    'lib/payments/stripe.ts',
  ].filter((rel) => !rel.startsWith('components/DesignStudio') && !rel.includes('dev-tools'));
  const offenders = [];
  for (const rel of files) {
    for (const text of renderedStrings(read(rel))) {
      if (DEV_WORDS.test(text)) offenders.push(`${rel}: ${text.slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, [], 'rewrite these as product copy');
});

test('B5 · the rewritten lines are the product sentences', () => {
  assert.match(code('screens/EarningsScreen.tsx'), /'What you’ve earned, what’s held, what’s been paid'/);
  assert.match(code('screens/WorkerJobScreen.tsx'), /'The customer hasn’t paid yet\. Nothing is held for this job\.'/);
  // F20: Route & arrival is gone; its reassurance is WorkerJob's stage note.
  assert.match(code('screens/WorkerJobScreen.tsx'), /`Each tap tells \$\{clientName\} where things stand — nothing tracks your location\.`/);
  assert.match(code('screens/TrackWorkerScreen.tsx'), /If\s+they share their live location in chat, you’ll see it there\./);
  assert.match(code('screens/NotificationSettingsScreen.tsx'), /'Notifications aren’t available in this version\. Update Brazos to turn them on\.'/);
  assert.match(code('lib/adapters/payments.ts'), /'Payments aren’t available right now\. Nothing was charged or held\.'/);
  assert.match(code('lib/errorMessage.ts'), /'Can’t reach Brazos right now\. Check your connection and try again\.'/);
  assert.match(code('screens/CheckoutScreen.tsx'), /<Text style=\{styles\.summaryLabel\}>Pay by<\/Text>/);
});

// ---------------------------------------------------------------------------
// C3 (FIX-RUN 2026-10-03) — one word for each person and thing: customer (never
// client), job (never task). Code identifiers (client_id, ClientJobDetail) are
// not copy; a checklist's "tasks" count checklist items, not jobs.
// ---------------------------------------------------------------------------

test('[static] C3 · no screen or component says "client" or calls a job a "task"', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.web\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk('screens');
  walk('components');
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  const WORD = /\b[Cc]lients?\b|\b[Tt]asks?\b/;
  const hits = [];
  for (const file of files) {
    strip(read(file)).split('\n').forEach((line, index) => {
      // Rendered copy: quoted strings, template text (its ${…} code removed) and JSX text.
      const texts = [...line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map(
        (m) => m[1] ?? m[2] ?? (m[3] != null ? m[3].replace(/\$\{[^}]*\}/g, '') : m[4])
      );
      // A JSX text line on its own (no code punctuation once its {…} pieces are out).
      const bare = line.replace(/\{[^{}]*\}/g, ' ');
      if (/^\s*[A-Z][^=;(){}<>]*$/.test(bare)) texts.push(bare);
      for (const text of texts) {
        if (WORD.test(text) && !/^[a-z_./-]+$/.test(text.trim())) hits.push(`${relative(root, join(root, file))}:${index + 1}: ${text.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

// ---------------------------------------------------------------------------
// C2 / ruling H review (2026-10-03) — M-17's one noun per audience, kept: a customer reads
// "bid" for what a worker sends, and a worker's own bid is "your bid". These three lines had
// slipped to "offer" (Home's explainer, Compare bids' heading, JobDetail's push prompt, whose
// twin on SubmitBid already said bid).
// ---------------------------------------------------------------------------

test('[static] M-17 · the customer explainer, Compare bids and the bid push prompt say bid', () => {
  const home = code('components/HowBrazosWorks.tsx');
  assert.match(home, /Post free\. Get bids\. Pay only when you hire\./);
  assert.doesNotMatch(home, /Get offers/);
  const compare = code('screens/CompareBidsScreen.tsx');
  assert.match(compare, />Compare each bid in full\.</);
  assert.doesNotMatch(compare, /full offer/);
  const prompt = 'Get told the moment this customer accepts your bid — and when new jobs like this are posted.';
  for (const file of ['screens/JobDetailScreen.tsx', 'screens/SubmitBidScreen.tsx']) {
    assert.ok(code(file).includes(prompt), `${file} prompts with the bid sentence`);
  }
  assert.doesNotMatch(code('screens/JobDetailScreen.tsx'), /accepts your offer/);
});
