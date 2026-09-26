# The refresh — Before / After, from the real app (2026-09-26)

Two copies of the real app, running side by side in one page, driven by the same taps:

- **Before** — the app exactly as it is in the repository today.
- **After** — the same app with the Emerald Lux colours in dark (and a consistent light), the UX
  audit's screen fixes (`.shots/ux-audit/`) and the operator's rulings (`docs/DECISIONS.md`
  2026-09-26). The After lives in a practice copy; **nothing in the real app changes until the
  operator says "build it"**.

A **Dark / Light** pill switches both phones live. Every screen is clickable and animates as the
app does, on sample data that lives in the page only (`mock.js` — no network, no database, no
credentials; external requests are refused).

## Open it

```
.shots/refresh/index.html
```

(open the file in a browser; it needs no server). Pick a screen from the list or the menu;
Replay re-runs its taps; the notes under the phones say what changed and why.

## Rebuild it

```
node docs/mockups/refresh/export.mjs before     # the real app  → .shots/refresh/before-export
node docs/mockups/refresh/export.mjs after      # the practice copy → .shots/refresh/after-export
node docs/mockups/refresh/prepare.mjs before after
node docs/mockups/refresh/validate.mjs after dark    # every screen reached? (also: before, light)
```

- `bootstrap.js` — runs before the app: the URL's scheme, landing and mode; the phone's safe
  area; a live `prefers-color-scheme`; the tap recipes (`press` · `text` · `tab` · `has` · `fill`
  · `scroll` · `wait`); every request handed to `mock.js`.
- `mock.js` — the sample world (you, three people, eleven jobs across every stage, bids,
  payments, messages, notifications) behind a small PostgREST / RPC / auth / storage / functions
  emulator.
- `screens.js` — the 68 screens: name, taps (`steps`, and `afterSteps` where the After moved the
  way there), and the notes.
- `prepare.mjs` — makes each export open from `file://`: relative asset paths, Inter for the
  system face (the iPhone's own look), the iPhone's safe-area insets, and one web-only fix so an
  `edges={['top']}` screen pads only its top, as on iOS.
- `viewer.html` — the page itself.

## Build it (only on the operator's word)

The After is one patch against the repository — every changed screen, component and fence:

```
node docs/mockups/refresh/make-patch.mjs                                   # regenerate from the practice copy
git apply --check --ignore-whitespace docs/mockups/refresh/after.patch     # dry run
git apply --ignore-whitespace docs/mockups/refresh/after.patch
npm run verify
```

It was checked to apply cleanly on `ec9ec36`, and the practice copy it came from passes the
lint-level type check and every test that can run there (1269 / 0 — `safety` and `governance`
need `.claude/` and `.git/`, which the copy does not have). Forgot password needs
`brazos://reset-password` on the Auth redirect list: the patch adds it for the local stack
(`supabase/config.toml`); staging and production are the operator's to add (Auth → URL
Configuration).
