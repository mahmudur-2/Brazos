import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FIX-RUN B3 (2026-10-03) — Apple guideline 1.2, user-generated content.
//
// Report + Block wherever another person's content is shown (not only chat and
// the inbox); an "Inappropriate content" reason; the reported subject recorded;
// a blocked person's posts, profiles and reviews out of the viewer's feeds; a
// word filter enforced by the database (supabase/tests/280_content_filter.sql
// proves that half); and the inbox's Support pill reaching a real contact.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MIGRATION = 'supabase/migrations/20261003000700_ugc_moderation.sql';

test('B3 · the reasons and subject kinds are the database allow-lists, exactly', () => {
  const moderation = read('lib/moderation.ts');
  const sql = read(MIGRATION);

  const reasons = [...moderation.slice(moderation.indexOf('export const REPORT_REASONS'), moderation.indexOf('] as const;')).matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1]);
  const dbReasons = [...sql.match(/reports_reason_valid\s+check \(reason = any \(array\[([^\]]+)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...reasons].sort(), [...dbReasons].sort());
  assert.ok(reasons.includes('inappropriate'));
  assert.match(moderation, /\{ value: 'inappropriate', label: 'Inappropriate content' \}/);

  const kinds = [...moderation.match(/REPORT_SUBJECT_KINDS = \[([^\]]+)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const dbKinds = [...sql.match(/subject_kind = any \(array\[([^\]]+)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(kinds, dbKinds);
});

test('B3 · a report carries its subject only when it has one; the dialog passes it through', () => {
  const moderation = stripComments(read('lib/moderation.ts'));
  assert.match(
    moderation,
    /\.\.\.\(params\.subject \? \{ subject_kind: params\.subject\.kind, subject_id: params\.subject\.id \} : \{\}\)/
  );
  const dialog = stripComments(read('components/ReportDialog.tsx'));
  assert.match(dialog, /subject\?: ReportSubject \| null;/);
  assert.match(dialog, /description,\s*subject,\s*\}\);/);
});

test('B3 · every surface that shows another person\'s content offers Report (and, through it, Block)', () => {
  const link = stripComments(read('components/ReportContentLink.tsx'));
  // Never on your own content, never signed out; the shared dialog does the rest.
  assert.match(link, /if \(!user \|\| !reportedId \|\| reportedId === user\.id\) return null;/);
  assert.match(link, /<ReportDialog[\s\S]*subject=\{subject\}/);

  const hosts = [
    ['screens/JobDetailScreen.tsx', "kind: 'job'"],
    ['components/MarketJobPreview.tsx', "kind: 'job'"],
    ['screens/WorkerProfileScreen.tsx', "kind: 'profile'"],
    ['screens/PublicProfileScreen.tsx', "kind: 'profile'"],
    ['screens/ProfileReviewsScreen.tsx', "kind: 'review'"],
  ];
  for (const [path, kind] of hosts) {
    const code = stripComments(read(path));
    assert.match(code, /import \{ ReportContentLink \} from '\.\.?\/(components\/)?ReportContentLink';/, `${path} imports the link`);
    assert.ok(code.includes('<ReportContentLink'), `${path} renders it`);
    assert.ok(code.includes(kind), `${path} reports a ${kind}`);
  }

  // Portfolio photos: from the viewer, which closes before the dialog opens.
  const pastWork = stripComments(read('components/PastWork.tsx'));
  assert.match(pastWork, /subject=\{\{ kind: 'portfolio_item', id: reportItem\.id \}\}/);
  assert.match(pastWork, /const canReport = !editable && !!user && user\.id !== workerId;/);
  assert.match(pastWork, /modalSettleDelay\(\)/);
  const viewer = stripComments(read('components/PhotoViewer.tsx'));
  assert.match(viewer, /onPress=\{\(\) => \{\s*onClose\(\);\s*onReport\(\);\s*\}\}/);
  assert.match(viewer, /accessibilityLabel="Report photo"/);
});

test('B3 · a blocked person leaves the feeds: open jobs, worker search, reviews', () => {
  const hook = stripComments(read('hooks/useHiddenUserIds.ts'));
  assert.match(hook, /useSyncExternalStore\(subscribeHiddenUsers, hiddenUserIds, hiddenUserIds\)/);

  const moderation = stripComments(read('lib/moderation.ts'));
  // A block either way hides, and a new block hides at once.
  assert.match(moderation, /setHidden\(new Set\(\[\.\.\.blocking, \.\.\.blockedBy\]\)\);/);
  assert.match(moderation, /if \(!error\) hideUser\(otherId\);/);

  assert.match(stripComments(read('hooks/useOpenJobs.ts')), /jobs\.filter\(\(job\) => !hidden\.has\(job\.client_id\)\)/);
  assert.match(stripComments(read('screens/WorkerSearchScreen.tsx')), /searched\.matches\.filter\(\(match\) => !hidden\.has\(match\.profile\.id\)\)/);
  const reviews = stripComments(read('screens/ProfileReviewsScreen.tsx'));
  assert.match(reviews, /reviews\.filter\(\(review\) => !hidden\.has\(review\.reviewer_id\)\)/);
  assert.match(reviews, /data=\{visibleReviews\}/);
});

test('B3 · the inbox Support pill reaches the team through the published address', async () => {
  const filters = stripComments(read('lib/inboxFilters.ts'));
  assert.match(filters, /title: 'Talk to the Brazos team',\s*body: 'Email us and Brazos will reply within 2 business days\.',\s*action: 'Contact support',/);
  assert.doesNotMatch(filters, /coming soon/i);

  const inbox = stripComments(read('screens/MessagesInboxScreen.tsx'));
  assert.match(inbox, /import \{ SUPPORT_EMAIL, supportMailtoUrl \} from '\.\.\/lib\/appLinks';/);
  assert.match(inbox, /await Linking\.openURL\(supportMailtoUrl\(\)\);/);
  assert.match(inbox, /alertAsync\('Could not open your mail app', `Write to \$\{SUPPORT_EMAIL\}\.`\)/);
  assert.match(inbox, /onPress=\{\(\) => void openSupportMail\(\)\}/);
});

test('B3 · the word filter is the server\'s, with a plain refusal and no client copy of the list', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /raise exception 'That includes words Brazos doesn''t allow\. Edit it and try again\.'/);
  assert.match(sql, /revoke all on function public\.reject_blocked_terms\(\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on table public\.blocked_terms from public, anon, authenticated;/);
  for (const [table, cols] of [
    ['jobs', "'title', 'description'"],
    ['profiles', "'bio'"],
    ['reviews', "'comment'"],
    ['messages', "'content'"],
    ['job_offers', "'message'"],
    ['portfolio_items', "'caption'"],
  ]) {
    assert.ok(
      sql.includes(`on public.${table}\n  for each row execute function public.reject_blocked_terms(${cols});`),
      `${table} is guarded on ${cols}`
    );
  }
  // The refusal reads as written wherever it surfaces.
  const em = read('lib/errorMessage.ts');
  assert.match(em, /lower\.includes\('blocked_content'\)/);
});
