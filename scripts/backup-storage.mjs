/**
 * Copies every object in every Storage bucket of ONE Supabase project to a
 * folder, for the backup workflow (.github/workflows/backup-staging.yml).
 *
 * Dependency-free (Node 24 fetch). Reads SUPABASE_ACCESS_TOKEN and
 * SUPABASE_PROJECT_REF from the environment, asks the Management API for the
 * project's service key (never printed, masked for the Actions log), lists
 * buckets, walks each bucket's folders and downloads every file. Prints counts
 * and bytes only — never a key, a URL with a key, or file contents.
 *
 *   OUT_DIR=backup/storage node scripts/backup-storage.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const outDir = process.env.OUT_DIR || 'backup/storage';
if (!token || !ref) {
  console.error('FATAL: SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  process.exit(2);
}

const api = `https://${ref}.supabase.co/storage/v1`;

async function json(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url.replace(ref, '<ref>')} -> ${res.status}`);
  return res.json();
}

// 1. The service key, from the Management API (the access token is the only
//    credential this job holds). Legacy projects name it "service_role"; newer
//    ones may expose an sb_secret_ key typed "secret". Either reads Storage.
const keys = await json(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
const key = (keys.find((k) => k.name === 'service_role') ?? keys.find((k) => k.type === 'secret'))?.api_key;
if (!key) {
  console.error('FATAL: no service key in the Management API answer');
  process.exit(1);
}
console.log(`::add-mask::${key}`);
const auth = { apikey: key, Authorization: `Bearer ${key}` };

// 2. Buckets.
const buckets = await json(`${api}/bucket`, { headers: auth });
console.log(`buckets: ${buckets.length} (${buckets.map((b) => b.name).join(', ')})`);

// 3. Walk and download. The list endpoint returns one level; folders come back
//    with id null, so recurse on them. Pages of 1000.
const manifest = [];
let bytes = 0;
async function walk(bucket, prefix) {
  for (let offset = 0; ; offset += 1000) {
    const entries = await json(`${api}/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    for (const e of entries) {
      const path = prefix + e.name;
      if (e.id === null) {
        await walk(bucket, `${path}/`);
        continue;
      }
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`${api}/object/${bucket}/${encoded}`, { headers: auth });
      if (!res.ok) throw new Error(`download ${bucket}/${path} -> ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = join(outDir, bucket, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, buf);
      bytes += buf.length;
      manifest.push({ bucket, path, bytes: buf.length, updated_at: e.updated_at ?? null });
    }
    if (entries.length < 1000) break;
  }
}
for (const b of buckets) {
  const before = manifest.length;
  await walk(b.name, '');
  console.log(`  ${b.name}: ${manifest.length - before} objects`);
}
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({ ref: '<redacted>', buckets: buckets.map((b) => ({ name: b.name, public: b.public })), objects: manifest }, null, 2));
console.log(`storage: ${manifest.length} objects, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
