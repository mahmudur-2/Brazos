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
import { unregisterPushToken } from './pushNotifications';
import { setSentryUser } from './observability/sentry';

/** A6: the most sign-out waits for this device to detach from push. */
const LOGOUT_PUSH_UNREGISTER_MS = 5000;

/**
 * Ends the session on this device without the network (B6). The public
 * `signOut({ scope: 'local' })` still posts to /logout and keeps the session
 * when that fails, so after it the client's own session removal (auth-js
 * 2.108's `_removeSession`: clears the stored session and emits SIGNED_OUT)
 * finishes the job. Guarded: if a future auth-js drops the method, this is a
 * no-op and the session simply stays, which is the old behaviour.
 */
async function signOutLocally(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) return;
  } catch {
    // Fall through to the device-only removal.
  }
  const auth = supabase.auth as unknown as { _removeSession?: () => Promise<void> };
  try {
    if (typeof auth._removeSession === 'function') await auth._removeSession();
  } catch {
    // Nothing more can be done offline.
  }
}

/** B16: how often a foregrounded app re-asks whether this account was banned. */
const BAN_RECHECK_MS = 10 * 60 * 1000;

type AuthResult = { error: AuthError | null };

type AuthContextValue = {
  /** The currently authenticated user, or null when signed out. */
  user: User | null;
  /** The active Supabase session, or null when signed out. */
  session: Session | null;
  /** True until the initial session has been restored from storage. */
  loading: boolean;
  /** Set when the last sign-out happened because the account is suspended. */
  bannedNotice: boolean;
  dismissBannedNotice: () => void;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string
  ) => Promise<AuthResult & { needsConfirmation: boolean }>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannedNotice, setBannedNotice] = useState(false);

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

  // Enforce bans on the client: a banned user is signed straight back out.
  // The database is the real gate (phase13 policies reject their writes even
  // with a valid token) — this is what makes the app *look* signed out.
  // NOTE: this cannot prevent the initial token from being issued. Blocking
  // authentication itself would need a Supabase Auth Hook, which isn't
  // configured here.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let active = true;
    let lastCheck = 0;

    const check = async () => {
      lastCheck = Date.now();
      const { data: banned } = await fetchCurrentUserBanned(userId);

      if (!active) return;
      if (banned) {
        setBannedNotice(true);
        await supabase.auth.signOut();
      }
    };
    void check();

    // FIX-RUN B16: a ban that lands while the app stays signed in is enforced
    // the next time it comes to the front — at most once per BAN_RECHECK_MS.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck >= BAN_RECHECK_MS) void check();
    });

    return () => {
      active = false;
      subscription.remove();
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
      bannedNotice,
      dismissBannedNotice: () => setBannedNotice(false),
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
        // Detach this device BEFORE the session goes away — the update is
        // RLS-scoped to the signed-in user, so it would be rejected after
        // sign-out. Without it, the next person to sign in on this phone would
        // keep receiving the previous user's notifications.
        // A6: bounded - a hung unregister (no network, a stuck token read) must not hold sign-out.
        await Promise.race([
          unregisterPushToken().catch(() => undefined),
          new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_PUSH_UNREGISTER_MS)),
        ]);
        const { error } = await supabase.auth.signOut();
        if (!error) return { error };
        // FIX-RUN B6: sign-out never fails offline. auth-js keeps the session
        // whenever the logout request itself fails (only a 401/403/404 answer
        // clears it), so a person with no connection could not sign out at
        // all. They asked to leave THIS device: end it here. The server's push
        // token stays registered; register_push_token() reassigns it on the
        // next sign-in on this phone (lib/pushNotifications.ts).
        await signOutLocally();
        return { error: null };
      },
    }),
    [session, loading, bannedNotice]
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
