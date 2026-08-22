# BRAZOS — Emerald Prestige golden-master manifest

> **TWELVE ENTRIES IN THIS FILE ARE REJECTED AND ARE NOT AUTHORITY.**
> The headings numbered 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45 and 46
> describe files that exist on disk only under WORD-NAMED filenames
> (`Discover_Map_Dark.png`, `My_Jobs_Active_Dark.png`, …). The operator has
> REJECTED that render pass as over-ornate — see HANDOFF.md, "THE MASTER SET
> IS SPLIT". Those numbers were never assigned to a file. Never cite one of
> those twelve to justify a change. Since 2026-08-22 the rejected files live
> in `docs/mockups/rejected/` — all except `Discover_Map_Dark.png`, which
> stays beside the masters because `components/HotspotMap.native.tsx` cites
> it by name.
>
> This file also omits `9_job_post_dark.png` (941×1672), which does exist on
> disk — "9" is not a numbering gap. The "43 unique PNG mockups" figure below
> and the palette section's "all 43" should read 44 files, 32 of them
> numbered masters.

Authoritative set: **43 unique PNG mockups** (`Compare_Bids_Dark` = duplicate of 46; numbering gaps 9/21/28 are gaps in numbering only, confirmed by operator 2026-08-19). The PNGs in `docs/mockups/` are the golden masters. **On any conflict between this manifest and a PNG, the PNG wins.** This file is the index and the measured record, not a replacement for looking.

Repo mappings marked (verify) are inferred from `repo_manifest` + HANDOFF and must be confirmed by reading the mounted navigation trees before implementation. Nothing in this document redesigns, merges, or normalizes a master; cross-screen contradictions are recorded in Appendix B and resolved only in the dispatch.

## Reference geometry — three aspect classes

| Class | Size | Aspect | Screens |
|---|---|---|---|
| A | 941×1672 | 16:9 | 1–4, 6–8, 10–20, 33–46 (33 screens) |
| B | 852×1846 | 19.5:9 (true device) | 22, 23, 24, 25, 26, 27, 29, 30, 31, 32 |
| C | 863×1822 | ~19:9 | 5 |

Class-A masters are vertically compressed relative to a real phone: the device will show MORE vertical air and MORE list content than the reference. Fidelity comparison for class A is **width-proportional and section-by-section, never full-frame**. Class B/C compare near-1:1. Never letterbox, never scale type down to force a class-A frame to fit.

## Measured global palette (pixel-sampled across all 43)

Per-screen AI drift is ±10 units; canonical values below. Text golds/greens render brighter than swatches because every master pairs them with soft glow.

| Role | Canonical | Observed range | Notes |
|---|---|---|---|
| bg | `#03110E` | #000405–#031110 | masters vignette darker at edges; home(5) moved it into that range |
| surface (cards) | `#0E1D17` | #021313–#1B2B20 | many cards are bg + hairline only; elevated cards lift |
| ink / cream | `#F1EDE1` | #E1DBD4–#F5F5F4 | display + body-on-dark |
| muted | `#93A096` | — | secondary text, sage-grey |
| gold (metal) | `#DCAB60` | #A68645–#E8B254 | icons, eyebrows, borders, hairlines; hairline tier ≈ gold @ 25–55% alpha (#55482E flat equivalent) |
| warn (hot amber) | `#F2B04F` | #EDAE57–#F6B24D | warning headings/gates (31, 32, 41 delete row) — this is NOT red |
| emerald (status/money) | `#5FAE81` | #308063–#6DB27C | prices, Open, live, unread, active states; bright money tier ~#6BBC9A |
| forest (solid CTA fill) | `#1E3A2C` | #183025 (s44) | the ONLY solid button fill in the whole set |
| mint / mint2 | `#11241C` / `#2A4C3D` | — | sage chip fill / its border; unread badge fill |
| goldSoft | `#251E10` | — | warning card wash |
| danger red | `#D54C2C` | — | appears ONCE as UI: the offline dot on 43. All other red pixels in the set are photos, the US-flag glyph (3, 4), or the map hospital marker (33). No master uses a red control. |

## Cross-cutting component vocabulary (as drawn; conflicts in Appendix B)

- **Card**: surface or bg fill, 1px gold hairline, radius ~16–20, soft drop shadow + faint gold outer glow, occasional ghost serif "B" watermark (39, 40, 41, 43-card, 44-card, 45, 46) and top-sheen. Section eyebrows inside cards: gold small-caps, ls ~2.
- **Buttons**: (a) solid deep-green pill — hero/conversion only (44 Post a job, 43 search-go, 46 Choose best-fit variant); (b) standard — dark fill + gold hairline + cream serif label (everywhere); (c) ghost gold serif text; (d) disabled — flat desaturated grey fill, muted text, no border (31/32 Delete, 23 Add service, 25 cash out).
- **Chips/pills**: sage (mint fill, mint2 border, green text+icon) for categories/tags; gold-outline chip; serif green "Open"/status pill; "Your job" green chip; dashed-border add-affordance (11-active? no — 35 Post another job, 42 past-work empty).
- **Search**: full-round pill, gold hairline, gold search glyph, inset circular submit (gold-outline arrow on 1; solid green on 43/44-adjacent).
- **Segmented tabs**: full-width, cells separated, active = dark fill + gold border + serif cream (34, 36, 37, 38, 39-mi) — EXCEPT 35 (green fill active); see B-3.
- **Stepper**: check nodes = deep-green circle, gold ring, gold/white check, thin connectors; pending = grey ring + numeral (6, 13→timeline variant on 14, 16).
- **Toggle**: ON = gold knob, dark track, gold rim (23); ON cream knob (39); OFF = white knob, near-black track (43). See B-5.
- **Bottom nav**: 5 items Home/Map/My Jobs/Messages/Profile, icon + 11pt label; container floats as pill on most, docks flat on some; active treatment varies (B-1). One master (33) labels slot 2 "Discover" with a search glyph — every other master says "Map" (B-2).
- **Avatar**: circle, deep-green fill, gold ring, gold serif initials (5, 16, 18, 22, 27, 34) — exception 46 (B-6).
- **Progress bar**: gold fill on dark track (37).
- **Decorative system**: concentric gold arc hairlines bleeding off a corner (2, 3, 20, 41-family), sparkle glyphs, leaf divider (22), crescent-moon "away" glyph (5).

