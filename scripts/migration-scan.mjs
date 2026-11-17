/**
 * THE MIGRATION RISK DETECTOR behind scripts/staging-scan.sh (R-M4, F01). It reads a migration file
 * as SQL statements and flags each statement whose shape needs a person's review before it reaches a
 * database that installed apps use: it removes, renames or changes something an app may still call
 * or read, or it runs code the moment it is applied.
 *
 * A DETECTOR, NOT A PROOF. A statement it does not flag can still break an installed app: a function
 * made again with another return type, a replaced view, a new constraint, row security without a
 * usable policy, a revoke on a function the file replaces, an insert that overwrites rows. The proof
 * is the local suite (and tests of the old app's requests); this catches the risky shapes that the
 * text alone shows. Nothing it says means "safe".
 *
 * IT READS STATEMENTS, NOT LINES. The text is split at the semicolons that are code, so a keyword
 * inside a 'string', an E'string', a "name", a -- comment, a nested block comment or a $tag$ body
 * never counts, and a statement split over lines counts as one. Each flag names the statement's
 * first line. A file that ends inside an open quote or comment is flagged, never guessed.
 *
 * NOT FLAGGED (definitions and additions): begin, commit, set (except standard_conforming_strings
 * to anything but on: the reader then cannot follow a backslash in a string); every create; comment on; grant;
 * insert into; alter table with only add, enable or force row level security, alter column ... set
 * default, owner to; alter function or procedure ... owner to or set; alter policy (policy changes
 * are definitions, the director's answer 3); alter publication ... add table; alter default
 * privileges ... grant; a select of only set_config; a revoke on an object this file
 * made earlier; a drop of a policy, trigger, view or index that this file makes again later by the
 * same name (policy and trigger: on the same table), and a drop of a function this file makes again
 * later with the same parameters (compared after folding case and white space, parameter names and
 * defaults aside; any doubt is a flag, the director's answer 4). Everything else is flagged.
 *
 *   node scripts/migration-scan.mjs <file>
 *   stdout: one line per flagged statement, "<line>\t<reason>"
 *   exit 0: no statement flagged; 1: flagged; 2: called wrongly (no file), or the scan itself failed.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IDENT = /[A-Za-z0-9_$]/;
const SIMPLE = /^[a-z_][a-z0-9_$]*$/;

/** The file's top-level statements: { line, sql, open }. sql is lower case, one space, no comments. */
export function statements(text) {
  const src = String(text).replace(/\r\n?/g, '\n');
  const out = [];
  let code = '';
  let start = 0;
  let line = 1;
  const mark = () => {
    if (!start) start = line;
  };
  const push = (open) => {
    const sql = code.replace(/\s+/g, ' ').trim();
    if (sql || open) out.push({ line: start || line, sql, open });
    code = '';
    start = 0;
  };
  // Skips from i to end (exclusive), counting the newlines it passes.
  const skip = (i, end) => {
    for (let j = i; j < end; j++) if (src[j] === '\n') line++;
    return end;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '-' && next === '-') {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      code += ' ';
    } else if (c === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        if (src.startsWith('/*', j)) [depth, j] = [depth + 1, j + 2];
        else if (src.startsWith('*/', j)) [depth, j] = [depth - 1, j + 2];
        else j++;
      }
      if (depth > 0) {
        mark();
        push(true);
        return out;
      }
      i = skip(i, j);
      code += ' ';
    } else if (c === "'") {
      mark();
      const escaped = /[eE]/.test(src[i - 1] ?? '') && !IDENT.test(src[i - 2] ?? '');
      let j = i + 1;
      for (;;) {
        if (j >= src.length) {
          push(true);
          return out;
        }
        if (escaped && src[j] === '\\') j += 2;
        else if (src[j] === "'" && src[j + 1] === "'") j += 2;
        else if (src[j] === "'") break;
        else j++;
      }
      i = skip(i, j + 1);
      code += "''";
    } else if (c === '"') {
      mark();
      let j = i + 1;
      let name = '';
      for (;;) {
        if (j >= src.length) {
          push(true);
          return out;
        }
        if (src[j] === '"' && src[j + 1] === '"') [name, j] = [`${name}"`, j + 2];
        else if (src[j] === '"') break;
        else [name, j] = [name + src[j], j + 1];
      }
      i = skip(i, j + 1);
      code += SIMPLE.test(name) ? name : `"${name}"`;
    } else if (c === '$' && !IDENT.test(src[i - 1] ?? '') && /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.test(src.slice(i, i + 64))) {
      mark();
      const tag = src.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)[0];
      const end = src.indexOf(tag, i + tag.length);
      if (end < 0) {
        push(true);
        return out;
      }
      i = skip(i, end + tag.length);
      code += ' $$ ';
    } else if (c === ';') {
      push(false);
      i++;
    } else {
      if (c === '\n') line++;
      else if (!/\s/.test(c)) mark();
      code += c.toLowerCase();
      i++;
    }
  }
  push(false);
  return out;
}

