# DECISIONS — the decisions in force

One line per decision that still applies. The full text of every decision up to 2026-10-06 is
`docs/archive/DECISIONS-2026-10.md`, kept verbatim; `L<n>` in the last column is its line. This
index says what applies; the archive says why.

- **Also binding, kept elsewhere:** the standing decision table D-1…D-16 is
  `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2 (D-3 carries ADR-0013, the fee rates; its original
  is `docs/archive/BRAZOS_TARGET_ARCHITECTURE_v2.md` §12.1). Prior history, not restated here:
  `DECISIONS.md` at the repository root (the phases 6–12 forks) and `docs/emerald-v2/DECISIONS.md`
  (the Emerald V2 redesign forks).
- **Old pointers** such as "`docs/DECISIONS.md` 2026-09-30 entry (4)", "DECISIONS 2026-09-20
  sitting 3, (8)" or "DECISIONS 19" resolve in the archive exactly as written: find the date, then
  the item.
- **IDs are new:** `D-<yyyymmdd>-<k>`, with the archive's sitting tag (n1, n3, s2, s3) where a date
  holds several sittings. k is a serial within the date, not the archive's item number. The ID
  follows the archive's section; Date is the ruling's own date (s3-9 to s3-12 were ruled on
  2026-09-21).
- **Superseded, so not listed:** the n8 file move (L56, done); the two-line hero sub-copy (L73, by
  D-20260920-s3-6); N3's gold [+] (L66, by D-20260917-1); the mint bell pill (L164, by
  D-20260928-1); the Welcome and Sign-in serif (L129–135, by D-20260926-2); a pinned Continue on
  every Post-a-job step (L140, by D-20260927-6); Home's "Browse workers" link (L140, by
  D-20260927-7); the Lux CTA gradient (L166, declined in D-20260929-1).
- **Not decisions, so not listed:** fences moved with a ruling, harness and viewer notes, run
  lists, build steps, open questions and operator to-dos. Open items live in `HANDOFF.md`.
- **To add a decision:** append `| D-<yyyymmdd>-<k> | <date> | <decision> | <full text> |`. A
  decision longer than its row gets a `### D-<id>` section under the table, and the row points at
  it. When a decision replaces a row, delete that row and name it in the new one.
- A taste decision (font, colour, asset, spacing) is never reversed within 48 hours of its date.
- Budget: 40,000 bytes (`tests/docsBudget.test.mjs`).

