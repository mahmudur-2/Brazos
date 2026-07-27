/**
 * Privacy Policy — WORKING DRAFT.
 *
 * Describes what the app actually does today, checked against the real
 * schema and code rather than written generically:
 *   * location   — phase12 (job_locations, neighbourhood label on `jobs`)
 *   * photos     — phase13 job photos, phase17 completion photos + portfolio
 *   * moderation — phase13 blocks/mutes/reports/bans
 *   * push       — phase20 push_tokens, notification_prefs.home_lat/lng
 *
 * If any of those change, this needs changing with them, and PRIVACY_VERSION
 * in ./index.ts needs bumping so users re-accept.
 */
export const PRIVACY_POLICY = `
# Brazos Privacy Policy

## ⚠️ Working draft — pending legal review

This document is an unreviewed first draft written to describe accurately what
the app does with your data. It is NOT final legal text and has NOT been
reviewed by a licensed attorney. It must be reviewed and revised by qualified
counsel before Brazos is offered to the public.

Last updated: 26 July 2026

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
  NY"). This label is visible to anyone browsing that job.
- Precise, and restricted. If you use "use my location" when posting, the app
  also stores exact coordinates for that job. These are used only to place the
  job on the map's aggregated hotspot view. They are stored separately from the
  job listing itself and are readable only by the job's Client and its assigned
  Worker. Exact coordinates are never sent to people browsing jobs, and the
  map's hotspot view shows counts per area, never individual pins.

If you turn on "New jobs nearby" notifications, the app stores one further
coordinate: an approximate point for your own location, used solely to measure
which new jobs fall inside your chosen radius. It is readable only by you and
is never shown to other users.

You can decline location permission. Jobs can be posted with a typed location
instead, and nearby-job notifications simply stay off.

### Photos

The app collects photos in four places, with different visibility:

- Job photos, attached by a Client when posting. Visible to anyone who can see
  that job.
- Completion photos, attached by a Worker when marking a job done. Visible to
  the Client and the Worker on that job.
- Portfolio photos. A Worker may choose to feature completion photos on their
  profile. THESE ARE PUBLIC — visible to anyone who views that profile,
  including people not involved in the original job. The app warns you before
  your first one, but you should assume anything you feature can be seen by
  anyone.
- Profile photos. Visible to other users.

Photos may show the inside of homes and personal property. Only post photos you
have permission to post, and do not feature a photo publicly if it shows
anything the Client would not want shared.

### Messages and job activity

Messages you send, including text, photos, and voice messages; bids; hire
requests and counter-offers; reviews and ratings you give and receive; and the
status history of your jobs.

### Moderation data

Blocks, mutes, and reports you make, including any description you write in a
report. Reports are visible to Brazos administrators. Blocks and mutes are not
disclosed to the person blocked or muted.

### Device and notification data

If you enable notifications, a push token identifying your device, plus your
per-category notification preferences. Push tokens are stored so that only you
can read them, and are removed from your account when you sign out.

## 3. What we do not collect

- Payment card details, bank details, or financial account information. Brazos
  does not process payments.
- Government identification documents.
- Your device's contact list.
- Continuous or background location. Location is read only when you actively
  use a feature that needs it.

## 4. How we use it

- To operate the platform: show jobs, deliver messages, run bidding, and
  display profiles.
- To place jobs on the aggregated map view.
- To send notifications you have switched on.
- To enforce safety and the Terms of Service: reviewing reports, applying
  blocks and mutes, suspending accounts, and preventing a banned user from
  re-registering.
- To fix problems and diagnose errors.

Brazos does not sell your personal information, and does not use it for
third-party advertising.

## 5. Who it is shared with

- Other users, as described above — what is public, what is limited to the
  parties on a job, and what is private is set out in section 2.
- Service providers who run the infrastructure: our hosting and database
  provider (Supabase), and the notification delivery service (Expo). They
  process data on our behalf in order to run the app.
- Law enforcement or others where required by law, or where necessary to
  protect someone's safety.

## 6. How long it is kept

- Account data is kept while your account exists.
- Job listings, messages, bids, and reviews are kept while the account exists,
  because they form the shared history of a job between two people. A review
  you left about someone else, and their rating, remain part of their record.
- Reports and moderation records are kept as long as needed for safety, and may
  outlive the reported account so that a banned user cannot simply re-register.
- Banned phone numbers are retained specifically to enforce bans.
- Push tokens are deactivated at sign-out and removed when your account is
  deleted.

## 7. Deleting your account

You can request deletion of your account at any time through the in-app
reporting tool until a dedicated deletion control is available.

On deletion we remove your profile, your photos, your push tokens, and your
notification preferences. Content that is part of another user's record — a
review you left, and messages within a shared job thread — may be retained in
a form disassociated from your profile, and moderation records are retained as
described above.

Deletion is permanent and cannot be undone.

## 8. Your choices

- Location: decline the permission, or type a location manually instead.
- Notifications: switch any category off under Profile → Notifications, or turn
  them off entirely in your device settings.
- Portfolio photos: choose which completion photos, if any, are featured
  publicly, and remove any of them at any time.
- Profile details: edit or clear your bio, photo, and categories whenever you
  want.
- Other users: block or mute anyone.

Depending on where you live, you may have additional rights to access, correct,
port, or delete your personal information. Requests can be made through the
in-app reporting tool until a published contact is available.

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

Privacy questions can be raised through the in-app reporting tool until a
published privacy contact is available.
`.trim();
