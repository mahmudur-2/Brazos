// Test helper (not a test file): run one app module under node with every import swapped for a stub.
// The module's types are stripped (node:module stripTypeScriptTypes) and each import line becomes a read
// from `stubs[specifier]` (`.default` for a default import). A specifier without a stub is an error, so
// a new import can never slip past a test unseen.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = (rel) => readFileSync(join(root, rel), 'utf8');

let loads = 0;

export async function loadModule(rel, stubs) {
  const key = `__loadModule${++loads}`;
  globalThis[key] = stubs;
  const from = (spec) => {
    if (!(spec in stubs)) throw new Error(`${rel}: no stub for '${spec}'`);
    return `globalThis.${key}[${JSON.stringify(spec)}]`;
  };
  const named = (list) => `{${list.replace(/\s+as\s+/g, ': ')}}`;
  const js = stripTypeScriptTypes(read(rel), { mode: 'strip' })
    .replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';?$/gm, (_, name, spec) => `const ${name} = ${from(spec)};`)
    .replace(
      /^import\s+(\w+)\s*,\s*\{([^}]*)\}\s+from\s+'([^']+)';?$/gm,
      (_, name, list, spec) => `const ${name} = ${from(spec)}.default; const ${named(list)} = ${from(spec)};`
    )
    .replace(/^import\s+(\w+)\s+from\s+'([^']+)';?$/gm, (_, name, spec) => `const ${name} = ${from(spec)}.default;`)
    .replace(/^import\s+\{([^}]*)\}\s+from\s+'([^']+)';?$/gm, (_, list, spec) => `const ${named(list)} = ${from(spec)};`)
    .replace(/^export\s+\{([^}]*)\}\s+from\s+'([^']+)';?$/gm, (_, list, spec) =>
      list
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n, i) => {
          const [local, exported = local] = n.split(/\s+as\s+/);
          return `const __re${i}_${local} = ${from(spec)}.${local}; export { __re${i}_${local} as ${exported} };`;
        })
        .join(' ')
    );
  if (/^import\s/m.test(js)) throw new Error(`${rel}: an import line the loader does not know`);
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));
}

/** Resolves to true when `promise` settles within `ms`, false otherwise. */
export const settlesWithin = (promise, ms = 50) =>
  Promise.race([promise.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), ms))]);
