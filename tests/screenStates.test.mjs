import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Fix run E7 — ONE LOADING AND ERROR STATE. A screen that waits shows the
// shared spinner (ui/templates/ScreenStates.tsx, SPINNER_STATE or a labelled
// spinner state); a load that failed offers the one retry word,
// STATE_COPY.retry. "Check again" stays where it re-checks a payment or payout
// state, because nothing failed there.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const sources = ['screens', 'components'].flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/')),
);

test('E7: the state copy lives once, and the template reads it', () => {
  const states = read('ui/templates/ScreenStates.tsx');
  assert.match(states, /errorTitle: 'Couldn’t load this',/);
  assert.match(states, /errorBody: 'It’s usually temporary\.',/);
  assert.match(states, /retry: 'Try again',/);
  assert.match(states, /return noun \? `Couldn’t load \$\{noun\}` : STATE_COPY\.errorTitle;/);
  const view = stripComments(states);
  assert.match(view, /title=\{state\.title \?\? STATE_COPY\.errorTitle\}/);
  assert.match(view, /actionLabel=\{state\.onRetry \? STATE_COPY\.retry : undefined\}/);
  assert.doesNotMatch(view, /'Try again'\s*:|title="Something went wrong"/, 'no second copy of the words');
});

test('E7: no load retry says "Retry" or "Refresh"', () => {
  const offenders = sources.filter((path) =>
    /title="(Retry|Refresh)"|'Retry'|>\s*Retry\s*</.test(stripComments(read(path))),
  );
  assert.deepEqual(offenders, []);
});

test('E7: a full-screen wait is the shared spinner, never a hand-rolled one', () => {
  // A large spinner may still sit INSIDE a sheet or a picker that owns its own
  // body; a screen's own loading branch uses ScreenStateView.
  const ownBody = new Set(['components/PortfolioPicker.tsx', 'components/TranslationSheet.tsx']);
  // Inline waits, not a screen's: the bids section on the job page, and the
  // public profile's card under its wordmark.
  const inline = new Set(['screens/ClientJobDetailScreen.tsx', 'screens/PublicProfileScreen.tsx']);
  const handRolled = sources.filter(
    (path) =>
      !ownBody.has(path) &&
      !inline.has(path) &&
      /<ActivityIndicator size="large"/.test(read(path)),
  );
  assert.deepEqual(handRolled, []);
  for (const path of [
    'screens/AdminReportsScreen.tsx',
    'screens/CellJobsScreen.tsx',
    'screens/ChatScreen.tsx',
    'screens/HiddenChatsScreen.tsx',
    'screens/MessagesInboxScreen.tsx',
    'screens/MyJobsHubScreen.tsx',
    'screens/NotificationSettingsScreen.tsx',
    'screens/PostJobScreen.tsx',
    'screens/ProfileReviewsScreen.tsx',
    'screens/ProfileScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/WorkerProfileScreen.tsx',
  ]) {
    assert.match(read(path), /<ScreenStateView state=\{/, `${path} waits on the shared state`);
  }
  assert.match(read('screens/WorkerProfileScreen.tsx'), /kind: 'error', title: loadErrorTitle\('this profile'\)/);
  assert.match(read('screens/ProfileReviewsScreen.tsx'), /kind: 'error', title: loadErrorTitle\('reviews'\)/);
});
