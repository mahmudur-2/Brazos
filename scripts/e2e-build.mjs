#!/usr/bin/env node
/**
 * The e2e iOS workflow's app check (.github/workflows/e2e-ios.yml), tested in
 * tests/e2eWorkflow.test.mjs.
 *
 *   node scripts/e2e-build.mjs <build.json>
 *
 * Reads the EAS answer (build:view prints one build, build:list an array), stops unless it is a
 * finished iOS simulator build with an app archive, writes one line to the run summary saying
 * whether the app was made from the commit this run tests, and prints the archive URL.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The run summary's line. It says "the same commit" and "release evidence" only when EAS reported
 * this very commit; any other run is compatibility evidence (F15).
 */
export function buildLine(build, sha) {
  const made = build.gitCommitHash;
  if (!made) {
    return `App under test: EAS build ${build.id}; EAS did not report the commit it was made from. This run tests commit ${sha}; the two cannot be compared, so this run is compatibility evidence, not release evidence.`;
  }
  const verdict =
    made === sha
      ? 'the same commit, so this run is release evidence.'
      : 'NOT the same commit, so the flows test an older app: this run is compatibility evidence, not release evidence.';
  return `App under test: EAS build ${build.id}, made from commit ${made}. This run tests commit ${sha}: ${verdict}`;
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  scriptPath !== '' &&
  (process.platform === 'win32' ? scriptPath.toLowerCase() === selfPath.toLowerCase() : scriptPath === selfPath);

if (isMain) {
  const b = [].concat(JSON.parse(readFileSync(process.argv[2], 'utf8')))[0];
  const url = b?.artifacts?.applicationArchiveUrl;
  if (!b || b.status !== 'FINISHED' || !b.isForIosSimulator || !url) {
    console.error('no finished iOS simulator build with an app archive');
    process.exit(1);
  }
  const line = buildLine(b, process.env.GITHUB_SHA);
  console.error(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n\n`);
  console.log(url);
}