const NAME = String.raw`(?:"[^"]*"|[^\s(),;."]+)(?:\.(?:"[^"]*"|[^\s(),;."]+))*`;
const bare = (name) => name.replace(/^public\./, '');

/** The text inside the parenthesis that opens at s[at], and the index after it closes. */
function parens(s, at) {
  let depth = 0;
  for (let j = at; j < s.length; j++) {
    if (s[j] === '(') depth++;
    if (s[j] === ')' && --depth === 0) return [s.slice(at + 1, j), j + 1];
  }
  return [null, s.length];
}

/** s split at its commas outside parentheses. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let j = 0; j < s.length; j++) {
    if (s[j] === '(') depth++;
    if (s[j] === ')') depth--;
    if (s[j] === ',' && depth === 0) [parts[parts.length], from] = [s.slice(from, j), j + 1];
  }
  return parts.concat(s.slice(from)).map((p) => p.trim()).filter(Boolean);
}

/** A routine's input parameters, folded: no default, no IN, no OUT parameter (not part of its identity). */
function inputs(list) {
  return splitTop(list)
    .map((arg) => arg.replace(/\s*(\bdefault\b|=).*$/, '').replace(/^in /, ''))
    .filter((arg) => !/^out /.test(arg));
}

/** Equal parameters: the same text, or the same text once one side's single-word name is set aside. */
function sameArg(a, b) {
  const named = (long, short) => long.endsWith(` ${short}`) && !long.slice(0, -short.length - 1).includes(' ');
  return a === b || named(a, b) || named(b, a);
}
const sameInputs = (a, b) => a.length === b.length && a.every((arg, j) => sameArg(arg, b[j]));

/** A routine named at s[at...]: { name, args } (args null when no parameter list follows). */
function routineAt(s) {
  const m = s.match(new RegExp(`^(${NAME}) ?`));
  if (!m) return null;
  const rest = s.slice(m[0].length);
  const args = rest.startsWith('(') ? parens(rest, 0)[0] : null;
  return { name: bare(m[1]), args: args === null ? null : inputs(args) };
}

/** What the file makes, with the statement index: functions, policies, triggers, views, indexes, tables. */
function made(list) {
  const out = [];
  list.forEach(({ sql }, at) => {
    let m = sql.match(new RegExp(`^create (?:or replace )?(?:function|procedure) (.*)$`));
    if (m) {
      const r = routineAt(m[1]);
      if (r && r.args) out.push({ kind: 'function', name: r.name, args: r.args, at });
      return;
    }
    m = sql.match(new RegExp(`^create (policy) (${NAME}) on (${NAME})`)) ??
      sql.match(new RegExp(`^create (?:or replace )?(?:constraint )?(trigger) (${NAME}) .*? on (${NAME})`));
    if (m) return void out.push({ kind: m[1], name: m[2], table: bare(m[3]), at });
    m = sql.match(new RegExp(`^create (?:or replace )?(?:temp |temporary )?(?:recursive )?(?:materialized )?view (?:if not exists )?(${NAME})`));
    if (m) return void out.push({ kind: 'view', name: bare(m[1]), at });
    m = sql.match(new RegExp(`^create (?:unique )?index (?:concurrently )?(?:if not exists )?(${NAME}) on `));
    if (m) return void out.push({ kind: 'index', name: bare(m[1]), at });
    m = sql.match(new RegExp(`^create (?:(?:temp|temporary|unlogged) )?(table|sequence) (?:if not exists )?(${NAME})`));
    if (m) out.push({ kind: m[1], name: bare(m[2]), at });
  });
  return out;
}

