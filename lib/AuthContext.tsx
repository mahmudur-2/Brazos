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
  ) => Promise<AuthResult>;
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

    (async () => {
      const { data: banned } = await fetchCurrentUserBanned(userId);

      if (!active) return;
      if (banned) {
        setBannedNotice(true);
        await supabase.auth.signOut();
      }
    })();

    return () => {
      active = false;
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
        return { error };
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
        await unregisterPushToken();
        const { error } = await supabase.auth.signOut();
        return { error };
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
