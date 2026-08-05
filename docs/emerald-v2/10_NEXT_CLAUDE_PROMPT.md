# 10 — Copy-Paste Prompt for the Next Claude Coding Session

This prompt implements **only** the bounded task specified in
[09_SETUP_IMPLEMENTATION_HANDOFF.md](09_SETUP_IMPLEMENTATION_HANDOFF.md). It
is not run by this audit. Paste it verbatim to start that session.

---

> **Goal:** Verify and, where necessary, correct the Emerald Trust visual
> tokens used by `screens/SetupScreen.tsx` and `screens/LegalGateScreen.tsx`
> (colors, spacing, radii, type scale in `lib/authTheme.ts`) against the real
> atlas source at
> `design-reference/emerald-auth-v1/_extracted/BRAZOS_Emerald_Trust_UI/` (PDF)
> and `design-reference/06_permissions_mode.png` /
> `design-reference/02_welcome.png`. This is a **polish task, not a rebuild**
> — the screen already implements the atlas's Screen 06 spec (permissions,
> legal status, mode choice, finish CTA) both structurally and, on a spot
> check, visually.
>
> **Context:** Read `docs/emerald-v2/00_EXECUTIVE_SUMMARY.md`,
> `docs/emerald-v2/09_SETUP_IMPLEMENTATION_HANDOFF.md`, and
> `docs/emerald-v2/04_DESIGN_SYSTEM_PLAN.md` first — they contain the full
> audit findings this task is scoped from. Do not re-derive them from
> scratch.
>
> **Files to inspect first (in this order):** `lib/authTheme.ts`,
> `screens/SetupScreen.tsx`, `screens/LegalGateScreen.tsx`,
> `components/SetupChoiceCard.tsx`, `components/SetupRow.tsx`,
> `hooks/useSetupPermissions.ts`, `hooks/useLegalGate.ts`,
> `lib/setupState.ts`, `tests/setupOnboarding.test.mjs`.
>
> **Existing behavior to preserve (do not regress, do not "improve" beyond
> the ask):**
> - Permissions are read on mount, never requested — the OS prompt is spent
>   only on an explicit tap.
> - `SetupScreen` takes `legalComplete` as a prop; do not add a second
>   `useLegalGate()` instance inside it.
> - Navigation follows persistence — `writeSetupRecord` must succeed before
>   `onFinished` is called; a write failure must leave the user retryable
>   with their choices intact.
>   - Sign-out is the only way out of the mandatory step; do not add a skip
>   control.
> - Reduced-motion, accessibility labels/hints, and the 44pt touch-target
>   floor are already implemented — preserve them exactly.
>
> **Scope:**
> 1. Extract or otherwise directly inspect the real color values from the
>    atlas PDF/PNGs for the Setup and Welcome screens (forest/emerald green
>    primary, mint accents, ivory background, gold, ink/muted text neutrals).
> 2. Compare against `lib/authTheme.ts`'s current `authColors` (and
>    spacing/radius/type values if time permits).
> 3. Where a value is wrong, correct it in `lib/authTheme.ts` (single source
>    of truth for this token family — do not hardcode a corrected hex
>    directly in a screen file).
> 4. Where a value is already correct, leave it untouched — this task is not
>    a mandate to change something for the sake of changing it.
> 5. If — and only if — you find a genuine layout/structure deviation from
>    the atlas mock (not just a color/spacing nit), note it, but do not
>    restructure the screen without flagging it back to the user first;
>    this task's default is token correction, not layout changes.
>
> **Non-goals — do not do any of the following:**
> - Do not add persistent customer/worker `mode` state anywhere (device
>   storage or Supabase). The current one-shot `landing` preference in
>   `lib/setupState.ts`/`lib/setupLanding.ts` stays exactly as it is. Mode
>   persistence is separate, later work (see
>   `docs/emerald-v2/03_NAVIGATION_AND_ROUTE_PLAN.md`) and is explicitly out
>   of scope here.
> - Do not touch navigation structure, `App.tsx`, or any file outside the
>   auth/onboarding screens and their direct dependencies listed above.
> - Do not touch `public/`, `hosting/`, `dist/`, `WEB_DEPLOYMENT.md`, the
>   service worker, PWA bootstrap, web deployment config, any `*.web.tsx`
>   file, or the web map implementation, under any circumstance.
> - Do not write or run a Supabase migration.
> - Do not install any package.
> - Do not rename any existing export, route, or file.
> - Do not touch any screen other than `SetupScreen.tsx`/`LegalGateScreen.tsx`
>   and their listed direct dependencies.
>
> **Implementation requirements:**
> - Change values in `lib/authTheme.ts` only; if a component hardcodes a
>   value that should come from the theme, fix the component to reference
>   the theme instead of hardcoding a second corrected value.
> - Keep every change reviewable as a token diff — no drive-by refactors.
>
> **Permission behavior:** unchanged — do not touch
> `hooks/useSetupPermissions.ts`'s request-only-on-tap contract.
>
> **Mode-selection behavior:** unchanged — see Non-goals.
>
> **Compatibility rules:** an existing account that already completed setup
> under the old token values must see no functional change, only a visual
> one. Do not add a version bump or migration to `lib/setupState.ts`'s
> storage key (`brazos.setup.v1.<userId>`) for a pure token change.
>
> **Testing:** run `npm run verify` (lint + test) before and after your
> change and confirm no new failures — the only pre-existing allowed failure
> is `tests/pwa.test.mjs`'s frozen-web-surface version mismatch, documented
> in `CLAUDE.md`. If you add or change any testable behavior (not expected
> for a pure token pass), extend `tests/setupOnboarding.test.mjs` rather than
> creating a new file.
>
> **Acceptance criteria:**
> - `lib/authTheme.ts` values match the atlas source, with each corrected
>   value traceable to where you verified it (cite the PDF page or PNG file
>   you checked it against in the commit message or a short inline comment
>   only if the value is genuinely non-obvious).
> - No behavior change to permissions, legal gating, landing-preference
>   navigation, or sign-out.
> - `npm run verify` clean except the one known pre-existing failure.
> - No file outside the declared scope was touched.
>
> **Git boundaries:** work on the current branch
> (`feature/setup-onboarding-v1`) unless told otherwise; do not switch
> branches; do not push; create one commit for the token correction (a
> second, separate commit only if you also touch `SetupChoiceCard`/
> `SetupRow` structurally, and only with an explicit reason).
>
> **Required final report:** list every value you changed in
> `lib/authTheme.ts` with old → new, and what you verified it against. State
> plainly if you found no discrepancies and made no changes — that is a
> valid, complete outcome for this task, not a failure to find something.
