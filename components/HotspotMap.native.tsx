import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Polygon, type MapStyleElement } from 'react-native-maps';
import * as Location from 'expo-location';
import { Button } from './Button';
import { useThemeColors } from '../hooks/useThemeColors';
import {
  cellPolygon,
  glowRingsForCell,
  tierForCount,
  type HotspotMapProps,
} from '../lib/hotspots';
import { radius, spacing } from '../lib/theme';

type PermState = 'loading' | 'granted' | 'denied' | 'skipped';

// Brooklyn beachhead (East Flatbush / Sheepshead Bay area) — the fallback
// center when we don't have the user's location.
const DEFAULT_REGION = {
  latitude: 40.6501,
  longitude: -73.9496,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// Standard dark "Night mode" Google Maps style (customMapStyle only takes
// effect on the Google Maps provider, i.e. Android here — iOS stays on Apple
// Maps and gets its dark look via the `userInterfaceStyle` prop below).
const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1B2620' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1B2620' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ea08f' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2E3B33' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#22302A' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6E8272' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1E3328' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3A32' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1B2620' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8ea08f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3E8863' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#22302A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101712' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6E8272' }] },
];

export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  const { palette, isDark } = useThemeColors();
  const [perm, setPerm] = useState<PermState>('loading');
  const mapRef = useRef<MapView>(null);

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

  if (perm === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (perm === 'denied') {
    return (
      <View style={[styles.fallback, { backgroundColor: palette.background }]}>
        <View style={[styles.fallbackIcon, { backgroundColor: palette.primarySoft }]}>
          <Ionicons name="location-outline" size={32} color={palette.primary} />
        </View>
        <Text style={[styles.fallbackTitle, { color: palette.text }]}>
          Location is off
        </Text>
        <Text style={[styles.fallbackText, { color: palette.textMuted }]}>
          Brazos uses your location to show work near you on the map. Turn it on
          in Settings to see nearby hotspots.
        </Text>
        <View style={styles.fallbackActions}>
          <Button title="Open Settings" onPress={() => Linking.openSettings()} palette={palette} />
          <Button
            title="View map without location"
            variant="secondary"
            onPress={() => setPerm('skipped')}
            palette={palette}
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
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
      >
        {cells.flatMap((cell) => {
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
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.text }]}>
            Updating hotspots…
          </Text>
        </View>
      )}

      {!loading && cells.length === 0 && (
        <View
          style={[
            styles.emptyBanner,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={palette.textMuted} />
          <Text style={[styles.emptyBannerText, { color: palette.textMuted }]}>
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
  fallbackIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
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
});
