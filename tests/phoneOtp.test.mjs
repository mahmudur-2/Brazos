import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// ===========================================================================
// Running the real providers, not a restatement of them
// ===========================================================================
// lib/phoneAuth/{types,errors,mode,mock,supabase}.ts are deliberately free of
// React Native imports so the whole boundary can be executed here rather than
// asserted about as text — the same technique tests/authPhone.test.mjs uses on
// lib/phoneNumber.ts. Node strips the types; the only rewrite is the
// extensionless relative specifiers, which ESM won't resolve on its own. The
// Supabase client type is an `import type`, which strips to nothing, so no
// real client is ever constructed and no SMS can be sent from this file.
const strip = (path) => stripTypeScriptTypes(read(path), { mode: 'strip' });
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const link = (path, links = {}) => {
  let js = strip(path);
  for (const [specifier, url] of Object.entries(links)) {
    js = js.replaceAll(`from '${specifier}'`, `from '${url}'`);
  }
  return toDataUrl(js);
};

const typesUrl = link('lib/phoneAuth/types.ts');
const errorsUrl = link('lib/phoneAuth/errors.ts', { './types': typesUrl });
const modeUrl = link('lib/phoneAuth/mode.ts', { './types': typesUrl });
const mockUrl = link('lib/phoneAuth/mock.ts', {
  './types': typesUrl,
  './errors': errorsUrl,
});
const supabaseUrl = link('lib/phoneAuth/supabase.ts', {
  './types': typesUrl,
  './errors': errorsUrl,
});

const { MAX_VERIFY_ATTEMPTS, MOCK_CODE_TTL_MS, OTP_LENGTH, RESEND_COOLDOWN_MS } =
  await import(typesUrl);
const { mapSupabaseAuthError } = await import(errorsUrl);
const { resolvePhoneAuthMode } = await import(modeUrl);
const { createMockPhoneAuthProvider } = await import(mockUrl);
const { createSupabasePhoneAuthProvider } = await import(supabaseUrl);

const PHONE = '+17185550123';
const OTHER_PHONE = '+17185550124';

/** A mock provider on a clock the test drives, with a code it chooses. */
function mockHarness(codes = ['111111']) {
  let clock = 1_700_000_000_000;
  let issued = 0;
  const provider = createMockPhoneAuthProvider({
    now: () => clock,
    generateCode: () => codes[Math.min(issued++, codes.length - 1)],
    generateId: () => `challenge-${issued}`,
  });
  return {
    provider,
    advance: (ms) => {
      clock += ms;
    },
    at: () => clock,
  };
}

async function startSignIn(provider, phone = PHONE) {
  const sent = await provider.requestOtp({ phone, intent: 'sign-in' });
  assert.equal(sent.status, 'challenge-sent');
  return sent;
}

// ===========================================================================
// Mock provider
// ===========================================================================

test('a mock code is always six digits, zero padding included', async () => {
  // The padding is the point: a range of 100000..999999 would never produce a
  // leading zero, which leaks a digit to anyone who notices.
  const { provider } = mockHarness(['000123']);
  const sent = await startSignIn(provider);
  assert.equal(sent.devCode, '000123');
  assert.equal(sent.devCode.length, OTP_LENGTH);

  const wrong = await provider.verifyOtp({
    phone: PHONE,
    token: '123',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(wrong.status, 'error');
  assert.equal(wrong.code, 'invalid-code');
});

test('the code generator is injectable, so these tests are deterministic', async () => {
  const { provider } = mockHarness(['424242']);
  const sent = await startSignIn(provider);
  assert.equal(sent.devCode, '424242');
});

test('there is no universal code — every request generates a new random one', async () => {
  // The real generator, not an injected one: this is the property that keeps
  // the mock from being a backdoor, so it has to be tested as shipped.
  const provider = createMockPhoneAuthProvider();
  const codes = [];
  for (let i = 0; i < 200; i += 1) {
    const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
    assert.match(sent.devCode, /^\d{6}$/);
    codes.push(sent.devCode);
  }
  // 200 draws from a million values: a duplicate is possible, 100 collisions
  // is not. Anything approaching a fixed code fails here.
  assert.ok(
    new Set(codes).size > 100,
    `expected varied codes, saw ${new Set(codes).size} distinct in 200`
  );

  // …and no fixed candidate is quietly accepted alongside the real one.
  const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
  for (const guess of ['000000', '123456', '111111']) {
    if (guess === sent.devCode) continue;
    const result = await provider.verifyOtp({
      phone: PHONE,
      token: guess,
      intent: 'sign-in',
      challengeId: sent.challengeId,
    });
    assert.equal(result.status, 'error', `${guess} must not be a master code`);
  }
});

test('the generated code verifies', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const result = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });

  assert.equal(result.status, 'verified-mock');
  // The whole point of the mode: no session is claimed.
  assert.equal(result.sessionAvailable, false);
  assert.equal(result.intent, 'sign-in');
});

