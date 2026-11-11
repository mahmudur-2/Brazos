/**
 * Privacy Policy.
 *
 * Describes what the app actually does today, checked against the real
 * schema and code rather than written generically:
 *   * sign-in    — phone text code or email + password (eas.json production)
 *   * location   — job_locations (service address + coordinates, owner and
 *                  hired worker), neighborhood label on `jobs`,
 *                  lib/reverseGeocode.ts (OpenStreetMap Nominatim),
 *                  jobs_within_radius() (the searcher's position, not saved)
 *   * media      — lib/storage.ts: job-photos and avatars are public buckets,
 *                  chat-photos is private
 *   * moderation — blocks/reports/bans, the word filter (20261003000700)
 *   * push       — push_tokens, notification_prefs.home_lat/lng
 *   * payments   — Stripe (payments, payment_events, payment_accounts, saved
 *                  cards through supabase/functions/payment-methods); the
 *                  90-day payload prune (20261003000500)
 *   * receipts   — supabase/functions/send-receipts (Resend), only to an
 *                  account that has an email address
 *   * diagnostics — lib/observability (Sentry: crash reports with emails and
 *                  phone numbers stripped, sessions, sampled performance)
 *   * speech     — on-device only (requiresOnDeviceRecognition: true)
 *   * deletion   — delete_my_account() (20261108000000), saved cards removed,
 *                  the payout account kept open while money is owed
 *   * website    — scripts/build-site.mjs: static pages, no cookies, no
 *                  analytics, no scripts; hosted on Cloudflare Pages
 *
 * If any of those change, this needs changing with them, and PRIVACY_VERSION
 * in ./index.ts needs bumping so users re-accept. The public website is
 * generated from this string by scripts/build-site.mjs: never copy the text.
 * Not yet reviewed by counsel: ledger O1 is still owed.
 */
import { SUPPORT_EMAIL } from '../appLinks';

