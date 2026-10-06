// Guard test for the 2026-10-06 guard proposal (docs/proposed/guard.ps1).
//
// Hands the same 40 tool calls to the CURRENT guard (.claude/hooks/guard.ps1) and to the PROPOSED one,
// exactly as Claude Code hands a PreToolUse hook its JSON on stdin, and writes the verdicts to
// docs/proposed/guard-test.md. Nothing is executed: a call is only shown to the guards. The calls are
// docs/proposed/guard-cases.json: 30 safe calls the current guard refused in past BRAZOS chats, as
// typed, and 10 dangerous calls that must stay refused. The production ref is written there as
// {{PROD_REF}} and filled in here from scripts/supabase-ref.mjs, so no document carries it.
//
// The last column names what else still refuses a call once the proposal is applied: the evidence
// hook (.claude/hooks/evidence-guard.ps1, run for real) and the settings deny lists (matched here
// approximately, on the whole command and on each part split at && || ; |).
//
// Last, it runs the real tests/safety.test.mjs against the proposed guard: a copy in .shots/ whose
// two guard paths point at docs/proposed/guard.ps1, deleted afterwards. Nothing under .claude/ is
// written.
//
//   node docs/proposed/guard-test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF } from '../../scripts/supabase-ref.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = join(REPO, '.claude', 'hooks');
const CURRENT = join(HOOKS, 'guard.ps1');
const PROPOSED = join(REPO, 'docs', 'proposed', 'guard.ps1');
const EVIDENCE = join(HOOKS, 'evidence-guard.ps1');
const OUT = join(REPO, 'docs', 'proposed', 'guard-test.md');
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const HOME = homedir().replace(/\\/g, '/').toLowerCase();

const cases = JSON.parse(readFileSync(join(REPO, 'docs', 'proposed', 'guard-cases.json'), 'utf8'))
  .map((c) => ({ ...c, input: JSON.parse(JSON.stringify(c.input).replaceAll('{{PROD_REF}}', PRODUCTION_REF)) }));

// One hook, one call. Exit 2 is the only refusal a PreToolUse hook has; 0 lets the call run.
function runHook(script, c) {
  const payload = JSON.stringify({ session_id: c.session_id, cwd: REPO, hook_event_name: 'PreToolUse', tool_name: c.tool, tool_input: c.input });
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    input: payload, encoding: 'utf8', timeout: 60_000, env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
  });
  if (r.status === 2) return { verdict: 'BLOCK', code: (/BLOCK (GUARD-[A-Z-]+)/.exec(r.stderr ?? '') ?? [])[1] ?? '' };
  if (r.status === 0) return { verdict: 'PASS', code: '' };
  return { verdict: `EXIT ${r.status}`, code: '' };
}

// ---- the settings deny lists, matched approximately ------------------------------------------
const denyOf = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')).permissions?.deny ?? []; } catch { return []; }
};
const DENY = [...denyOf(join(REPO, '.claude', 'settings.json')), ...denyOf(join(REPO, '.claude', 'settings.local.json'))]
  .map((rule) => /^(\w+)\((.*)\)$/s.exec(rule)).filter(Boolean).map(([rule, tool, pattern]) => ({ rule, tool, pattern }));
const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const commandMatches = (pattern, text) => {
  if (pattern.endsWith(':*')) { const p = pattern.slice(0, -2); return text === p || text.startsWith(`${p} `); }
  return new RegExp(`^${pattern.split('*').map(escapeRe).join('.*')}$`, 's').test(text);
};
const pathMatches = (pattern, file) => {
  const abs = pattern.startsWith('//') ? pattern.slice(1)
    : pattern.startsWith('~/') ? `${HOME}/${pattern.slice(2)}`
    : `${REPO.replace(/\\/g, '/')}/${pattern.replace(/^\.?\//, '')}`;
  const re = abs.toLowerCase().split(/(\*\*|\*)/).map((p) => (p === '**' ? '.*' : p === '*' ? '[^/]*' : escapeRe(p))).join('');
  return new RegExp(`^${re}$`).test(file.replace(/\\/g, '/').toLowerCase());
};
function denyHits(c) {
  if (c.tool === 'Bash' || c.tool === 'PowerShell') {
    const parts = [c.input.command, ...c.input.command.split(/&&|\|\||;|\||\r?\n/)].map((s) => s.trim()).filter(Boolean);
    return DENY.filter((d) => d.tool === c.tool && parts.some((p) => commandMatches(d.pattern, p))).map((d) => d.rule);
  }
  return DENY.filter((d) => (d.tool === 'Edit' || d.tool === 'Write') && pathMatches(d.pattern, c.input.file_path)).map((d) => d.rule);
}

// ---- the real safety suite, against the proposed guard ---------------------------------------
function safetySuite() {
  const src = readFileSync(join(REPO, 'tests', 'safety.test.mjs'), 'utf8');
  const v2 = "path.join(REPO, '.claude', 'hooks', 'guard.v2.ps1')";
  const v1 = "path.join(REPO, '.claude', 'hooks', 'guard.ps1')";
  if (!src.includes(v2) || !src.includes(v1)) return { ran: false };
  mkdirSync(join(REPO, '.shots'), { recursive: true });
  const copy = join(REPO, '.shots', 'safety-proposed.test.mjs');
  writeFileSync(copy, src.replace(v2, "path.join(REPO, 'docs', 'proposed', 'guard.v2.ps1')")
    .replace(v1, "path.join(REPO, 'docs', 'proposed', 'guard.ps1')"));
  try {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', copy], { cwd: REPO, encoding: 'utf8', timeout: 900_000 });
    const out = r.stdout ?? '';
    const count = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(out) ?? [])[1] ?? NaN);
    const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]);
    return { ran: true, exit: r.status, pass: count('pass'), fail: count('fail'), failed };
  } finally {
    rmSync(copy, { force: true });
  }
}