---

# Per-screen manifest

Format — File · Surface/route (confidence) · Mode · Sections top→bottom · Type · Color/measured · Layout · Controls · Artwork · Nav · Exceptions · Dynamic-data (must stay real).

## Auth & onboarding

### `2_sign_up_dark.png` — Welcome
Route: `screens/WelcomeScreen.tsx` (high). Mode: pre-auth. Sections: floating trust badges over concentric-circle art (Verified workers / Protected payment / Local jobs, gold-outline lozenges w/ gold icon squircles) → eyebrow BRAZOS MARKETPLACE → display serif "Get it done. Work with confidence." (3 lines, ~44pt-class) → sub muted → standard button "Continue with phone" (phone icon) → standard button "I already have an account". Type: largest display in set; buttons serif. Measured: bg #000707, gold #C49659, cream #DAD5CE. Layout: film-grain texture on bg (NOT reproducible — drop), arcs top-right. No nav bar. Dynamic: none. Exceptions: darkest bg of set; grain.

### `3_sign_up_2ndpg_dark.png` — Create account (phone)
Route: `screens/CreateAccountScreen.tsx` (high). Mode: pre-auth. Sections: back chevron + centered serif "Create account" → gold eyebrow CREATE ACCOUNT → display "One account. Two ways to use it." → sub → FULL NAME gold eyebrow label + pill field (person icon, gold hairline) → PHONE NUMBER label + country-code field (US flag+chevron) beside number field → shield notice card "Your number stays private until a job is confirmed." → standard serif button "Create account" → ghost serif "Use Email Instead". Measured: bg #00090A, gold #D5AF63. Red pixels = flag glyph only. Arcs top-right. No nav. Dynamic: field values are user input. Exceptions: two-field phone row proportions (~1:2.4).

### `4_sign_up_dark.png` — Create account (email)
Route: `screens/EmailCreateAccountScreen.tsx` (high). As 3 plus EMAIL field (envelope icon) and PASSWORD field (lock icon, eye toggle right); headline "Sign up with your email."; single "Create account" standard button, no ghost. Measured: bg #000909, gold #C09143. Exceptions: warmer/oranger gold rendering on this master — treat as drift, not a second gold.

## Homes

### `44_customer_home_dark.png` — Customer Home ★ flagship
Route: `screens/HomeScreen.tsx` (certain; unlocked 2026-08-19). Mode: Customer. Sections: greeting "Good morning," + gold name / right "Switch to Worker" chip (green wrench icon, gold-outline pill) → display serif "Take a task off your plate." LEFT-constrained beside **armchair/lamp/plant artwork** right → sub "Describe it. Hire help. Get it handled." → large search pill "Describe a service or project…" with mic glyph + gold sparkle inside, right edge → category chips 2 rows (Furniture Assembly, Moving Help / House Cleaning, TV Mounting, ▾ Other) — sage fill, GREEN icons → promo card: eyebrow FASTEST WAY TO START, serif "Describe the job. BRAZOS handles the rest.", **3-D gold B-with-leaf on dark drape** right, solid-green pill button "Post a job ›" → "● Live Nearby" serif heading + "View map" pill + green "View all →" → feed card (photo thumb, title, EST. PRICE gold eyebrow, "Open" green serif) → nav. Measured: bg #010506 (darkest chrome), gold #D9AD5C, green #65A678, cream #F3EDE3. Artwork: `assets/prestige/hero_armchair_customer.png`, `assets/prestige/brazos_b_drape.png` (dark-only). Nav: floats; Home ACTIVE = GREEN glyph glow + green label. Dynamic: greeting name, Live Nearby feed (real jobs), thumbnail photos (job media). Exceptions: the only screen with a solid-green CTA + the green-icon chip variant; mic in search is voice-search (renders only when boundary available — EAS gate).