const UNKNOWN = 'a kind of statement the scan does not know';
const ROWS = 'changes or removes rows already in the database';

function alterTable(sql) {
  const m = sql.match(new RegExp(`^alter table (?:if exists )?(?:only )?${NAME} (.*)$`));
  if (!m) return UNKNOWN;
  for (const action of splitTop(m[1])) {
    if (/^rename\b/.test(action)) return 'renames something';
    if (/^add\b|^(enable|force) row level security$|^alter (column )?\S+ set default\b|^owner to\b/.test(action)) continue;
    return 'removes, renames or changes an existing column or table';
  }
  return null;
}

function alterRoutine(sql) {
  const rest = sql.replace(/^alter (function|procedure) /, '');
  const m = rest.match(new RegExp(`^${NAME} ?\\(`));
  if (!m) return UNKNOWN;
  const tail = rest.slice(parens(rest, m[0].length - 1)[1]).trim();
  if (/^(rename|set schema)\b/.test(tail)) return 'renames something';
  return /^(owner to|set|reset)\b/.test(tail) ? null : UNKNOWN;
}

function revoke(sql, at, makes) {
  const m = sql.match(/^revoke (?:grant option for )?.+? on (?:(table|function|procedure|routine|sequence) )?(.+?) from .+$/);
  const away = 'takes a right away from something this file does not make';
  if (!m || /^(all |schema |type |domain |language |database |foreign )/.test(m[2])) return away;
  const routine = /^(function|procedure|routine)$/.test(m[1] ?? '');
  for (const object of splitTop(m[2])) {
    const r = routineAt(object);
    const ok =
      r &&
      makes.some((x) =>
        x.at < at && x.name === r.name && (routine ? x.kind === 'function' && (r.args === null || sameInputs(r.args, x.args)) : /^(table|view|sequence)$/.test(x.kind))
      );
    if (!ok) return away;
  }
  return null;
}

function drop(sql, at, makes) {
  if (/ cascade$/.test(sql)) return 'CASCADE can remove other objects too';
  const m = sql.match(/^drop (function|procedure|policy|trigger|materialized view|view|index|[a-z]+) (?:concurrently )?(?:if exists )?(.+?)(?: restrict)?$/);
  if (!m) return UNKNOWN;
  const [, kind, rest] = m;
  const later = (x) => x.at > at;
  if (kind === 'function' || kind === 'procedure') {
    for (const object of splitTop(rest)) {
      const r = routineAt(object);
      if (!r || r.args === null) return `removes ${kind} ${r?.name ?? object} without naming its parameters`;
      const again = makes.filter((x) => later(x) && x.kind === 'function' && x.name === r.name);
      if (again.length === 0) return `removes ${kind} ${r.name}, and this file does not make it again`;
      if (!again.some((x) => sameInputs(r.args, x.args))) {
        return `makes ${kind} ${r.name} again with other parameters: (${r.args.join(', ')}) became (${again[0].args.join(', ')})`;
      }
    }
    return null;
  }
  if (kind === 'policy' || kind === 'trigger') {
    const p = rest.match(new RegExp(`^(${NAME}) on (${NAME})$`));
    if (!p) return UNKNOWN;
    const again = makes.some((x) => later(x) && x.kind === kind && x.name === p[1] && x.table === bare(p[2]));
    return again ? null : `removes ${kind} ${p[1]} on ${bare(p[2])}, and this file does not make it again`;
  }
  if (kind === 'view' || kind === 'materialized view' || kind === 'index') {
    const want = kind === 'index' ? 'index' : 'view';
    for (const object of splitTop(rest)) {
      if (!makes.some((x) => later(x) && x.kind === want && x.name === bare(object))) {
        return `removes ${kind} ${bare(object)}, and this file does not make it again`;
      }
    }
    return null;
  }
  return `removes ${kind} ${splitTop(rest).map(bare).join(', ')}`;
}

