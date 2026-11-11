/**
 * Terms of Service.
 *
 * Plain markdown so this can be handed to a lawyer, exported, or published to
 * a website without being untangled from app code first. Rendered by
 * components/MarkdownText.tsx, which supports headings, paragraphs and
 * bullets — keep to those. The public website is generated from this string
 * by scripts/build-site.mjs: never copy the text.
 *
 * Bump TERMS_VERSION in ./index.ts whenever the substance changes: existing
 * users are re-prompted on any version they have not already accepted.
 *
 * 2026-11-11 rewrite (website brief). Every statement of fact was checked
 * against the code: §4 is what the payment code does (Stripe, accept = fund,
 * held until approval, the 72-hour and 7-day automatic releases, cancel_job(),
 * Connect payouts, tips, saved cards). The protective sections (warranties,
 * liability, release, indemnity, disputes, Apple) are standard marketplace
 * terms and are NOT yet reviewed by counsel: ledger O1 is still owed. The
 * defined term is "Customer" (C3). The contact is the published address.
 */
import { SUPPORT_EMAIL } from '../appLinks';

export const TERMS_OF_SERVICE = `
# Brazos Terms of Service

Last updated: 11 November 2026

These Terms of Service (the "Terms") are a binding agreement between you and
the operator of Brazos ("Brazos", "we" or "us"). They cover the Brazos mobile
app and the Brazos website (together, the "platform").

By creating an account, accepting these Terms in the app, or using the
platform, you agree to these Terms and to the Brazos Privacy Policy. If you do
not agree, do not use Brazos.

## The short version

This summary is here to help you. The full text below is what applies.

- Brazos is a marketplace. Customers and Workers deal with each other
  directly. Brazos does not do the work and is not a party to any job.
- Workers are independent contractors. They are not employees of Brazos
  (section 3).
- Brazos does not run background checks and does not verify anyone's identity,
  licenses or insurance (section 5). You decide who you work with.
- A job's payment is held until the Customer approves the work, with set rules
  for cancelling and refunds (section 4). A held payment is not insurance.
- What you can recover from Brazos is limited (sections 7 to 10).
- Disputes with Brazos are resolved one person at a time, in New York, with no
  class actions and no jury trial (section 17).

## 1. What Brazos is

Brazos is a marketplace for short-term local work. It lets people who need
work done ("Customers") post jobs, and lets people willing to do that work
("Workers") find those jobs and bid on them. A Customer can also send a job
request directly to a Worker. Once a Customer hires a Worker, the two can
message each other about the job. Many users are both at different times.

Brazos provides the software and, through its payment provider, takes and
holds payment for jobs booked in the app. Brazos does not provide the services
listed on it. Every job is an agreement between a Customer and a Worker
directly. Brazos is not a party to that agreement. Brazos is not an employer,
a staffing agency, a contractor or a home-services company, and it does not
supervise, direct or perform any work.

## 2. Who may use Brazos

You must be at least 18 years old and legally able to enter into contracts
where you live. You must provide accurate registration details, including a
real name and a working phone number, and keep them accurate.

One account per person. You may not use Brazos if Brazos has removed you from
it before. You are responsible for everything done through your account, and
for keeping your sign-in details secure: your password, or the codes sent to
your phone. Tell us straight away if you think someone else has used your
account.

Brazos is operated from the United States and is intended for use in the
United States.

Text messages. If you sign in with your phone number, you agree to receive a
text message with a one-time code each time you sign in. Message and data
rates may apply.

Electronic records. You agree that Brazos may give you notices and records
electronically: in the app, by notification, or through the phone number or
email address on your account. Accepting these Terms in the app has the same
effect as signing them.

## 3. Workers are independent contractors, not employees

This section is important and you should read all of it.

Workers who find jobs through Brazos are independent contractors. They are not
employees, agents, partners, or joint venturers of Brazos, and nothing in
these Terms or in how the platform works creates an employment relationship
with Brazos. No Worker has authority to act or speak for Brazos.

Specifically, Brazos does not:

- set a Worker's hours, schedule, or availability;
- supervise, direct, or control how a Worker performs a job;
- set the price a Worker offers;
- require a Worker to accept any particular job, or any minimum number of jobs;
- prevent a Worker from working for competitors, other platforms, or directly
  for their own customers;
- provide tools, equipment, vehicles, or materials;
- pay wages, overtime, or benefits, or withhold taxes.

As a Worker, you are solely responsible for your own taxes (including
self-employment tax), your own insurance, any licenses or permits your work
requires, and compliance with any laws that apply to the work you do. You
decide which jobs to bid on and on what terms. You confirm that you are
legally allowed to work in the United States.

Some work can only be done legally by a licensed professional. Do not offer
work that needs a license you do not hold, and do not ask a Worker to do it.

Where the law requires it, Brazos or Stripe may report payments to tax
authorities and may ask you for tax information first.

As a Customer, you are responsible for understanding that you are engaging an
independent contractor directly, not hiring an employee of Brazos, and for
whatever obligations that engagement creates for you under applicable law.

## 4. Payments

Payments in Brazos are processed by Stripe, our payment provider. Card details
are entered into Stripe's own payment form and never reach Brazos.

- Accepting a bid books and pays for the job. When a Customer accepts a bid,
  the Customer's card is charged the agreed price plus a Protection fee, and
  any tax that applies. Each amount is shown before the Customer pays.
- What the Protection fee is. It pays for the held payment and the issue
  review this section describes. It is not insurance, a warranty, or a
  guarantee of anyone's work, and it does not cover injury, damage or loss.
- The payment is held in protection. Brazos holds the payment, through Stripe,
  until the Customer approves the finished work. The Worker is not paid before
  then. No interest is paid on a held payment.
- Brazos collects for the Worker. Each Worker appoints Brazos as the Worker's
  limited agent for one purpose only: collecting the Customer's payment for a
  job. Once a Customer has paid Brazos the agreed price, the Customer has paid
  the Worker for that job, and the Worker looks to Brazos for that money under
  these Terms.
- Approval releases it. When the Customer approves, the payment is released to
  the Worker. If the Customer neither approves nor reports an issue within 72
  hours of being told the work is complete, the payment is released
  automatically. In any case it is released 7 days after the work was marked
  complete, unless an issue or a card dispute is open.
- Issues. If a Customer reports an issue with a job, the payment stays held
  until Brazos resolves it. Brazos reviews what both sides have put in the app
  and decides where the held payment goes. That decision settles the held
  payment only. It is not a ruling on anyone's legal rights, and it does not
  stop a Customer and a Worker from pursuing each other directly.
- Workers are paid through Stripe. A Worker receives the agreed price less
  Brazos's fee, which the app shows before the Worker bids, into the payout
  account the Worker sets up with Stripe. Stripe's own schedule decides when
  that money reaches the Worker's bank.
- Fees are fixed at booking. Brazos may change its fees, but the fees for a
  job are fixed when the job is booked.
- Cancelling. A Customer may cancel a booked job. Cancelling is free more than
  24 hours before the arrival window starts, within 15 minutes of hiring, or
  when the job has no scheduled date. A later cancellation, or one after the
  work has started, carries a cancellation fee that goes to the Worker; the
  rest is refunded. The Protection fee is refunded in full whenever a job is
  cancelled. If the Worker cancels, the Customer is refunded in full. If the
  Worker reports that the Customer was not there, the payment stays held
  until Brazos decides it. The app shows these terms before you pay, and the
  fee, if any, before you confirm a cancellation.
- Refunds go back to the card that paid, on the provider's timeline.
- Card disputes. If a Customer disputes a charge with their card issuer,
  Brazos may keep the payment held and may share the job's records with
  Stripe and the issuer.
- Money paid by mistake or later reversed. If money that reached a Worker is
  later reversed by a card dispute, is owed back to the Customer under these
  Terms, or was paid in error, the Worker agrees that Brazos may recover it,
  including by taking it from later payouts.
- Holds. Brazos may delay a payout while it looks into suspected fraud or a
  breach of these Terms, while an issue or a card dispute is open, or where
  the law requires.
- Tips are optional. After a job's payment has reached the Worker, a Customer
  may add a tip. It is charged through Stripe, with any fee shown before you
  pay, and goes to the Worker.
- Saved cards are optional. A Customer may choose to save a card for faster
  hiring. The card is stored by Stripe, not by Brazos, and can be removed at
  any time in Payment methods. While a card is saved, you authorize Brazos to
  charge it, through Stripe, for the jobs you book.

Stripe's terms for Workers. Payment processing services for Workers on Brazos
are provided by Stripe and are subject to the Stripe Connected Account
Agreement, which includes the Stripe Terms of Service (together, the "Stripe
Services Agreement"). By agreeing to these Terms or continuing to operate as a
Worker on Brazos, you agree to be bound by the Stripe Services Agreement, as
Stripe may change it from time to time. As a condition of Brazos enabling
payment processing services through Stripe, you agree to give Brazos accurate
and complete information about yourself, and you authorize Brazos to share it,
and transaction information related to your use of Stripe's payment
processing services, with Stripe.

Payments arranged outside Brazos are outside these Terms, and Brazos is not
responsible for non-payment, underpayment, or any other dispute about them.

## 5. No screening, no guarantee

BRAZOS DOES NOT PERFORM BACKGROUND CHECKS, CRIMINAL RECORD CHECKS, IDENTITY
VERIFICATION, REFERENCE CHECKS, LICENSE VERIFICATION, OR INSURANCE
VERIFICATION ON ANY USER, unless a specific check is explicitly described in
the app at the time you use it.

Ratings and reviews are supplied by users, and the completion, on-time and
response figures on a profile are calculated by Brazos from activity in the
app. Brazos does not independently verify them and does not guarantee they are
accurate.

Brazos does not guarantee:

- that any Worker is skilled, qualified, licensed, insured, honest, or safe;
- that any Customer will be present, or has described the job accurately;
- that any job will be completed, completed on time, or completed to any standard;
- that any listing or user profile is genuine.

You are responsible for deciding who you work with. Take the same precautions
you would with anyone you met outside the app.

## 6. Your responsibility for safety

You are responsible for your own safety. Brazos strongly encourages you to:

- meet in a way you are comfortable with, and tell someone where you are going;
- agree scope and price in the app before work starts;
- carry your own insurance appropriate to the work you do or commission;
- stop and leave any situation that feels unsafe.

If you are in immediate danger, contact your local emergency services. Brazos
is not an emergency service and cannot intervene in one.

## 7. No warranties

READ SECTIONS 7 TO 10 CAREFULLY. THEY LIMIT WHAT YOU CAN RECOVER FROM BRAZOS.

BRAZOS PROVIDES THE PLATFORM "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR
NON-INFRINGEMENT.

Brazos does not promise that the platform will always be available, free of
errors, or secure, or that any job, Worker, Customer or listing will meet your
expectations. Brazos may change, pause or end any part of the platform at any
time.

## 8. Limitation of liability

TO THE FULLEST EXTENT PERMITTED BY LAW, BRAZOS IS NOT LIABLE FOR ANY INJURY,
DEATH, PROPERTY DAMAGE, LOSS, THEFT, FRAUD, NON-PAYMENT, HARASSMENT, ASSAULT,
OR ANY OTHER HARM OR DISPUTE ARISING OUT OF OR RELATING TO:

- any job arranged, discussed, or performed through the platform;
- the conduct of any user, whether online or in person;
- anything a user brings into your home or workplace;
- any content posted by a user, including photos and descriptions;
- your reliance on any rating, review, or profile information.

USERS ENGAGE ONE ANOTHER ENTIRELY AT THEIR OWN RISK.

TO THE FULLEST EXTENT PERMITTED BY LAW, BRAZOS IS NOT LIABLE FOR INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, OR FOR
LOST PROFITS, LOST INCOME, OR LOST DATA, EVEN IF ADVISED SUCH DAMAGES WERE
POSSIBLE.

BRAZOS'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS IS LIMITED TO THE GREATER OF
(A) THE TOTAL FEES YOU PAID TO BRAZOS IN THE TWELVE MONTHS BEFORE THE CLAIM,
OR (B) ONE HUNDRED US DOLLARS (US$100).

These limits apply to Brazos and to its owners, officers, employees and
agents. They apply whatever the legal basis of a claim, and even if a remedy
does not fully compensate you.

Nothing in these Terms limits liability that the law does not allow to be
limited, including liability for Brazos's own gross negligence, fraud, or
intentional misconduct. Some jurisdictions do not allow certain exclusions or
limitations, so parts of sections 7 to 10 may not apply to you.

## 9. Release

Because Brazos is not a party to the jobs its users arrange, you release
Brazos, and its owners, officers, employees and agents, from all claims and
damages, known and unknown, that arise from a dispute between you and another
user, or from another user's acts or omissions.

If you live in California, you waive California Civil Code section 1542, which
says that a general release does not extend to claims the releasing party does
not know or suspect to exist at the time of the release and that would have
materially affected the settlement.

## 10. Your promise to cover Brazos

You agree to defend and indemnify Brazos, and its owners, officers, employees
and agents, against any claim, loss, or cost (including reasonable legal
fees) that comes from:

- a job you posted, bid on, booked, or performed;
- your content;
- your breach of these Terms, or of any law;
- your taxes, or your failure to hold a license, permit or insurance your
  work requires;
- any claim that you were an employee of Brazos or of another user.

This does not apply to the extent a claim was caused by Brazos's own gross
negligence or intentional misconduct.

## 11. Rules of conduct

Brazos has no tolerance for objectionable content or abusive users.

You agree not to:

- post false, misleading, or fraudulent listings, bids, reviews, or profile
  information, or impersonate anyone;
- harass, threaten, stalk, defame, or discriminate against any user;
- post content that is unlawful, hateful, sexually explicit, or violent;
- post photos you do not have the right to post, or that show the inside of
  someone's home or their belongings without their permission;
- solicit or arrange anything illegal, or any work that puts people in
  serious danger;
- use Brazos to spam, advertise unrelated services, or recruit for other
  platforms;
- attempt to bypass a block, ban, or other restriction, including by creating a
  new account;
- scrape, reverse engineer, overload, or interfere with the platform or its
  security;
- collect other users' personal information for any purpose other than
  completing a job with them.

Brazos automatically refuses posts, bids, profiles, service listings, reviews
and messages that contain certain words it does not allow.

## 12. Reporting, suspension and termination

Brazos provides in-app tools to block and report other users, and to
report what they post — job posts, profiles, reviews and messages.
Reports are reviewed by Brazos administrators. When you block someone, their
posts, profile and reviews no longer appear to you, and they cannot message
you or bid on your jobs.

Brazos may, at its discretion and with or without notice, remove content and
restrict, suspend, or permanently terminate any account for a violation of
these Terms, for conduct that puts other users at risk, or where required by
law. A terminated user may not create a replacement account. When an account
is suspended, its unfinished jobs are cancelled and any payment for them is
refunded in full to the Customer. The exception is a suspended Customer's job
on which work has already started: its payment stays held until Brazos reviews
it.

Brazos may report conduct it believes is unlawful to the authorities, and may
keep and share the related records with them.

You may stop using Brazos and delete your account at any time — see the
Privacy Policy for what happens to your data.

Suspending or terminating an account is a decision about access to the
platform. It is not a legal finding about the user, and it does not make
Brazos responsible for that user's conduct.

Sections 3 to 10, 13, 17 and 19, and anything you owe at the time, continue to
apply after your account ends.

## 13. Your content

You keep ownership of the content you post — photos, videos, descriptions,
messages, and reviews.

By posting content, you grant Brazos a non-exclusive, worldwide, royalty-free
license to host, store, copy, display, and distribute that content, and to
resize or reformat it, for the purpose of operating the platform. Brazos may
pass that license to the service providers that run the platform for it.

You confirm you have the right to post what you post, including permission
from anyone whose property or home appears in a photo or video.

Reviews must be honest and based on a real job you took part in.

If you send Brazos ideas or suggestions, Brazos may use them freely and owes
you nothing for them.

Brazos may remove content that violates these Terms.

## 14. Copyright complaints

If you believe something on Brazos copies your work without permission, email
${SUPPORT_EMAIL} with: what the work is, where it appears in Brazos, your
contact details, a statement that you believe in good faith the use is not
authorized, and a statement, under penalty of perjury, that your notice is
accurate and that you are the owner or act for the owner. Brazos removes
material it finds infringing and closes the accounts of repeat infringers.

## 15. The Brazos app

Brazos gives you a personal, limited, non-transferable, revocable license to
use the app on a device you own or control, for its intended purpose and under
these Terms. Brazos and its licensors own the app, its design, and the Brazos
name and marks. Nothing in these Terms transfers them to you.

The platform relies on services run by other companies, including Stripe for
payments and Apple for maps and notifications. Your use of those services is
also subject to their own terms, and Brazos is not responsible for them.

## 16. Changes to these Terms

Brazos may update these Terms. When the substance changes, the version
recorded against your account no longer matches the current one, and you will
be asked to review and accept the new version before continuing to use the
app. Continuing to use Brazos after accepting means you agree to the updated
Terms.

## 17. Governing law and disputes

READ THIS SECTION CAREFULLY. IT AFFECTS HOW DISPUTES WITH BRAZOS ARE RESOLVED.

Talk to us first. Before starting any legal claim against Brazos, you agree to
email ${SUPPORT_EMAIL} with a description of the problem and what you want
done, and to give Brazos 30 days to resolve it. Brazos will do the same for
you, using the contact details on your account.

Governing law. These Terms are governed by the laws of the State of New York,
without regard to its conflict-of-laws rules.

Where. Any dispute arising out of or relating to these Terms or your use of
Brazos will be brought exclusively in the state or federal courts located in
New York County, New York, and you consent to the personal jurisdiction of
those courts. Either of us may instead bring a claim that qualifies in a small
claims court.

NO CLASS ACTIONS. TO THE FULLEST EXTENT PERMITTED BY LAW, YOU AND BRAZOS MAY
BRING CLAIMS AGAINST EACH OTHER ONLY ON AN INDIVIDUAL BASIS, AND NOT AS A
PLAINTIFF OR CLASS MEMBER IN ANY CLASS, COLLECTIVE, OR REPRESENTATIVE ACTION.

NO JURY TRIAL. TO THE FULLEST EXTENT PERMITTED BY LAW, YOU AND BRAZOS EACH
WAIVE THE RIGHT TO A TRIAL BY JURY.

Time limit. To the fullest extent permitted by law, any claim against Brazos
must be started within one year after the events that gave rise to it.
Otherwise it is permanently barred.

Disputes between users. Brazos is not required to take part in a dispute
between users, and section 4 describes the only review Brazos carries out.

## 18. Apple

If you got the app from Apple's App Store, these terms also apply.

- These Terms are between you and Brazos, not Apple. Apple is not responsible
  for the app or its content.
- Apple has no obligation to provide maintenance or support for the app.
- If the app fails to meet a warranty that applies, you may tell Apple, and
  Apple will refund what you paid for the app, if anything. To the fullest
  extent permitted by law, Apple has no other warranty obligation for the app.
- Apple is not responsible for claims about the app or your use of it,
  including product liability claims, claims that the app fails to meet a
  legal requirement, consumer protection or privacy claims, and claims that
  the app infringes someone's intellectual property rights.
- You confirm that you are not in a country under a United States Government
  embargo or named by it as supporting terrorism, and that you are not on any
  United States Government list of prohibited or restricted parties.
- You must follow any third-party terms that apply when you use the app, such
  as your mobile carrier's.
- Apple and its subsidiaries are third-party beneficiaries of these Terms, and
  may enforce them against you.

## 19. General

- These Terms and the Privacy Policy are the whole agreement between you and
  Brazos about the platform, and replace any earlier one.
- If any provision of these Terms is found unenforceable, it is enforced as
  far as the law allows and the rest remains in force.
- If Brazos does not enforce a provision, that is not a waiver of it.
- You may not transfer your account or these Terms. Brazos may transfer them
  as part of a merger, a sale of the business, or a reorganization.
- Brazos is not responsible for a delay or failure caused by something beyond
  its reasonable control, such as an outage at a service provider.
- Apart from section 18, these Terms give no rights to anyone but you and
  Brazos.
- Headings and the short version at the top are for convenience only.

## 20. Contact

Questions about these Terms: email ${SUPPORT_EMAIL}. Brazos replies within 2
business days.
`.trim();
