# Screen by screen — the operator's list (started 2026-09-26)

The loop, in the operator's words: see the screen as it is now beside the refreshed version, give
changes, answer questions until it is what they want — then that screen is built.

**The reference is the Before / After viewer** — `.shots/refresh/index.html`, built by
`docs/mockups/refresh/` (its README says how). Both phones are the real app, clickable, on sample
data, with one Dark / Light pill for both. The operator: "All i have to do is reference this html
exactly and have entire UI/UX refreshed without any bugs". Nothing reaches the real app until the
operator says "build it"; then `docs/mockups/refresh/after.patch` is the change, whole.

The earlier Lux-in-light pages (`docs/mockups/html/lux/modes/`, written by `lux-modes.mjs`) are
superseded by the viewer: the operator judged the Lux drawings "unrealistic" beside the phone, and
the viewer renders the app itself instead.

## Everywhere, both modes

1. **One font.** The phone's own system font everywhere, no serif. The operator, 2026-09-26: "so
   i want this font… change any font from everywhere to this (default one i already have on the
   app)". After: `fonts.displayHero` is undefined, so every display line takes the system face;
   `tests/themeTokens.test.mjs` pins it. (The viewer draws the system face with Inter, "Like my
   iPhone".)
2. **Emerald Lux, dark and light.** After: the Lux palette in dark (`ui/tokens.ts`, `lib/theme.ts`
   dark values — ground #0A1A17, mint #7EE2B4 action, gold #E9C170 for money only, mint CTA
   gradient), and light kept consistent with it.
3. **Broken icons fixed**, both modes: the viewer shows every icon at its own size; selected chips
   now carry a check glyph (M-35).
4. **No B mark except Launch.** "anywhere there is this Icon... please get rid of it" / "Keep it on
   launch only". After: the ghost B leaves Profile, Account & safety, Compare bids, Payment
   methods and the worker's payout card (a plain shield-check there); `screens/LaunchScreen.tsx`
   keeps `BrandLogo`.
5. **The bottom nav bar is untouched**, in both modes: "please dont touch the bottom nav bar… I
   like the current bottom nav bar". Its colours are frozen through `navBarPalette()`; no tab is
   added, renamed or badged.

## Rulings on the audit's calls (2026-09-26)

1. **Phone stays first** on Welcome (SMS off or not), so the audit's "email first" is not taken;
   "Use Email Instead" now carries what was typed (M-18).
2. **"Send a bid" is the main button** on a job — filled and pinned (M-2).
3. **Forgot password is added** (M-21): "Forgot password?" on email sign-in, a reset email, and a
   "Set a new password" screen the email link opens.
4. **The B stays on Launch only.**
5. **All screen fixes** — "All screen fixes (Recommended)" — except where a ruling above says
   otherwise, or a fix needs the server (listed below).

## What the After changes, screen by screen

- **Post a job** (M-7): Continue pinned at the bottom of every step, riding the keyboard, and
  when it is disabled it says why ("Add a title to continue"…); "Required" on Title, Description,
  Category and Area; "Other" is one tap (no second list); a plain back chevron; Review opens with
  the summary and every row jumps back to its step; "Ask for bids | Set a price" on the step,
  above the amount; backing out keeps the draft (My jobs shows it, with "Discard draft").
- **A job with bids / the client's job** (M-1, M-4, M-5): one pinned primary by state (Accept $X,
  Compare N bids, Protect payment in checkout, Track worker, Review & approve, Leave a review);
  the all-in price on each bid; the accept dialog shows agreed price + protection fee + total.
- **A job, for the worker** (M-2, M-4, M-37): "I'll do it for $X" is the filled, pinned primary
  with "Write a bid" beside it, a listed-price bid lands on Bid sent, and one line says questions
  go in the bid because chat opens on hire.
- **Approve** (M-6): "Approve & release payment", the auto-release countdown, and the amount the
  card was charged at checkout (the protection fee included — never said to go to the worker).
- **The worker's job** (M-3, M-27): Getting there first (exact address → Apple Maps, the arrival
  window, Message); one progress stepper; one pinned button that is always the next step (I'm on
  my way → I've arrived → Start job → Mark complete); before the payment is protected the primary
  is Message and "Start anyway" confirms; Route & arrival's last button is Start job.
- **Profile** (M-8, M-16, M-22, M-24): "Your profile" opens on you (photo, name, rating); the one
  standing mode switch in both modes (also on Account & safety); rows in the mode's order;
  "Notification settings", "Notification feed", "Earnings & payouts"; Account & safety a full row;
  every page titled by the row that opened it.
- **Homes** (M-12, M-13, M-15, M-24, M-20, M-29): customer Home is posting (the field, the pill
  and the tiles start a draft; "Browse workers ›" searches); a bell with an unread dot on both
  Homes; Worker Home's "Needs you" strip; "TAKING NEW WORK · Open / Paused" in place of the untrue
  "Online / Visible to customers"; a nearby-alerts line; "Add your skills" opens the editor.
- **Messages** (M-10, M-11, M-16): a visible ⋯ on every inbox row; ONE manage sheet (Mute, Mark
  as unread, Archive, Hide, then Block…, Report, Clear or delete chat…) with Block's one chooser;
  the chat's ⋯ menu carries Block… and Report in both modes; the tab and its screen both say Inbox.
- **Forms** (M-33): Send bid, Send counter-offer and Delete my account pinned above the keyboard.
- **Smaller**: My jobs gets a back chevron (M-9); the Discover tab root says "Discover" with no
  back (M-16); a Filters chip in the distance row (M-39); the [+] sheet stays up if the switch is
  declined (M-38); a confirmed switch from a job preview opens that job (M-23); Review & tip ends
  with a thank-you and Done / Hire again, and its tip button is always there (M-26); 44pt touch
  targets on the small remove / publish controls (M-34); Buttons grow with Dynamic Type (M-36);
  empty My jobs tabs teach their one step (M-28).

## Not in the After, and why

- **M-19** (collapse Setup and the legal gate into one visit): the legal gate's fail-closed logic
  is fenced tightly; it wants its own run.
- **Server-side halves** — arrival / start pushes and a "payment protected" push (M-26, M-27),
  the payouts nudge from `my_payouts_status()` (M-14): migrations and edge work, not screens.
- **M-20's silent location write** (saving the worker's home area from the first location fix):
  not done — a location stored without being asked. The status line tells the worker instead.
- **Tab badges** (M-15, M-24) and **the My Jobs tab** (M-9): the nav bar is untouched by ruling.
- **M-31 / M-32 / M-36 in full** (one dialog grammar, one destructive rule everywhere, 12pt caption
  floor): broad sweeps; only Delete account's pinned red button and the Button min-height landed.
- **M-12's label table** (one name per service across Home, the wizard and Filters): a data
  change across three surfaces; not in this pass.
- **M-17** (one bid / offer vocabulary and button weight everywhere) and **M-25** (one filter
  memory and one radius across Worker Home, Available Jobs and the Map): cross-surface state and
  copy sweeps, each its own pass; M-39's Filters chip is the only part of M-25 that landed.
