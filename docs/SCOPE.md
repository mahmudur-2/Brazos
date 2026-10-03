# SCOPE — v1 is this list and nothing else

Anything not listed goes to `docs/BACKLOG.md` under v1.2 — it is not built before ten real users ask for it.

**Platform:** iOS only. **Market:** one neighbourhood.
**Loop:** customer posts a job → workers bid (sealed) → accept = fund → work → complete → release → review.

## In v1
- Auth, profile, one account with customer and worker modes
- Post job (manual, no AI), bids / offers / counteroffers, accept = fund with test money until launch
- Complete / approve / dispute path; payouts; reviews
- Push notifications
- Text + photo messaging, unlocked after assignment
- Worker discovery with radius and default-on nearby alerts
- Account deletion; report / block
- Posted-price choice at posting: the customer chooses between a posted price and open bids (ruled in 2026-09-05 - docs/DECISIONS.md, entry (2) of that date; not Instant Book - the customer still accepts and funds)
- Undo instead of a confirm box when archiving, muting or marking a chat unread: a five-second Undo; money and hiring keep their confirm (ruled in 2026-09-30 - docs/DECISIONS.md, entry (1) of that date; the only change those built-already features get)
- Running late, one tap: the worker's 10 / 20 / 30 min chips tell the customer and move the arrival time (ruled in 2026-09-30 - docs/DECISIONS.md, entry (1) of that date)
- Need it today: a posting toggle, off by default; on, nearby workers get an instant alert and the job card shows a Today pill (ruled in 2026-09-30 - docs/DECISIONS.md, entry (1) of that date)
- Dictation into the Post-a-job title and description: two mics, on-device speech-to-text filling the field in place; not voice messages (ruled in 2026-09-30 - docs/DECISIONS.md, entry (1) of that date)
- The receipt: after a release, the customer and the worker each get a receipt with a short job number and the What-happened timeline; the sender is decided separately (ruled in 2026-09-30 - docs/DECISIONS.md, entry (4) of that date)
- The lock-screen live card: the worker's stage taps and the arrival time on the customer's lock screen; it needs a new TestFlight build (ruled in 2026-09-30 - docs/DECISIONS.md, entry (4) of that date)
- Hire from the push: Accept & pay on a bid's push, confirmed in place, paid with a card the customer chose to save (opt-in at Checkout and in Payment methods, removable there), through accept_offer() and the Checkout payment path; no new money rule (ruled in 2026-09-30 - docs/DECISIONS.md, entry (4) of that date)
- Repeat jobs: post once; the same worker gets first refusal on each visit; the customer still approves and pays each visit; the money rules stay; a repeating job, not a calendar (ruled in 2026-09-30 - docs/DECISIONS.md, entry (4) of that date)

## Not in v1 (do not build before ten real users ask)
Voice messages · live location · document sharing · translation · hidden / archived / muted chats · Android · web · design studio · second theme · second font · instant payouts · calendars · AI features

## Built already — no enhancement (BRAZOS only; a new project deletes this section)
Everything below already exists in the repository and sits beyond the "In v1" line. It is
listed so that a run can recognise it and leave it alone — not as a licence to extend it.

Feature-flagged, in `lib/featureFlags.ts`. Nine are LIVE; the guarded UI is built, typed
and fixture-tested whether the flag is on or off, so a flag is the whole switch.