/** A select whose every item is one call of set_config. */
function onlySettings(sql) {
  return splitTop(sql.replace(/^select /, '')).every((item) => {
    const m = item.match(/^(?:pg_catalog\.)?set_config ?/);
    if (!m || item[m[0].length] !== '(') return false;
    const [, end] = parens(item, m[0].length);
    return /^( as \S+)?$/.test(item.slice(end));
  });
}

function reasonFor(sql, at, makes) {
  const scs = sql.match(/^set (?:session |local )?standard_conforming_strings(?: to | ?= ?)(.*)$/);
  if (scs && scs[1] !== 'on') return 'the scan cannot read the strings after this setting (a backslash in a string may then end it early)';
  if (/^(begin|commit|start transaction|set|reset)\b/.test(sql)) return null;
  if (/^(create|comment on|grant|insert into|alter policy)\b/.test(sql)) return null;
  if (new RegExp(`^alter publication ${NAME} add table\\b`).test(sql)) return null;
  if (/^alter default privileges\b/.test(sql)) return / revoke /.test(sql) ? 'takes a default right away' : null;
  if (/^alter table\b/.test(sql)) return alterTable(sql);
  if (/^alter (function|procedure)\b/.test(sql)) return alterRoutine(sql);
  if (/^revoke\b/.test(sql)) return revoke(sql, at, makes);
  if (/^drop\b/.test(sql)) return drop(sql, at, makes);
  if (/^select\b/.test(sql)) return onlySettings(sql) ? null : 'a SELECT that runs code at once';
  if (/^do\b/.test(sql)) return 'a DO block runs at once';
  if (/^execute\b/.test(sql)) return 'EXECUTE runs dynamic SQL at once';
  if (/^call\b/.test(sql)) return 'CALL runs a procedure at once';
  if (/^(update|delete|truncate|merge|copy)\b/.test(sql)) return ROWS;
  if (/ rename /.test(` ${sql} `)) return 'renames something';
  return UNKNOWN;
}

/** Every flagged statement of a migration's text: [{ line, reason }]. */
export function scanSql(text) {
  const list = statements(text);
  const makes = made(list);
  return list
    .map((s, at) => ({
      line: s.line,
      reason: s.open ? 'the scan cannot read this statement to its end (an open quote, comment or dollar quote)' : reasonFor(s.sql, at, makes),
    }))
    .filter((flag) => flag.reason !== null);
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  scriptPath !== '' &&
  (process.platform === 'win32' ? scriptPath.toLowerCase() === selfPath.toLowerCase() : scriptPath === selfPath);

if (isMain) {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error(`migration-scan.mjs: no such migration file: ${file ?? '(none)'}`);
    process.exit(2);
  }
  let flags;
  try {
    flags = scanSql(readFileSync(file, 'utf8'));
  } catch (err) {
    // Exit 1 means "flagged", which allow_destructive may let through; a broken scan is exit 2.
    console.error(`migration-scan.mjs: the scan itself failed on ${file}: ${String(err?.message ?? err).split('\n')[0]}`);
    process.exit(2);
  }
  for (const flag of flags) console.log(`${flag.line}\t${flag.reason}`);
  process.exit(flags.length === 0 ? 0 : 1);
}
