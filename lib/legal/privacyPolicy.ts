/**
 * Privacy Policy — WORKING DRAFT.
 *
 * Describes what the app actually does today, checked against the real
 * schema and code rather than written generically:
 *   * location   — phase12 (job_locations, neighbourhood label on `jobs`),
 *                  lib/reverseGeocode.ts (OpenStreetMap Nominatim)
 *   * photos     — phase13 job photos, phase17 completion photos + portfolio
 *   * moderation — phase13 blocks/mutes/reports/bans, FIX-RUN B3 word filter
 *   * push       — phase20 push_tokens, notification_prefs.home_lat/lng,
 *                  live_activity_tokens (the lock-screen card)
 *   * payments   — Stripe (payments, payment_events, payment_accounts, saved
 *                  cards through supabase/functions/payment-methods); the
 *                  90-day payload prune (20261003000500)
 *   * receipts   — supabase/functions/send-receipts (Resend)
 *   * analytics  — lib/observability (PostHog, no PII; Sentry crash reports)
 *   * speech     — on-device only (requiresOnDeviceRecognition: true)
 *   * deletion   — phase67/68, FIX-RUN A18a (saved cards removed, the payout
 *                  account kept open while money is owed)
 *
 * If any of those change, this needs changing with them, and PRIVACY_VERSION
 * in ./index.ts needs bumping so users re-accept.
 */
import { SUPPORT_EMAIL } from '../appLinks';

