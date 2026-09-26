// THE REFRESH VIEWER'S TWO APPS (2026-09-26) — the web export of the app, twice:
//   before   the operator's real app, exported read-only from the repository root;
//   after    the practice copy (.shots/refresh/practice — every tracked file, node_modules
//            joined by a junction), where the refresh is made. The real app is never edited.
// Each export gets the harness's own environment (scripts/shots.mjs buildExport: a host that
// resolves nowhere, a key that is plainly fake, the crash reporter and analytics blanked), so
// no bundle can carry a real project. Then prepare.mjs makes it open from a double-click.
//   node docs/mockups/refresh/export.mjs before|after
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const which = process.argv[2];
if (which !== 'before' && which !== 'after') throw new Error('export.mjs before|after');
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const cwd = which === 'before' ? repo : join(repo, '.shots', 'refresh', 'practice');
const out = join(repo, '.shots', 'refresh', `${which}-export`);
if (!existsSync(join(cwd, 'app.config.ts'))) throw new Error(`no app at ${cwd}`);
rmSync(out, { recursive: true, force: true });
const cli = join(repo, 'node_modules', 'expo', 'bin', 'cli');
const t0 = Date.now();
const run = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', '--output-dir', out, '--clear'], {
  cwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: 'https://harness.supabase.co',
    EXPO_PUBLIC_SUPABASE_KEY: 'harness-anon-key-not-a-real-key',
    EXPO_PUBLIC_SENTRY_DSN: '',
    EXPO_PUBLIC_POSTHOG_KEY: '',
  },
});
if (run.error) throw run.error;
if (run.status !== 0) throw new Error(`expo export (${which}) failed with status ${run.status}`);
console.log(`[refresh] ${which} exported to ${out} in ${Math.round((Date.now() - t0) / 1000)} s`);
