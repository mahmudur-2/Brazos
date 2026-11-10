/**
 * Terms of Service — WORKING DRAFT.
 *
 * Plain markdown so this can be handed to a lawyer, exported, or published to
 * a website without being untangled from app code first. Rendered by
 * components/MarkdownText.tsx, which supports headings, paragraphs and
 * bullets — keep to those.
 *
 * Bump TERMS_VERSION in ./index.ts whenever the substance changes: existing
 * users are re-prompted on any version they have not already accepted.
 *
 * FIX-RUN B1 (2026-10-03, pick B1a): §4 states what the payment code does —
 * Stripe, accept = fund, held in protection until approval, the 72-hour
 * automatic release, cancellation and refunds as cancel_job() implements them,
 * Stripe Connect payouts, tips and saved cards. The defined term is
 * "Customer" (C3). The contact is the published support address. The draft
 * notice stays until counsel signs off.
 */
import { SUPPORT_EMAIL } from '../appLinks';

export const TERMS_OF_SERVICE = `
# Brazos Terms of Service

## ⚠️ Working draft — pending legal review

This document is an unreviewed first draft written to get the product's
obligations on paper. It is NOT final legal text, it has NOT been reviewed by
a licensed attorney, and it should NOT be relied on as legal advice or as an
enforceable agreement in its current form. It must be reviewed and revised by
qualified counsel before Brazos is offered to the public.

Last updated: 3 October 2026

## 1. What Brazos is

Brazos is a marketplace for short-term local work. It lets people who need
work done ("Customers") post jobs, and lets people willing to do that work
("Workers") find those jobs and bid on them. Once a Customer hires a Worker,
the two can message each other about the job. Many users are both at
different times.

Brazos provides the software and, through its payment provider, takes and
holds payment for jobs booked in the app. Brazos does not provide the services
listed on it. Every job is an agreement between a Customer and a Worker
directly.

## 2. Who may use Brazos

You must be at least 18 years old and legally able to enter into contracts
where you live. You must provide accurate registration details, including a
real name and a working phone number, and keep them accurate.

One account per person. You are responsible for everything done through your
account, and for keeping your password secure.

Brazos is operated from the United States and is intended for use in the
United States.

## 3. Workers are independent contractors, not employees

This section is important and you should read all of it.

Workers who find jobs through Brazos are independent contractors. They are not
employees, agents, partners, or joint venturers of Brazos, and nothing in
these Terms or in how the platform works creates an employment relationship
with Brazos.

Specifically, Brazos does not:

- set a Worker's hours, schedule, or availability;
- supervise, direct, or control how a Worker performs a job;
- require a Worker to accept any particular job, or any minimum number of jobs;
- prevent a Worker from working for competitors, other platforms, or directly
  for their own customers;
- provide tools, equipment, vehicles, or materials;
- pay wages, overtime, or benefits, or withhold taxes.

As a Worker, you are solely responsible for your own taxes (including
self-employment tax), your own insurance, any licences or permits your work
requires, and compliance with any laws that apply to the work you do. You
decide which jobs to bid on and on what terms.

As a Customer, you are responsible for understanding that you are engaging an
independent contractor directly, not hiring an employee of Brazos, and for
whatever obligations that engagement creates for you under applicable law.

## 4. Payments

Payments in Brazos are processed by Stripe, our payment provider. Card details
are entered into Stripe's own payment form and never reach Brazos.

- Accepting a bid books and pays for the job. When a Customer accepts a bid,
  the Customer's card is charged the agreed price plus a Protection fee. Both
  amounts are shown before the Customer pays.
- The payment is held in protection. Brazos holds the payment, through Stripe,
  until the Customer approves the finished work. The Worker is not paid before
  then.
- Approval releases it. When the Customer approves, the payment is released to
  the Worker. If the Customer neither approves nor reports an issue within 72
  hours of being told the work is complete, the payment is released
  automatically. While an issue is open, the payment stays held until Brazos
  resolves it.
- Workers are paid through Stripe. A Worker receives the agreed price less
  Brazos's fee, which the app shows before the Worker bids, into the payout
  account the Worker sets up with Stripe. Stripe's own schedule decides when that money
  reaches the Worker's bank.
- Cancelling. A Customer may cancel a booked job. Cancelling is free more than
  24 hours before the arrival window starts, within 15 minutes of hiring, or
  when the job has no scheduled date. A later cancellation, or one after the
  work has started, carries a cancellation fee that goes to the Worker; the
  rest is refunded. The Protection fee is refunded in full whenever a job is
  cancelled. If the Worker cancels, the Customer is refunded in full.
- Refunds go back to the card that paid, on the provider's timeline.
- Tips are optional. After a job's payment has reached the Worker, a Customer
  may add a tip. It is charged through Stripe, with any fee shown before you
  pay, and goes to the Worker.
- Saved cards are optional. A Customer may choose to save a card for faster
  hiring. The card is stored by Stripe, not by Brazos, and can be removed at
  any time in Payment methods.

Payments arranged outside Brazos are outside these Terms, and Brazos is not
responsible for non-payment, underpayment, or any other dispute about them.

## 5. No screening, no guarantee

BRAZOS DOES NOT PERFORM BACKGROUND CHECKS, CRIMINAL RECORD CHECKS, IDENTITY
VERIFICATION, REFERENCE CHECKS, LICENCE VERIFICATION, OR INSURANCE
VERIFICATION ON ANY USER, unless a specific check is explicitly described in
the app at the time you use it.

Ratings, reviews, badges, and completion counts are supplied
by users. Brazos does not independently verify them and does not guarantee
they are accurate.

Brazos does not guarantee:

- that any Worker is skilled, qualified, licensed, insured, honest, or safe;
- that any Customer will be present, or has described the job accurately;
- that any job will be completed, completed on time, or completed to any standard;
- that any listing or user profile is genuine.

You are responsible for deciding who you work with. Take the same precautions
you would with anyone you met outside the app.

## 6. Limitation of liability

READ THIS SECTION CAREFULLY. IT LIMITS WHAT YOU CAN RECOVER FROM BRAZOS.

Brazos provides the platform "as is" and "as available", without warranties of
any kind, express or implied, including any implied warranties of
merchantability, fitness for a particular purpose, or non-infringement.

TO THE FULLEST EXTENT PERMITTED BY LAW, BRAZOS IS NOT LIABLE FOR ANY INJURY,
DEATH, PROPERTY DAMAGE, LOSS, THEFT, FRAUD, NON-PAYMENT, HARASSMENT, ASSAULT,
OR ANY OTHER HARM OR DISPUTE ARISING OUT OF OR RELATING TO:

- any job arranged, discussed, or performed through the platform;
- the conduct of any user, whether online or in person;
- anything a user brings into your home or workplace;
- any content posted by a user, including photos and descriptions;
- your reliance on any rating, review, or profile information.

USERS ENGAGE ONE ANOTHER ENTIRELY AT THEIR OWN RISK.

Brazos is not liable for indirect, incidental, special, consequential,
punitive, or exemplary damages, or for lost profits, lost income, or lost
data, even if advised such damages were possible.

Where liability cannot lawfully be excluded, Brazos's total liability to you
for all claims is limited to the greater of (a) the total fees you paid to
Brazos in the twelve months before the claim, or (b) one hundred US dollars
(US$100).

Some jurisdictions do not allow certain exclusions or limitations, so parts of
this section may not apply to you.

## 7. Your responsibility for safety

You are responsible for your own safety. Brazos strongly encourages you to:

- meet in a way you are comfortable with, and tell someone where you are going;
- agree scope and price in the app before work starts;
- carry your own insurance appropriate to the work you do or commission;
- stop and leave any situation that feels unsafe.

If you are in immediate danger, contact your local emergency services. Brazos
is not an emergency service and cannot intervene in one.

## 8. Rules of conduct

You agree not to:

- post false, misleading, or fraudulent listings, bids, reviews, or profile
  information, or impersonate anyone;
- harass, threaten, stalk, defame, or discriminate against any user;
- post content that is unlawful, hateful, sexually explicit, or violent;
- post photos you do not have the right to post, or that show the inside of
  someone's home or their belongings without their permission;
- solicit or arrange anything illegal;
- use Brazos to spam, advertise unrelated services, or recruit for other
  platforms;
- attempt to bypass a block, ban, or other restriction, including by creating a
  new account;
- scrape, reverse engineer, overload, or interfere with the platform or its
  security;
- collect other users' personal information for any purpose other than
  completing a job with them.

Brazos automatically refuses posts, bids, profiles, reviews and messages that
contain certain words it does not allow.

## 9. Reporting, suspension and termination

Brazos provides in-app tools to block and report other users, and to
report what they post — job posts, profiles, reviews, photos and messages.
Reports are reviewed by Brazos administrators. When you block someone, their
posts, profile and reviews no longer appear to you, and they cannot message
you or bid on your jobs.

Brazos may, at its discretion and with or without notice, restrict, suspend,
or permanently terminate any account for a violation of these Terms, for
conduct that puts other users at risk, or where required by law. A terminated
user may not create a replacement account. When an account is suspended, its
jobs that are still in progress are cancelled and their payments refunded as
section 4 describes.

You may stop using Brazos and delete your account at any time — see the
Privacy Policy for what happens to your data.

Suspending or terminating an account is a decision about access to the
platform. It is not a legal finding about the user, and it does not make
Brazos responsible for that user's conduct.

## 10. Your content

You keep ownership of the content you post — photos, descriptions, messages,
and reviews.

By posting content, you grant Brazos a non-exclusive, worldwide, royalty-free
licence to host, store, display, and distribute that content within the
platform for the purpose of operating it.

You confirm you have the right to post what you post, including permission
from anyone whose property or home appears in a photo.

Brazos may remove content that violates these Terms.

## 11. Changes to these Terms

Brazos may update these Terms. When the substance changes, the version
recorded against your account no longer matches the current one, and you will
be asked to review and accept the new version before continuing to use the
app. Continuing to use Brazos after accepting means you agree to the updated
Terms.

## 12. Governing law and disputes

These Terms are governed by the laws of the State of New York, without regard
to its conflict-of-laws rules.

Any dispute arising out of or relating to these Terms or your use of Brazos
will be brought exclusively in the state or federal courts located in New York
County, New York, and you consent to the personal jurisdiction of those
courts.

If any provision of these Terms is found unenforceable, the rest remains in
force.

## 13. Contact

Questions about these Terms: email ${SUPPORT_EMAIL}. Brazos replies within 2
business days.
`.trim();