test('a wrong code costs one attempt and says how many are left', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const first = await provider.verifyOtp({
    phone: PHONE,
    token: '000000',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(first.status, 'error');
  assert.equal(first.code, 'invalid-code');
  assert.equal(first.attemptsRemaining, MAX_VERIFY_ATTEMPTS - 1);

  // An incomplete entry is a typo, not a guess — it must not burn an attempt.
  const partial = await provider.verifyOtp({
    phone: PHONE,
    token: '00',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(partial.code, 'invalid-code');
  assert.equal(partial.attemptsRemaining, undefined);

  const second = await provider.verifyOtp({
    phone: PHONE,
    token: '000001',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(second.attemptsRemaining, MAX_VERIFY_ATTEMPTS - 2);
});

test('the fifth wrong code burns the challenge', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  for (let i = 1; i < MAX_VERIFY_ATTEMPTS; i += 1) {
    const attempt = await provider.verifyOtp({
      phone: PHONE,
      token: '000000',
      intent: 'sign-in',
      challengeId: sent.challengeId,
    });
    assert.equal(attempt.code, 'invalid-code');
  }

  const locked = await provider.verifyOtp({
    phone: PHONE,
    token: '000000',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(locked.code, 'too-many-attempts');

  // Burned means burned: the real code no longer works either.
  const afterLock = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(afterLock.code, 'stale-challenge');
});

test('a code expires', async () => {
  const { provider, advance } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  advance(MOCK_CODE_TTL_MS - 1);
  const justInTime = await provider.verifyOtp({
    phone: PHONE,
    token: '000000',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(justInTime.code, 'invalid-code', 'still live one millisecond before expiry');

  advance(2);
  const expired = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(expired.code, 'expired-code', 'the correct code is refused once expired');
});

test('resend is blocked until the cooldown is up', async () => {
  const { provider, advance } = mockHarness(['111111', '222222']);
  const sent = await startSignIn(provider);

  advance(RESEND_COOLDOWN_MS - 1000);
  const early = await provider.resendOtp({
    phone: PHONE,
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(early.status, 'error');
  assert.equal(early.code, 'rate-limited');
  assert.equal(early.retryAvailableAt, sent.resendAvailableAt);

  // …and the original code is untouched by the refused resend.
  assert.equal(provider.inspectChallenge(sent.challengeId).devCode, '111111');
});

test('a resend past the cooldown issues a new code and kills the old one', async () => {
  const { provider, advance } = mockHarness(['111111', '222222']);
  const sent = await startSignIn(provider);

  advance(RESEND_COOLDOWN_MS);
  const resent = await provider.resendOtp({
    phone: PHONE,
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });

  assert.equal(resent.status, 'challenge-sent');
  assert.equal(resent.devCode, '222222');
  assert.ok(resent.resendAvailableAt > sent.resendAvailableAt, 'the cooldown restarts');

  const old = await provider.verifyOtp({
    phone: PHONE,
    token: '111111',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(old.code, 'invalid-code', 'the superseded code must not still work');

  const fresh = await provider.verifyOtp({
    phone: PHONE,
    token: '222222',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(fresh.status, 'verified-mock');
});

test('a challenge is consumed by success and cannot be replayed', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const first = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(first.status, 'verified-mock');

  const replay = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(replay.code, 'stale-challenge');
  assert.equal(provider.inspectChallenge(sent.challengeId), null);
});

test('a code issued for one number cannot verify another', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const mismatched = await provider.verifyOtp({
    phone: OTHER_PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(mismatched.code, 'stale-challenge');
});

test('a sign-in challenge cannot be used to finish a sign-up', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const crossed = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-up',
    challengeId: sent.challengeId,
  });
  assert.equal(crossed.code, 'stale-challenge');

  // …and the sign-in it was actually issued for still works.
  const correct = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(correct.status, 'verified-mock');
});

test('a stale challenge id verifies nothing, and cancelling clears the live one', async () => {
  const { provider } = mockHarness(['654321']);
  const sent = await startSignIn(provider);

  const wrongId = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: 'challenge-from-a-previous-life',
  });
  assert.equal(wrongId.code, 'stale-challenge');
  assert.equal(provider.inspectChallenge('challenge-from-a-previous-life'), null);

  // "Change phone number" and the back button both land here.
  provider.cancelChallenge();
  assert.equal(provider.inspectChallenge(sent.challengeId), null);
  const afterCancel = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.equal(afterCancel.code, 'stale-challenge');
});

test('starting over replaces the live challenge rather than adding a second', async () => {
  const { provider } = mockHarness(['111111', '222222']);
  const first = await startSignIn(provider);
  const second = await startSignIn(provider);

  assert.notEqual(first.challengeId, second.challengeId);
  assert.equal(provider.inspectChallenge(first.challengeId), null);

  const old = await provider.verifyOtp({
    phone: PHONE,
    token: '111111',
    intent: 'sign-in',
    challengeId: first.challengeId,
  });
  assert.equal(old.code, 'stale-challenge');
});

test('a malformed number never becomes a challenge', async () => {
  const { provider } = mockHarness();
  for (const bad of ['7185550123', '+1', '', '+0123456789', 'not a number']) {
    const result = await provider.requestOtp({ phone: bad, intent: 'sign-in' });
    assert.equal(result.status, 'error', `${bad} must not produce a challenge`);
    assert.equal(result.code, 'invalid-phone');
  }
});

// ===========================================================================
// Mode selection — the guard that keeps the mock out of a release
// ===========================================================================

test('mock mode is impossible outside development', () => {
  // The dangerous case: someone ships a build with the development value still
  // set. It fails closed and says why, rather than shipping a client-generated
  // credential path.
  const release = resolvePhoneAuthMode({ configured: 'mock', dev: false });
  assert.equal(release.mode, 'disabled');
  assert.match(release.configError, /development-only/i);

  assert.equal(resolvePhoneAuthMode({ configured: 'mock', dev: true }).mode, 'mock');
});

test('an unset mode is mock in development and disabled in a release', () => {
  assert.equal(resolvePhoneAuthMode({ dev: true }).mode, 'mock');
  assert.equal(resolvePhoneAuthMode({ dev: false }).mode, 'disabled');
  assert.equal(resolvePhoneAuthMode({ configured: '', dev: false }).mode, 'disabled');
  assert.equal(resolvePhoneAuthMode({ dev: false }).configError, null);
});

test('the real provider is only ever chosen explicitly', () => {
  assert.equal(resolvePhoneAuthMode({ configured: 'supabase', dev: false }).mode, 'supabase');
  assert.equal(resolvePhoneAuthMode({ configured: 'SUPABASE', dev: true }).mode, 'supabase');
  assert.equal(resolvePhoneAuthMode({ configured: 'disabled', dev: true }).mode, 'disabled');

  // An unrecognised value is a misconfiguration, not a licence to guess.
  const typo = resolvePhoneAuthMode({ configured: 'supabse', dev: true });
  assert.equal(typo.mode, 'disabled');
  assert.match(typo.configError, /not a recognised value/i);
});

// ===========================================================================
// Supabase provider — driven against a double. No SMS is sent.
// ===========================================================================

function supabaseHarness(responses = {}) {
  const calls = { signInWithOtp: [], verifyOtp: [] };
  const auth = {
    signInWithOtp: async (credentials) => {
      calls.signInWithOtp.push(credentials);
      return responses.signInWithOtp ?? { data: {}, error: null };
    },
    verifyOtp: async (params) => {
      calls.verifyOtp.push(params);
      return (
        responses.verifyOtp ?? {
          data: { session: { access_token: 'token' }, user: { id: 'user-1' } },
          error: null,
        }
      );
    },
  };
  let clock = 1_700_000_000_000;
  const authenticated = [];
  const provider = createSupabasePhoneAuthProvider(auth, {
    now: () => clock,
    onAuthenticated: async (context) => {
      authenticated.push(context);
    },
  });
  return {
    provider,
    calls,
    authenticated,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test('the real provider sends exactly the E.164 value it was given', async () => {
  const { provider, calls } = supabaseHarness();
  const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });

  assert.equal(sent.status, 'challenge-sent');
  assert.equal(calls.signInWithOtp.length, 1);
  assert.equal(calls.signInWithOtp[0].phone, PHONE);
  // Nothing to leak: the real provider never holds a code.
  assert.equal(sent.devCode, undefined);
  assert.equal(provider.inspectChallenge(sent.challengeId).devCode, null);
});

test('a sign-in must not bring an account into existence', async () => {
  const { provider, calls } = supabaseHarness();
  await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });

  assert.equal(
    calls.signInWithOtp[0].options.shouldCreateUser,
    false,
    'a typo in a sign-in number must not register a new user'
  );
  assert.equal(calls.signInWithOtp[0].options.data, undefined);
});

test('a sign-up creates, and carries the name the trigger reads', async () => {
  const { provider, calls } = supabaseHarness();
  await provider.requestOtp({
    phone: PHONE,
    intent: 'sign-up',
    profileDraft: { fullName: 'Carlos Reyes' },
  });

  const options = calls.signInWithOtp[0].options;
  assert.equal(options.shouldCreateUser, true);
  // handle_new_user (the 20260901000000 baseline; lean_v1's on_auth_user_created) reads these off the user
  // metadata, so no client write has to race the trigger.
  assert.deepEqual(options.data, { full_name: 'Carlos Reyes', phone: PHONE });
});

test('verification uses the SMS token type the installed client expects', async () => {
  const { provider, calls } = supabaseHarness();
  const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
  const result = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });

  assert.deepEqual(calls.verifyOtp[0], { phone: PHONE, token: '654321', type: 'sms' });
  assert.equal(result.status, 'authenticated');
  assert.equal(result.sessionAvailable, true);
});

test('no session means nobody is authenticated, whatever the response said', async () => {
  // The load-bearing check: a 200 with no session would otherwise put an
  // unauthenticated user inside the app.
  const { provider, authenticated } = supabaseHarness({
    verifyOtp: { data: { session: null, user: { id: 'user-1' } }, error: null },
  });
  const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
  const result = await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });

  assert.equal(result.status, 'error');
  assert.equal(authenticated.length, 0, 'no profile write may follow a non-session');
});

test('the profile draft is written only after a real session, under that user id', async () => {
  const { provider, authenticated } = supabaseHarness();
  const sent = await provider.requestOtp({
    phone: PHONE,
    intent: 'sign-up',
    profileDraft: { fullName: 'Carlos Reyes' },
  });
  assert.equal(authenticated.length, 0, 'nothing is written while only a code is outstanding');

  await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-up',
    challengeId: sent.challengeId,
  });

  assert.deepEqual(authenticated, [
    { userId: 'user-1', phone: PHONE, profileDraft: { fullName: 'Carlos Reyes' } },
  ]);
});

test('provider errors become user-safe messages that do not enumerate accounts', () => {
  const cases = [
    [{ code: 'otp_expired' }, 'expired-code'],
    [{ code: 'invalid_credentials' }, 'invalid-code'],
    [{ code: 'otp_disabled' }, 'unknown-account'],
    [{ code: 'sms_send_failed' }, 'sms-not-configured'],
    [{ code: 'phone_exists' }, 'identity-conflict'],
    [{ code: 'over_sms_send_rate_limit' }, 'rate-limited'],
    [{ status: 429, code: 'anything' }, 'rate-limited'],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'network'],
    [{ message: 'Signups not allowed for otp' }, 'unknown-account'],
    [{ message: 'something nobody has seen before' }, 'unknown'],
  ];

  for (const [raw, expected] of cases) {
    const mapped = mapSupabaseAuthError(raw);
    assert.equal(mapped.code, expected, `${JSON.stringify(raw)} should map to ${expected}`);
    assert.ok(mapped.message.length > 0);
    // The raw provider string never reaches the user.
    if (raw.message) {
      assert.notEqual(mapped.message, raw.message);
    }
  }

  // "Wrong code" and "no such account" must not be distinguishable by tone —
  // neither confirms whether a number is registered.
  assert.doesNotMatch(mapSupabaseAuthError({ code: 'otp_disabled' }).message, /not registered|no account|doesn't exist/i);
});

test('a duplicate request inside the cooldown is refused instead of billed', async () => {
  const { provider, calls, advance } = supabaseHarness();
  await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });

  const again = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
  assert.equal(again.code, 'rate-limited');
  assert.equal(calls.signInWithOtp.length, 1, 'the second tap must not reach Supabase');

  advance(RESEND_COOLDOWN_MS);
  const resent = await provider.resendOtp({ phone: PHONE, intent: 'sign-in' });
  assert.equal(resent.status, 'challenge-sent');
  assert.equal(calls.signInWithOtp.length, 2);
});

