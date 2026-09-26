// THE REFRESH — the After as ONE patch against the real app, for the day the operator says "build it".
//
//   node docs/mockups/refresh/make-patch.mjs
//
// Compares the practice copy (.shots/refresh/practice, where every After change was made and
// verified) with the repository's tracked files, over the app's source and its fences, and writes
// docs/mockups/refresh/after.patch: a standard unified diff with LF line endings (the index form),
// new files included. The repository itself is only read. To apply it later:
//
//   git apply --check --ignore-whitespace docs/mockups/refresh/after.patch
//   git apply --ignore-whitespace docs/mockups/refresh/after.patch
//
// --ignore-whitespace lets it land on the files this checkout keeps with CRLF endings.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repo = 'C:/Users/mdmah/BRAZOS';
const practice = join(repo, '.shots/refresh/practice');
const tmp = join(repo, '.shots/refresh/patch-tmp');
const out = join(repo, 'docs/mockups/refresh/after.patch');

// What the refresh may change: the app, its fences and the harness that photographs it — never the
// frozen web surface, never docs, never .claude.
const ROOTS = ['App.tsx', 'components/', 'screens/', 'lib/', 'ui/', 'navigation/', 'modes/', 'hooks/', 'tests/', 'scripts/', 'supabase/config.toml'];
const inScope = (p) => ROOTS.some((r) => (r.endsWith('/') ? p.startsWith(r) : p === r)) && !/\.web\.tsx?$/.test(p);
const norm = (s) => s.replace(/\r\n/g, '\n');

const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean).filter(inScope);
const trackedSet = new Set(tracked);

function walk(dir, base = '') {
  const found = [];
  for (const entry of readdirSync(join(practice, dir, base))) {
    const rel = base ? `${base}/${entry}` : entry;
    const full = join(practice, dir, rel);
    if (statSync(full).isDirectory()) found.push(...walk(dir, rel));
    else found.push(`${dir}${rel}`);
  }
  return found;
}
const added = ROOTS.filter((r) => r.endsWith('/') && existsSync(join(practice, r)))
  .flatMap((r) => walk(r))
  .filter((p) => inScope(p) && !trackedSet.has(p) && /\.(tsx?|mjs|js|json|toml)$/.test(p));

rmSync(tmp, { recursive: true, force: true });
const chunks = [];
const summary = { modified: [], added: [] };
for (const path of tracked) {
  const mine = join(practice, path);
  if (!existsSync(mine)) continue;
  const before = norm(readFileSync(join(repo, path), 'utf8'));
  const after = norm(readFileSync(mine, 'utf8'));
  if (before === after) continue;
  for (const [side, text] of [['a', before], ['b', after]]) {
    mkdirSync(dirname(join(tmp, side, path)), { recursive: true });
    writeFileSync(join(tmp, side, path), text);
  }
  let diff = '';
  try {
    execFileSync('git', ['diff', '--no-index', '--no-color', '--no-prefix', `a/${path}`, `b/${path}`], { cwd: tmp, encoding: 'utf8' });
  } catch (e) {
    diff = e.stdout; // exit 1 = the files differ, which is the point
  }
  chunks.push(diff.replace(/^index [0-9a-f]+\.\.[0-9a-f]+( \d+)?\n/m, ''));
  summary.modified.push(path);
}
for (const path of added) {
  const lines = norm(readFileSync(join(practice, path), 'utf8')).replace(/\n$/, '').split('\n');
  chunks.push(
    `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` +
      lines.map((l) => `+${l}`).join('\n') + '\n'
  );
  summary.added.push(path);
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(out, chunks.join(''));
console.log(`[refresh] after.patch: ${summary.modified.length} modified, ${summary.added.length} added`);
for (const p of summary.added) console.log(`  + ${p}`);
for (const p of summary.modified) console.log(`  ~ ${p}`);
