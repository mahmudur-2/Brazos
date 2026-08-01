#!/usr/bin/env node
/**
 * Local-only admin script: reset ONE Supabase test user's password via
 * auth.admin.updateUserById(). Touches nothing else - no profile data,
 * email, metadata, confirmation status, or other database rows.
 *
 *   node scripts/reset-test-user-password.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment
 * variables in the shell running this command - NOT from .env, which only
 * ever holds the publishable key. The service-role key bypasses every RLS
 * policy in the project: never put it in .env, never print it, never commit
 * it. Set it for this command only, e.g.:
 *
 *   PowerShell:
 *     $env:SUPABASE_URL = "https://xxxx.supabase.co"
 *     $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *     node scripts/reset-test-user-password.mjs
 *
 *   Git Bash:
 *     SUPABASE_URL="https://xxxx.supabase.co" \
 *     SUPABASE_SERVICE_ROLE_KEY="..." \
 *     node scripts/reset-test-user-password.mjs
 *
 * The new password is read from NEW_PASSWORD if that's set, otherwise
 * prompted for locally with the input hidden (typed characters are not
 * echoed). Nothing sensitive is written to disk, printed, or logged.
 */
import { createClient } from '@supabase/supabase-js';
import { writeSync } from 'node:fs';
import readline from 'node:readline';

// Single-purpose script for exactly this account - kept as a constant
// rather than an argument so there is never ambiguity about which user a
// run of this file can affect.
const TARGET_EMAIL = 'dixonmayas771@gmail.com';

const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's own default minimum.
const PER_PAGE = 200;
const MAX_PAGES = 20; // safety cap while paginating listUsers()

// Control characters used while reading masked input, built from their
// decimal char codes rather than embedded as literal bytes so the source
// file itself contains only plain, unambiguous ASCII.
const KEY_CTRL_C = String.fromCharCode(3);
const KEY_CTRL_D = String.fromCharCode(4);
const KEY_BACKSPACE = String.fromCharCode(127);

function fail(message) {
  // fs.writeSync (fd 2 = stderr) is truly synchronous on every platform,
  // unlike console.error/process.stderr.write, which can be asynchronous
  // when stderr is piped or redirected (common on Windows). Without this,
  // the immediately-following process.exit() can terminate the process
  // before the message is flushed, so the failure prints nothing at all.
  writeSync(2, `\n[reset-test-user-password] ${message}\n`);
  process.exit(1);
}

/** Reads one line from stdin without echoing typed characters. */
function readHiddenInput(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    const canMask = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
    if (!canMask) {
      // Non-interactive stdin (e.g. piped) - fall back to a plain readline
      // line read rather than failing outright.
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === KEY_CTRL_D) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === KEY_CTRL_C) {
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
        return;
      }
      if (char === KEY_BACKSPACE || char === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    process.stdin.on('data', onData);
  });
}

/** Every user whose email matches (case-insensitive), across all pages. */
async function findUsersByEmail(admin, email) {
  const target = email.toLowerCase();
  const matches = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) fail(`listUsers() failed: ${error.message}`);

    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email && user.email.toLowerCase() === target) matches.push(user);
    }
    if (users.length < PER_PAGE) break; // last page reached
  }

  return matches;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    fail("SUPABASE_URL is not set in your environment. See this file's header for how to set it.");
  }
  if (!serviceKey) {
    fail("SUPABASE_SERVICE_ROLE_KEY is not set in your environment. See this file's header for how to set it.");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Looking up ${TARGET_EMAIL} ...`);
  const matches = await findUsersByEmail(admin, TARGET_EMAIL);

  if (matches.length === 0) {
    fail(`No user found with email ${TARGET_EMAIL}. Nothing was changed.`);
  }
  if (matches.length > 1) {
    fail(
      `${matches.length} users matched ${TARGET_EMAIL} - refusing to guess which one. ` +
        `Matching ids: ${matches.map((u) => u.id).join(', ')}`
    );
  }

  const user = matches[0];
  console.log(`Found exactly one match: id=${user.id}`);

  let newPassword = process.env.NEW_PASSWORD;
  const passwordFromEnv = Boolean(newPassword);
  if (!newPassword) {
    newPassword = await readHiddenInput('New password: ');
    const confirmPassword = await readHiddenInput('Confirm new password: ');
    if (newPassword !== confirmPassword) {
      fail('Passwords did not match. Nothing was changed.');
    }
  }

  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
  }

  // Only `password` is set here - email, metadata, confirmation status, and
  // every other field on the user are left exactly as they are.
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  // Drop the reference as soon as it's no longer needed. Best effort only -
  // JS strings are immutable so this can't scrub the old value from memory,
  // but it stops this script from holding or reusing it any further.
  newPassword = null;

  if (updateError) {
    fail(`updateUserById() failed: ${updateError.message}`);
  }

  console.log(`\nPassword reset for ${TARGET_EMAIL} (id=${user.id}).`);
  console.log('No profile data, email, metadata, or confirmation status was touched.');

  if (passwordFromEnv) {
    console.log('\nNEW_PASSWORD was read from your environment - unset it now:');
    console.log('  PowerShell:  Remove-Item Env:NEW_PASSWORD');
    console.log('  Git Bash:    unset NEW_PASSWORD');
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
