import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'brazos.notice.';

/**
 * A notice that should be shown once per device and then stay dismissed —
 * e.g. the portfolio privacy reminder, which is useful the first time a
 * worker features a photo and nagging every time after.
 *
 * `seen` starts null while the stored flag is being read, so callers can
 * avoid flashing the notice before its state is known.
 */
export function useOneTimeNotice(key: string) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((value) => {
        if (active) setSeen(value === '1');
      })
      .catch(() => {
        // A storage read failure shouldn't block the action the notice is
        // attached to — treat it as "already seen" rather than showing the
        // reminder on a loop.
        if (active) setSeen(true);
      });
    return () => {
      active = false;
    };
  }, [key]);

  const markSeen = useCallback(async () => {
    setSeen(true);
    try {
      await AsyncStorage.setItem(PREFIX + key, '1');
    } catch {
      // Best-effort: the in-memory flag still suppresses it this session.
    }
  }, [key]);

  return { seen, markSeen };
}
