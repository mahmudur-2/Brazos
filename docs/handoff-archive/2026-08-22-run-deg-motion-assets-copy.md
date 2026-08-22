## 2026-08-22 — RUN D+E+G: motion driver, asset diet, honest copy, dead status writer — COMPLETE

**D — one Animated driver (F-017, F-041, F-052).** `lib/motion.ts` now owns
the platform decision: `USE_NATIVE_DRIVER = Platform.OS !== 'web'`, plus
`JS_DRIVER = false` for the two borderColor animations no platform's native
module can drive (`AuthField`, `PhoneNumberInput` — their literal `false` was
required, not drift, but the fence bans all literals, so they read the named
constant; this is the run's one reported deviation from the dispatch's
enumerated sites). Thirteen files dropped private declarations; PhotoViewer's
seven, PulseDot's two and Customer Home's two hardcoded `true` became the
import; SetupScreen's two opacity-only `false` flipped to the shared constant
(the F-041 behavior change — those pulses now drive natively on device);
Toggle's inline platform read became the import. `tests/motionDriver.test.mjs`
fences it: no `useNativeDriver:` literal, no inline `Platform.` driver, no
redeclaration anywhere outside `lib/motion.ts`. Every fence branch was mutated
red before keeping.

**E — assets (F-016).** Deleted the four orphans re-proven unreferenced this
run by grep over every config, script and source file: `splash-icon.png`
(254,638 B) and the three `android-icon-*.png` (100,485 B) — 355,123 B gone.
The design master `brazos-logo-source.png` (1,887,276 B) moved out of the
bundled tree to `docs/brand-source/`, and `scripts/generate-icons.ps1`
archives the master there now. `node scripts/home-shots.mjs --build` exported
clean afterwards — 40 bundled assets, nothing missing, all four Home shots
rendered. **The downscale commit was SKIPPED: this machine has no image tool**
(no `sharp`/`jimp` in node_modules, no ImageMagick, no Python at all) and
installing one is outside a run's authority. `hero_toolbox_worker.png`
(1329×885 for a 162×108 pt slot) and `app-icon-v2.png` (1254×1254) stay
oversized on the raster roster; that work is owed to a session with a tool.
`brazos_b_drape.png` (F-036) untouched by standing decision.

**G — honest copy and the dead writer (F-007, F-024, F-008).** Customer
Home's search-arrow accessibility label is now `"Search"` (was "Smart
matching is on" — a router the product does not have), and the stale
gold-sparkle comment went with it. `tests/copyHonesty.test.mjs` fences
"smart matching", "matching is on" and the word "AI" out of components,
hooks, lib, modes, navigation, screens and ui entirely — comments included,
since a comment is exactly how the label drifted in. The demand caption now
states only what `similarPostedToday()` measures — `{n} similar jobs posted
today` (`1 similar job posted today` singular), rendering nothing at zero;
no distance or "area" claim survives anywhere. `lib/jobStatusCompatibility.ts`
and its PGRST202 fallback in `lib/jobs.ts` are DELETED, and the
`tests/hardening.test.mjs` test that asserted that writer exists is INVERTED:
it now proves the module stays deleted, no fallback returns, phase31's
`transition_job_status()` remains the only status mover, and nothing under
`lib/`, `hooks/`, `screens/`, `components/` chains `.update()` off the jobs
table at all. `isMissingRpc()` in `lib/profiles.ts` is a different shim and
was deliberately left alone. `scripts/verify-schema.mjs`'s comment naming the
deleted module was corrected in the same commit.

**Suite:** 810 tests at run start → 814 at run end (+3 motion fences, +1 copy
fence, hardening swapped one test for one test), all green, 0 TS errors,
`npm run verify` exit 0 after every commit. **Light mode FROZEN was honored
and proven:** the run's full diff contains exactly one style-sheet line — the
removal of the `jobMetaText` key orphaned by the caption merge — and zero
changed color, spacing, radius or palette values in either theme.

**Device checks OWED (operator, physical device):**
- Live Nearby pulse on Customer Home (driver now platform-derived).
- PhotoViewer pinch-zoom, double-tap zoom, and dismiss springs.
- Setup screen's legal-row completion pulse (now native-driven — F-041).
- Customer Home similar-jobs caption with real jobs posted today.

