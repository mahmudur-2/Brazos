/**
 * secureSessionStorageCore — the auth-session storage adapter that moves the
 * Supabase session out of plain AsyncStorage and into the device keychain
 * (expo-secure-store). This file is the PURE core: every platform surface —
 * the native SecureStore module, the legacy AsyncStorage, `__DEV__` — is
 * injected, so the entire behavior executes under `node --test` with no
 * native module and no device (the themeResolution.test.mjs arrangement).
 * The wiring that hands in the real surfaces lives in a separate module and
 * is the only place `expo-secure-store` is imported.
 *
 * Everything below is deliberate; none of it is incidental:
 *
 * CHUNKING. Expo documents a ~2048-byte per-value ceiling for SecureStore; a
 * Supabase session (two JWTs plus the user object) routinely exceeds it.
 * Values are split into chunks of at most MAX_CHUNK_BYTES (2000) UTF-8 bytes,
 * never splitting a surrogate pair, and reassembled on read.
 *
 * TORN-READ IMMUNITY. Chunks are written under a per-write GENERATION
 * (`<base>.c<gen>.<i>`). The manifest at `<base>` — naming the generation,
 * chunk count and total length — is the completion mark and is written LAST;
 * old-generation chunks are deleted only AFTER it lands. A read concurrent
 * with a write (a token refresh) therefore returns the old value, the new
 * value, or null — never a value assembled from two different writes. Writes
 * are additionally serialized per key within the process. An interrupted
 * write can strand at most its own not-yet-current generation's chunks; the
 * manifest bounds every read, so strands are never readable through the
 * adapter, and the next write of that generation overwrites them.
 *
 * PARTIAL OR CORRUPT READS AS ABSENT. A missing chunk, a chunk the keychain
 * refuses to return, an unparseable manifest, or a reassembled-length
 * mismatch all read as null — auth treats that as signed-out — never as a
 * truncated session.
 *
 * KEY SANITIZATION. SecureStore accepts only [A-Za-z0-9._-]; any other
 * character fails SILENTLY on-device. Every key, chunk keys included, passes
 * through sanitizeStorageKey (illegal characters → '_', deterministic) before
 * any native call, so a later read always finds what an earlier write left.
 *
 * ONE-TIME SILENT MIGRATION. A read that finds no manifest consults the
 * previous storage (AsyncStorage) at most once per key, ever — a `.migrated`
 * marker records that the question was answered. On a hit the value is
 * written through the adapter, cleared from AsyncStorage and returned:
 * existing signed-in users are not signed out, and nothing is user-visible.
 * After that, the previous storage is never on the hot path again.
 *
 * DEV FALLBACK vs PRODUCTION HARD FAILURE — deliberate asymmetry. If the
 * native module is unavailable and `__DEV__` is true, the adapter falls back
 * to the previous storage under the RAW key (exactly the old behavior) and
 * logs one unmissable warning. This keeps Metro usable against a development
 * build that predates expo-secure-store. It is a dev-only path by design —
 * a future reader must not mistake it for an accident. If the native module
 * is unavailable in a NON-dev build, every operation rejects loudly: it must
 * be impossible to ship a release that quietly stores tokens in plain
 * storage.
 *
 * Auth behavior is otherwise unchanged: this module changes WHERE the session
 * is written and nothing else.
 */

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface KeyValueStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SessionStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecureSessionStorageOptions {
  /** Returns the native SecureStore surface, or null when the module is not
   *  present in this build. A throwing loader is treated as null. */
  loadSecureStore: () => SecureStoreLike | null;
  /** The previous session storage (AsyncStorage): the migration source, and
   *  the dev-only fallback target. */
  legacyStorage: KeyValueStorageLike;
  /** `__DEV__` at the call site — decides fallback (true) vs hard failure. */
  isDev: boolean;
  warn?: (message: string) => void;
  info?: (message: string) => void;
}