export const PRIVACY_POLICY = `
# Brazos Privacy Policy

Last updated: 11 November 2026

This policy explains what personal information Brazos collects, why, who
receives it, how long it is kept, and the choices you have. "Brazos", "we" and
"us" mean the operator of the Brazos mobile app and the Brazos website.

## The short version

- Brazos collects what it needs to run a marketplace for local work: your
  account details, what you post, your messages, your payments, and a location
  for each job.
- Other users see your name, your profile, and the jobs and reviews you post.
  They never see your phone number, and they see a job's exact address only if
  they are hired for it.
- Brazos does not sell your personal information, shows no advertising, and
  does not track you across other companies' apps or websites.
- You can delete your account in the app at any time (section 7).

## 1. Who this covers

This policy covers the Brazos mobile app and the Brazos website. Brazos is
operated from the United States and intended for use there. Your information
is processed in the United States and wherever our service providers operate.

## 2. What we collect

### Account details

- Your name, as you enter it.
- Your phone number. If you sign in by phone, a one-time code is sent to it
  by text message.
- Your email address, if you sign in with email.
- Your password, if you sign in with email, stored only as a cryptographic
  hash by our authentication provider — Brazos never stores or sees your
  actual password.

Your name and profile photo are shown to other users. Your phone number is
collected for sign-in, account identity, recovery, and safety (including
preventing a banned user from re-registering). It is not displayed on your
public profile.

### Profile information

An optional short bio, your preferred language, and the job categories you
select. If you offer work: the services and prices you list, a short note
about your availability, and whether you are accepting work. These are shown
on your public profile, together with figures Brazos calculates from your
activity in the app: your rating and reviews, completion rate, on-time record
and typical response time.

### Location

Location is handled in two distinct ways, deliberately:

- Approximate, and public. When a job is posted with a location, the app
  stores a neighborhood-level text label (for example "Flatbush, Brooklyn,
  NY"). This label is visible to anyone browsing that job. To find that label,
  the app sends your coordinates, or the place you type, to OpenStreetMap's
  Nominatim service, which returns the area's name.
- Precise, and restricted. When you post a job you can give its service
  address, and if you use "use my location" the app also stores exact
  coordinates for that job. The coordinates are used only to place the job on
  the map's aggregated hotspot view and to measure how far away it is. The
  address and coordinates are stored separately from the job listing itself
  and are readable only by the job's Customer and its hired Worker, who keeps
  access to them as part of the job's record. They are never sent to people
  browsing jobs: the map's hotspot view shows counts per area, never
  individual pins, and a Worker browsing sees only a job's area and its
  distance.

When you look for jobs near you, the app sends your current position to our
servers to find the jobs within your chosen distance. It is used to answer
that search and is not saved.

If you turn on "New jobs nearby" notifications, the app stores one further
coordinate: an approximate point for your own location, used solely to measure
which new jobs fall inside your chosen radius. It is readable only by you and
is never shown to other users.

You can decline location permission. Jobs can be posted with a typed location
instead, and nearby-job notifications simply stay off.

### Photos and videos

The app collects photos and short videos in these places, with different
visibility:

- Job photos and a short video, attached by a Customer when posting. Visible
  to anyone who can see that job.
- Completion photos and videos, attached by a Worker when marking a job done.
  Shown in the app to the Customer and the Worker on that job.
- Review photos, attached to a review. Visible wherever the review is shown.
- Profile photos. Visible to other users.
- Photos sent in a conversation. Kept in private storage and shown only to the
  people in that conversation.

Job, completion and review media and profile photos are currently stored in
public storage buckets, which the app's access rules do not protect: someone
outside the job who has, or finds, a file's link could open it;
private storage for completion media is planned.

Photos and videos may show the inside of homes and personal property. Only
post media you have permission to post, and do not share anything the
Customer would not want shared.

### Messages and job activity

Messages you send, including text and photos;
bids; hire requests and counter-offers; reviews and ratings you give and
receive; issue reports you file about a job, and what you write in them; the
schedule of a job, including a repeating one; and the status history of your
jobs, including a Worker's on-the-way, arrival and running-late updates.

Speaking to search or to dictate a job's title and description is turned into
text on your device. The audio is not sent to Brazos.

### Payments

Payments are processed by Stripe. Your card number is entered into Stripe's
own payment form and never reaches Brazos. Brazos keeps a record of each
payment — the amounts, the fees, and its state (held, released, refunded) —
and the event records Stripe sends about it, which can include the name and
ZIP code on the card and the card's brand and last four digits. The detail in
those event records is removed after 90 days; the record that the event
happened is kept.

Stripe's payment form runs inside the app and may collect information about
your device that Stripe uses to prevent fraud, under Stripe's own privacy
policy.

If you choose to save a card for faster hiring, Stripe stores it, not Brazos,
and you can remove it at any time in Payment methods. If you are paid as a
Worker, Stripe collects the details it needs to pay you (such as your identity
and bank account) in its own onboarding; Brazos keeps only a reference to that
payout account and whether it can receive money.

After a payment is released, Brazos emails a receipt to the Customer and the
Worker, where the account has an email address.

### Moderation data

Blocks and reports you make, including any description you write in a
report and what the report is about (a job post, a profile, a review or a
message). Reports are visible to Brazos administrators. Blocks
are not disclosed to the person blocked. Brazos refuses posts, bids,
profiles, service listings, reviews and messages that contain certain words it
does not allow; the refused text is not stored.

### Device, notification and diagnostic data

If you enable notifications, a push token identifying your device, plus your
per-category notification preferences and any quiet hours you set. Push tokens
are stored so that only you can read them, are switched off when you sign out,
and are deleted with your account.

When the app crashes or hits an error, a crash report (what failed, and the
device and app version) is sent to Sentry. It is identified by your account id
only, and email addresses and phone numbers are stripped from it before it
leaves your device. Sentry also receives basic performance and session
measurements: that the app was opened, how long it took to start and to draw
its screens, how long its network requests took, and whether a session ended
in a crash. Those measurements include the web addresses the app requested,
which for a neighborhood lookup can include the coordinates looked up.

When the app starts it asks Expo's update service whether a newer version of
itself is available. That request carries the app's version and platform, not
your account.

### The website

The Brazos website sets no cookies, runs no analytics and loads no scripts.
Like any website, its host receives your IP address and basic browser details
when you open a page. If you email us, we receive your email address and what
you write.

## 3. What we do not collect

- Your full card number or bank login. Card details go to Stripe directly.
- Government identification documents. (A Worker's identity check for payouts
  is done by Stripe, and Brazos does not receive the documents.)
- Your device's contact list.
- Background location. Location is read only while the app is open and you are
  using a feature that needs it.
- An advertising identifier. Brazos shows no advertising.

## 4. How we use it

- To operate the platform: show jobs, deliver messages, run bidding, and
  display profiles.
- To take, hold, release and refund payments, pay Workers, and send receipts.
- To place jobs on the aggregated map view and show how far away a job is.
- To send notifications you have switched on.
- To enforce safety and the Terms of Service: reviewing reports, applying
  blocks, refusing words Brazos does not allow, suspending accounts,
  and preventing a banned user from re-registering.
- To fix problems, diagnose errors, and measure how well the app performs.
- To answer you when you contact us, to meet legal obligations, and to
  establish or defend legal claims.

Brazos does not sell your personal information, does not share it for
advertising, does not use it for third-party advertising, and does not track
you across other companies' apps or websites.

## 5. Who it is shared with

- Other users, as described above — what is public, what is limited to the
  parties on a job, and what is private is set out in section 2.
- Service providers who run the platform for us, each only for its own job:
  - Supabase — hosting, database, sign-in, and file storage;
  - a text-message provider, working for our sign-in service — delivering
    sign-in codes to your phone number;
  - Expo — push notification delivery and app updates;
  - Apple — delivering notifications to your iPhone, drawing the map, and
    opening a job's address in Apple Maps when you ask for directions;
  - Stripe — payments, saved cards, and Worker payouts;
  - Resend — receipt emails;
  - OpenStreetMap Nominatim — naming the neighborhood for a location;
  - Sentry — crash reports and performance measurements;
  - Cloudflare — hosting the Brazos website.
- Authorities and others, where the law requires it, or where we believe in
  good faith it is necessary to protect someone's safety, to investigate
  fraud or a breach of the Terms of Service, or to establish or defend legal
  claims.
- A successor. If Brazos is merged, sold or reorganized, your information may
  pass to the new operator, which must keep honoring this policy until it
  tells you otherwise.

## 6. How long it is kept

- Account data is kept while your account exists.
- Job listings, a job's address, messages, bids, and reviews are kept while
  the account exists, because they form the shared history of a job between
  two people, and afterwards as section 7 describes. A review you left about
  someone else, and their rating, remain part of their record.
- Payment records are kept as the record of what was charged, held, released
  and refunded. The detail in Stripe's event records is removed after 90 days.
- Reports and moderation records are kept as long as needed for safety, and may
  outlive the reported account so that a banned user cannot simply re-register.
- Banned phone numbers are retained specifically to enforce bans.
- The record of which version of the Terms and of this policy you accepted,
  and when, is kept.
- Push tokens are deactivated at sign-out and removed when your account is
  deleted. Your nearby-jobs point is kept until you replace it or delete your
  account.

## 7. Deleting your account

You can delete your account in the app: Profile → Account & safety → Delete
account.

You cannot delete it while a job or a payment is still in progress; the app
lists what is outstanding.

On deletion we deactivate your account, permanently delete your sign-in
identity, and remove your name, photo, bio and contact details from your
profile. Jobs you posted that nobody was hired for are closed, and bids and
hire requests still waiting on an answer are withdrawn. Your notification
settings, push tokens and listed services are deleted.
Any card you saved is removed from Stripe before the account goes. A Worker's
payout account stays open until every payment still owed to them has reached
it, so nothing earned is lost with the account. Content tied
to past jobs — the job and its address, photos, messages, reviews — and
payment records may be retained, shown under "Deleted user", so other users'
job records stay intact and for dispute or legal needs.
Uploaded media files are not yet automatically removed from storage; email
${SUPPORT_EMAIL} to ask for a file to be removed.
Moderation records and the record of the documents you accepted are retained
as described above.

Deletion is permanent and cannot be undone.

## 8. Your choices and rights

- Location: decline the permission, or type a location manually instead.
- Notifications: switch any category off in the notification settings under
  Profile → Notifications, or turn them off entirely in your device settings.
- Saved cards: save one only if you want to, and remove it in Payment methods.
- Profile details: edit or clear your bio, photo, and categories whenever you
  want.
- Other users: block anyone, and report what they post.

Depending on where you live, you may have the right to ask for a copy of your
personal information, to have it corrected, or to have it deleted. To make a
request, email ${SUPPORT_EMAIL} from the email address on your account, or
tell us the phone number on it. We may ask for more detail to confirm the
request is yours. We do not treat you differently for making a request. If we
decline a request, we tell you why, and you can reply to ask us to look again.

## 9. Security

Your information is sent over encrypted connections and stored with our
hosting provider. Access rules in the database are designed to limit each user
to the information they are entitled to see; section 2 says which files those
rules do not yet cover. Passwords are hashed by our authentication provider.
No system is perfectly secure, and we cannot guarantee against every possible
breach. If a breach affects your personal information, we will tell you as the
law requires.

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
