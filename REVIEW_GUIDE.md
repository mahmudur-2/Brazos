# REVIEW_GUIDE — ordered device checklist (human review pass)

Prep once: `.env` pointed at staging ·
`psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-6.sql "$SUPABASE_DB_URL_STAGING"`
· then `node scripts/seed-review.mjs`. Two devices (or two simulators):
**C** = phase6.customer@brazos.test, **W** = phase6.worker@brazos.test
(password `brazos-test-1234`). Every lifecycle state below is already live —
no flow-driving needed except where marked TAP-THROUGH.

Items marked **[device-only]** have no automated coverage (the backend is
proven by lifecycle-proof + the phase proofs; rendering is not).

## 1 · My Jobs hub (C, Customer mode)
- Open My Jobs → nine "REVIEW ·" jobs listed, statuses matching their
  titles. **[device-only]** Cards truncate long titles without pushing
  layout.

## 2 · Compare & bid surfaces (C)
- "Open with two bids to compare" → two pending bids ($38 / $42), Compare
  works, Bid Detail shows "Message Wren first" (pre-hire chat opens the
  pair thread). **[device-only]**

## 3 · Lifecycle states (C)
- "Confirmed — funds held, before arrival": payment card says held/protected;
  Track worker shows Hired ✓ only; an UNREAD message from Wren sits in
  Messages (badge). 
- "Worker en route" / "Worker arrived": Track worker timeline shows the
  matching step with timestamps and the no-live-location notice.
- "In progress with checklist": job detail reachable; checklist shows
  1 of 2 done (read-only for C).
- "Done — awaiting your approval": the "your call" card → Review & approve
  shows the completion photo, Approve & release + Report an issue.
- "Done — issue reported (frozen)": red issue card; pinned button is
  Withdraw report; payment note says funds hold while open.
- "Approved — review & tip open": Review & tip opens directly (release
  already happened); leave a review, tap a tip preset — confirm dialog says
  sandbox; a second tip attempt returns the same tip. TAP-THROUGH.
- "Fully settled": review card renders both directions; tip row visible.

## 4 · Worker side (W, Worker mode)
- My Jobs shows the same nine from the worker perspective (EST. PAY
  vocabulary, no customer-only data). **[device-only]**
- "Confirmed" job → Route & arrival: exact address + window visible, taps
  are one-way; Work checklist add/toggle/delete works on the in-progress
  job. TAP-THROUGH on one job only.
- Profile → Earnings: Pending / Available / Transferred buckets are sums of
  the visible ledger rows; "Cash out (simulated)" enabled only when
  Available > 0; a second tap after success reports nothing to cash out.
- Profile → Services & availability: three seeded services (one marked
  Draft — only visible to W), availability toggle + note persist.
- Profile → Notification feed: seeded rows present; open one → unread dot
  clears; "Mark all read" clears the rest.

## 5 · Mode isolation spot-checks (C)
- Map → any cell → open a job: the CUSTOMER-SAFE preview renders (EST.
  PRICE, approximate area, no bid button); "Switch to Worker Mode to bid"
  asks before switching. **[device-only]**
- Saved & past workers: Wren appears under Saved (bookmark) and under
  "Worked for you before" (from "Fully settled"); Hire opens PostJob
  prefilled.

## 6 · Cross-cutting **[device-only]**
- Keyboard: checklist input, dispute details, tip custom amount, review
  comment — submit control stays reachable with the keyboard open.
- Offline: airplane-mode any lifecycle screen → retryable error states, no
  blank screens (ReviewAndTip, WorkChecklist, SavedWorkers hardened this
  run).
- Realtime: with both devices in one chat, messages arrive live; leaving
  the screen stops updates (see DECISIONS — three locked-hook realtime
  findings are flagged for the human pass).
