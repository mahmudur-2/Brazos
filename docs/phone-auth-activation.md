# Activating phone (SMS) sign-in

The whole phone one-time-code experience is built and running today against a
development-only mock provider. No SMS provider is configured and none is paid
for. This document is what turns it on.

Nothing here requires a UI change. The screens talk to the provider boundary in
[`lib/phoneAuth/`](../lib/phoneAuth), and activation swaps which implementation
that boundary returns.

## What mock mode is, and is not

`EXPO_PUBLIC_PHONE_AUTH_MODE=mock` (the default in development) generates a
random six-digit code on the device, shows it on the verify screen under a
`DEVELOPMENT CODE:` banner, and accepts it. That exercises the request, the
six-cell input, the resend cooldown, the expiry, the attempt limit, the error
copy and the routing — everything except the two things only a real provider
can do.

**Unavailable in mock mode**, and therefore unverified until this runbook is
followed:

- No real SMS is sent. Nothing leaves the device.
- No real phone-authenticated session is created. A mock verification ends on a
  screen that says so and hands the user to email sign-in.
- No carrier delivery proof — nothing about deliverability, latency, sender ID,
  or which countries the account may message.
- No production provider result for fraud controls, rate limits, or pumping
  protection.
- No account linking between an existing email user and a phone number.

Mock mode cannot run in a release build. `resolvePhoneAuthMode` in
[`lib/phoneAuth/mode.ts`](../lib/phoneAuth/mode.ts) resolves `mock` to
`disabled` whenever `__DEV__` is false and reports the misconfiguration.

## Steps

### Twilio

1. Fund or upgrade the Twilio account. A trial account can only message
   verified numbers, which is not a usable test of anything.
2. Create a Verify Service for BRAZOS (Twilio Console → Verify → Services).
   Set the friendly name users will see in the message body.
3. Copy three values: **Account SID**, **Auth Token**, **Verify Service SID**.

### Supabase

4. Enter those three values in the Supabase dashboard only — Authentication →
   Providers → Phone → Twilio Verify. This is the one place they belong.
5. Enable the Phone provider, and confirm the OTP expiry and length there. The
   app assumes six digits (`OTP_LENGTH` in
   [`lib/phoneAuth/types.ts`](../lib/phoneAuth/types.ts)); change both together
   if you change either.
6. Do **not** put any of those values in `.env`, `app.json`, EAS secrets read by
   the client, or anywhere else in this repository. The app never sees them —
   it calls `signInWithOtp`/`verifyOtp` with the publishable key, and GoTrue
   talks to Twilio server-side.

### The app

7. Set `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`.
8. Restart the bundler (`npm start`) or rebuild — the value is inlined at bundle
   time, so a running dev server will not pick it up.

## Verification, in this order

9. **New signup.** Create Account → name + number → real SMS arrives → code
   verifies → a session exists → the profile row carries the full name and the
   E.164 number.
10. **Returning sign-in.** Sign In with the same number → code → straight into
    the app, no second account created.
11. **Unknown number on sign-in.** A number nobody has registered must *not*
    create an account. `shouldCreateUser: false` is what enforces this
    (`lib/phoneAuth/supabase.ts`); confirm the user table is unchanged
    afterwards, and that the message on screen does not reveal whether the
    number is registered.
12. **Session persistence.** Force-quit and relaunch; the session is restored
    by `AuthContext` from AsyncStorage, exactly as with email.
13. **Log out and back in.** Confirm the push token is detached on the way out
    (`unregisterPushToken`) and the second sign-in works.
14. **Resend and rate limits.** The 60-second local cooldown, then Supabase's
    own limit past it. Confirm the copy is right for both.
15. **Disable mock for production.** Confirm the release build reports
    `phoneAuthMode === 'supabase'` and that no `DEVELOPMENT CODE` banner can
    render.
16. **Abuse controls before public launch.** Turn on CAPTCHA (Supabase Auth →
    Attack Protection), review the SMS send rate limit, and set a Twilio
    geo-permission allowlist. Without these, an open OTP endpoint is an SMS
    pumping target billed to this account.
17. **Real devices.** iOS and Android, on a real carrier — autofill of the code
    from the message is a platform behaviour that cannot be verified on web.

## Account linking — a separate phase

An existing email user signing in with a phone number that matches their
profile is **not** the same person as far as Supabase is concerned, and the app
must not treat it as one.

The intended shape, when it is built:

- The email user signs in first, with their existing credentials.
- They add and verify a phone number from settings, deliberately.
- The original auth user id is preserved — nothing is migrated by creating a
  second user and copying rows across.
- Matching is never inferred from a profile field. Two accounts sharing a phone
  string is not proof they are the same person.

Until then: `updateUser({ phone })` is deliberately not called anywhere, and the
providers never merge identities. A number already attached to another account
surfaces as `identity-conflict` and points the user at email sign-in.