### `43_worker_home_dark.png` — Worker Home ★ flagship
Route: `screens/WorkerHomeScreen.tsx` (certain; already at this anatomy per HANDOFF 4D-6, minus artwork). Mode: Worker. Sections: greeting + "Switch to Customer" chip → display "Get hired. / Get **paid.**" ("paid." green) + sub "Grow your reputation." LEFT beside **toolbox artwork** → search pill "Search for jobs or areas" with SOLID GREEN circular submit → summary card (gold hairline): left AVAILABLE NOW eyebrow, serif 30 "Offline", toggle (white knob dark track), red dot + "Not visible to customers" / divider / right POTENTIAL EARNINGS eyebrow, serif green "$280", "across 6 jobs" → two pills row "✦ 4 match your skills" / "📍 3 within 5 miles" (counts green) → "● Available Jobs" serif + green "View all →" → feed cards (icon tile, title, Handyman sage chip, location, bids, EST. PAY eyebrow + GREEN value or green serif "Open") → nav, Home active green. Measured: bg #01090C, green #6DB27B (2333 px — greenest screen), gold #BE9054, red #D54C2C (offline dot — the set's only UI red). Artwork: `assets/prestige/hero_toolbox_worker.png` (dark-only; mount mirrors 44's arrangement, headline width constrained). Dynamic: availability from `accepting_work`, earnings math, skill/nearby counts, feed — ALL real (HANDOFF pins); never fabricate. Exceptions: EST. PAY values GREEN here and on 12 but GOLD on 13 (B-4).

### `1_find_help_dark.png` — Find help (customer search/browse surface)
Route: `screens/WorkerSearchScreen.tsx` (verify — could be search-tab surface; NOT Home: 44 is Home). Mode: Customer. Sections: display serif "Find help" + gold shield button right → eyebrow FIND TRUSTED HELP, FAST → sub → search pill w/ inset gold-outline circular arrow → "Popular services" serif + "Swipe to explore" gold serif → horizontal service tiles (dark tile, gold icon, cream label; one tile gold-border highlighted) → "Top match" gold serif heading + "1 match found" muted → worker card: avatar DM, VERIFIED WORKER green eyebrow, serif name, "Not verified" gold-outline shield chip, ★4.7 (3 reviews), sage "Moving Help" chip, divider, gold serif "View full profile" + circle-arrow → nav (Home active gold — exception B-1). Measured: gold #DEA956, green #468861. Dynamic: match results, ratings, review counts (real). Exceptions: "VERIFIED WORKER" eyebrow beside a "Not verified" chip is the master's own contradiction — implement from live verification state only.

## Discovery & posting

### `33_Discover_Map_Dark.png` — Map discovery
Route: `screens/MapScreen.tsx` (high). Mode: Worker (find jobs). Sections: back + serif "Find Jobs Near You" + filter squircle → header card: MAP DISCOVERY eyebrow, serif "Jobs around Brooklyn", "Within 5 miles" gold-outline pill, density legend dots (green/green/amber/red + labels) → full-bleed DARK map (deep-green styled tiles, gold road hairlines, area labels) with teardrop job pins (green fill, gold ring, briefcase/tree icons), user blue dot → footer card: NEAR YOU eyebrow, serif "3 matching jobs", sub, gold-outline "View list →" pill → nav. Measured: bg #000909; red = hospital POI + legend dot. Nav: slot 2 reads **"Discover"** with search glyph, active gold-pill — sole occurrence (B-2). Dynamic: pins/counts from live hotspots. Exceptions: dark map styling is provider config work (custom style JSON / dark tiles), not screen styling; legend colors are heat semantics (keep `lib/hotspots.ts` tiers).

### `12_job_withinradius_worker_dark.png` — Jobs within 5 miles (list)
Route: `screens/CellJobsScreen.tsx` (verify). Mode: Worker. Sections: back + serif "Jobs Within 5 Miles" + gold filter icon → job cards: left square thumb (photo when job has media; else deep-green tile + gold category glyph), serif title + sage category chip, green "Your job" chip when owner, icon meta rows (gold pin/people/clock icons, cream text), right column EST. PAY gold eyebrow + GREEN serif value (or green serif "Open") → nav (Home active GREEN filled — B-1). Measured: green #649C6D. Dynamic: everything (jobs, bids counts, ages, photos). Exceptions: none beyond B-1/B-4 membership.

### `11_job_filter_worker_dark.png` — Filter jobs (sheet)
Route: filter modal over 12's screen (component; verify owner). Mode: Worker. Sections: dimmed parent header visible → sheet with drag handle: serif "Filter jobs" + gold serif "Done" → CATEGORIES eyebrow → 10 gold-outline pills (Dog walking … Other) wrap → helper muted "Nothing selected means every category." → MINIMUM BUDGET eyebrow → $25+/$50+/$100+ pills → helper ("open negotiation, not a low one") → SORT eyebrow → radio rows (gold ring, gold-filled dot active): Newest first / Highest budget / Closest first → footer: standard "Reset" + standard "Show jobs" pair. Measured: gold #D2A868. Dynamic: none (filter state). Exceptions: radio control unique to this master.

### `13_individual_skillmatch_worker_dark.png` — Skill matches (list)
Route: worker feed "View all (skill matches)" destination (verify — may be CellJobsScreen variant/param). Sections: back + serif "Skill Matches" + filter icon → job cards same anatomy as 12 but NO photo thumbs (all icon tiles) and EST. PAY values GOLD; "✦ Break the ice" gold line on the no-bids card. Measured: gold #CBA061, green none. Dynamic: derived "Break the ice" = bids==0 (real derivation, fine). Exceptions: gold prices (B-4); title truncation "REVIEW · Open with two bi…" shows numberOfLines behavior.

