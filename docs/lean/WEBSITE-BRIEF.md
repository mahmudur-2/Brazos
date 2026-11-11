# Brief for the next chat: the Brazos website (Privacy, Terms, Support)

Written 2026-11-10 by the orchestrating chat, at the owner's request. Read CLAUDE.md first, then this
file. This is a standalone task; it does not continue the e2e loop in HANDOFF.md.

## What the owner wants, in their words

"I'd rather have Fable review the privacy / support / terms and build me a really nice Brazos-inspired
page... with Brazos theme."

## Why it is needed

App Store Connect requires two public web links before review: a **Privacy Policy URL** and a
**Support URL** (audit ledger item O2). Today neither exists.

## The job, in order

1. **Review the three texts (Fable).** Sources: `lib/legal/termsOfService.ts`,
   `lib/legal/privacyPolicy.ts` (the app shows exactly these; versions in `lib/legal/index.ts`), and a
   new Support page. Check each claim against what the code actually does (payments in `lib/payments/`
   and `supabase/functions/`, cancel in `cancel_job()`, data stored and shared, deletion, Report/Block,
   Stripe, push, location). Check Apple's requirements: privacy policy names what is collected, how it
   is used, who it is shared with, retention, and how to delete the account; support page has a working
   contact. Report findings as a list (claim, what the code does, fix). This is a product and accuracy
   review, NOT legal advice: the lawyer review (ledger O1) still happens, and the "Working draft"
   notice stays until the owner says the lawyer has signed off.
2. **Fix the text in the app, one source.** Edit `lib/legal/*.ts` only. Bump `TERMS_VERSION` /
   `PRIVACY_VERSION` in `lib/legal/index.ts` for a substantive change (users are re-prompted). Keep
   `tests/` green; `npm run verify` must exit 0.
3. **Build the website from that same source.** Add `scripts/build-site.mjs` that reads the two legal
   strings from `lib/legal/*.ts` and writes static HTML to a `site/` output folder (git-ignored or
   committed, the chat's call; say which). Pages: `/` (a short home page about Brazos), `/support`,
   `/privacy`, `/terms`, a 404. No framework, no build dependency, no tracking or analytics, no cookies,
   no external scripts. Fonts from Google Fonts only if they match the app; otherwise system fonts.
4. **Make it look like Brazos.** Use the app's brand, not a generic template:
   - Palette `brand` in `ui/tokens.ts`: forest `#064C3B`, emerald `#0D6B52`, gold `#C8A15B`, gold-soft
     `#F3E7CE`, mint `#E5F1EC`, mint2 `#D3E8DF`, ink `#13201B`; the cream/ivory backgrounds are in the
     same file and in `lib/authTheme.ts` (the Welcome / sign-in look: emerald on ivory, gold eyebrows).
   - Artwork: `assets/brand/brazos-b-leaf.png` (the B-leaf monogram), `assets/brand/app-icon-b-leaf.png`,
     `assets/prestige/hero_*` (armchair customer and toolbox worker heroes, light and dark).
   - Look at the Welcome and Sign In screens (`screens/` auth flow) for type scale, small-caps gold
     eyebrows ("WELCOME BACK"), rounded cards and pill buttons. Light and dark both, via
     `prefers-color-scheme`. Phone-first: most visitors arrive from the App Store on a phone.
   - Show the owner 2-3 directions as screenshots first and let them pick (their standing preference:
     options first, the pick becomes the reference).
5. **Deploy (owner clicks).** Cloudflare Pages, free, direct upload: dash.cloudflare.com → Workers &
   Pages → Create → Pages → Upload assets → project name `brazos` (address `brazos.pages.dev`; if
   taken, `brazosapp`) → drag the output folder → Deploy. Clean URLs work (`/privacy` serves
   `privacy.html`). Give the owner these exact steps and the final links. The chat does not log in to
   Cloudflare for the owner.
6. **App Store Connect (owner pastes).** Privacy Policy URL: `https://brazos.pages.dev/privacy`.
   Support URL: `https://brazos.pages.dev/support`.

## Facts the next chat needs

- Support email today: `SUPPORT_EMAIL` in `lib/appLinks.ts` (a Gmail address). The ledger (O2) says a
  non-personal address is better. A custom domain is NOT bought yet: the owner tried the free .me from
  the GitHub Student Pack (Namecheap refused the Gmail address); `brazos.me` showed "Taken" on nc.me
  though the .me registry has no record of it (likely held by the failed order). Open alternatives the
  owner liked: `brazo.me`, `brazosmvp.com`, `brazos.website`, `brazo.tech`. The site must work on
  `brazos.pages.dev` now and move to a custom domain later with no rebuild (relative links only).
- A rough first version (plain styling, built by a throwaway script, text verbatim from the app) sits in
  `C:\Users\mdmah\brazos-site`. Use it only as a content reference; replace it.
- Support page facts already checked against the code (2026-11-10): Cancel is "Cancel job" on the
  customer's job screen (`screens/ClientJobDetailScreen.tsx`); Report and Block are in the
  conversation menu (`screens/MessagesInboxScreen.tsx`, `screens/ChatScreen.tsx`); a worker's profile
  has "Report this profile" (`screens/WorkerProfileScreen.tsx`); account deletion is Profile → Account
  & safety → Delete account.

## Rules (from CLAUDE.md, apply here)

- Never read or change `.env`; never contact production Supabase; never print secrets, phone numbers
  or codes. The repo is public: nothing private goes into the site or the repo.
- Stage by explicit path; `npm run verify` exits 0 before `git push origin mainexpo`; no new
  dependency without flagging it; never edit `.claude/`.
- Legal text has ONE source (`lib/legal/`); the site is generated from it, never hand-copied.
- Done = the owner has opened the live links; until then report "built, not deployed".
