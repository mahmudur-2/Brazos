## 2026-08-22 (latest) — SECURESTORE SESSION ADAPTER: WIRED AND LANDED

The Supabase auth session now lives in the device keychain. Both dispatched
commits are in: `9552f70` (pure core + its executed ten-test suite, previous
run) and `6e84651` (this run — the wiring, the fence, the dependency, D32).
Bare `npm run verify` exit 0 three times this run: baseline **856** pass,
after the wiring commit **860** pass / 0 fail — the +4 are exactly the new
F-KEYCHAIN fence suite, `tests/secureSessionStorageFence.test.mjs`.

**Landed — `6e84651`:** `lib/secureSessionStorage.ts`, the ONLY importer of
`expo-secure-store` — a try/caught `require('expo-secure-store')` reading as
null when the native module is absent, `legacyStorage` = AsyncStorage,
`isDev` = `__DEV__` — exported as the adapter built by
`createSecureSessionStorage` from `lib/secureSessionStorageCore.ts`.
`lib/supabase.ts` `auth.storage` now points at it; the only other change in
that file is the dropped now-unused AsyncStorage import and the corrected
comment on the storage line. No `storageKey`, no other auth option — the key
stays supabase-js's default. Same commit: app.json / package.json /
package-lock.json land the operator's approved
`npx expo install expo-secure-store` (2026-08-22, run outside the agent
session): `expo-secure-store@~15.0.8`, the SDK 54 match, plus the OPTIONLESS
`expo-secure-store` config plugin entry Expo auto-added to app.json. That
entry stays exactly as Expo wrote it. (The previous version of this section
said no app.json plugin entry was needed; the operator's install superseded
that — the entry exists and stays, still with no FaceID or Android-backup
options, since FaceID-gating reads would change auth UX, which is frozen.)
Decision log: `docs/emerald-v2/DECISIONS.md` D32.

**The fence, proven red first:** mutating `auth.storage` back to plain
AsyncStorage failed F-KEYCHAIN-1 (`auth.storage points at "AsyncStorage",
not the SecureStore adapter`) and F-KEYCHAIN-3, exit 1; reverted, green.
The four fences: auth storage in `lib/supabase.ts` never resolves to plain
AsyncStorage (and that file never references AsyncStorage at all); the
wiring module builds the adapter from the core with the three real surfaces;
ONE wiring path — only the wiring imports the core, only `lib/supabase.ts`
imports the wiring; and no app code names the session key by literal
(`auth-token` or a `'sb-` storage-key prefix, comment-stripped, across
components/dev-tools/hooks/lib/modes/navigation/screens/ui + App.tsx +
index.ts). `lib/supabase.web.ts` (frozen web surface, its own AsyncStorage
client) and `scripts/home-shots.mjs` (seeds `sb-harness-auth-token` into web
localStorage for a fabricated host) are web-only surfaces OUTSIDE the native
fence by design.

**Phase 0 facts, still true and now fenced:** the client passes no
`storageKey`, so the key is supabase-js's default — literally
`` `sb-${baseUrl.hostname.split('.')[0]}-auth-token` ``
(`@supabase/supabase-js/src/SupabaseClient.ts:324`), the project ref being
the first hostname label of `SUPABASE_URL` from `@env`. No app code reads or
writes that key directly anywhere.

**How the operator tells which path a running app took:** exactly one console
line at first session-storage use — keychain path:
`[secureSessionStorage] auth session storage: device keychain (SecureStore).`
— or the `██ DEV FALLBACK ██` warning. The EXISTING development build
predates the native module and will take the dev fallback until a NEW dev
client is built; a release/TestFlight build without the module hard-fails by
design instead of silently downgrading.

**What only a real installed build can confirm (operator, physical device):**
that a NEW dev client (or release build) with the native module logs the
keychain line, not the banner; that an existing signed-in session migrates
silently on first read (no sign-out, AsyncStorage source cleared); that
sign-in / refresh / sign-out survive the chunked write path against the real
keychain and its real ~2048-byte ceiling. Until a new dev client is built,
the existing one showing the `██ DEV FALLBACK ██` banner is CORRECT, not a
regression.