### `10_job_post_pg2_dark.png` — Submit a bid (worker) — filename is misleading
Route: `screens/SubmitBidScreen.tsx` (high). Mode: Worker. Sections: EST. PAYOUT card: eyebrow, serif "$75", gold shield-B monogram right, long sub (0% fee + sandbox disclosure copy) → card "TAKE IT AT THE LISTED PRICE": inner row (money icon tile, serif "You'll offer $75", sub) + standard serif button "I'll do it for $75 ✦" → card "Or name your own price": serif heading, sub, ghost-in-border "Write a bid" → SIMILAR OPEN JOBS eyebrow → job card (photo tile purple w/ paw, title, "Your job" chip, price gold, age) → nav (Home gold-filled active). Measured: gold #C38B41. Dynamic: payout figure = customer budget (real), similar jobs real, sandbox copy is configuration-truth. Exceptions: purple photo tile is the JOB'S OWN uploaded image, not a palette color.

### `8_jobnbids_dark.png` — Client job & bids (open, no active bids)
Route: `screens/ClientJobDetailScreen.tsx` open-state (verify vs a dedicated bids screen). Mode: Customer. Sections: back + serif "Job & bids" → job card: "Open" gold-outline pill + "Posted 3 d ago", display serif title "Example", icon tile + serif meta "Dog walking · East Flatbush…", divider, BUDGET eyebrow + serif "$50", right serif gold "No bids yet" → JOB SCOPE card: eyebrow, body, gold-outline category chip w/ gold paw → empty-bids card: circled people glyph, serif "No active bids", sub → nav (My Jobs gold active). Dynamic: all job fields, bid states. Exceptions: serif meta line (most screens set meta sans).

## Job lifecycle — client view

