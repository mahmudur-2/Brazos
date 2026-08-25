#!/usr/bin/env node
// shot(0) — THE HOME ENTRY POINT OF scripts/shots.mjs.
//
// This file WAS the whole screenshot harness: four Home targets, and nothing
// else could be reached. shot(1) generalised it into scripts/shots.mjs, where a
// surface is a registry entry with a navigation recipe, so Post-a-Job and the
// publish screen can be photographed too.
//
// It is kept, rather than deleted, because the command is named in CLAUDE.md
// and in a dozen handoff and audit records. Deleting it would either break
// those or require rewriting history to mention a file that did not exist when
// they were written. It forwards instead, so `node scripts/home-shots.mjs`
// still means exactly what every one of those records says it means: Customer
// Home and Worker Home, dark and light, at 393x852 into .shots/.
//
//   node scripts/home-shots.mjs            reuse the export if one is present
//   node scripts/home-shots.mjs --build    force a fresh web export first
//
// Everything else — the four Home targets themselves, the fixtures, and every
// guarantee about viewport, motion and network isolation — lives in
// scripts/shots.mjs. There is one harness, not two.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// `--only home` selects exactly the four Home targets; no other registry name
// contains it. Anything the caller passed (--build) rides along behind.
const run = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'shots.mjs'), '--only', 'home', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);
if (run.error) {
  console.error('[shots] FAILED:', run.error.message);
  process.exit(1);
}
process.exit(run.status ?? 1);
