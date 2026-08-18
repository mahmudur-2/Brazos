import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { Button } from './Button';
import { MapPinIcon } from './MapPinIcon';
import {
  cellPolygon,
  glowRingsForCell,
  tierForCount,
  type HotspotMapProps,
} from '../lib/hotspots';
import { colors, radius, spacing } from '../lib/theme';

type PermState = 'loading' | 'granted' | 'denied' | 'skipped';

// Brooklyn beachhead (East Flatbush / Sheepshead Bay area) — the fallback
// center when we don't have the user's location.
const DEFAULT_REGION = {
  latitude: 40.6501,
  longitude: -73.9496,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function HotspotMap({
  cells,
  loading,
  onSelectCell,
  pins,
  onSelectPin,
  onRegionChangeComplete,
  onUserLocation,
}: HotspotMapProps) {
  const [perm, setPerm] = useState<PermState>('loading');
  const mapRef = useRef<MapView>(null);
  // Kept in a ref so obtaining a GPS fix (an effect below) always reports to
  // the CURRENT caller without re-running the location effect per render.
  const onUserLocationRef = useRef(onUserLocation);
  onUserLocationRef.current = onUserLocation;

  useEffect(() => {
    let active = true;
    (async () => {
      // Foreground-only ("while using the app"); rationale copy comes from the
      // NSLocationWhenInUseUsageDescription string configured in app.json.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      setPerm(status === 'granted' ? 'granted' : 'denied');
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (perm !== 'granted') return;
    let active = true;
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        onUserLocationRef.current?.({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
        mapRef.current?.animateToRegion(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          },
          700
        );
      } catch {
        // Location fetch can fail (e.g. services off); the map still shows
        // hotspots centered on the default region.
      }
    })();
    return () => {
      active = false;
    };
  }, [perm]);

  // Without a real GPS fix to center on, DEFAULT_REGION is just one arbitrary
  // fixed neighborhood — any hotspot outside its ~0.08° span (about 5.5mi
  // across) is invisible until the user manually pans/zooms, with nothing on
  // screen hinting it's there. That's what made only the closest cluster to
  // DEFAULT_REGION visible after seeding several neighborhoods spread across
  // Brooklyn. Once real cells load, fit the viewport to all of them instead —
  // this only runs when there's no GPS position to prefer, so "jobs near me"
  // for a user who did grant location is untouched.
  useEffect(() => {
    if (perm === 'granted') return;
    if (perm === 'loading') return;
    if (cells.length === 0) return;
    mapRef.current?.fitToCoordinates(
      cells.map((c) => ({ latitude: c.cell_lat, longitude: c.cell_lng })),
      { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: true }
    );
  }, [cells, perm]);

  if (perm === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MapPinIcon size={80} />
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.loadingSpinner}
        />
      </View>
    );
  }

  if (perm === 'denied') {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.background }]}>
        <MapPinIcon size={88} />
        <Text style={[styles.fallbackTitle, { color: colors.text }]}>
          Location is off
        </Text>
        <Text style={[styles.fallbackText, { color: colors.textMuted }]}>
          Brazos uses your location to show work near you on the map. Turn it on
          in Settings to see nearby hotspots.
        </Text>
        <View style={styles.fallbackActions}>
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          <Button
            title="View map without location"
            variant="secondary"
            onPress={() => setPerm('skipped')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={perm === 'granted'}
        showsMyLocationButton={perm === 'granted'}
        toolbarEnabled={false}
        // Hardcoded light — see the DARK_MAP_STYLE comment above.
        userInterfaceStyle="light"
        customMapStyle={[]}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {pins !== undefined
          ? pins.map((pin) => (
              <Marker
                key={pin.key}
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                onPress={() => onSelectPin?.(pin)}
                anchor={{ x: 0.5, y: 1 }}
                // The pin content is static text, so re-capturing the marker
                // view on every map frame is pure cost. Text also renders
                // synchronously — no icon-font race at capture time, which is
                // why the badge is a count rather than a glyph.
                tracksViewChanges={false}
                accessibilityLabel={`${pin.count} open ${pin.count === 1 ? 'job' : 'jobs'} here`}
              >
                <View style={styles.pinWrap}>
                  <View style={styles.pinBadge}>
                    <Text style={styles.pinCount}>{pin.count}</Text>
                  </View>
                  <View style={styles.pinTail} />
                </View>
              </Marker>
            ))
          : cells.flatMap((cell) => {
          const tier = tierForCount(cell.job_count);
          if (!tier) return [];

          const glow = glowRingsForCell(cell).map((ring) => (
            <Circle
              key={ring.key}
              center={{ latitude: cell.cell_lat, longitude: cell.cell_lng }}
              radius={ring.radiusMeters}
              fillColor={ring.fillColor}
              // Circle defaults strokeColor to opaque black when unset — with
              // strokeWidth alone at 0 that outline can still render as a thin
              // hairline on some platforms, which is what showed up as solid
              // black rings. Explicit transparent stroke removes it for good.
              strokeColor="transparent"
              strokeWidth={0}
            />
          ));

          // Invisible tap target — react-native-maps' Circle has no onPress
          // support at all, so hit-testing the soft glow goes through a fully
          // transparent Polygon instead (which does support taps). Same
          // explicit-transparent-stroke guard as the glow circles above.
          const tapTarget = (
            <Polygon
              key={`${cell.ilat}:${cell.ilng}:tap`}
              coordinates={cellPolygon(cell)}
              fillColor="transparent"
              strokeColor="transparent"
              strokeWidth={0}
              tappable
              onPress={() => onSelectCell(cell)}
            />
          );

          return [...glow, tapTarget];
        })}
      </MapView>

      {loading && (
        <View
          style={[
            styles.loadingPill,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Updating hotspots…
          </Text>
        </View>
      )}

      {!loading && cells.length === 0 && (
        <View
          style={[
            styles.emptyBanner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.emptyBannerText, { color: colors.textMuted }]}>
            No active hotspots yet — they appear as more jobs are posted nearby.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  loadingSpinner: {
    marginTop: spacing.md,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  fallbackText: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  fallbackActions: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  loadingPill: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBanner: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyBannerText: {
    flex: 1,
    fontSize: 13,
  },
  pinWrap: {
    alignItems: 'center',
  },
  // A count badge on a teardrop-ish stem (reference: Discover_Map_Dark's
  // briefcase pins) — forest fill, gold hairline, cream count. Diameter stays
  // over the 44pt touch floor via the Marker's own hit area plus the tail.
  pinBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.forest,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCount: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  pinTail: {
    width: 10,
    height: 10,
    marginTop: -5,
    backgroundColor: colors.forest,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: colors.gold,
    transform: [{ rotate: '45deg' }],
  },
});
