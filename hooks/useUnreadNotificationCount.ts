import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './useAuth';
import { fetchNotifications } from '../lib/notifications';

/**
 * How many of this account's notifications are unread — the one fact the Home bell's count and
 * Profile's "Notifications" row both show (2026-09-29, LUX-LIST-2 #7), so the two can never
 * disagree. Re-read each time the screen that asks comes into focus; a failed read counts nothing
 * rather than guessing.
 */
export function useUnreadNotificationCount(): number {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) return;
      fetchNotifications(user.id).then(({ data, error }) => {
        if (active) setUnread(error ? 0 : data.filter((n) => !n.read_at).length);
      });
      return () => {
        active = false;
      };
    }, [user?.id])
  );

  return unread;
}
