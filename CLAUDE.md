# BRAZOS — Repository Instructions

These are permanent working rules for this repository. Follow them every
session, not just when reminded.

## Development mode

- Default and primary target: **Expo / iOS / Android** native app development.
- **Web and PWA development is frozen.** Do not touch web-specific code,
  styling, behavior, or deployment unless the user explicitly asks for
  web/PWA work in that specific message. Adjacent-looking tasks do not
  imply web work is in scope.
- Expo's APIs change significantly between SDKs. Before writing any
  Expo-related code, check the versioned docs for the SDK actually installed
  (see the `expo` version in `package.json`) at
  `https://docs.expo.dev/versions/vXX.0.0/` — don't assume from general
  knowledge or an older SDK's behavior.

## Do not modify unless explicitly requested

This is the frozen web/PWA surface. Leave it untouched even when a task
seems adjacent to it:

- `public/`
- `hosting/`
- `dist/`
- `WEB_DEPLOYMENT.md`
- the service worker
- PWA startup/bootstrap logic
- web deployment configuration
- `*.web.ts` / `*.web.tsx` platform-split files
- the web-specific map implementation

If a task genuinely requires touching one of these, stop and confirm with
the user first — don't assume it's in scope because it seemed necessary.

## Engineering rules

- **Scope discipline** — only inspect files actually required for the
  current task. Never perform repository-wide audits or sweeps unless
  explicitly requested.
- **Smallest safe change** — prefer the minimal diff that correctly
  addresses the request over a more thorough rewrite.
- **No unrelated refactors** — don't restructure, rename, or "clean up"
  working code that isn't part of the request, no matter how improvable it
  looks.
- **No unrequested features** — implement what was asked, not adjacent
  functionality that seems like a natural next step.
- **No `git push`.**
- **No deploys** — web, mobile, or otherwise.
- **No modifying production Supabase** — schema, data, or config. Write new
  migrations as SQL files for the user to review and run themselves; never
  execute changes against production directly.
- **Minimal validation** — run only the validation/build/typecheck commands
  relevant to what actually changed, not the full suite by default.

## Before editing anything

Always run `git status` first and report the current branch and whether the
tree is clean, before making any change. If the branch or tree state looks
unexpected, flag it to the user rather than proceeding silently.
