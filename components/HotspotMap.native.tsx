import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { Button } from './Button';
import {
  cellPolygon,
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

export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (perm === 'denied') {
    return (
      <View style={styles.fallback}>
        <View style={styles.fallbackIcon}>
          <Ionicons name="location-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.fallbackTitle}>Location is off</Text>
        <Text style={styles.fallbackText}>
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
      >
        {cells.map((cell) => {
          const tier = tierForCount(cell.job_count);
          if (!tier) return null;
          return (
            <Polygon
              key={`${cell.ilat}:${cell.ilng}`}
              coordinates={cellPolygon(cell)}
              strokeColor={tier.stroke}
              fillColor={tier.fill}
              strokeWidth={2}
              tappable
              onPress={() => onSelectCell(cell)}
            />
          );
        })}
      </MapView>

      {loading && (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Updating hotspots…</Text>
        </View>
      )}

      {!loading && cells.length === 0 && (
        <View style={styles.emptyBanner}>
          <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} />
          <Text style={styles.emptyBannerText}>
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  fallbackText: {
    fontSize: 14,
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  emptyBanner: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
});