export const PRIVACY_POLICY = `
# Brazos Privacy Policy

## ⚠️ Working draft — pending legal review

This document is an unreviewed first draft written to describe accurately what
the app does with your data. It is NOT final legal text and has NOT been
reviewed by a licensed attorney. It must be reviewed and revised by qualified
counsel before Brazos is offered to the public.

Last updated: 3 October 2026

## 1. Who this covers

This policy covers the Brazos mobile app. Brazos is operated from the United
States and intended for use there.

## 2. What we collect

### Account details

- Your name, as you enter it.
- Your email address, used to sign in.
- Your phone number.
- Your password, stored only as a cryptographic hash by our authentication
  provider — Brazos never stores or sees your actual password.

Your name and profile photo are shown to other users you interact with. Your
phone number is collected for account identity, recovery, and safety
(including preventing a banned user from re-registering). It is not displayed
on your public profile.

### Profile information

An optional short bio, your preferred language, and the job categories you
select. These are shown on your public profile.

### Location

Location is handled in two distinct ways, deliberately:

- Approximate, and public. When a job is posted with a location, the app
  stores a neighbourhood-level text label (for example "Flatbush, Brooklyn,
  NY"). This label is visible to anyone browsing that job. To find that label,
  the app sends your coordinates, or the place you type, to OpenStreetMap's
  Nominatim service, which returns the area's name.
- Precise, and restricted. If you use "use my location" when posting, the app
  also stores exact coordinates for that job. These are used only to place the
  job on the map's aggregated hotspot view. They are stored separately from the
  job listing itself and are readable only by the job's Customer and its
  hired Worker. Exact coordinates are never sent to people browsing jobs, and
  the map's hotspot view shows counts per area, never individual pins.

If you turn on "New jobs nearby" notifications, the app stores one further
coordinate: an approximate point for your own location, used solely to measure
which new jobs fall inside your chosen radius. It is readable only by you and
is never shown to other users.

You can decline location permission. Jobs can be posted with a typed location
instead, and nearby-job notifications simply stay off.

### Photos

The app collects photos in four places, with different visibility:

- Job photos, attached by a Customer when posting. Visible to anyone who can
  see that job.
- Completion photos, attached by a Worker when marking a job done. Shown in
  the app to the Customer and the Worker on that job. Job media files are
  currently stored in a public storage bucket, so someone with an exact file
  link could access them; private storage for completion media is planned.
- Portfolio photos. A Worker may choose to feature completion photos on their
  profile. THESE ARE PUBLIC — visible to anyone who views that profile,
  including people not involved in the original job. The app warns you before
  your first one, but you should assume anything you feature can be seen by
  anyone.
- Profile photos. Visible to other users.

Photos may show the inside of homes and personal property. Only post photos you
have permission to post, and do not feature a photo publicly if it shows
anything the Customer would not want shared.

### Messages and job activity

Messages you send, including text and photos;
bids; hire requests and counter-offers; reviews and ratings you give and
receive; and the status history of your jobs.

Speaking to search or to dictate a job's title and description is turned into
text on your device. The audio is not sent to Brazos.

### Payments

Payments are processed by Stripe. Your card number is entered into Stripe's
own payment form and never reaches Brazos. Brazos keeps a record of each
payment — the amounts, the fees, and its state (held, released, refunded) —
and the event records Stripe sends about it, which can include the name and
postcode on the card and the card's brand and last four digits. The detail in
those event records is removed after 90 days; the record that the event
happened is kept.

If you choose to save a card for faster hiring, Stripe stores it, not Brazos,
and you can remove it at any time in Payment methods. If you are paid as a
Worker, Stripe collects the details it needs to pay you (such as your identity
and bank account) in its own onboarding; Brazos keeps only a reference to that
payout account and whether it can receive money.

After a payment is released, Brazos emails a receipt to the Customer and the
Worker.

### Moderation data

Blocks, mutes, and reports you make, including any description you write in a
report and what the report is about (a job post, a profile, a review, a photo
or a message). Reports are visible to Brazos administrators. Blocks and mutes
are not disclosed to the person blocked or muted. Brazos refuses posts, bids,
profiles, reviews and messages that contain certain words it does not allow;
the refused text is not stored.

### Device, notification and diagnostic data

If you enable notifications, a push token identifying your device, plus your
per-category notification preferences. Push tokens are stored so that only you
can read them, and are removed from your account when you sign out. If you
allow the lock-screen card for a job, a token for that card, used only to
update it.

When the app crashes or hits an error, a crash report (what failed, and the
device and app version) is sent to Sentry. Product analytics — which screens
and steps are used — go to PostHog. Both are identified by your account id
only: no name, email, phone number, message text or location is sent to
either.

## 3. What we do not collect

- Your full card number or bank login. Card details go to Stripe directly.
- Government identification documents. (A Worker's identity check for payouts
  is done by Stripe, and Brazos does not receive the documents.)
- Your device's contact list.
- Background location. Location is read only while the app is open and you are
  using a feature that needs it.

## 4. How we use it

- To operate the platform: show jobs, deliver messages, run bidding, and
  display profiles.
- To take, hold, release and refund payments, pay Workers, and send receipts.
- To place jobs on the aggregated map view.
- To send notifications you have switched on.
- To enforce safety and the Terms of Service: reviewing reports, applying
  blocks and mutes, refusing words Brazos does not allow, suspending accounts,
  and preventing a banned user from re-registering.
- To fix problems and diagnose errors, and to understand which parts of the
  app are used.

Brazos does not sell your personal information, and does not use it for
third-party advertising.

## 5. Who it is shared with

- Other users, as described above — what is public, what is limited to the
  parties on a job, and what is private is set out in section 2.
- Service providers who run the app for us, each only for its own job:
  - Supabase — hosting, database, sign-in, and file storage;
  - Expo — push notification delivery;
  - Stripe — payments, saved cards, and Worker payouts;
  - Resend — receipt emails;
  - OpenStreetMap Nominatim — naming the neighbourhood for a location;
  - Sentry — crash reports;
  - PostHog — product analytics, without names or contact details.
- Law enforcement or others where required by law, or where necessary to
  protect someone's safety.

## 6. How long it is kept

- Account data is kept while your account exists.
- Job listings, messages, bids, and reviews are kept while the account exists,
  because they form the shared history of a job between two people. A review
  you left about someone else, and their rating, remain part of their record.
- Payment records are kept as the record of what was charged, held, released
  and refunded. The detail in Stripe's event records is removed after 90 days.
- Reports and moderation records are kept as long as needed for safety, and may
  outlive the reported account so that a banned user cannot simply re-register.
- Banned phone numbers are retained specifically to enforce bans.
- Push tokens are deactivated at sign-out and removed when your account is
  deleted.

## 7. Deleting your account

You can delete your account in the app: Profile → Delete Account.

You cannot delete it while a job or a payment is still in progress; the app
lists what is outstanding.

On deletion we deactivate your account, permanently delete your sign-in
identity, and remove your name, photo, and contact details from your profile.
Any card you saved is removed from Stripe before the account goes. A Worker's
payout account stays open until every payment still owed to them has reached
it, so nothing earned is lost with the account. Content tied
to past jobs — photos, messages, reviews — and payment records may be retained
so other users' job records stay intact and for dispute or legal needs.
Uploaded media files are not yet automatically removed from storage.
Moderation records are retained as described above.

Deletion is permanent and cannot be undone.

## 8. Your choices

- Location: decline the permission, or type a location manually instead.
- Notifications: switch any category off under Profile → Notifications, or turn
  them off entirely in your device settings.
- Saved cards: save one only if you want to, and remove it in Payment methods.
- Portfolio photos: choose which completion photos, if any, are featured
  publicly, and remove any of them at any time.
- Profile details: edit or clear your bio, photo, and categories whenever you
  want.
- Other users: block or mute anyone, and report what they post.

Depending on where you live, you may have additional rights to access, correct,
port, or delete your personal information. Email ${SUPPORT_EMAIL} to make a
request.

## 9. Security

Data is stored with our hosting provider and access is restricted by row-level
security rules so that users can only read what they are entitled to. Passwords
are hashed by our authentication provider. No system is perfectly secure, and
we cannot guarantee against every possible breach.

## 10. Children

Brazos is not intended for anyone under 18, and we do not knowingly collect
information from children. If we learn we have, we will delete it.

## 11. Changes

We may update this policy. When the substance changes, you will be asked to
review and accept the new version before continuing to use the app.

## 12. Contact

Privacy questions: email ${SUPPORT_EMAIL}. Brazos replies within 2 business
days.
`.trim();
