import { useCallback, useEffect, useState } from 'react';
import { userMessage } from '../lib/errorMessage';
import { fetchMyProfile, type Profile } from '../lib/profiles';
import { useAuth } from './useAuth';

/** Loads the signed-in user's own profile row. */
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error } = await fetchMyProfile(user.id);
    if (error) setError(userMessage(error));
    else setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh, setProfile };
}