### `16_job_detail_clientview_dark.png` — Job detail (in progress) p1
Route: `screens/ClientJobDetailScreen.tsx` (high). Sections: back + serif "Job detail" → job card: "● In Progress" gold-outline pill + posted-ago, display "Room Cleaning", sparkle icon tile + Cleaning · location, divider, AGREED PRICE eyebrow + serif cream "$65" → JOB SCOPE card (body + GREEN-text sage Cleaning chip) → TIMING & ADDRESS card: gold clock row "Fri, Aug 14 · 5 PM–8 PM"; gold lock row "308 Church Avenue" + privacy sub → JOB PROGRESS card begins: serif "Where things stand" → nav (My Jobs GREEN active — vs 17 gold, B-1's sharpest instance). Dynamic: schedule, address (RLS-gated surface), price. Exceptions: address block renders only for owner/hired (invariant).

### `17_job_detail_clientview_pg2_dark.png` — Job detail p2 (scroll)
Same route, scrolled. Sections: JOB PROGRESS card: 3-node stepper Assigned ✓ / In progress ✓ / Completed "3" pending → ASSIGNED WORKER card: serif name heading, inner row (avatar, name serif, "$65 agreed" muted, Not-verified chip, chevron) → standard buttons "Message Diego Martinez" (chat icon) and "Track worker" (pin icon) → PAYMENT · SANDBOX card: serif "$65", "Funds held in protection", gold shield-circle right → WORK EVIDENCE card top edge → nav (My Jobs GOLD active). Dynamic: worker, agreed cents via formatBudget, payment state labels from state machine ("held in protection" wording — never "escrow").

### `14_track_worker_client_dark.png` — Track worker p1
Route: `screens/TrackWorkerScreen.tsx` (high). Sections: back + serif "Track worker" + sub "Room Cleaning" → notice card (gold send-glyph circle): status-comes-from-worker copy, "no live location tracking" → serif "Where things stand" → vertical timeline: green-fill/gold-ring check nodes + gold connecting line: Hired/On the way/Arrived/Working checked with subs; "Done — Not yet" grey node → serif "Scheduled window" → clock pill card → serif "Payment" → SANDBOX — NO REAL MONEY gold-outline banner → standard "Message Diego Martinez" → nav (My Jobs gold). Dynamic: every timeline state (worker-declared), schedule. Exceptions: vertical timeline variant (14 only, vs horizontal steppers).

### `15_track_worker_client_pg2_dark.png` — Track worker p2 / finished-work review state
Sections (scrolled/late state): payment card "$50 FUNDS HELD IN PROTECTION" green eyebrow + 72-hour auto-release copy + "Sandbox build — no real money." → standard "Message …" w/ chevron → "✦ Finished work" serif + full-width photo (worker-submitted) → "Your review" card: green check circle, serif heading, 4/5 gold stars, quoted text, thanks sub → nav (My Jobs GREEN filled). Dynamic: photos (real uploads), review. Exceptions: none new.

## Job lifecycle — worker view

### `6_job_finished_worker_dark.png` — Your job (worker, completed) p1
Route: `screens/WorkerJobScreen.tsx` (high). Sections: back + serif "Your Job" → job card: hammer icon tile, "H" title, meta, "Completed" gold-outline pill, divider, "$50" serif + "for Diego Martinez" → 3-node horizontal stepper all-checked (green fill, gold ring) → PAYMENT PROTECTED · SANDBOX card: serif "$50", "Funds held in protection", 72-hr copy, big outlined shield-check right → standard "Message …" → "Finished work" serif + photo → nav (My Jobs gold). Dynamic: all. Exceptions: large decorative shield.

### `7_job_finished_worker_pg2_dark.png` — Your job p2
Sections: payment card variant (shield-circle left, "$50" gold serif, FUNDS HELD IN PROTECTION green eyebrow, copy) → standard "Message …" chevron → "✦ Finished work" + photo → "Your review" card (as 15) → nav (My Jobs GREEN filled). Measured gold #D29D60 dominant (8078 px — heaviest gold usage; borders everywhere).

### `46_Compare_Bids_Dark.png` — Compare bids
Route: `screens/CompareBidsScreen.tsx` (high). Mode: Customer. Sections: gold-outline back squircle + serif "Compare bids" → header card: green eyebrow "3 BIDS · MOUNT A 65-INCH TV", serif "Compare the full offer.", sub, "Protected job" gold pill, ghost B → 3-column bid cards: BEST FIT green ribbon tab on col 1 (green-glow border), avatar squircles (col1 dark+green ring, col2 GOLD-FILLED, col3 dark+gold ring — B-6), serif names, GREEN serif prices $60/$65/$55, gold star rows, three stat lines each, footer buttons ("Choose Afnan" dark-green fill + bright green border; "View offer" standard ×2) → BRAZOS PROTECTS card: eyebrow, serif "One job. One clear record.", 3 mini-tiles (Scope/Payment/Evidence: icon squircle + title + sub) → nav (My Jobs gold, top-indicator bar variant). Dynamic — CRITICAL: "98% on time" has NO data source → omit that line class entirely (CLAUDE.md no-invented-data); "N completed jobs" derivable (real count); "Mount + tools included" style lines = bid message content (real). Exceptions: 3-col layout unique; ribbon tab unique.

## Messaging

### `34_Messages_Inbox_Dark.png` — Messages inbox
Route: `screens/MessagesInboxScreen.tsx` (high). Mode: shared. Sections: gold-outline back squircle + centered serif "Messages" → search pill "Search messages" → segmented All/Jobs/Offers/Support (active All = dark+gold border serif) → thread cards: avatar squircle, green eyebrow context (DOG WALKING / ROOM CLEANING / COMPLETED JOB), serif name, preview muted, right timestamp + unread (solid green count badge or small green dot) → nav (Messages… inactive-looking gold outline set; verify active state on device). Measured: bg #000909; gold #836545 (dimmest — mostly hairlines). Dynamic: threads, unread counts, "Deleted user" label verbatim. Exceptions: segmented has 4 cells here (3 elsewhere).

### `19_messages_clientview_dark.png` — Chat thread
Route: `screens/ChatScreen.tsx` (high). Sections: back + serif name "Diego Martinez" + sub context "Dog Walking" + "Hire Again" gold-outline chip (person+ icon) → pinned job card top-left (price serif "$70", title, photo thumb, age, gold "Tap to view the job") → date/context divider "— Dog Walking —" hairline+label → message row: small avatar + bubble (dark, gold hairline) "^^" + time → system/offer card right-aligned: green check circle + OFFER ACCEPTED green eyebrow, serif "Electrical", meta, "$70", photo, body, gold "Tap to view the job", chevron → quick-reply gold-outline pills row ("How's it going?" / "Any update?" / "When can you start?" / ▾) → composer: camera, image, mic icons gold + message pill + gold-outline circular send ↑ → nav (Messages gold active). Dynamic: all thread content; offers are RPC-shaped cards. Exceptions: quick-reply pill row unique; composer icon set (mic here is chat voice — distinct from search mic; implement only what exists: verify current composer capabilities, do not add recording).

## Profile & worker business

### `5_view_profile_dark.png` — Worker profile (deleted/away state)
Route: `screens/WorkerProfileScreen.tsx` state variant (high). Class C aspect. Sections: back + serif "Profile" → identity card: DU avatar, display serif "Deleted user" + Not-verified chip, ★5.0 (2 reviews) chevron → away banner card: crescent-moon glyph, "Deleted isn't taking new work right now." → full-width green-text card "Saved — tap to remove 🔖(green)" → Past Work card: serif heading, "1 Cleaning · 1 Dog walking" muted, empty-state image glyph + copy → nav (Messages GREEN glow active). Dynamic: "Deleted user" verbatim label, availability note from accepting_work, category counts. Exceptions: away-banner unique; saved-state full-width control unique.

### `18_viewprofile_clientview_dark.png` — Worker profile (active)
Same route, active-worker state. Sections: identity card (DM, serif name, Not-verified chip, ★4.7 (3) chevron, TWO gold-outline category chips) → "Saved — tap to remove" card (cream serif + gold bookmark this time — state drift vs 5, B-7) → "Work with Diego again" card: serif heading, offer-flow explainer body, standard button "Send an offer ✈" → Past Work card w/ counts + empty state → nav (Messages gold). Dynamic: categories, ratings, offer flow (job_offers RPC-only).

### `27_profile_reviews_dark.png` — Reviews list
Route: `screens/ProfileReviewsScreen.tsx` (high). Class B. Sections: back + serif "Diego's reviews" → summary card: display "4.7" + 5 gold stars + "3 reviews", per-star gold bars w/ counts (5★→2 …) → review cards: MR avatar, serif reviewer name, green meta "35 min ago · Handyman", right gold stars (empty star outlined), body text when present ("g") → nav (Messages green). Dynamic: every value real (no fake reviews — invariant). Exceptions: rating-bar component unique; green timestamps (green-as-metadata membership).

### `20_featurework_workerview_dark.png` — Feature past work (picker)
Route: portfolio feature-picker (within Profile flow; verify exact owner/modal). Class A. Sections: display serif "Feature past work" + gold-outline circular ✕ → sub "0/20 featured · tap a photo to add it, tap a featured one (checkmark) to edit or remove it" → photo grid (one item): gold-border thumb + image-glyph corner button, HANDYMAN gold eyebrow + "H" title below → vast empty area → nav (Profile gold-filled active). Dynamic: portfolio_items real photos, 0/20 count. Exceptions: grid-picker unique; arcs decoration.

### `23_availability_workerview_dark.png` — Services & availability p1
Route: `screens/ServicesPricingScreen.tsx` (high). Class B. Sections: back + serif "Services & availability" → "Taking new work" card: serif heading + GOLD-knob toggle, explainer body, inner "Availability note —…" pill field → Verification card: serif heading + Not-verified chip, honest no-provider body ("The badge shows exactly what the database records.") → "Your services" serif section + body → "Add a service" card: serif heading, name field, price field + "flat" gold-outline chip, category pill grid (gold-outline w/ gold icons, 9 visible) → nav (Profile gold-filled). Dynamic: accepting_work, services list, verification state (honest copy stays). Exceptions: in-card field pills.

### `24_availability_workerview_pg2_dark.png` — Services & availability p2
Same route scrolled/variant. Sections: Verification card (icon squircle now leading) → Your services → Add a service card: leaf-icon heading + leaf-prefix name field, $-prefix price field, **flat|ask segmented pair** (flat active = GREEN fill — B-3 member), full category grid incl. Packing/Unpacking + ⊕ Other, disabled grey "Add service" button → nav (Profile GREEN person glyph). Dynamic: as 23. Exceptions: flat/ask mini-segment unique.

### `25_earnings_dark.png` — Earnings
Route: `screens/EarningsScreen.tsx` (high). Class B. Sections: back + serif "Earnings" + sub "Sandbox — no real money" → 3 stat cards row: icon circles, GREEN eyebrows PENDING/AVAILABLE/TRANSFERRED, serif amounts, subs → fee-explainer card (receipt icon, 0%-fee body — configuration truth) → "Ledger" serif → ledger row card: avatar-circle "H", title, "Held in protection", right GOLD "$50" → spacer → disabled full-width "Nothing available to cash out" (lock icon) → nav (Profile green). Dynamic: all sums from ledger rows only (copy says so — keep). Exceptions: 3-up stat cards unique; ledger amount gold while stat eyebrows green.

### `26_notifications_dark.png` — Notifications feed (capture-style master)
Route: `screens/NotificationsScreen.tsx`. Class B. Sections: back + serif "Notifications" + green "41 unread" + gold serif "Mark all read" → notification cards: gold-outline icon circle (star/bell/chat), serif title, muted body, age, right green unread dot → nav (Profile green). Dynamic: all real events. **See Appendix B-8: 38 covers the same surface with different chrome.**

### `29_editprofile_pg2_dark.png` — Edit profile (form section)
Route: `screens/ProfileScreen.tsx` edit region (verify). Class B. Sections: serif "Profile" → card: English|Español segmented (active dark+gold border), "Bio (optional)" CREAM label + 0/200 counter, textarea pill, "Job categories (optional)" cream label + dropdown pill "2 categories selected" ⌄, standard "Save Changes", standard "Cancel" → Past Work card: serif + "Add photos" gold-outline chip w/ icon, count, empty-state → "Settings" serif top edge → nav (Profile gold-filled). Exceptions: CREAM field labels here vs GOLD on 30 (B-9).

### `30_editprofile_dark.png` — Edit profile (top)
Same route, top. Sections: display "Profile" + leaf underline flourish → centered avatar MR + camera badge → email serif, ★5.0 (4) · 1 job completed · Member since — meta row → gold serif "See all your reviews ›" → form card: GOLD labels Full name/Phone number/Language + pill fields, segmented, Bio, categories dropdown → nav (Profile gold ring-circle variant — B-1 member). Dynamic: profile fields, aggregates. Exceptions: centered identity header unique.

### `22_savedworkers_clientview_dark.png` — Saved & past workers
Route: `screens/SavedWorkersScreen.tsx` (high). Class B. Sections: back + serif "Saved & past workers" + gold leaf divider → "Saved" serif → worker rows: avatar, serif name, ★ meta (+ "Not taking work right now" on DU), gold-outline "Hire" pill, GREEN bookmark → "Worked for you before" serif → rows (no bookmark, "No reviews yet") → nav (Profile green). Dynamic: saved list, "Deleted user" verbatim, availability notes. Exceptions: leaf divider unique.

## Settings, account, payments

### `45_Profile_Past_Work_Settings_Dark.png` — Profile hub: past work & settings
Route: profile-area page (repo has single `ProfileScreen`; masters 42/45/41 imply a 3-page profile architecture — see Appendix B-10). Class A. Sections: back squircle + centered serif "Profile" + edit-pencil squircle → hub card: YOUR WORK eyebrow, display "Past work & settings", sub, "Edit" gold-outline chip, ghost B, gold underline flourish → PAST WORK card: eyebrow, serif "1 Handyman project", "Add photos" chip, shield-notice inner card ("Only feature real work…") → "Settings" serif + "Account" gold-outline chip → settings rows card: icon+serif title+sub+chevron ×5 (Notifications / Notification feed / Earnings / Services & availability / Saved & past workers) → nav (Profile gold, top-bar indicator). Dynamic: counts. Exceptions: settings-row list pattern (shared with 41).

### `42_Profile_Details_Dark.png` — Profile hub: details
Class A. Sections: back + centered "Profile" + pencil → centered avatar squircle MR → display name, email, ★ meta row → standard wide "See all your reviews →" (star icon) → SHARED IDENTITY card: eyebrow, serif "Profile details", "Edit profile" chip, icon rows Full name/Phone/Language/Bio with right-aligned cream values ("No bio yet" muted) → JOB CATEGORIES eyebrow + two gold-outline icon chips → PROOF OF WORK card: eyebrow, serif "Past work", "1 Handyman" pill, dashed-border empty block (camera squircle + copy) → nav (Profile gold). Dynamic: all fields. Exceptions: dashed empty block; value-right row pattern.

### `41_Profile_Account_Safety_Dark.png` — Profile hub: account & safety
Class A. Sections: back + "Profile" + pencil → ACCOUNT & SAFETY hub card: eyebrow, display "Private by default.", sub, gold shield-check, ghost B → rows card: Payment methods / Terms of Service / Privacy Policy (icon squircles, serif, subs, chevrons) → SAFETY PRINCIPLE card: shield squircle, serif "One identity, two modes.", body → standard "Log out" (exit icon) → **delete row: HOT-AMBER outlined button "🗑 Delete account"** (measured — amber family #E1AE65, NOT red; earlier red read was wrong) → info note card "Deletion is permanent…" → nav (Profile gold, top-bar). Dynamic: none beyond identity. Exceptions: the delete row is the set's strongest amber control.

### `40_Payment_Methods_Dark.png` — Payment methods
Route: `screens/PaymentMethodsScreen.tsx` (high). Class A. Sections: back squircle + centered serif "Payment methods" → PAYMENT PROTECTION card: eyebrow, display "Honest by design.", sandbox body, ghost B → FUNDING SOURCE card: card-icon squircle, green eyebrow, serif "No stored payment methods", body → SANDBOX LEDGER card: green eyebrow, serif "What the sandbox does", "No real charge" gold pill, 4 rows green-check circles + bold lead + body (Authorize/Hold in protection/Release/Audit) → footer note card (payment-state label copy) → nav (Profile gold, top-bar). Dynamic: none until provider exists (copy is configuration truth). Exceptions: green eyebrows on section cards here (vs gold elsewhere) — B-11 member.

### `39_Notifications_Preferences_Dark.png` — Notification preferences
Route: `screens/NotificationSettingsScreen.tsx` (high). Class A. Sections: back squircle + centered "Notifications" → ALERT PREFERENCES card: green eyebrow, display "Stay informed, not interrupted.", body, bell circle, ghost B → toggles card: 5 rows (icon circle, serif title, sub, CREAM-knob toggle ON) with hairline separators → NEARBY RANGE card: green eyebrow, serif "How far is "nearby"?", 1/3/5/10 mi segmented (3 mi active dark+gold), footnote + GREEN text button "Update my location" → categories footnote card (gold "Categories:" + list) → nav (Profile gold). Dynamic: notification_prefs, radius, categories from profile. Exceptions: cream toggle knob (B-5); green text-button.

### `31_deleteacc_dark.png` — Delete account p1 (explainers)
Route: `screens/DeleteAccountScreen.tsx` (phase67 exists). Class B. Sections: back + display "Delete account" + sub "Permanent. Please read this first." → "What is removed" card: gold shield-check squircle, serif heading, 5 gold-bullet body lines → "What is kept, and why" card: same anatomy, 3 bullets ("Deleted user" attribution copy verbatim) → amber gate card begins: "5 things have to be settled…" → nav (Profile GREEN person). Dynamic: none (copy) — but see 32. Measured warn #EDAE57.

### `32_deleteacc_pg2_dark.png` — Delete account p2 (blockers)
Same route scrolled. Sections: gold underline under header → amber-border gate card: (!) circle + warn serif heading → 5 blocker rows (inner cards): green eyebrows JOB/PAYMENT, icon circles (briefcase green / $ gold), serif titles (Room Cleaning, Dog Walking, Payment you sent, Payment owed to you ›, Payment you sent), muted bodies → closing muted paragraph → disabled grey "🗑 Delete my account" → nav (Profile green). Measured warn #F6B24D (hottest amber in set). Dynamic — CRITICAL: blocker list is REAL phase67 gating output; rows/counts/kinds from the RPC, never hardcoded five.

## My Jobs hub (one screen, three tab states)

### `35_My_Jobs_Active_Dark.png` — Active tab
Route: `screens/MyJobsHubScreen.tsx` (high). Class A. Sections: back squircle + centered serif "My jobs" → YOUR WORK eyebrow + display "My jobs" + briefcase squircle right + sub → segmented Active|In Progress|Closed — **active = GREEN fill** (B-3 exception) → YOU POSTED eyebrow + "2 jobs" green pill → open-job cards: "Open" green pill + age + ⋯ , display title, meta, divider, tag-icon circle + "N bid(s) received"/"No budget set", "View details →" standard chip; price serif when set → dashed-border "＋ Post another job" → nav (My Jobs green-fill briefcase — B-1). Dynamic: all.

### `37_My_Jobs_In_Progress_Dark.png` — In Progress tab
Same route. Segmented active = dark+gold SERIF (B-3 majority form). Cards: "● In progress" green pill + age, display title + right serif cream price, meta rows incl. Worker name, GOLD progress bar, status caption ("Work underway"/"Worker assigned") + "View details →" → dashed post-another w/ gold arrow → nav (My Jobs gold). Dynamic: progress states from lifecycle derivation (single source).

### `36_My_Jobs_Closed_Dark.png` — Closed tab
Same route. Segmented active Closed = dark+gold. WORK HISTORY eyebrow + "5 completed" sage pill → completed cards: COMPLETED green check-pill (+ "Payment released" row with card icon on one), title, price serif, role lines (Client · X / Worker · X), divider, gold stars + "5.0 · Great work!" + "View details →" → nav (My Jobs gold-outline). Dynamic: history, reviews, payment-state labels.

### `38_Notifications_Feed_Dark.png` — Notifications, "What needs attention" chrome
Same surface as 26 — **Appendix B-8 conflict.** Class A. Sections: back squircle + centered "Notifications" → ACTIONABLE UPDATES eyebrow + display "What needs attention." + "2 new" gold pill → segmented All|Jobs|Payments (gold active) → action cards: icon squircle, serif title, sub, clock+age row, gold chevron → DEEP LINKS explainer card (star squircle, eyebrow, serif "Updates open the right job state.", body, circle-arrow) → nav (Profile gold, top-bar). Dynamic: real events only — NOTE this master shows items with no live feature ("Identity verification approved" — no provider exists; that card class cannot render until verification ships).

---

# Appendix A — Asset inventory

| Asset | Source | Status |
|---|---|---|
| `assets/prestige/hero_toolbox_worker.png` (443×295) | crop of 43 | placed by operator |
| `assets/prestige/hero_armchair_customer.png` (400×351) | crop of 44 | placed by operator |
| `assets/prestige/brazos_b_drape.png` (306×251) | crop of 44 | placed by operator |
| Ghost "B" watermark | render as serif Text, low-alpha gold | code, no asset |
| Concentric arcs / sparkles / leaf / moon / shield glyphs | vector/icon-font in code | code |
| Welcome film grain (2) | not reproducible | DROP |
| Dark map style | provider style config | build item |
| Job/portfolio photos | live uploads | never stocked |

# Appendix B — Cross-screen conflicts (recorded, not resolved here; dispatch resolves)

1. **Nav active treatment** — 5 forms across the set: gold glyph (1, 12→? no—), gold-filled (10, 20, 29), green-filled (12, 35), green glow (5, 15, 22, 24, 25, 26, 31, 32, 43, 44, 27), gold ring-circle (30), gold top-bar (38, 40, 41, 45, 46); 16 vs 17 flip green/gold on the SAME screen. One rule required.
2. **"Discover" (33) vs "Map" (all others)** for nav slot 2.
3. **Segmented active**: dark+gold serif (34, 36, 37, 38, 39, 29) vs green fill (35, 24-flat). One rule required.
4. **EST. PAY value color**: green (12, 43) vs gold (13, 10-similar). One rule required.
5. **Toggle ON knob**: gold (23) vs cream (39); OFF white (43).
6. **Avatar fill**: dark+ring everywhere vs one gold-filled squircle (46 col 2).
7. **Saved-state control**: green text + green bookmark (5) vs cream serif + gold bookmark (18).
8. **Two masters, one surface**: 26 vs 38 are both the Notifications feed with different chrome and different card anatomy. Operator must pick the master (or assign 38's chrome as the design with 26 demoting to a content reference). *Open question — the only one.*
9. **Form label color**: cream (29) vs gold (30) on the same form.
10. **Profile architecture**: masters 42 / 45 / 41 are three distinct profile pages; repo has one `ProfileScreen` (+ existing sub-screens). Implementing faithfully requires routing the profile area into hub + pages inside the existing navigation trees.
11. **Card-section eyebrow color**: gold on most screens; green on 39/40 section cards and lifecycle/status eyebrows (FUNDS HELD…, OFFER ACCEPTED, JOB/PAYMENT). Pattern reads as status-vs-structure; rule stated at dispatch.

# Appendix C — Hard boundaries every screen inherits

- PNG wins over this manifest; this manifest wins over memory.
- Class-A masters: proportional/section comparison only (16:9 reference vs 19.5:9 device).
- No invented marketplace data — every number/name/photo binds to a live source or renders the honest empty/loading state (46's "% on time" is the canonical omission).
- 44pt touch floor; hitSlop over drawn size.
- No new dependencies (gradients ship flat), no font bundling (serif = `fonts.display`), no hardcoded hex (everything through `lib/theme.ts`), no absolute positioning to a reference.
- Dark-only baked artwork renders only under the dark palette; light keeps current arrangements.
- Sandbox/payment copy is configuration truth; payment labels follow the state machine; "held in protection" wording, never "escrow"; "Deleted user" verbatim.
