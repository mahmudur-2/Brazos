import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTimeRemaining, type LiveLocationShare } from '../lib/liveLocation';
import { reverseGeocodeArea } from '../lib/reverseGeocode';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * THE TWO FACES OF A LIVE SHARE, and they are deliberately not the same
 * element with a flag.
 *
 *   LiveLocationCard   THEIR share. Where they are and how long it lasts —
 *                      information, with nothing to press.
 *   LiveLocationBar    YOUR share. A statement that you are broadcasting,
 *                      with the one control that ends it. Not information:
 *                      a running state you can stop.
 *
 * BOTH DISAPPEAR WHEN THE SHARE ENDS, and neither has an "ended" state,
 * because there is no such row to render — phase77's SELECT policy hides an
 * expired share from everyone, so ended means ABSENT. The owner
 * (hooks/useLiveLocation.ts) stops passing a share and the element unmounts.
 *
 * NO MAP, and the reason is worth stating so a later run does not read this as
 * an oversight. react-native-maps IS a dependency, but the repo reaches it
 * through exactly one component built as a `.native.tsx` / `.web.tsx` / `.d.ts`
 * triple (components/HotspotMap*), because a bare `react-native-maps` import
 * goes into the web bundle and breaks it — there is no metro alias. Writing the
 * `.web.tsx` half is not available: CLAUDE.md freezes that surface. So this
 * card carries the area label, the coordinates and the time remaining, which
 * is every fact a map would have drawn, minus the picture. Adding the map is a
 * separate, deliberate piece of work on the frozen surface.
 */

/** Three decimals is roughly 110 m — the resolution at which the AREA a pin
 *  sits in can actually change. Keyed on this so a share heartbeating every
 *  fifteen seconds re-geocodes when it MOVES rather than when it beats. */
function areaKeyFor(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/** "40.6501, -73.9496" — four decimals, about 11 m. The precise fact, under
 *  the human-readable one, for a share whose whole purpose is precision. */
function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * The neighbourhood a share is in, resolved once per ~110 m of movement.
 *
 * Best-effort by design: reverseGeocodeArea() returns null when Nominatim is
 * unreachable, and the card then shows the coordinates alone rather than a
 * placeholder. It never blocks the card — the coordinates and the countdown
 * are on screen from the first frame.
 */
function useAreaLabel(lat: number, lng: number): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const key = areaKeyFor(lat, lng);

  useEffect(() => {
    let active = true;
    void reverseGeocodeArea(lat, lng).then((resolved) => {
      if (active) setLabel(resolved);
    });
    return () => {
      active = false;
    };
    // `key`, not lat/lng: a heartbeat that moves the pin two metres must not
    // spend a network round trip re-deriving the same neighbourhood name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return label;
}

type LiveLocationCardProps = {
  share: LiveLocationShare;
  /** Whose position this is, for the line that names it. */
  sharerName?: string | null;
  /** Ticked by the owner's expiry clock, so the countdown moves with the same
   *  `now` that decides whether this card exists at all. */
  now: number;
};

export function LiveLocationCard({ share, sharerName, now }: LiveLocationCardProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const area = useAreaLabel(share.lat, share.lng);
  const remaining = formatTimeRemaining(share.expires_at, now);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`${sharerName ?? 'They'} are sharing their live location${
        area ? `, near ${area}` : ''
      }${remaining ? `, for ${remaining} more` : ''}`}
    >
      <View style={styles.pin}>
        <Ionicons name="navigate" size={18} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {sharerName ? `${sharerName}’s live location` : 'Live location'}
        </Text>
        {/* The AREA first, because it is the reading a person acts on, and the
            coordinates under it, because this is a share whose point is
            precision. When the geocode is unreachable the coordinates simply
            become the whole line rather than sitting under a placeholder. */}
        <Text style={styles.detail} numberOfLines={1}>
          {area ? `${area} · ` : ''}
          {formatCoordinates(share.lat, share.lng)}
        </Text>
      </View>
      {remaining ? (
        <View style={styles.remaining}>
          <View style={styles.liveDot} />
          <Text style={styles.remainingText}>{remaining}</Text>
        </View>
      ) : null}
    </View>
  );
}

type LiveLocationBarProps = {
  share: LiveLocationShare;
  now: number;
  busy?: boolean;
  onStop: () => void;
};

export function LiveLocationBar({ share, now, busy = false, onStop }: LiveLocationBarProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const remaining = formatTimeRemaining(share.expires_at, now);

  return (
    <View style={styles.bar}>
      <View style={styles.liveDot} />
      <Text style={styles.barText} numberOfLines={1}>
        {/* WHAT IS HAPPENING, not what was done. This is a running state, and
            the time left is the part that reassures someone it is bounded. */}
        You’re sharing your live location
        {remaining ? ` · ${remaining} left` : ''}
      </Text>
      <Pressable
        onPress={onStop}
        disabled={busy}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Stop sharing your live location"
        style={({ pressed }) => [
          styles.stop,
          busy && styles.stopDisabled,
          pressed && styles.stopPressed,
        ]}
      >
        <Text style={styles.stopText}>Stop</Text>
      </Pressable>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pin: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    body: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      gap: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    detail: {
      fontSize: 12,
      color: colors.textMuted,
      // Tabular figures, or a coordinate whose last digit changes every
      // heartbeat makes the whole line shuffle sideways.
      fontVariant: ['tabular-nums'],
    },
    remaining: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    remainingText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    // The universal "live" dot, the same one the recording pill uses — this is
    // a feed that is running, not a warning.
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.danger,
    },
    // The same shape and the same wash as the reply chip above the composer:
    // a strip that spans the column and says what state the composer is in.
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.primarySoft,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    barText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    // Bounded and filled rather than a bare text link: this ends a broadcast
    // of someone's position, so it gets a real target. 32 drawn plus hitSlop
    // clears the 44pt floor.
    stop: {
      minHeight: 32,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: withAlpha(colors.danger, 0.45),
      backgroundColor: colors.dangerBg,
    },
    stopPressed: {
      opacity: 0.6,
    },
    stopDisabled: {
      opacity: 0.4,
    },
    stopText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.danger,
    },
  }),
);