- `LIVE_LOCATION` — LIVE. Sharing a live position into a thread while a job runs; foreground only, no background permission (D-16). `screens/ChatScreen.tsx`, `tests/liveLocation.test.mjs`.
- `DOCUMENTS` — LIVE. PDF / doc / spreadsheet attachments, the one attachment kind that works on both thread kinds. `components/ChatComposer.tsx`, `tests/chatDocuments.test.mjs`.
- `TIMED_BLOCK` — LIVE. Blocking someone for a period rather than permanently; the permanent block predates the flag and is untouched by it. `lib/moderation.ts`.
- `HIDDEN_CHATS` — LIVE. A conversation behind device authentication; the entry renders only where a biometric or passcode is enrolled.
- `ARCHIVE` — LIVE. Archiving a conversation out of every inbox pill, not only "All".
- `CLEAR_CHAT` — LIVE. Clearing a thread's messages for one participant; the other keeps their copy. `lib/conversationVisibility.ts`.
- `DELETE_CHAT` — LIVE. Removing a conversation from one inbox; the next message reopens it by derivation, never by a write.
- `MARK_UNREAD` — LIVE. Rewinding your own read position on both thread kinds.
- `READ_TICKS` — LIVE. The gold read tick on an own message. `lib/messageTicks.ts`, `components/MessageTicks.tsx`.
- `DELIVERED_TICKS` — DARK, and a refusal rather than a wait: no schema here distinguishes "the insert succeeded" from "the other device has it".
- `TRANSLATION` — DARK. In-chat translation; `supabase/functions/translate/` is drafted and deliberately not deployed, and the sheet renders from fixtures.
- `PRICE_GUIDANCE` — DARK, and the one flag that is not a messaging feature: the Post-a-Job "Suggested starting range" (`lib/priceGuidance.ts`) is an unattributed seed, so it renders off.

Not flagged, and equally out of scope for new work:

- Voice messages — record, meter and play back in a thread. `supabase/archive/phases/phase16_voice_messages.sql`, `components/VoiceNote.tsx`, `components/AudioMeterBars.tsx`, `lib/audioMeter.ts`.
- Muting a person — live since `supabase/archive/phases/phase13_moderation_photos_location.sql`, reached from the inbox long-press sheet and the chat overflow menu; it was never flag-gated because it had no unmet dependency.
- Voice search — the Home search bar's mic (`ui/primitives/SearchBar.tsx`, `tests/voiceSearch.test.mjs`). `lib/voiceSearch/` and `expo-speech-recognition` are also the in-v1 dictation's on-device boundary (wording only, docs/DECISIONS.md 2026-10-03, fix run F22).
- The design studio — a schema-driven, per-screen dial surface. `dev-tools/HomeDesignStudio.tsx`, `components/DesignStudioPanel.tsx`, `lib/designOverrides.ts`, `lib/designStudioGate.ts`, `ui/designStudioSchema.ts`, `screens/AppearanceScreen.tsx`, `tests/designStudio.test.mjs`, `tests/homeDesignStudio.test.mjs`.
- The dark theme — the second theme, with a stored per-user preference and a light / dark / system choice. `lib/ThemeContext.tsx`, `lib/themePreference.ts`, `lib/themePreferenceStorage.ts`, `tests/themeResolution.test.mjs`. Ruled one theme, not a second, by docs/DECISIONS.md 2026-09-04 (n1) entry (2): one token set rendered in the device's own appearance; the picker stays.
- The Android target — a complete `android` block in `app.config.ts` (permissions included) and `npm run android`. Settled 2026-08-31: CLAUDE.md §Target and trunk now agrees with this file's "Platform: iOS only" line — iOS is the only shipping target for v1, the Android configuration stays in the repository and keeps building, and no work is scheduled for it before ten real users; the decision and its reasons are dated in `docs/DECISIONS.md`.
- The web / PWA surface — already frozen by CLAUDE.md §Design references: `public/`, `hosting/`, `dist/`, the service worker, `*.web.ts` / `*.web.tsx` and the web map. Never modified by product work.

The second font is NOT built: `assets/fonts/PlayfairDisplay-Bold.ttf` is on disk with its
licence and is loaded by nothing — the app runs on platform faces.

These receive no enhancement work before ten real users. They may be removed, disabled or changed when required for v1 correctness, security, build health or simplification — delete what you are not shipping.

## Change control
Adding a line to "In v1" requires a dated entry in `docs/DECISIONS.md` naming the user request that justified it.
