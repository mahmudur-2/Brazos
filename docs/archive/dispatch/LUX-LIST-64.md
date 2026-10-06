# LUX-LIST-64 — the operator's 64 changes to the After (brief)

Written 2026-09-28 from the operator's list sitting (one chat, ~85 pictures). NOTHING was built.
This file is the whole brief: every ruling, number, exception and reference. Read it top to
bottom before touching code. The pictures are backup only (§2); the references outrank them.

## 1. Boundaries and how to run

- Build ONLY in the practice copy `.shots/refresh/practice`. The Before stays exactly as it is.
  The real app's code does not change. The After reaches the repo only as
  `docs/mockups/refresh/after.patch`, applied only when the operator says "build it".
  The viewer is `.shots/refresh/index.html` (Before beside After, dark and light, 68 screens).
- First check: `node docs/mockups/refresh/make-patch.mjs` then
  `git status --short docs/mockups/refresh/after.patch` → no output = the practice copy is the
  committed After (`5f4aaf4`). Pipeline, fences and traps: `HANDOFF.md` §3, §7, §8.
- Run shape: fully autonomous. Questions ONLY for big taste calls, and then as tap-to-answer
  popups (AskUserQuestion, 2–4 options, recommended first) — never as chat text. Small things:
  decide, record in `docs/DECISIONS.md`, report. Answer the operator by item number.
- Rule 0: pictures point at the problem; the references in the repo build the fix. Never copy a
  look from a picture. If a complaint has no reference, say so instead of guessing.
- Rule 0b: every change applies to light mode too — same shapes, sizes and layout; only colours
  and gradients differ. Light-mode looks are copied from the app's own light renders, never
  guessed (the app's light pills are FILLED tints with a near-invisible rim; dark pills are faint
  fill + visible rim). Light was only machine-validated before; look at every light render.
- Everything must feel 120 Hz (Reanimated 4 is installed; native driver; Reduce Motion → still or
  a short fade). No new dependency without stopping (there is no `react-native-svg`).
- End of run: one mobile push, as HANDOFF §11 describes.

## 2. References (paths)

| For | File |
|-|-|
| #42 Publish → Job live, transition C "Seal" + the live page | `docs/mockups/html/refs/publish-moment.html` |
| #45 Assigned card live status, option A "Stage rail" | `docs/mockups/html/refs/live-job-cards.html` |
| #53–#58 Inbox, the FINAL row and glass menu (version 9) | `docs/mockups/html/refs/inbox-clean-list.html` |
| #62 Customer Home, option B "Tucked in" | `docs/mockups/html/refs/home-tucked-in.html` |
| #38 Job summary (UX + layout; app colours; Publish unchanged) | `docs/mockups/html/refs/job-summary.html` |
| #41 Review-step bottom bar (numbers) | `docs/mockups/html/refs/bottom-bar.html` |
| #36/#37 price dropdown UX (packed bundle: 8 boards; UX ONLY, not its look) | `.shots/refresh/refs/price-dropdown.html` (unpack a readable copy at run start into `docs/mockups/html/refs/price-dropdown/`, add #37's icons and #40's white prices there) |
| #8 focus glow, #13 All services sheet, #14 roller/trash icons, #16 How Brazos works, #17 draft card | `.shots/ux-audit/sim.html` (lines 278, 446, 363/388, 1511–1530, 1533) |
| #63/#64 audit fixes (flaw, fix, afterSpec per major) | `.shots/ux-audit/synthesis.json` (M-14, M-25, M-17, M-31, M-37) |
| Lux numbers | `docs/mockups/html/lux/*.html`, SYSTEM_CSS in `lux.build.mjs` ~217–460 |
| Rejected option pages (context only) | `.shots/refresh/inbox-rows.html`, `.shots/refresh/home-active-hire.html` |
| The operator's pictures, numbered as sent | `.shots/refresh/brief-pics/` (N.png ↔ the item lists below) |

Reference pages are direction, not canvases (CLAUDE.md): match their numbers and behaviour with
the app's components and tokens; never position absolutely to copy them.

## 3. The list

