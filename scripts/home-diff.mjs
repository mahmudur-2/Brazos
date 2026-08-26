#!/usr/bin/env node
// home(20) — MEASURING A RENDER AGAINST MASTER 44 INSTEAD OF LOOKING AT IT.
//
// `node scripts/shots.mjs --only home` produces the picture (and so does its
// Home entry point, `node scripts/home-shots.mjs`). This reads two pictures
// and produces NUMBERS: where every outlined control and every band of ink
// actually sits, in points, in both, and how far apart they are.
//
//   node scripts/home-diff.mjs
//   node scripts/home-diff.mjs --render .shots/customer-home-dark.png \
//                              --master docs/mockups/44_customer_home_dark.png
//   node scripts/home-diff.mjs --master-inset 59 --render-inset 0
//
// Output goes to stdout only. Nothing is written to disk, so nothing can be
// committed by accident; `.shots/` is gitignored and this never touches it.
//
// -------------------------------------------------------------------------
// lit(1) — THIS IS NOW A SHIM OVER scripts/master-diff.mjs.
//
// The measurement engine was generalized off this file so a second screen
// could be measured against a second master without a second copy of the PNG
// edge pass. Every flag, default and inset this file ever accepted still works
// and still means the same thing, and the OUTPUT IS BYTE-IDENTICAL: the banner
// is passed in, and master-diff's colour pass is left off here because a
// colour section this file never printed would be a behaviour change.
//
// It is the same arrangement scripts/home-shots.mjs has over scripts/shots.mjs
// and for the same reason: the command is named by the record and by CLAUDE.md,
// so it keeps working. Everything this header used to explain — why the render
// is resampled onto the master's pixel width, why each side declares its own
// inset, what the tool cannot see — is in master-diff.mjs, unchanged.
// -------------------------------------------------------------------------

import { parseArgs, run } from './master-diff.mjs';

run({
  ...parseArgs(process.argv.slice(2)),
  title: 'home-diff — master 44 versus a harness render',
  colour: false,
});