/** Expo's documented ceiling is ~2048 bytes per value; 2000 leaves margin. */
export const MAX_CHUNK_BYTES = 2000;

const ILLEGAL_KEY_CHARS = /[^A-Za-z0-9._-]/g;

/** Deterministic: the same raw key always maps to the same legal key. */
export function sanitizeStorageKey(key: string): string {
  return key.replace(ILLEGAL_KEY_CHARS, '_');
}

/** Split into chunks of at most maxBytes UTF-8 bytes, never mid-surrogate. */
export function chunkValue(value: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  let i = 0;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    let charBytes: number;
    let units = 1;
    if (code < 0x80) {
      charBytes = 1;
    } else if (code < 0x800) {
      charBytes = 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < value.length &&
      (value.charCodeAt(i + 1) & 0xfc00) === 0xdc00
    ) {
      charBytes = 4; // surrogate pair — kept atomic
      units = 2;
    } else {
      charBytes = 3;
    }
    if (bytes + charBytes > maxBytes && bytes > 0) {
      chunks.push(value.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += charBytes;
    i += units;
  }
  chunks.push(value.slice(start));
  return chunks;
}

interface ChunkManifest {
  v: 1;
  gen: number;
  chunks: number;
  length: number;
}

function parseManifest(raw: string | null): ChunkManifest | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) return null;
    const { gen, chunks, length } = record;
    if (typeof gen !== 'number' || typeof chunks !== 'number' || typeof length !== 'number') {
      return null;
    }
    if (!Number.isInteger(gen) || !Number.isInteger(chunks) || chunks < 0 || length < 0) {
      return null;
    }
    return { v: 1, gen, chunks, length };
  } catch {
    return null;
  }
}

const chunkKeyFor = (base: string, gen: number, index: number): string => `${base}.c${gen}.${index}`;
const markerKeyFor = (base: string): string => `${base}.migrated`;

type Backend = { kind: 'secure'; store: SecureStoreLike } | { kind: 'legacy-dev' };