Colours: dark mint `#4FC58C`; light "matching green" = the light token (`#0E6B52`, icons
`#064C3B` per #47). "Grey" = `#909594`. Gold (dark) `#D4A24C`, Lux gold `#E9C170`.

**1.** Sign-in and sign-up screens only: EMAIL and PASSWORD labels and their icons (paper plane /
envelope, padlock, the password eye) → mint (Lux `.field svg{color:var(--acc)}`). Reverses
"field labels are gold" for these screens only. (pics 1)
**2.** The "Phone number" label → mint everywhere: `components/PhoneNumberInput.tsx` (sign-in phone,
sign-up phone, email sign-up's phone field), Edit profile (`screens/ProfileScreen.tsx:732`),
Account details row (`screens/ProfileDetailsScreen.tsx:120`). (pic 2)
**3.** Create account (email): fits ONE screen at rest, no scrolling (the keyboard may still slide
the focused field into view — native-ui rule). FULL NAME, PHONE NUMBER, EMAIL, PASSWORD labels +
icons (person, envelope, padlock, eye) → mint. Remove the gold "CREATE ACCOUNT" eyebrow (header
already says Create account). Lux `lux-email-create.html`: body gap 12, 54-tall fields. The phone
field stays. (pic 3)
**4.** Create account: remove the "Private until a job is confirmed." pill
(`screens/EmailCreateAccountScreen.tsx:237` in the practice copy).
**5.** Country-code picker (tap "US +1"): replace the tall light sheet
(`components/CountryPicker.tsx`) with a small dropdown built on the Filters' system
(`components/PickerPopover.tsx` / DropMenu): opens right under the country pill, left edges
aligned, floating over the fields; ~240 wide; ~5 rows visible, scrolls inside; top: "Select
country" + search "Country or code"; rows: flag · country name · +code; chosen = mint tick; long
names end in "…"; no X (tap outside closes); opens upward when the keyboard leaves no room;
dark/light by scheme; the pill's "›" becomes a down chevron that flips when open. Flags are emoji
(`lib/countries` flagEmoji): letters in Windows renders, real on iPhone. (pics 4, 5, 6)
**6.** Launch, sign-in, sign-up, verify, legal and setup buttons: fully round (radius = half the
height, like Home's "Post a job" `radius.pill`) and ALL 52 tall (Lux `.cta` 52/26). Today
`lib/authTheme.ts` button 54/16, heroButton 58/22. Includes outlined "Use … Instead". (pic 7)
**7.** Dark-mode error red → `#D8604B` everywhere (`lib/theme.ts` darkColors.danger and
`ui/tokens.ts` dark danger are `#EE8B78`; the Map already uses `#D8604B`): field errors,
delete/block/report, problem notices and statuses. Light keeps its own red. (pic 8)
**8.** Every text field (TextField, AuthField, PhoneNumberInput, SearchBar, bid/amount fields…):
while typing, border mint at 55% + a soft 3 px mint ring at 14% (sim.html:278
`.in:focus-within`, but the app mint, not `#7EE2B4`). (pic 9)
**9.** Setup: remove the gold "FINAL SETUP" eyebrow; header "Setup" → "Finish Setup" (white,
same size and font: AuthScaffold navTitleLarge 17/700). "Start in" tiles: the tile NOT selected
shows its title + icon in grey `#909594` (either Hire help or Find work); the selected keeps a
white title + mint icon. (pics 10, 12)
**10.** Terms & Privacy (legal gate): the document reader grows to fill the area of the operator's
red box (reader + the old middle button + hint). ONE button that changes, at the bottom: "Review
Privacy Policy" until both are read, then "Agree and continue"; the middle button and "Review
both documents to enable agreement." go. Mint whenever it can be tapped; `#909594` text on
`#073328` while waiting. (pic 11)
**11.** Bell unread badge (both Homes): red `#D8604B` fill, white number (light: its red). (pic 13)
**12.** Category tiles (`components/ServiceTileRow.tsx`, both Homes): icon 26 → 30
(`TILE_ICON_SIZE`), dead centre in the tile. Lux draws 26; the operator overrides. (pic 14)
**13.** Home POPULAR SERVICES: add "View all →" at the heading's right (styled like "See all →");
opens a pop-up list of all 24 services in the tile row's order (6 shortcuts + the 18
`MORE_SERVICES`) then Other, each with its tile icon; laid out like sim.html's "All services"
sheet (title, "Pick what you need help with", close, rows icon · name · chevron). Reuse
`components/ServicePickerSheet.tsx` with outline icons. (pics 15, 16)
**14.** Category icons everywhere (tiles, the #13 list, category glyphs): Painting → sim.html
`i-brush` (a paint roller, line 363); Junk Removal → sim.html `i-trash` (line 388); Handyman → a
DRILL (new, same line weight) because the hammer is Assembly's (`construct`). No svg library:
bake these as tinted PNGs (Playwright canvas, like `.shots/refresh/hero-lux-webp.mjs`) and render
with Image tintColor, matched to the Ionicons outline weight. (pic 16)
**15.** Every search bar except the Map's own pill: the Lux Home field — 54 tall, radius 27,
padding 0 18, gap 12, 22 px mint icons, 16 px text (`ui/primitives/SearchBar.tsx` default; keep
`wells.field` colours). (pic 17)
**16.** Customer Home only: "HOW BRAZOS WORKS" card (keep the gold eyebrow) — title "Post free.
Get offers. Pay only when you hire." body "When you hire, we hold your payment safely. The worker
gets it only after you approve the job. You'll see the protection fee before you pay." + a 32
round close X (sim.html 1527–1530: card padding 16/18, title 16 bold, body 14/19). Under POPULAR
SERVICES, above NEEDS YOUR ATTENTION. Shows only for new users: from finishing setup until they
close it OR post their first job (sim rule). Dismissal persists per account. (pic 18)
**17.** Home NEEDS YOUR ATTENTION: the unpublished draft (`lib/postJobDraft`, per account) is the
FIRST card, styled like sim.html:1533 — pencil in a round well, eyebrow "NOT PUBLISHED YET", the
job's title (or its category), "Resume where you left off — workers can't see it until you
publish.", chevron; tap resumes it. One shared card with My Jobs' draft card (no duplicated
logic, P3-31). (pics 19, 20)
**18 / 21 / 43.** Job cards (Home + My Jobs): "View details" + a PLAIN mint "→" to its right (no
circle, no outlined pill); the action line ("Awaiting bids", "Approval needed · releases in 63h")
has no arrow; under an action line "View details" stays grey with the mint arrow; cards with an
outlined "View details →" pill lose the outline (tap target ≥ 44). (pics 20, 23, 45, 46)
**19.** Job cards: "Worker · Sam Okafor" → "Sam Okafor"; the worker's cards drop their label before
the customer's name the same way. (pic 21)
**20.** "Assigned" status pill → gold `#E9C170` (text + rim, dark); light: its own gold in the
filled light style. Everywhere. (pic 22)
**22.** Every screen with a back button: the round outlined back button (My Jobs' bare chevron gets
it), chevron optically centred; the title centred on that row (size #27); My Jobs loses "From
first bid to final review.". (pics 24, 25, 26)
**23.** Every screen title in Title Case: My Jobs, Saved & Past Workers, Account & Safety,
Notification Settings, Payment Methods, Finish Setup…
**24.** Saved & Past Workers: remove the gold leaf divider (`screens/SavedWorkersScreen.tsx`
~261–266, `leafDivider` / `leafRule`). (pic 26)
**25.** Initials avatars everywhere (no photo): dark fill `#173A31`, 1 px border `#325047`,
initials `#F1EDE1`; light: dark green `#1F4A3C` fill with cream initials (the app's light). (pic 27)
**26.** Inbox empty screens ONLY (All, Unread, Archived, Requests, Support): the chat-bubble icon
gold → grey `#909594`. Other empty screens unchanged. (pics 28, 29)
**27.** Title system: back-button screens → centred 17/700; Inbox, Discover (even when opened from
Home with a back button) and Profile → one big LEFT title at 34; card headings like Profile's
big "Settings" → 17 like "Past Work". (pics 30, 31, 32)
**28.** Inbox bug: the swipe actions (Mute / Report / More) show through the translucent rows —
keep them hidden until a swipe. (pics 30, 67)
**29.** All screens: the header row sits just under the status bar, a small gap (~6), no empty
band — where it makes sense. (pics 33, 34)
**30.** Post a Job header: left = round back button + where you came from ("‹ Home" on step 1
from Home; later the previous step: Describe / Media / Location); right = next step + round
chevron ("Media ›", "Location ›", "Review ›"), same round outline; all three texts 17/700 (title
shrinks, side labels grow). (pic 35)
**31.** Media step privacy note: "Avoid faces, documents, plates, addresses and personal details.
Just show the job." — two lines at most at 393 wide (trim padding/size slightly if needed); the
crossed-out eye → red `#D8604B` (light: its red). Fence: `tests/postJobPublish.test.mjs` pins the
privacy sentences — move constants with a dated ruling. (pics 36, 37)
**32.** Post a Job: remove the "Add photos so workers can see the work." nudge entirely
(`showPhotoNudge` in `screens/PostJobScreen.tsx` ~1930 + its state and draft field). (pic 38)
**33.** Media boxes: dashed outlines gold → mint (photo + box and video box); + and video-camera
icons → mint; the video box narrows to the red line (~164 wide, was ~204), icon centred; the "Up
to 10 photos" and "Up to 60 seconds" pills: outline + icons gold → mint, words white → grey
`#909594` (these two pills only). (pic 39)
**34.** Where and when: "SERVICE ADDRESS" stays a gold eyebrow; "(private, optional)" → the same
grey as "Required", not bold; the pin icon in the mint square button ~25% bigger, centred. (pic 40)
**35.** Every choice chip (day, arrival window, category, distance, filters): a small check on
the left inside the chosen chip, gone when unchosen; chips with their own icon swap it for the
check (no width change); others widen smoothly. EXCEPTION: Inbox filter pills (#55). (pic 40)
**36.** Review step price section: right under the step bars, above the Job summary; starts on
"Ask for bids" (`DEFAULT_PRICING_MODE` open_bids); the "Ask for bids | Set a price" switch stays.
Ask for bids: field "No maximum"; tap → a tick list drops down (preset maximums, "No maximum",
"Enter your own" → number pad) → "Up to $X". Set a price: field empty, Publish waits; pick (e.g.
$150) or type → Publish lights up. Replaces the pencil + EditBudgetDialog. Style = the Filters'
PickerPopover tick list in Emerald Lux colours; the Price dropdown file is UX only (operator:
"don't copy their exact look … don't change the Publish button to the html's gradient"). (pic 41)
**37.** The switch gets icons: people for "Ask for bids", price tag for "Set a price"; icon + label
centred per half; chosen half filled icon, other outline; they swap on switching. Add the same
to the unpacked price-dropdown copy. (pic 42)
**38.** Review step Job summary rebuilt from `refs/job-summary.html` (layout + behaviour; app
colours; Publish unchanged): "JOB SUMMARY" + "Tap any detail to edit"; title (serif) + description,
tappable; MEDIA + count + Edit/Done; view fills the width (1 → 16:9, 2 → 4:3, 3–4 → squares, >4 →
"+N" on the 4th); tap → full-screen viewer (swipe, dots, video play); edit: 4 across, an X on each
(24 light circle, 44 tap area), "+" tile (dashed → solid mint while its menu is open) → "Add a
photo / Add a video"; upload ring; failed → "Retry"; remove → toast "Photo removed · Undo";
Publish reads "Uploading…" and waits during uploads; no media → one wide "Add photos or videos";
limits are the app's real ones (10 photos, 1 video), not the file's 8. Details: CATEGORY + AREA
side by side, then TIMING, ADDRESS (PRIVATE) ("+ Add address" when empty), BUDGET full width,
each with a small mint icon; tap any detail to edit it (its step); BUDGET jumps up and opens the
#36 dropdown. (pic 43)
**39.** The "Add a photo / Add a video" menu: ~150 wide (was 210), centred under the + button,
shifting left only to stay on the card. (pic 43)
**40.** Prices WHITE everywhere (job cards, summary, bids, checkout, earnings…): dark `#F3F1E8`,
light dark ink. Ends "gold for money". Same in the price-dropdown copy. (pic 43)
**41.** Review step bottom bar (`refs/bottom-bar.html`): right above the tab bar; bar `#0A231E`,
1 px top `#2C4D44`, 0 vertical padding, 16 sides, 14 gap. "Save draft" (flex 3; `#081F19`, 1.5 px
`#2E765A`, text `#ABB4AE` 600, save icon `#AFB8B3`, gap 12) + "Publish" (flex 4; FLAT `#4FC58C`,
ink `#030A12` 700, inset rim white .09, glow `0 0 22px rgba(79,197,140,.24)`, rocket 23 / gap 10,
rocket nudges up-right on press); both 52 tall, fully round. Disabled Publish: `#909594` on
`#073328`. Above the bar: check icon + "Publishing makes this job visible to workers nearby." (13,
one line). "Save draft" saves EVERYTHING (fields, photos, videos) and goes straight to Home, where
the draft is the first card (#17). Tab bar unchanged. Light: matching light colours.
**42.** Publish → Job live: transition C "Seal" (`refs/publish-moment.html`): Publish shrinks to a
52 circle, a spinner ring draws WHILE the job saves (the real network wait), a tick draws when
it's saved, and the live page opens as a circle from the tick. Reduce Motion → short fade. The
live page: tick tile 76 (draws itself), "Your job is live." (serif 32), "Workers nearby can see it
now.", the published card (summary layout: PUBLISHED + "Just now", title, CATEGORY chip, BUDGET "Up
to $120" white, AREA, TIMING), "WHAT HAPPENS NEXT" (Bids arrive / From workers nearby; You choose /
We hold the payment; You approve / Then they're paid; first node pulses), "We'll let you know when
the first bid arrives.", bar "Back to Home" (Save draft slot) + "View job and bids →" (Publish
slot). The tick never draws before the server confirms.
**44.** My Jobs: remove every "Post another job" (the list-foot pill `MyJobsHubScreen.tsx` ~570 and
the CTA ~370). The empty-state "Post a job" (no jobs at all) stays. (pics 47–49)
**45.** Assigned job cards (My Jobs, and Home wherever the card shows), option A
(`refs/live-job-cards.html`): a 4-step rail under the title (Hired · On the way · Working · Done;
current step fills with a shimmer); one status line ("On the way · about 12 min" / "Arrived · 9:02
AM" / "Working · 2 of 4 tasks done" / "Done · approve, or it releases in 63h") with a live dot while
live; a chat button; pill Assigned → In progress → Completed; "$110 held" white until approved;
the ETA only while live location is shared, else the booked window ("Starts Sat, 8–11 AM"). (pic 50)
**46.** In progress pill: dark bright orange `#FF9046` outlined (rim .55, fill .09); light FILLED
peach `#FBE2CA` with `#9A4608` text (the app's normal light recipe). Everywhere, incl. #45.
(pics 51, 52, 53)
**47.** Light mode: gold `#C8A15B` icons & marks → green `#064C3B`: the chat "…" button, every
non-destructive menu icon (profile, star, mute — pic 55), swipe buttons, create-sheet icons, the
tab bar + glyph and glow, client job detail shields, Delete Account bullets, sparkles on job cards
and the success tick, the Inbox unread dot, voice-note bars. STAY gold in light: outlines & chips
(Compare Bids "Protected", Profile details category chips, client job detail badge, portfolio
border, Verify dashed box) and brand & ratings (Launch wordmark, shield logo, sign-in rings, read
ticks, star bars, toggle knobs, the Map's gold). After the build send ONE sheet of cut-out
pictures of every gold spot left in light mode, for confirmation. (pics 54, 55)
**48.** Light mode: every small uppercase label → antique gold `#86641A` (4.9:1 on cream) — the
gold ones (WORK HISTORY, YOU POSTED, YOU'RE WORKING, PENDING BIDS, Account & Safety, Profile
details, Post a Job row labels, Job detail price + SIMILAR OPEN JOBS, Worker Home summary, mode
label…) AND the green ones (POPULAR SERVICES, NEEDS YOUR ATTENTION, NEEDS YOU, AVAILABLE JOBS,
"Taking new work", "Nearby Demand"). The light eyebrow role `#0D6B52` → `#86641A`. Exception: the
sign-in/up field labels of #1–#3 stay light green. Dark keeps `#D4A24C`. (pics 56–59)
**49.** NEEDS YOUR ATTENTION (customer Home) and NEEDS YOU (Worker Home): label stays gold; a red
dot before it (light `#A8432B`, dark `#D8604B`) with "Sonar": the dot still, a 1.5 px ring
travels out (scale 1 → 2.8, fading) every 2 s. Reduce Motion → the still dot. (pics 60, 61)
**50.** Worker Home "Taking new work": the red paused dot gets the same Sonar (an active dot, if
any, stays still). Also: "Pau…" truncates → show "Paused" in full; "Offers still reach you" on one
line; no layout change. (pic 62)
**51.** Worker screens: remove the dot before "AVAILABLE JOBS" (both modes). (pic 63)
**52.** Notification bells everywhere, both modes: no round background; bare bell + badge (#11);
light bell green (#47); tap area 44. (pic 64)
**53.** Inbox •••: the bottom action sheet becomes a small glass dropdown right under the •••
(`refs/inbox-clean-list.html`): dark `linear-gradient(160deg, rgba(26,74,62,.66),
rgba(9,34,28,.80))`, backdrop blur 22 + saturate 160%, rim `rgba(126,226,180,.24)`, inset top
white .14, shadow `0 22px 48px rgba(0,0,0,.55)`; light frosted white
`rgba(255,255,255,.82) → rgba(236,244,239,.76)`, rim `rgba(14,107,82,.16)`. Only as wide as its
longest item (11 pt each side), right edge 8 pt from the screen edge. Items: Mute, Mark as Unread,
Archive | Block, Report, Clear chat, Delete chat (red: dark `#E36A53`, light `#A8432B`), NO "…".
Clear chat = empty the messages for me (CLEAR_CHAT; the other keeps theirs); Delete chat = remove
from my Inbox until a new message (DELETE_CHAT); both confirm. (pics 65–70)
**54–58.** Inbox rows, FINAL (`refs/inbox-clean-list.html`, version 9): a clean list, no cards,
hairlines between rows, row padding 13. Top line of a row: photo 58 (initials 20) · text column
(name 16/700 with the unread count beside it, or a 19 pt muted / blocked icon; the message 2 pt
below, 15/20, dark `#D5DED9`, light `#2E3A35`, unread full ink 600) · a 44-wide right column
(time, right-aligned, accent when unread, over the •••; right edges lined up). 10 pt below: the
job chip from the LEFT edge under the photo (24 tall, radius 12, faint fill): stage dot (breathing)
+ stage word in its colour (Assigned gold, In progress orange, Review work LAVENDER dark `#B9A6FF`,
light `#5B45C7` on `#ECE7FF`) · the job title; a finished job shows the title only. Title "Inbox"
34 left. (pics 69–80)
**55.** Inbox filter pills (All, Unread, Archived, Requests): NO check when chosen (the one
exception to #35); chosen = mint outline + soft tint. (pic 76)
**59.** Both Homes: the user's photo, 36 round, right of the bell (initials in the #25 style if
none); tap → Edit profile. (pic 81)
**60.** Every screen opened from either Home shows "‹ Home" beside its round back button (title
still centred). (pic 82)
**61.** Worker Home: remove the "Switch to Customer" pill (and its "Worker" tag); the greeting
shows in full; switching stays in Profile with its confirm.
**62.** Customer Home, option B (`refs/home-tucked-in.html`): a live bar (54 tall, radius 27,
glass) above the search card, ONLY while a job is underway: Sonar dot in the stage colour (gold
assigned, orange in progress, lavender review) · status ("On the way · about 12 min", "Arrived ·
9:02 AM", "Working · 2 of 4 tasks done", "Done · check the work") · "Message Sam ›" (opens the
chat). Inside the search card under Post a job: hairline, three overlapping faces (34, 2 px ring in
the card colour), "Hire again" + "Sam, Priya, Dana and 1 more" + chevron → pick a past worker and
send them a new job. NEEDS YOUR ATTENTION as #17/#49. Keep content from colliding with the status
bar when Home scrolls. (pic 83 = the feature source; ignore its styling)
**63.** Payout honesty (audit M-14, `synthesis.json` afterSpec): only when the customer approved
and payouts are not enabled: the worker job's eyebrow "APPROVED · SET UP PAYOUTS TO RECEIVE IT",
the existing PAYOUT_SETUP_NOTICE sentence, a row "Set up payouts to receive $X →" to Payouts (1
tap, was 3); Earnings row meta "Approved — waiting on your payout setup", rows open their job;
the same one-line nudge on Worker Home; the Profile row renamed "Earnings & payouts". Enabled
payees see no change.
**64.** Consistency set (audit M-25, M-17, M-31, M-37 afterSpecs): one filter memory across the
Map, the list and worker results, distance set in one place, and a Cancel on the Filters sheet
(bends the 09-19 "every close applies" ruling — record it); one bid/offer vocabulary and button
weight; one way to close sheets, one dialog button order, one confirm engine; before bidding, the
job screen says messaging opens once hired and lets the worker add a question to their bid (the
pre-assignment messaging lock stays).

## 4. Settled defaults (do not re-ask)

The "Completed" pill stays mint. Inbox tags breathe; the Home live bar uses Sonar. The My Jobs
empty-state "Post a job" stays. In light mode In progress is the filled peach. Titles are Title
Case ("Finish Setup"). The operator is NOT adding: the audit's My Jobs customer tab (M-9 swap),
phone-free sign-up (M-30) or fewer sign-up steps (M-19).

## 5. Traps (each cost time)

- Guards: `node -e` refused; no writes outside the project (memory dir included); commit with
  `git commit -F <file>`; `git push origin mainexpo` alone in its own Bash call; never `cd` in
  parallel calls; Grep with a brace glob + path returns nothing (search per directory); CRLF.
- Fences (move expected constants only, with the date and ruling): `postJobPublish` (privacy
  sentences, info card, footer on the last step), the copy fences (HANDOFF §7), `themeTokens`,
  `goldOnForest` D6_SURFACES, `customerCore` (SegmentedControl minHeight 44, tab role),
  `screenDials` (no comments inside a dial object), `workerHome` import line, `voiceSearch` colour
  expressions, `maestroFlows` (placeholders the flow types into).
- Rulings this list reverses (write each into DECISIONS with 2026-09-28): auth field labels
  gold → mint (#1–#3); money gold → white (#40); Assigned blue → gold (#20); light labels green →
  antique gold (#48); gold-is-never-a-rim relaxed for Assigned (#20); Filters "every close
  applies" bent by a Cancel (#64).

## 6. Order and verification

Suggested batches: tokens and colours (#7, #11, #20, #25, #40, #46–#48) → headers and titles
(#22, #23, #27, #29, #30, #60) → auth (#1–#6, #8–#10) → Home (#12–#17, #49, #52, #59, #62) → job
cards (#18–#21, #43–#45) → Post a Job (#31–#39, #41, #42) → Inbox (#26, #28, #53–#58) → worker
(#50, #51, #61, #63) → #64. Each batch: practice `tsc` + tests, export, prepare, validate 68/68 in
BOTH schemes, shoot the changed screens in dark AND light and look at them. End: after-notes in
`docs/mockups/refresh/screens.js`, the #47 gold sheet, DECISIONS entry, `make-patch.mjs`,
`git apply --check`, the real `npm run verify` exit 0, commits by explicit path (never the
operator's Lux files), HANDOFF rewritten last, the push, one mobile push.
