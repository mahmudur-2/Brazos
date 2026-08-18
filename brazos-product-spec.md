> **ARCHIVED PRODUCT VISION — aspirational, NOT current state. Implemented
> truth lives in docs/architecture.md.**

# BRAZOS — Product Specification

*Local labor marketplace · bidding-based · bilingual-first · Brooklyn-launched*

**Last updated:** June 2026
**Status:** Phase 1 (core loop) in development. Auth complete.

---

## 1. What Brazos is

A two-sided mobile marketplace connecting people who need local work done (clients) with people who do it (workers) — handyman jobs, cleaning, moving help, dog walking, yard work, errands. Clients post a job; workers **bid** to win it; the client picks; they coordinate in-app and pay through the platform.

**One-line pitch:** "Get someone now to do the work — fast, trusted, and language is never a barrier."

**Brand identity (what we're known for):** *Fastest* — get someone NOW. Speed is the headline; trust and the language layer are what make the speed safe and accessible.

**The wedge (why we win):** Three things the incumbents (TaskRabbit, Thumbtack, Handy, Chamba) don't do well together:
1. **Bidding** with reputation-weighted ranking (not flat assignment or pay-per-lead).
2. **Bilingual-first** with LLM smart-translation that makes the English/Spanish gap invisible.
3. **Trust engineered in** — layered verification + a self-funded guarantee.

**Target market (launch):** NYC's Spanish-speaking local-labor workforce + the clients who hire them. Beachhead is Brooklyn (East Flatbush / Sheepshead Bay area).

---

## 2. The five product pillars

### Pillar A — Two modes (speed vs. price)
- **Express ("NOW"):** Client taps category + location, hits "Find someone now." Nearby *available, pre-verified* workers get pinged; system auto-picks best-value or shows 2-3 "tap to book" options at a fair set price. No bidding round. Speed over price.
- **Standard (bidding):** Client posts a job; workers bid; client compares and picks. Slower, cheaper, more choice.
- **Launch decision:** Ship Standard (bidding) first. Design Express in, enable it once a neighborhood has enough active workers that "NOW" actually delivers. Verification happens at onboarding (once), so Express workers are already verified — speed at hire, rigor at signup.

### Pillar B — Chat + LLM smart-translation (the signature feature)
- In-app chat opens the moment a client accepts a worker (or books Express).
- **LLM smart-translation:** every message routed through Claude (Anthropic API). Not literal translation — understands regional Spanish slang (Dominican/Mexican/Puerto Rican), handyman jargon, tone; cleans up rushed/low-punctuation messages so both sides read clearly and professionally.
- **Behavior:** translation off by default (users see original first, builds trust). When the two users' languages differ, the "Traducir / Translate" button is surfaced prominently. A "see original" toggle always available.
- **Cost control:** cache identical phrases (translate once, reuse); pre-translate templates (no API call); LLM only for novel messages; fall back to original on API failure.
- **Quick-tap templates** (one tap, auto-translated both ways): "On my way 🚗", "Here, where do I go?", "Running 10 min late", "Job done ✅", "Send me a photo". Critical for workers who are driving/on a ladder/hands dirty.
- **Live arrival status:** chat header shows "Carlos accepted · 8 min away" → "Carlos has arrived" with a map dot. The Uber feeling.
- **In-thread photos:** client snaps the task; worker snaps the finished work (also dispute evidence).
- **On-platform only:** no phone numbers shared. Protects the business, powers translation, creates the dispute record.

### Pillar C — Trust & verification (four layers)
1. **Identity (floor, everyone):** phone + email + government ID scan with selfie match (Stripe Identity / Persona / Veriff). Every user is a real, traceable person.
2. **Verified tier (price differentiator):** background check (Checkr) + proven track record. Costs clients more, fully vetted. *Unverified = ID-checked, NOT unscreened* — never market it as unscreened (legal shield + honest pitch).
3. **Reputation (compounds):** two-way reviews (clients rate workers AND workers rate clients), completion rate, on-time %, response time, verified work photos as a portfolio, tenure. Feeds the bidding value score.
4. **Safety net (when things go wrong):** escrow; dispute resolution using chat + photo evidence; the **Brazos Guarantee** (self-funded damage/theft pool from a slice of commission → graduates to a real underwritten policy as volume grows); live location share + emergency button (protects workers especially).
- **Halal note:** the self-funded guarantee pool resembles *takaful* (cooperative risk-sharing), a cleaner fit than conventional insurance. Worth a fiqh review as it scales.

### Pillar D — Bidding & the value score (the differentiator engine)
- **The trap to avoid:** cheapest-first sorting = race to the bottom that screws workers and attracts low quality.
- **The fix — value score:** bids ranked by a blend, not just price: price (weighted, not dominant) + rating + completion rate + on-time % + response time + category experience + verification tier.
- Client sees a *smart-sorted* list (default = value score), each bid card showing the worker's **proof** (rating, jobs done, completion %, photos, one-line pitch) with price as just one line. A pricier proven worker can outrank a cheaper unknown.
- **Client controls the sort:** can flip to lowest-price / highest-rated / fastest. Respect their priorities.
- **Guardrails:** suggested fair-price range when posting; gentle flag on absurdly low bids ("Below typical — underbidders often cancel"); bids expire; one bid per worker per job.
- **Express skips bidding** — auto-picks best-value available worker at a set price.

### Pillar E — Payments & business model
- **Model (LOCKED):** Free for workers to bid. Brazos takes a commission from **completed** jobs only. Everyone's incentives aligned; best for early liquidity.
- **Escrow:** client's payment held by Brazos, released to worker on job completion, minus commission.
- **Instant payout** to workers (day laborers want money *today*) — major draw vs. competitors.
- **Cash-culture bridge:** make in-app payment so easy + protected (instant payout, escrow protection) that it beats cash on convenience. Optional cash *tip* on top is fine; base transaction must flow through the app (or the business and the guarantee can't work).
- **Stripe Connect** powers onboarding workers as payout accounts, escrow, fee splitting, 1099 reporting.

---

## 3. Tech stack

- **Frontend:** React Native (Expo) — one codebase, iOS + Android.
- **Backend:** Supabase — Postgres database, auth, realtime, file storage. (Live. Project URL + publishable key in `.env`.)
- **Payments:** Stripe Connect (escrow, payouts, fees).
- **Verification:** Stripe Identity / Persona / Veriff (ID), Checkr (background checks).
- **Translation:** Anthropic API (Claude) for LLM smart-translation, with caching.
- **Testing during dev:** Expo Go on a real phone (QR scan) or web target in browser.
- **Build/submit:** EAS Build → App Store ($99/yr) + Google Play ($25 once).

---

## 4. Database schema (current)

Tables live in Supabase (see `brazos-schema.sql`):
- `profiles` — id (→ auth.users), full_name, phone, avatar_url, role (client/worker/both), verification_status (unverified/pending/verified), stripe_account_id, rating_avg, rating_count.
- `jobs` — client_id, title, description, category, location, lat/lng, budget_cents, status (open/assigned/in_progress/completed/cancelled), assigned_worker_id, accepted_bid_id, final_amount_cents, scheduled_for.
- `bids` — job_id, worker_id, amount_cents, message (pitch), status (pending/accepted/rejected/withdrawn). One bid per worker per job.
- `payments` — job_id, payer_id, payee_id, amount_cents, platform_fee_cents, stripe_payment_intent_id, status.
- `reviews` — job_id, reviewer_id, reviewee_id, rating (1-5), comment.

Row Level Security is ON. A trigger auto-creates a profile on signup.

**Schema additions coming in later phases:** background-check status, reputation signal fields (completion_rate, on_time_pct, response_time), a disputes/guarantee-fund table, chat messages table (with original + translated text + language fields), Express-availability fields on worker profiles.

---

## 5. Build roadmap

### Phase 1 — The core loop (BUILD NOW)
Auth ✅ → post a job → browse jobs → place a bid → accept a bid → complete → review.
**Goal:** one client hires one worker end-to-end on your phone. **No payments yet** — handle money by hand (cash/Venmo) to prove the loop. Don't build anything below this line until the loop works.

### Phase 2 — Make it real (trust + money)
ID verification · Stripe escrow + instant payout + commission · two-way reviews + reputation signals · in-app chat (basic).
**Goal:** strangers transact safely; Brazos earns per job.

### Phase 3 — The differentiators
LLM smart-translate chat · value-score bidding · verified tier · Express "NOW" mode · arrival tracking · Brazos Guarantee.
**Goal:** clearly better than Chamba / TaskRabbit for this market.

### Phase 4 — Scale
More categories · more neighborhoods · real insurance policy · App Store + Play launch · marketing · safety ops.
**Goal:** dominate Brooklyn, then expand.

**The real hard part is liquidity, not code.** Plan the Brooklyn beachhead in parallel: pick 1-2 categories + one specific area, personally line up the first 10-15 reliable workers.

---

## 6. Design language (for all UI)

Modern, clean, premium — "Uber meets Linear." Confident primary color (deep blue or near-black), generous spacing, rounded cards with soft shadows, one clean sans-serif with clear weight hierarchy, smooth loading/empty/error states. Price is never the visual hero on bid cards — worker *proof* (rating, jobs, completion %) leads. Reusable components: Card, Chip, ScreenHeader, Button, TextField, StatusBadge.

---

## 7. The remaining Phase 1 build prompts (for Claude Code)

Feed these one at a time, test each before the next.

**Prompt 3 — Design system + Post a Job**
> Establish a reusable design system in /lib/theme.ts (modern, clean, premium — Uber meets Linear: confident primary color, generous spacing, rounded cards with soft shadows, clear type hierarchy, smooth loading/empty/error states). Build reusable Card, Chip, and ScreenHeader components. Then build the "Post a Job" flow for clients: polished form with title, description, category (visual chips with icons for dog_walking, cleaning, moving, yard_work, handyman, errands, other), location, optional budget. On submit, insert into `jobs` (status 'open', current user as client_id) with a success animation. Then a "My Jobs" screen: clean card list with title, category icon, color-coded status badge, bid count, and a nice empty state. Reachable from the Home tab.

**Prompt 4 — Browse + Bid (worker side)**
> Build the worker home screen: a live list of open jobs (status 'open'), newest first, using Supabase realtime so new jobs appear without refresh. Each job is a clean card (title, category icon, location, budget if set, time posted). Tapping opens a detail screen with a "Place Bid" form (amount + short pitch message). On submit, insert into `bids`. Show the worker their own bids and status.

**Prompt 5 — Accept a bid (the match)**
> On the client's job detail screen, show all bids for that job as cards (worker name, avatar, rating, completion %, verification badge, price, pitch), sorted by a value score (blend of price, rating, completion rate — not just lowest price), with a sort toggle (Best value / Lowest price / Highest rated). Add "Accept". On accept: set that bid 'accepted', set job 'assigned', fill assigned_worker_id + accepted_bid_id + final_amount_cents.

**Prompt 6 — Complete + review**
> Add a flow to move a job from 'assigned' → 'in_progress' → 'completed' (worker uploads a "done" photo). Once completed, prompt both client and worker for a 1-5 star review + optional comment (insert into `reviews`), and update the reviewee's rating_avg / rating_count. Two-way: clients rate workers and workers rate clients.

That completes Phase 1. Then move to Phase 2 (verification → payments → chat).

---

## 8. Key decisions locked

- Name: **Brazos** (Spanish: "arms / laborers" — what the target market calls day labor).
- Bidding model: **free to bid, commission from completed jobs.**
- Translation: **LLM smart-translation**, off by default, surfaced when languages differ.
- Launch mode: **Standard (bidding) first, Express later.**
- Insurance: **self-funded Brazos Guarantee pool first** (takaful-like), real policy later.
- Verification: **everyone ID-checked; verified tier adds background check.**
- Launch market: **Brooklyn beachhead, 1-2 categories first.**