export function createSecureSessionStorage(
  options: SecureSessionStorageOptions
): SessionStorageAdapter {
  const { legacyStorage, isDev } = options;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const info = options.info ?? ((message: string) => console.log(message));

  let backend: Backend | null = null;
  let backendError: Error | null = null;

  function resolveBackend(): Backend {
    if (backend) return backend;
    if (backendError) throw backendError;
    let store: SecureStoreLike | null = null;
    try {
      store = options.loadSecureStore();
    } catch {
      store = null;
    }
    if (store) {
      backend = { kind: 'secure', store };
      info('[secureSessionStorage] auth session storage: device keychain (SecureStore).');
      return backend;
    }
    if (isDev) {
      backend = { kind: 'legacy-dev' };
      warn(
        '[secureSessionStorage] ██ DEV FALLBACK ██ The expo-secure-store native module is not in ' +
          'this build, so the auth session is stored in PLAIN AsyncStorage for this dev session. ' +
          'This fallback is deliberate and dev-only; rebuild the dev client with expo-secure-store ' +
          'included to exercise the keychain path.'
      );
      return backend;
    }
    backendError = new Error(
      '[secureSessionStorage] The expo-secure-store native module is unavailable in a production ' +
        'build; refusing to store auth tokens in plain storage. Rebuild the app with ' +
        'expo-secure-store included.'
    );
    throw backendError;
  }

  async function readNative(store: SecureStoreLike, key: string): Promise<string | null> {
    try {
      return await store.getItemAsync(key);
    } catch {
      return null; // an unreadable entry is treated as absent
    }
  }

  async function deleteNative(store: SecureStoreLike, key: string): Promise<void> {
    try {
      await store.deleteItemAsync(key);
    } catch {
      // best-effort: a failed delete never fails the operation that ordered it
    }
  }

  /** Per-key write serialization: two concurrent writes can never interleave
   *  chunk writes within one generation. */
  const writeTails = new Map<string, Promise<void>>();
  function enqueueWrite<T>(base: string, task: () => Promise<T>): Promise<T> {
    const prev = writeTails.get(base) ?? Promise.resolve();
    const run = prev.then(task);
    writeTails.set(
      base,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  async function writeValue(store: SecureStoreLike, base: string, value: string): Promise<void> {
    const previous = parseManifest(await readNative(store, base));
    const gen = (previous ? previous.gen : 0) + 1;
    const chunks = chunkValue(value);
    for (let index = 0; index < chunks.length; index++) {
      await store.setItemAsync(chunkKeyFor(base, gen, index), chunks[index]);
    }
    // The manifest is the completion mark: readers can see the new value only
    // once every chunk of its generation is already in place.
    await store.setItemAsync(
      base,
      JSON.stringify({ v: 1, gen, chunks: chunks.length, length: value.length })
    );
    // Surplus removal strictly after the completion mark (failure modes i/ii).
    if (previous) {
      for (let index = 0; index < previous.chunks; index++) {
        await deleteNative(store, chunkKeyFor(base, previous.gen, index));
      }
    }
  }

  async function removeValue(store: SecureStoreLike, base: string): Promise<void> {
    const manifest = parseManifest(await readNative(store, base));
    // Manifest first: from this point the value reads as absent, and the
    // chunk deletes below can never expose a partial set.
    await deleteNative(store, base);
    if (manifest) {
      for (let index = 0; index < manifest.chunks; index++) {
        await deleteNative(store, chunkKeyFor(base, manifest.gen, index));
      }
    }
  }

  async function migrateOnMiss(
    store: SecureStoreLike,
    base: string,
    rawKey: string
  ): Promise<string | null> {
    const marker = await readNative(store, markerKeyFor(base));
    if (marker !== null) return null; // answered once already — never re-consult
    let legacyValue: string | null = null;
    try {
      legacyValue = await legacyStorage.getItem(rawKey);
    } catch {
      legacyValue = null;
    }
    if (legacyValue === null) {
      try {
        await store.setItemAsync(markerKeyFor(base), '1');
      } catch {
        // best-effort: the next miss simply asks the (empty) source again
      }
      return null;
    }
    const migrated = legacyValue;
    // Write through first, clear the source after: a crash mid-migration must
    // never lose the session.
    await enqueueWrite(base, () => writeValue(store, base, migrated));
    try {
      await store.setItemAsync(markerKeyFor(base), '1');
    } catch {
      // best-effort
    }
    try {
      await legacyStorage.removeItem(rawKey);
    } catch {
      // best-effort: if the source survives, the next read still hits the
      // keychain manifest and the source stays off the hot path
    }
    return migrated;
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const active = resolveBackend();
      if (active.kind === 'legacy-dev') return legacyStorage.getItem(key);
      const store = active.store;
      const base = sanitizeStorageKey(key);
      const rawManifest = await readNative(store, base);
      if (rawManifest === null) return migrateOnMiss(store, base, key);
      const manifest = parseManifest(rawManifest);
      if (!manifest) return null;
      const parts: string[] = [];
      for (let index = 0; index < manifest.chunks; index++) {
        const chunk = await readNative(store, chunkKeyFor(base, manifest.gen, index));
        if (chunk === null) return null; // missing or unreadable chunk → absent
        parts.push(chunk);
      }
      const value = parts.join('');
      return value.length === manifest.length ? value : null;
    },

    async setItem(key: string, value: string): Promise<void> {
      const active = resolveBackend();
      if (active.kind === 'legacy-dev') return legacyStorage.setItem(key, value);
      const store = active.store;
      const base = sanitizeStorageKey(key);
      await enqueueWrite(base, () => writeValue(store, base, value));
    },

    async removeItem(key: string): Promise<void> {
      const active = resolveBackend();
      if (active.kind === 'legacy-dev') return legacyStorage.removeItem(key);
      const store = active.store;
      const base = sanitizeStorageKey(key);
      await enqueueWrite(base, () => removeValue(store, base));
    },
  };
}