test('the real provider only ever calls the two public auth methods', async () => {
  // The double has exactly two methods; anything else — an admin call above
  // all — would throw here rather than pass silently.
  const { provider, calls } = supabaseHarness();
  const sent = await provider.requestOtp({ phone: PHONE, intent: 'sign-in' });
  await provider.resendOtp({ phone: PHONE, intent: 'sign-in', challengeId: sent.challengeId });
  await provider.verifyOtp({
    phone: PHONE,
    token: '654321',
    intent: 'sign-in',
    challengeId: sent.challengeId,
  });
  assert.deepEqual(Object.keys(calls), ['signInWithOtp', 'verifyOtp']);
});

// ===========================================================================
// The flow: the screens have to actually use the boundary
// ===========================================================================

const signIn = read('screens/SignInScreen.tsx');
const createAccount = read('screens/CreateAccountScreen.tsx');
const emailSignIn = read('screens/EmailSignInScreen.tsx');
const emailCreateAccount = read('screens/EmailCreateAccountScreen.tsx');
const verify = read('screens/VerifyPhoneScreen.tsx');
const flow = read('screens/AuthFlow.tsx');
const routes = read('lib/navigation.ts');

test('sign-in requests a sign-in challenge and routes to VerifyPhone', () => {
  assert.match(signIn, /phoneAuth\.requestOtp\(\{ phone, intent: 'sign-in' \}\)/);
  assert.match(signIn, /navigation\.navigate\('VerifyPhone', \{/);
  // Only a real challenge routes anyone onward.
  assert.match(signIn, /if \(result\.status === 'challenge-sent'\)/);
  assert.match(signIn, /const phone = toE164\(country, phoneDigits\)/);
});

test('create account requests a sign-up challenge and carries a draft, not a record', () => {
  assert.match(createAccount, /intent: 'sign-up'/);
  assert.match(createAccount, /profileDraft/);
  // Nothing is written before anyone is authenticated.
  assert.doesNotMatch(createAccount, /signUp\(/, 'no account may be created here');
  assert.doesNotMatch(createAccount, /updateProfile|from\('profiles'\)/, 'no profile write pre-auth');
  // …and no second credential is collected on the way past.
  assert.doesNotMatch(createAccount, /secureTextEntry|newPassword/, 'no password in the phone flow');
});

test('both halves of each pair are registered and offer each other', () => {
  assert.match(routes, /VerifyPhone: VerifyPhoneParams;/);
  assert.match(routes, /EmailCreateAccount:\s*\| \{ fullName\?: string; phoneDigits\?: string; country\?: Country \}\s*\| undefined;/);
  assert.match(flow, /name="VerifyPhone" component=\{VerifyPhoneScreen\}/);
  assert.match(flow, /name="EmailCreateAccount" component=\{EmailCreateAccountScreen\}/);

  assert.match(signIn, /navigation\.navigate\('EmailSignIn'\)/);
  // M-18: the phone form hands over what was typed.
  assert.match(createAccount, /navigation\.navigate\('EmailCreateAccount', \{\s*fullName: fullName\.trim\(\) \|\| undefined,\s*phoneDigits: phoneDigits \|\| undefined,\s*country,\s*\}\)/);
  // popTo, not navigate: under React Navigation 7 navigate() pushes when the
  // target isn't current, which would stack a duplicate over the screen the
  // user came from and discard what they had typed there.
  assert.match(emailSignIn, /navigation\.popTo\('SignIn'\)/);
  assert.match(emailCreateAccount, /navigation\.popTo\('CreateAccount'\)/);
});

test('changing the number or backing out invalidates the challenge', () => {
  assert.match(verify, /phoneAuth\.cancelChallenge\(\)/);
  assert.match(verify, /title="Change phone number"/);
  assert.match(verify, /onBack=\{\(\) => leaveChallenge/);
});

test('the verify screen guards every duplicate and stale path', () => {
  // One guard covers both buttons, and a settled screen accepts neither.
  assert.match(verify, /if \(busy \|\| settled\) return;/);
  assert.match(verify, /if \(busy \|\| settled \|\| secondsToResend > 0\) return;/);
  // A challenge that no longer exists is detected on mount, not on submit.
  assert.match(verify, /phoneAuth\.inspectChallenge\(params\.challengeId\)/);
  assert.match(verify, /setStale\(true\)/);
  // No state is written after the screen goes away.
  assert.match(verify, /if \(!mounted\.current\) return;/);
});

test('the resend countdown is derived from the provider, not from a local guess', () => {
  assert.match(verify, /resendAvailableAt/);
  assert.match(verify, /Resend code in \$\{formatCountdown\(secondsToResend\)\}/);
  assert.match(verify, /setResendAvailableAt\(result\.resendAvailableAt\)/);
});

test('a full six-digit paste is handled by one input, not six', () => {
  const otp = read('components/OtpInput.tsx');
  assert.match(otp, /text\.replace\(\/\\D\/g, ''\)\.slice\(0, OTP_LENGTH\)/);
  // `<TextInput\s` is the JSX element; `useRef<TextInput>` is a type argument.
  assert.equal((otp.match(/<TextInput\s/g) ?? []).length, 1, 'one input, so paste lands whole');
  assert.match(otp, /textContentType="oneTimeCode"/);
  assert.match(otp, /autoComplete="one-time-code"/);
});

// ---------------------------------------------------------------------------
// The keyboard. A regression guard for a real iOS-only failure: UIKit's
// hitTest ignores views with alpha < 0.01, so an `opacity: 0` overlay input is
// untouchable on device — and completely fine on the web, which is why a
// browser pass missed it.
// ---------------------------------------------------------------------------

test('the code input is transparent, never zero-opacity', () => {
  const otp = read('components/OtpInput.tsx');
  const styles = otp.slice(otp.indexOf('const styles'));
  const inputStyle = styles.slice(styles.indexOf('  input: {'));
  const body = inputStyle.slice(0, inputStyle.indexOf('  },'));

  // Anchored to a line start so the comment explaining *why* it isn't opacity 0
  // doesn't count as the thing it warns about.
  assert.doesNotMatch(
    body,
    /^\s*opacity:\s*0/m,
    'opacity 0 makes the input untouchable on iOS — clear each visible part instead'
  );
  assert.match(body, /color: 'transparent'/);
  assert.match(body, /backgroundColor: 'transparent'/);
});

test('nothing in the input can stop it taking focus or raising the keyboard', () => {
  const otp = read('components/OtpInput.tsx');
  for (const killer of [
    /display:\s*'none'/,
    /showSoftInputOnFocus/,
    /editable=\{false\}/,
    /focusable=\{false\}/,
  ]) {
    assert.doesNotMatch(otp, killer, `${killer} would break focus on native`);
  }
  // editable is driven by the caller's busy state, not hardcoded off.
  assert.match(otp, /editable=\{editable\}/);
});

test('a tap anywhere on the row reaches focus()', () => {
  const otp = read('components/OtpInput.tsx');
  assert.match(otp, /onStartShouldSetResponder=\{\(\) => editable\}/);
  assert.match(otp, /onResponderRelease=\{\(\) => inputRef\.current\?\.focus\(\)\}/);
  assert.match(otp, /useImperativeHandle\(ref, \(\) => \(\{ focus: \(\) => inputRef\.current\?\.focus\(\) \}\)/);
});

test('the keyboard opens after the transition, and returns after every failure', () => {
  const verify = read('screens/VerifyPhoneScreen.tsx');
  // autoFocus fires mid-push and iOS drops it; the request has to wait for the
  // screen to stop moving.
  // The prop, not the word — the comment above the effect names it too.
  assert.doesNotMatch(verify, /autoFocus=/, 'autoFocus is dropped mid-transition on iOS');
  assert.match(verify, /useFocusEffect\(/);
  assert.match(verify, /InteractionManager\.runAfterInteractions\(focusCode\)/);
  assert.match(verify, /return \(\) => task\.cancel\(\)/, 'the delayed focus must be cancelled');

  // Every path that leaves the user needing to type again.
  const calls = (verify.match(/focusCode\(\);/g) ?? []).length;
  assert.ok(calls >= 3, `expected refocus after incomplete, wrong and resent codes, saw ${calls}`);
});

test('native keyboard properties are the ones a code field needs', () => {
  const otp = read('components/OtpInput.tsx');
  assert.match(otp, /keyboardType="number-pad"/);
  assert.match(otp, /inputMode="numeric"/);
  assert.match(otp, /maxLength=\{OTP_LENGTH\}/);
  assert.match(otp, /autoCorrect=\{false\}/);
  assert.match(otp, /autoCapitalize="none"/);
  assert.match(otp, /accessibilityLabel=\{`Verification code, \$\{OTP_LENGTH\} digits`\}/);
});

// ---------------------------------------------------------------------------
// Cell geometry, checked as arithmetic rather than as a screenshot
// ---------------------------------------------------------------------------

/**
 * Pull a numeric design token out of one named block of lib/authTheme.ts.
 * Scoped by block because `otpCell` is a height in authSizes and a radius in
 * authRadius, and an unscoped match would silently take whichever comes first.
 */
function token(source, block, name) {
  const start = source.indexOf(`export const ${block} = {`);
  assert.ok(start >= 0, `expected a ${block} block`);
  const body = source.slice(start, source.indexOf('} as const', start));
  const match = body.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
  assert.ok(match, `expected ${block}.${name}`);
  return Number(match[1]);
}

test('six cells fit every supported width, as portrait slots not squares', () => {
  const theme = read('lib/authTheme.ts');
  const otp = read('components/OtpInput.tsx');

  const gutter = token(theme, 'authSpacing', 'gutter');
  const maxContent = token(theme, 'authSizes', 'maxContentWidth');
  const cellMax = token(theme, 'authSizes', 'otpCellMaxWidth');
  const cellHeight = token(theme, 'authSizes', 'otpCell');
  const radius = token(theme, 'authRadius', 'otpCell');
  const gap = Number(otp.match(/const CELL_GAP = (\d+)/)[1]);

  // The shape the correction asked for: taller than it is wide.
  assert.ok(cellHeight > cellMax, 'a cell must be taller than it is wide');
  assert.ok(cellHeight >= 62 && cellHeight <= 68, `height ${cellHeight} outside 62-68`);
  assert.ok(gap >= 9 && gap <= 12, `gap ${gap} outside 9-12`);
  assert.ok(radius >= 15 && radius <= 18, `radius ${radius} outside 15-18`);

  // Exactly what the stylesheet does: flex:1 inside the content column, capped.
  const widthAt = (screen) => {
    const content = Math.min(screen, maxContent) - gutter * 2;
    return Math.min(cellMax, (content - gap * 5) / 6);
  };

  for (const screen of [320, 390, 430, 1440]) {
    const w = widthAt(screen);
    const content = Math.min(screen, maxContent) - gutter * 2;
    assert.ok(w > 0, `cells collapse at ${screen}`);
    assert.ok(w * 6 + gap * 5 <= content + 0.5, `the row overflows at ${screen}`);
  }

  // The reference width is the one the design was drawn at.
  const at390 = widthAt(390);
  assert.ok(at390 >= 48 && at390 <= 54, `390pt cell width ${at390} outside 48-54`);
});

test('the verify title is one step up from the rest of the auth bar', () => {
  const theme = read('lib/authTheme.ts');
  const scaffold = read('components/AuthScaffold.tsx');
  const verify = read('screens/VerifyPhoneScreen.tsx');

  const base = Number(theme.match(/navTitle: \{ fontSize: (\d+)/)[1]);
  const large = Number(theme.match(/navTitleLarge: \{ fontSize: (\d+)/)[1]);
  const growth = (large - base) / base;
  assert.ok(growth > 0.1 && growth < 0.2, `expected ~15% larger, got ${Math.round(growth * 100)}%`);

  assert.match(verify, /titleVariant="large"/);
  assert.match(scaffold, /titleVariant === 'large' && styles\.topTitleLarge/);
  // …and only this screen opts in, so Sign in and Create account are untouched.
  for (const path of ['screens/SignInScreen.tsx', 'screens/CreateAccountScreen.tsx']) {
    assert.doesNotMatch(read(path), /titleVariant/, `${path} keeps the default bar`);
  }
});

test('resend is the danger token when pressable, and muted while counting down', () => {
  const verify = read('screens/VerifyPhoneScreen.tsx');
  const styles = verify.slice(verify.indexOf('const styles'));

  const enabled = styles.slice(styles.indexOf('  resendText: {'));
  assert.match(
    enabled.slice(0, enabled.indexOf('  },')),
    // Fix run D9: the resolved palette's danger, on the themed auth path.
    /color: colors\.danger,/,
    'the pressable resend uses the semantic danger token'
  );

  const waiting = styles.slice(styles.indexOf('  resendTextWaiting: {'));
  assert.match(
    waiting.slice(0, waiting.indexOf('  },')),
    /color: colors\.textMuted,/,
    'the countdown stays muted — there is nothing to act on yet'
  );

  // Not a new hex, and not a signal red: the palette's own restrained brick.
  assert.match(read('lib/authTheme.ts'), /danger: '#9C3F35'/);
});

test('mock success never claims a session and says so on screen', () => {
  assert.match(verify, /verified-mock/);
  assert.match(
    verify,
    /Real app access still requires\s*\n?\s*email sign in until SMS is activated\./
  );
  assert.match(verify, /title="Back to welcome"/);
  // The verify screen authenticates nobody by itself.
  assert.doesNotMatch(verify, /\blogin\(|\bsignUp\(/);
});

test('email remains the path that really authenticates', () => {
  assert.match(emailSignIn, /await login\(trimmedEmail, password\)/);
  assert.match(emailCreateAccount, /await signUp\(trimmedEmail, password, trimmedName, phone\)/);
  assert.match(emailCreateAccount, /const phone = toE164\(country, phoneDigits\)/);
});

// ===========================================================================
// Static security properties
// ===========================================================================

const boundary = [
  'lib/phoneAuth/index.ts',
  'lib/phoneAuth/mock.ts',
  'lib/phoneAuth/mode.ts',
  'lib/phoneAuth/errors.ts',
  'lib/phoneAuth/supabase.ts',
  'lib/phoneAuth/types.ts',
];
const surface = [...boundary, 'screens/VerifyPhoneScreen.tsx', 'components/OtpInput.tsx', 'screens/SignInScreen.tsx', 'screens/CreateAccountScreen.tsx'];

test('no secret and no admin API is anywhere near the client', () => {
  for (const path of surface) {
    const source = read(path);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE/, `${path} must hold no service-role key`);
    // Credential-shaped names, not the word "Twilio" — the screens are allowed
    // to explain in a comment what they are waiting for.
    assert.doesNotMatch(
      source,
      /TWILIO_[A-Z]|AUTH_TOKEN|ACCOUNT_SID|VERIFY_SERVICE_SID|\bAC[0-9a-f]{32}\b/i,
      `${path} must hold no Twilio credential`
    );
    assert.doesNotMatch(source, /auth\.admin/, `${path} must not call an admin API`);
  }
});

test('there is no hardcoded code anywhere in the boundary', () => {
  for (const path of boundary) {
    const source = read(path);
    // A six-digit literal in a provider is either a master code or a test
    // fixture that escaped; neither belongs in shipped source.
    const literals = source.match(/'(\d{6})'/g) ?? [];
    assert.deepEqual(literals, [], `${path} must not contain a literal six-digit code`);
  }
});

test('no code ever travels through navigation', () => {
  // The route params are the whole contract — if a code is not declared here,
  // it cannot be routed.
  const params = routes.slice(routes.indexOf('export type VerifyPhoneParams'));
  const body = params.slice(0, params.indexOf('};'));
  assert.doesNotMatch(body, /\bcode\b|\btoken\b|devCode/i, 'no credential in the route params');
  assert.match(body, /challengeId: string;/);

  for (const source of [signIn, createAccount]) {
    const call = source.slice(source.indexOf("navigate('VerifyPhone'"));
    assert.doesNotMatch(call.slice(0, call.indexOf('}')), /devCode|token/);
  }
});

test('the new code carries no escape hatches', () => {
  for (const path of [...surface, 'lib/navigation.ts']) {
    const source = read(path);
    assert.doesNotMatch(source, /@ts-ignore|@ts-expect-error|eslint-disable/, `${path}`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b/, `${path} must not widen to any`);
  }
});