// ---- run ---------------------------------------------------------------------------------------
const rows = cases.map((c) => {
  const row = { c, current: runHook(CURRENT, c), proposed: runHook(PROPOSED, c), also: denyHits(c) };
  if (runHook(EVIDENCE, c).verdict === 'BLOCK') row.also.unshift('evidence hook');
  process.stdout.write('.');
  return row;
});
process.stdout.write('\n');
const suite = safetySuite();

// ---- report ------------------------------------------------------------------------------------
const cell = (s) => String(s).replaceAll(PRODUCTION_REF, '<production ref>').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;');
const shown = (c) => {
  const raw = c.input.command ?? `[${c.tool}] ${c.input.file_path}`;
  const text = raw.replaceAll(PRODUCTION_REF, '<production ref>').replace(/C:[\\/]Users[\\/]mdmah/gi, '~').replace(/\r?\n/g, ' ⏎ ');
  return text.length > 110 ? `${text.slice(0, 107)}...` : text;
};
const verdict = (v) => (v.code ? `${v.verdict} (${v.code.replace('GUARD-', '')})` : v.verdict);
const safe = rows.filter((r) => r.c.kind === 'safe');
const danger = rows.filter((r) => r.c.kind === 'dangerous');
const passes = (list, who) => list.filter((r) => r[who].verdict === 'PASS').length;
const blocks = (list, who) => list.filter((r) => r[who].verdict === 'BLOCK').length;
const stillBlocked = safe.filter((r) => r.proposed.verdict !== 'PASS');
const endToEnd = safe.filter((r) => r.proposed.verdict === 'PASS' && r.also.length === 0).length;
const heldElsewhere = safe.filter((r) => r.proposed.verdict === 'PASS' && r.also.length > 0).length;

const lines = [
  '# Guard test: the current guard against the proposed one',
  '',
  `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node docs/proposed/guard-test.mjs\`. Each row is one`,
  'tool call, handed to each guard as the JSON a PreToolUse hook receives; nothing is executed.',
  'PASS = the guard lets the call run; BLOCK = it refuses it (exit 2), with the rule that fired.',
  'The 30 safe calls are real calls the current guard refused in past BRAZOS chats',
  '(`docs/proposed/guard-cases.json` carries each one in full, with the day it was refused).',
  '',
  '## Result',
  '',
  `- **Safe calls (30):** the current guard passes ${passes(safe, 'current')}; the proposed guard passes **${passes(safe, 'proposed')}**.`,
  `- **Dangerous calls (10):** the current guard blocks ${blocks(danger, 'current')}; the proposed guard blocks **${blocks(danger, 'proposed')}**.`,
  `- **After applying, end to end:** ${endToEnd} of the 30 safe calls run. ${heldElsewhere} more pass the proposed guard but are still refused by the evidence hook or a deny list (last column), which this proposal does not change.`,
  suite.ran
    ? `- **\`tests/safety.test.mjs\` against the proposed guard:** ${suite.pass} pass, ${suite.fail} fail (exit ${suite.exit}).${suite.failed.length ? ` Failed: ${suite.failed.join('; ')}.` : ''}`
    : '- **`tests/safety.test.mjs` against the proposed guard:** not run, because its guard paths changed; this script needs updating.',
  '',
  '## The 40 calls',
  '',
  '| # | Kind | Call | What it is | Current guard | Proposed guard | Also refused after applying, by |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(({ c, current, proposed, also }) => `| ${c.n} | ${c.kind === 'dangerous' ? '**DANGEROUS**' : 'safe'} | <code>${cell(shown(c))}</code> | ${cell(c.what)} | ${verdict(current)} | ${verdict(proposed)} | ${also.length ? cell(also.join(', ')) : '-'} |`),
  '',
  '## Safe calls the proposed guard still blocks',
  '',
  ...(stillBlocked.length
    ? stillBlocked.map((r) => `- #${r.c.n} (${r.proposed.code.replace('GUARD-', '')}): ${cell(r.c.what)} None of the four changes covers it.`)
    : ['- None.']),
  '',
  '## The last column',
  '',
  'Applying the proposal replaces only `.claude/hooks/guard.ps1`. Two other layers keep running: the',
  'evidence hook (`.claude/hooks/evidence-guard.ps1`, registered in `.claude/settings.local.json`) and',
  'the deny lists in `.claude/settings.json` and `.claude/settings.local.json`. A call listed there is',
  'still refused after applying, even where the proposed guard says PASS. The deny-list match is',
  'approximate; the evidence-hook verdict is the real hook, run on the same JSON.',
  '',
  '## Rerun',
  '',
  'From the repository root, in PowerShell:',
  '',
  '```powershell',
  'Set-Location C:\\Users\\mdmah\\BRAZOS; node docs/proposed/guard-test.mjs',
  '```',
  '',
];
const report = lines.join('\n');
if (report.includes(PRODUCTION_REF)) throw new Error('the report would carry the production ref');
writeFileSync(OUT, report);
console.log(lines.slice(10, 14).join('\n'));
if (stillBlocked.length) console.log(`still blocked: ${stillBlocked.map((r) => `#${r.c.n}`).join(' ')}`);
