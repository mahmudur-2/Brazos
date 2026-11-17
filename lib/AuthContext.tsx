import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchCurrentUserBanned, updateProfile } from './profiles';
import { setSentryUser } from './observability/sentry';
import { endSession, forgetDevice, SIGN_OUT_UNFINISHED_MESSAGE } from './signOut';
import { onSuspensionMark, suspendedFor, suspensionChecks, type SuspensionAnswer } from './suspension';

/** B16: how often a foregrounded app re-asks whether this account was banned (B1: always while
 *  it is suspended, so the suspended screen leaves when the suspension ends). */
const BAN_RECHECK_MS = 10 * 60 * 1000;

type AuthResult = { error: AuthError | null };

type AuthContextValue = {
  /** The currently authenticated user, or null when signed out. */
  user: User | null;
  /** The active Supabase session, or null when signed out. */
  session: Session | null;
  /** True until the initial session has been restored from storage. */
  loading: boolean;
  /**
   * B1: whether the signed-in account is suspended, by the server's own answer
   * (current_user_is_banned). Null while no answer is known for this account, or nobody is
   * signed in. App.tsx shows the suspended screen in place of the app while it is true.
   */
  suspended: boolean | null;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string
  ) => Promise<AuthResult & { needsConfirmation: boolean }>;
  login: (email: string, password: string) => Promise<AuthResult>;
  /** R7-a: an error only when the session could not be proven gone from this phone (SIGN_OUT_UNFINISHED_MESSAGE). */
  logout: () => Promise<{ error: { message: string } | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspension, setSuspension] = useState<SuspensionAnswer>(null);
  const suspended = suspendedFor(suspension, session?.user?.id ?? null);

  useEffect(() => {
    // Restore any persisted session on startup. The rejection branch matters:
    // getSession() reads AsyncStorage, and an unhandled rejection here would
    // leave `loading` true forever — the launch overlay never resolves and the
    // app is a spinner until killed (AUD-P2-07). On failure the session is
    // left exactly as it is (null at startup — a session is never fabricated,
    // and one delivered by onAuthStateChange below is never torn down); the
    // failure detail stays in the dev console, never on a user surface.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((error: unknown) => {
        if (__DEV__) {
          console.warn('[auth] session restore failed at startup', error);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    // Keep state in sync with sign in / sign out / token refresh events.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Bind the observability identity to whoever is signed in — AN ID AND
  // NOTHING ELSE, on both edges: a sign-in binds it, a sign-out clears it so
  // the next person's events are not attributed to the person who just left.
  //
  // Kept as its own effect rather than folded into the ban check below, which
  // reads the same key: that one returns early when there is no user, so the
  // sign-out edge — the one that matters for not mixing two people's data —
  // would never run. The call is a no-op when its vendor module is absent.
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    setSentryUser(userId);
  }, [session?.user?.id]);

  // R7-d: at every launch (once the stored session is restored) and whenever
  // the signed-in person changes, sign-out included, the phone forgets what
  // belongs to anyone else (lib/signOut.ts forgetDevice). A failure is
  // retried at the next launch; it never blocks the app.
  const restoredUserId = loading ? undefined : session?.user?.id ?? null;
  useEffect(() => {
    if (restoredUserId === undefined) return;
    void forgetDevice(restoredUserId);
  }, [restoredUserId]);

  // B1 (production-36h): a suspended account stays signed in and sees the suspended screen
  // (App.tsx AccountGate) in place of the app; nothing here signs anyone out. The database is the
  // real gate (the access lane refuses every guarded call and returns no rows); this only decides
  // what the app shows. The read runs beside the legal and setup reads, and App.tsx holds its
  // loader until this account's first answer. A deleted account (the server's hint
  // 'account_inactive') is not a suspension and never a mark, so it never shows the suspended
  // screen. The app has no handler of its own for that hint: the delete screen signs this phone out
  // after its own deletion (lib/signOut signOutLocally); a session left on another phone stays
  // signed in, and each call the server refuses there shows its error, until the person signs out.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    // B7 (R6, R7): the reads, their answer and their timers live in lib/suspension.ts (executed by the
    // tests): a failed read is asked again after 5 s, 15 s, then every 60 s, until one answers; while
    // suspended, a read every 60 s.
    const checks = suspensionChecks({
      userId,
      read: () => fetchCurrentUserBanned(userId),
      publish: setSuspension,
      everyMs: BAN_RECHECK_MS,
    });
    void checks.check();

    // FIX-RUN B16: a ban that lands while the app stays signed in is seen the next time it comes
    // to the front: at most once per BAN_RECHECK_MS, and every time while suspended.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checks.foreground();
    });
    // Between two checks, a call the server refused for a suspended account asks for one now
    // (lib/suspension.ts; the client's fetch in lib/supabase.ts). Only the answer above decides.
    const stopMarks = onSuspensionMark(() => void checks.check());

    return () => {
      checks.stop();
      subscription.remove();
      stopMarks();
      // The next account (or this one, signed in again) starts with no answer.
      setSuspension(null);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    // Only auto-refresh the token while the app is in the foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      suspended,
      signUp: async (email, password, fullName, phone) => {
        // full_name / phone are passed as user metadata; the handle_new_user
        // DB trigger writes them onto the profiles row (works even when email
        // confirmation is on and there's no session yet).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone } },
        });
        // Belt-and-suspenders: if a session exists (confirmation off), make sure
        // the profile has the name/phone even if the trigger didn't populate it.
        if (!error && data.session && data.user) {
          await updateProfile(data.user.id, { full_name: fullName, phone });
        }
        // B7: no session means the project asks for email confirmation, and
        // the screen says where the link went; with a session the app is
        // already routing in.
        return { error, needsConfirmation: !error && !data.session };
      },
      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error };
      },
      logout: async () => {
        // R7-a: push unregister (bounded), server sign-out, then the device-only
        // removal when offline — each removal read back (lib/signOut.ts). Only a
        // session proven gone is reported as signed out.
        const ended = await endSession();
        return { error: ended ? null : { message: SIGN_OUT_UNFINISHED_MESSAGE } };
      },
    }),
    [session, loading, suspended]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
