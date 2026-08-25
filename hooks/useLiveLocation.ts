import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import type { ErrorLike } from '../lib/errorMessage';
import {
  EXPIRY_TICK_MS,
  HEARTBEAT_DISTANCE_M,
  HEARTBEAT_MS,
  fetchActiveShares,
  isShareActive,
  shareChannelKeyFor,
  shareExpiryFor,
  shareFilterFor,
  startLiveLocation,
  stopLiveLocation,
  updateLiveLocation,
  type LiveLocationShare,
} from '../lib/liveLocation';
import type { ChatTarget } from '../lib/messages';
import { supabase } from '../lib/supabase';

/**
 * ONE THREAD'S LIVE LOCATION SHARES — the watcher, the subscription, the focus
 * refetch and the local expiry clock, in one owner.
 *
 * FOREGROUND ONLY, and this is a decision rather than a first cut.
 * requestForegroundPermissionsAsync + watchPositionAsync, no TaskManager task
 * and no "Always" prompt. Background location is the most invasive permission
 * iOS asks for and it would be asked for a feature whose whole purpose is
 * bounded and consensual; a share whose updates stop because iOS suspended the
 * app is an accepted outcome, because the counterparty's honest upper bound is
 * always the `expires_at` they already hold. Nothing here can outlive it.
 *
 * THREE THINGS END A SHARE, and only one of them is an event:
 *
 *   the user stops it     stop_live_location() moves expires_at to now(). The
 *                         row then fails the SELECT policy's expiry term, so
 *                         realtime DROPS the update rather than delivering it
 *                         — the counterparty gets no event at all.
 *   it expires            same shape: the row simply stops being visible. No
 *                         UPDATE happens, so there is nothing to deliver.
 *   the heartbeat raises  'No active location share', which is the server
 *                         telling this device the share it thinks it owns is
 *                         over. Authoritative, never retried.
 *
 * Which is why the counterparty's side rests on a REFETCH and a CLOCK rather
 * than a subscription: `refresh` on every focus, and a tick that drops a card
 * whose held `expires_at` has passed. The subscription is what makes a MOVING
 * pin move; it is not what makes an ended share disappear, and a build that
 * assumed otherwise would leave a stale pin on screen indefinitely.
 */
export type LiveLocationState = {
  /** The counterparty's live shares — never this user's own. */
  theirs: LiveLocationShare[];
  /** This user's own live share in this thread, if any. */
  mine: LiveLocationShare | null;
  /** True from the moment a start is asked for until the share is over. */
  sharing: boolean;
  /** True while a start or stop is in flight, so a control can disable. */
  busy: boolean;
  /**
   * The instant the lists above were derived against — the local expiry
   * clock's current tick. Handed out so a card's countdown moves on the SAME
   * `now` that decides whether the card exists: two clocks would let a card
   * read "under a minute" for a share this hook has already dropped.
   */
  now: number;
  start: (durationMs: number) => Promise<ErrorLike>;
  stop: () => Promise<ErrorLike>;
  refresh: () => Promise<void>;
};