| ID | Date | Decision | Full text |
|-|-|-|-|
| D-20260830-1 | 2026-08-30 | Governance-kit changes need a named failure they would have prevented (the archive's D-0) | L8 |
| D-20260831-1 | 2026-08-31 | iOS is the only v1 release target; Android stays buildable, not released | L10 |
| D-20260831-2 | 2026-08-31 | Reviews are double-blind: hidden until both sides write, or 7 days, whichever comes first | L13 |
| D-20260831-3 | 2026-08-31 | Review writing window: 30 days from job completion, separate from the blind window | L14 |
| D-20260831-4 | 2026-08-31 | Two reputations per person (worker / customer), derived per review, no role column | L15 |
| D-20260831-5 | 2026-08-31 | A new rating shrinks to the platform prior; shown as "New" under 3 revealed reviews | L16 |
| D-20260831-6 | 2026-08-31 | Would-you-hire-again captured per review; rehires counted; workers see client stats | L17 |
| D-20260831-7 | 2026-08-31 | The legacy mixed rating aggregate (`recompute_profile_rating`, `profiles.rating_avg` / `rating_count`) stays untouched; the list surfaces and its trigger stay on it until a schema run | L18 |
| D-20260831-8 | 2026-08-31 | `docs/architecture.md` reconstructed from code still counts as Gate 1's output doc | L20 |
| D-20260901-1 | 2026-09-01 | One rating number shown everywhere (shown_average or "New"); the raw average is never shown | L23 |
| D-20260901-2 | 2026-09-01 | The default reputation shown is the worker one; the customer one only via the reviews toggle | L24 |
| D-20260901-3 | 2026-09-01 | Skipping would-you-hire-again stays legitimate: NULL is valid, no Skip control | L25 |
| D-20260901-4 | 2026-09-01 | ReviewSection always uses the other person's first name only, both roles | L27 |
| D-20260901-5 | 2026-09-01 | LLC / EIN / bank, Stripe verification and the domain start pre-TestFlight, not before | L29 |
| D-20260901-6 | 2026-09-01 | Audit budget: 2 audits in total (Gate 0, pre-TestFlight); anything else is a scoped fix run | L31 |
| D-20260901-7 | 2026-09-01 | `docs/SCOPE.md` and `docs/DOMAIN.md` change only through a dated DECISIONS entry | L33 |
| D-20260901-8 | 2026-09-01 | The production ref lives only in the guard machinery (the `.claude/` deny matrix and hook, the CLAUDE.md sentinel, the refusal tests); docs say "the production ref" | L35 |
| D-20260901-9 | 2026-09-01 | Real secrets live only under `%LOCALAPPDATA%\BRAZOS\`; `.env` holds client-public values only | L37 |
| D-20260902-1 | 2026-09-02 | The Gate 2 money walk is one Maestro flow on EAS Workflows, workflow_dispatch only, against 2 staging accounts | L39 |
| D-20260902-2 | 2026-09-02 | Maestro: dismiss the keyboard after every typed field; a silent wait asserts the screen's own error text and fails in 30 s; an optional `build_id` reruns a flow-only fix on the last binary | L41 |
| D-20260902-3 | 2026-09-02 | Maestro: `hideKeyboard` after single-line fields; a static-label tap after multiline fields | L43 |
| D-20260903-1 | 2026-09-03 | The Maestro worker fixture is Connect-onboarded once, in Stripe test mode, by the operator; the flow still never opens payout setup | L45 |
| D-20260904-n3-1 | 2026-09-04 | Auto-release gates on the customer being TOLD (a notification row exists), not on push delivery; 7-day hard fallback | L47 |
| D-20260904-n1-1 | 2026-09-04 | Nearby alerts default ON for every user; the one-tap opt-out stays | L50 |
| D-20260904-n1-2 | 2026-09-04 | One theme: light and dark render from one token set in the device's appearance; the picker stays; not a second theme | L51 |
| D-20260904-n1-3 | 2026-09-04 | `accepting_work` defaults ON for new profiles (schema default, confirmed) | L52 |
| D-20260904-n1-4 | 2026-09-04 | An ad-hoc `.shots` audit run is advisory only, not one of the two budgeted audits | L53 |
| D-20260904-n1-5 | 2026-09-04 | The worker's 3 bid numbers come from the server's `quote_job_price()`, never a client-side rate | L54 |
| D-20260905-1 | 2026-09-05 | The 10-user TestFlight cohort runs on staging with test money; production untouched until real money | L59 |
| D-20260905-2 | 2026-09-05 | Posted-price choice at posting is in v1: the customer picks a posted price or open bids (not Instant Book) | L60 |
| D-20260905-3 | 2026-09-05 | Support contact is brazosmvp@gmail.com, one mailto row on Profile Settings | L61 |
| D-20260905-4 | 2026-09-05 | Customer Home gets a "needs your move" attention section, from existing data only | L62 |
| D-20260907-1 | 2026-09-07 | claude.ai project knowledge syncs through the GitHub integration, not the bundle-upload script | L64 |
| D-20260908-1 | 2026-09-08 | 19 dialled nav / home / postJob / messages values (bar height 70, etc.) became the shipped UI defaults | L66 |
| D-20260917-1 | 2026-09-17 | The dark centre [+] fill is the post-pill green (postPillGreen), reversing N3's gold; frozen since | L69 |
| D-20260917-2 | 2026-09-17 | "Nearby" removed from customer Home; "Your jobs" (the 3 most recent posted) takes its slot | L70 |
| D-20260917-3 | 2026-09-17 | Both Homes share one horizontally sliding row of 25 service tiles (ServiceTileRow); chip rows retired | L74 |
| D-20260918-1 | 2026-09-18 | The customer Home task card replaces the standalone search bar and promo card with one combined card | L77 |
| D-20260918-2 | 2026-09-18 | The [+] sheet is G1 "Clear" glass, docked, 5 fixed rows (Needs you / Post a job / Hire again / My jobs / Switch) | L80 |
| D-20260918-3 | 2026-09-18 | Customer Home's own "Switch to Worker" pill removed; it lives only in the [+] sheet; Worker Home keeps its own | L81 |
| D-20260919-1 | 2026-09-19 | The web harness export renders real CSS backdrop-filter blur, so glass renders honestly | L84 |
| D-20260919-2 | 2026-09-19 | Create-sheet rows match the G1 mockup exactly (no top hairline, dim hints, 2-bar plus glyph) | L85 |
| D-20260919-3 | 2026-09-19 | The Post-a-job row's disc is a solid 40pt rounded-square green with a white plus, not G1's circle | L86 |
| D-20260919-4 | 2026-09-19 | Discovery filters: 5 sorts (Smart Match default / Newest / Budget / Distance / Fewest bids), a date window, 11 category chips, server radius cap 50 → 3000 | L89 |
| D-20260919-5 | 2026-09-19 | Map: glass search pill and distance pill, Today chip only (Nearby retired on the map), 3-stop draggable PeekSheet jobs sheet, teardrop pins | L90 |
| D-20260919-6 | 2026-09-19 | Filters sheet rebuilt: 5 pill rows; Custom opens a checkmark popover; chosen = emerald tint (not gold); FilterSlider retired | L91 |
| D-20260920-1 | 2026-09-20 | A popup over a sheet renders into that sheet's own overlay slot, never a nested Modal | L95 |
| D-20260920-2 | 2026-09-20 | Filters sheet: topRadius 28, sage hairline, pinned footer (Reset / "Show N jobs"); the When row scrolls sideways | L96 |
| D-20260920-3 | 2026-09-20 | Map peek row: neighbourhood-only location, abbreviated day word by the category chip, fixed-top pay column | L97 |
| D-20260920-4 | 2026-09-20 | The jobs sheet sizes to its actual rows (capped); pull / toggle disabled when nothing lies beyond the peek | L98 |
| D-20260920-5 | 2026-09-20 | The map search field gets the brighter emphasis="ink"; dark glass panes get a diagonal sheen highlight | L99 |
| D-20260920-s2-1 | 2026-09-20 | Dark pane "recipe D": richer gradient / rim / sheen / glow / saturation for the search pill, jobs sheet and Filters pane; light stays flat | L102 |
| D-20260920-s2-2 | 2026-09-20 | The Filters sheet edge is a top-only line, no side or bottom rim; other panes keep the full rim | L103 |
| D-20260920-s2-3 | 2026-09-20 | Every dark pane draws its rim only, no separate inner specular line | L105 |
| D-20260920-s2-4 | 2026-09-20 | Light-mode peek-row price amount is #C08F2E for contrast (the amount text only) | L106 |
| D-20260920-s2-5 | 2026-09-20 | Map search pill 62pt tall, radius 31, bigger magnifier and mic; the "Any" pill 34 tall | L107 |
| D-20260920-s2-6 | 2026-09-20 | Available Jobs card layout "a1": tighter, one-line facts row, square picture sized to the text block (~118pt) | L108 |
| D-20260920-s2-7 | 2026-09-20 | Jobs sheet: 3 vertical stops (mini / peek / full) resting on the nav bar; Best Match = profile categories ∪ listed-services categories | L109 |
| D-20260920-s2-8 | 2026-09-20 | Pane rims glow: search pill and Today chip emerald, jobs sheet bright green, Filters sheet hairline only | L110 |
| D-20260920-s2-9 | 2026-09-20 | Available Jobs: one constant 118-tall picture; the chip keeps its full label unless it overlaps the pay; one shared useScrollClearance() hook everywhere | L111 |
| D-20260920-s3-1 | 2026-09-20 | The Filters sheet tint is the mockup's exact gradient (measured); the Map keeps recipe D | L114 |
| D-20260920-s3-2 | 2026-09-20 | The Filters sheet's chosen-pill green is the mockup's #84dfaa (light unchanged) | L115 |
| D-20260920-s3-3 | 2026-09-20 | Popups (Distance / Budget / Date) are flat, never gradient; values centred, tick pinned left, the date popup 192 wide | L116–117 |
| D-20260920-s3-4 | 2026-09-20 | Popups use iOS's own scroll indicator, flashed once on open; no custom scrollbar | L118 |
| D-20260920-s3-5 | 2026-09-20 | The Sort popup gets a 6th row "Reset" (latest added); light-grey dividers; footer button centred | L120 |
| D-20260920-s3-6 | 2026-09-20 | Home: one 24pt rhythm between blocks; field 56pt, radius 20, mic-only trailing; 4 whole tiles fill the row, none peek; 3-line tagline | L121 |
| D-20260920-s3-7 | 2026-09-20 | Home's dark hero image feathered and the ground pooled to blend the seam; the light hero untouched | L122 |
| D-20260920-s3-9 | 2026-09-21 | Dark-mode direction: "Emerald Lux Glass" (teal gradient ground, lit glass, mint action, gold for money only, glass nav) | L127 |
| D-20260920-s3-10 | 2026-09-21 | The mode switch is a ground-coloured "glass wipe" carrying a capsule that names the new mode | L128 |
| D-20260920-s3-11 | 2026-09-21 | Welcome: the Lux 3-disc art with a rim-glint light looping the lead action; 3 actions: phone first, email second, the sign-in link third | L132 |
| D-20260920-s3-12 | 2026-09-21 | Both Sign-in screens match Welcome's styling; Continue pinned as a footer riding the keyboard; iOS-circle back button; no floating "Go" key | L135 |
| D-20260926-1 | 2026-09-26 | A redesign is compared against the real app itself (a clickable before / after HTML harness), not static mockups | L138 |
| D-20260926-2 | 2026-09-26 | ONE FONT: the system face everywhere, no serif; the launch "B" mark stays launch-only; nav bar colours frozen | L139 |
| D-20260926-3 | 2026-09-26 | ~39 UX-audit fixes ruled into the After (pinned primaries, Profile hub reorganised, Forgot password, etc.) | L140 |
| D-20260927-1 | 2026-09-27 | One flat mint #4FC58C is the action / CTA colour; gold only for field labels, eyebrows, money and the greeting name | L145 |
| D-20260927-2 | 2026-09-27 | The card is one flat Lux-glass material (fill .52, rim .20, white specular, shadow); light = a plain white card | L146 |
| D-20260927-3 | 2026-09-27 | The Lux gradient ground is drawn behind every dark screen; the Home atmosphere raster is retired; auth corner rings removed | L147 |
| D-20260927-4 | 2026-09-27 | The Map screen and Filters sheet are pinned to the pre-refresh dark palette by context; the nav bar and wizard progress bar are pinned too | L148 |
| D-20260927-5 | 2026-09-27 | Setup screens and the legal gate adopt the new dark scheme; the legal-gate fence goes from exact-match to opt-in | L149 |
| D-20260927-6 | 2026-09-27 | Post-a-job steps 1–3 drop the pinned Continue footer; forward motion is the header's step link, greyed with an inline reason | L150 |
| D-20260927-7 | 2026-09-27 | Home's "Browse workers" link removed; section titles become gold eyebrows; the task-card pill takes the system CTA colour | L151 |
| D-20260927-8 | 2026-09-27 | Added motion: the published-job checkmark draws itself, a card press spring, progress-bar crossfades | L152 |
| D-20260927-9 | 2026-09-27 | ~37 long subtitles and hints cut to one line; the money, no-tracking and sandbox honesty sentences stay long on purpose | L154 |
| D-20260927-10 | 2026-09-27 | Every category glyph on a card is the Lux line icon, mint in dark; Worker Home's gold hairlines become the plain card-rim colour | L155 |
| D-20260927-11 | 2026-09-27 | The search field's dark fill is the shared Lux well colour (wells.field); magnifier and idle mic mint in dark | L158 |
| D-20260927-12 | 2026-09-27 | Card material tuned past Lux: fill .58, rim .24, specular .22, shadow 12px / 34px at .42 | L159 |
| D-20260927-13 | 2026-09-27 | shadows.ctaDark glows under every primary Button and the Home pill in dark; the CTA fill stays flat mint | L160 |
| D-20260927-14 | 2026-09-27 | SegmentedControl is a Lux glass track with a filled mint chosen cell, 52pt tall, for every segmented control | L161 |
| D-20260927-15 | 2026-09-27 | Hub-card next-action labels split at their em dash onto two right-aligned lines | L162 |
| D-20260927-16 | 2026-09-27 | My Jobs header minimised (no eyebrow or icon); a count badge beside "YOU POSTED"; "Post another job" is a small hugging pill | L163 |
| D-20260927-18 | 2026-09-27 | Post-a-job step boxes are Lux pop-out cards (title / description, privacy notice, area / address, summary) | L165 |
| D-20260928-1 | 2026-09-28 | Reversals: auth field labels mint (sign-in / up only); money text gold → white everywhere; Assigned pill blue → gold; light section labels antique gold; Filters gets a Cancel; the bell is a bare bell with a red count badge | L169 |
| D-20260928-2 | 2026-09-28 | New shared colour roles (error red, `mark`, `grey`, waiting fill / ink, stage inks, the status-pill recipe, dropdown material); ~16 spots stay gold in light by name | L170 |
| D-20260928-3 | 2026-09-28 | Category glyphs are baked line-icon PNGs (with solid twins) through one CategoryGlyph component; the unread-message badge is a count, not a dot | L171 |
| D-20260928-4 | 2026-09-28 | One noun per audience for bid / offer copy; one confirmAsync dialog engine; one SheetHeader pattern; one session-only filter memory shared by the Map and the job list | L172 |
| D-20260929-1 | 2026-09-29 | Reversals: some light labels back to mint; auth buttons radius 22; the light eyebrow back to emerald (25 labels keep antique gold through eyebrowGold); status pills lose their rims; the Lux CTA gradient declined | L178 |
| D-20260929-2 | 2026-09-29 | Card material pick "S": a dark opaque wash, not blur; light white → #F9F8F3; popups get heavier blur on the `menu` material; one shared sheet-presenter motion hook; a soft-blue message-notification colour with day-grouped folding | L179 |
| D-20260929-3 | 2026-09-29 | Profile hub: identity card first (one Edit pill), mode card, 4 eyebrow-grouped sections, Sign out last and alone; Past Work moved to Profile details | L180 |
| D-20260929-4 | 2026-09-29 | A folded bid notification keeps the trigger's own amounts (money is never re-formatted outside `formatBudget()`); wording "2 new bids on your job", the bidders, then `on <job>.` | L181 |
| D-20260930-1 | 2026-09-30 | 4 features in v1: the Undo toast (archive / mute / mark unread); Running late 10 / 20 / 30 min chips; the "Need it today" toggle; two dictation mics (Post-a-job title and description) | L189 |
| D-20260930-3 | 2026-09-30 | Quiet hours run midnight to 6 am, off until each person turns them on; category posting questions (2–4 each) written by the build run, editable later | L191 |
| D-20260930-4 | 2026-09-30 | 4 more features in v1: the post-release receipt email, the lock-screen live card, hire from the push, repeat jobs (first refusal, not a calendar) | L192 |
| D-20260930-5 | 2026-09-30 | Repeat-job visits: weekly / biweekly / monthly; a 24 h first refusal to the same worker 3 days ahead; either side can stop or drop; every visit is its own job through accept_offer() / transition_job_status() | L193 |
| D-20260930-6 | 2026-09-30 | Hire from the push: the button reads "Accept & pay"; a tap opens an in-app confirm (never pays silently); a declined saved card alerts in-app and pushes a Checkout link | L196 |
| D-20260930-7 | 2026-09-30 | The receipt email goes through Resend's HTTP API, card payments only (no sandbox receipts); "skipped" until RESEND_API_KEY and RECEIPT_FROM are set | L197 |
| D-20260930-8 | 2026-09-30 | Repeat-job refusals and posts go out 9 am–9 pm New York only; too-close visits skip; moving or cancelling the first visit moves or ends the series | L198 |
| D-20260930-9 | 2026-09-30 | The lock-screen live card ships as inert code (reaches the native module by name only if present); the operator installs the package, plugin and push keys, then rebuilds | L199 |
| D-20261003-1 | 2026-10-03 | Sandbox UI strings are plain product copy ("Test mode — no real money moved.", etc.), no developer vocabulary | L202 |
| D-20261003-2 | 2026-10-03 | A legal-gate failure admits only on-device proof that the server confirmed THIS account accepted the CURRENT Terms and Privacy; otherwise it fails closed; sign-out always works locally | L203 |
| D-20261003-3 | 2026-10-03 | SCOPE.md's "built already" voice-search line also names the in-v1 dictation's on-device boundary; no scope change | L205 |
| D-20261011-1 | 2026-10-11 | Core rules block replaced by the owner's 2026-10-11 version (a run never waits at night; hard stops only: sending to real people, moving real money, deleting data with no backup, store submissions; spending money or a red deploy = parked step). Production deploys stay manual. Critical folders listed in CLAUDE.md. | `CLAUDE.md` |