export function useLiveLocation(
  target: ChatTarget | null,
  userId: string | null | undefined,
  enabled: boolean
): LiveLocationState {
  const [shares, setShares] = useState<LiveLocationShare[]>([]);
  const [busy, setBusy] = useState(false);
  // The local expiry clock. Ticking a NUMBER rather than re-filtering on a
  // timer keeps the rule in one place: everything below derives from `now`.
  const [now, setNow] = useState(() => Date.now());

  // The thread key, not the target object: `target` is rebuilt on every render
  // of the screen that owns it, so effects keyed on identity would resubscribe
  // continuously. The useConversationChat / useThreadOffers idKey pattern.
  const targetKey = target ? shareChannelKeyFor(target) : '';
  const targetRef = useRef(target);
  targetRef.current = target;

  const watcher = useRef<Location.LocationSubscription | null>(null);
  const loadRef = useRef(0);

  const refresh = useCallback(async () => {
    const current = targetRef.current;
    if (!enabled || !current) {
      setShares([]);
      return;
    }
    const load = ++loadRef.current;
    const { data, error } = await fetchActiveShares(current);
    // A stale answer is dropped rather than written: two overlapping reads on
    // different threads must not let the older one win.
    if (load !== loadRef.current) return;
    if (error) {
      // A failed read is NOT "no shares" — keep what is on screen and let the
      // local clock expire it. Blanking would hide a live share on a blip.
      console.warn('[LiveLocation] share read failed', error.message);
      return;
    }
    setShares(data);
    setNow(Date.now());
  }, [enabled]);

  // Initial load, and again whenever the thread changes.
  useEffect(() => {
    void refresh();
    return () => {
      loadRef.current++;
    };
  }, [targetKey, refresh]);

  // THE FOCUS REFETCH. An early stop delivers no event, so coming back to this
  // screen is the moment a share that ended while it was away is noticed.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // THE LOCAL EXPIRY CLOCK. Only runs while there is something on screen to
  // expire — a permanent interval on a chat screen would re-render it forever
  // for nothing.
  useEffect(() => {
    if (shares.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(timer);
  }, [shares.length]);

  // Realtime, on the same per-mount topic rule the other channels use:
  // supabase.channel() dedupes by topic and removeChannel() tears down
  // asynchronously, so every mount needs a string that has never existed.
  const instanceId = useId();
  const runRef = useRef(0);
  useEffect(() => {
    const current = targetRef.current;
    if (!enabled || !current) return;
    const filter = shareFilterFor(current);

    const channel = supabase
      .channel(`chat:shares:${targetKey}:${instanceId}:${runRef.current++}`)
      // INSERT and UPDATE both refetch rather than merging the payload. The
      // payload is the row as written, but whether it is still VISIBLE is a
      // policy question this client cannot answer from the row alone, and the
      // set is at most two rows — one per sharer per thread, by unique index.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_location_shares', filter },
        () => void refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, targetKey, instanceId, refresh]);

  const live = useMemo(
    () => shares.filter((share) => isShareActive(share, now)),
    [shares, now]
  );
  const mine = useMemo(
    () => live.find((share) => share.sharer_id === userId) ?? null,
    [live, userId]
  );
  const theirs = useMemo(
    () => live.filter((share) => share.sharer_id !== userId),
    [live, userId]
  );

  /** Tear the watcher down. Safe to call when there is none. */
  const stopWatching = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  // The watcher must die with the share, however the share ended — an expiry
  // this device noticed, a stop from this user's other device, or a block that
  // landed mid-share. `mine` going away is that fact in one place.
  useEffect(() => {
    if (!mine && watcher.current) stopWatching();
  }, [mine, stopWatching]);

  const start = useCallback(
    async (durationMs: number): Promise<ErrorLike> => {
      const current = targetRef.current;
      if (!current || busy) return null;
      setBusy(true);
      try {
        // WHEN IN USE, never Always. The rationale copy is the
        // NSLocationWhenInUseUsageDescription already configured in app.json —
        // the same prompt the hotspot map and the posting flow ask for, so
        // granting it in any of them covers all of them.
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          return {
            message:
              'Location permission is off. Enable it in Settings to share your live location.',
          };
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        // The window is computed here and CLAMPED to the server's ceiling; the
        // server re-checks it either way and its refusal is a sentence a user
        // can read.
        const { error } = await startLiveLocation(
          current,
          position.coords.latitude,
          position.coords.longitude,
          shareExpiryFor(durationMs)
        );
        if (error) return error;

        await refresh();
        stopWatching();
        watcher.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: HEARTBEAT_MS,
            distanceInterval: HEARTBEAT_DISTANCE_M,
          },
          (update) => {
            const thread = targetRef.current;
            if (!thread) return;
            void updateLiveLocation(
              thread,
              update.coords.latitude,
              update.coords.longitude
            ).then(({ error: beatError }) => {
              if (!beatError) return;
              // THE AUTHORITATIVE END. update_live_location() raises once the
              // share has expired or was stopped, so this is the server saying
              // there is nothing left to move. Tear down; never retry, because
              // every retry would raise for the same reason and a share cannot
              // be revived by a heartbeat — only start_live_location() inserts.
              console.warn('[LiveLocation] heartbeat ended the share', beatError.message);
              stopWatching();
              void refresh();
            });
          }
        );
        return null;
      } catch (err) {
        // THE ERROR IS HANDED ON, NOT UNWRAPPED. Reading `.message` here and
        // returning it as a sentence is exactly the leak
        // tests/errorMessage.test.mjs sweeps for: a GPS failure's raw text
        // would reach a user with none of lib/errorMessage's classification
        // applied. The caller runs userMessage() over this with its own
        // fallback, and phase77's own sentences — 'Location sharing is not
        // available', 'No active location share' — reach the user unchanged
        // through the same mapper.
        //
        // A non-Error throw becomes a shaped failure carrying NO text, so the
        // caller's own fallback sentence fires — never `null`, which would
        // read as success and leave the user with silence after a share that
        // did not start.
        console.error('[LiveLocation] start failed', err);
        return err instanceof Error ? err : { message: null };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, stopWatching]
  );

  const stop = useCallback(async (): Promise<ErrorLike> => {
    const current = targetRef.current;
    if (!current) return null;
    setBusy(true);
    // The watcher goes FIRST, so a position update already in flight cannot
    // land after the stop and be refused with an error nobody asked for.
    stopWatching();
    const { error } = await stopLiveLocation(current);
    setBusy(false);
    if (error) return error;
    // stop_live_location() moves expires_at to now(), and the updated row
    // immediately fails the SELECT policy — so THIS client gets no event for
    // its own stop either. The refetch is what clears the bar.
    await refresh();
    return null;
  }, [refresh, stopWatching]);

  return { theirs, mine, sharing: !!mine, busy, now, start, stop, refresh };
}
