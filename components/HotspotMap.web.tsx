import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinIcon } from './MapPinIcon';
import {
  glowRingsForCell,
  tierForCount,
  type HotspotMapProps,
} from '../lib/hotspots';
import { colors, radius, shadows, spacing } from '../lib/theme';

const DEFAULT_CENTER: L.LatLngExpression = [40.6501, -73.9496];
const DEFAULT_ZOOM = 12;

type LocationState = 'idle' | 'loading' | 'granted' | 'denied';

/**
 * Browser/PWA implementation of the hotspot map. Leaflet is used here because
 * react-native-maps only supports native iOS and Android. The data and privacy
 * model stay identical: the map receives aggregated cell centers and counts,
 * never individual job coordinates.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const userCenteredRef = useRef(false);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      attributionControl: true,
      zoomControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    hotspotLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapReady(true);

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      hotspotLayerRef.current = null;
      userLayerRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const hotspotLayer = hotspotLayerRef.current;
    if (!map || !hotspotLayer) return;

    hotspotLayer.clearLayers();

    for (const cell of cells) {
      const tier = tierForCount(cell.job_count);
      if (!tier) continue;

      const center: L.LatLngExpression = [cell.cell_lat, cell.cell_lng];
      const rings = glowRingsForCell(cell);

      rings.forEach((ring, index) => {
        const circle = L.circle(center, {
          radius: ring.radiusMeters,
          color: 'transparent',
          weight: 0,
          fillColor: tier.stroke,
          fillOpacity: [0.1, 0.16, 0.24, 0.36, 0.55][index] ?? 0.25,
          interactive: index === rings.length - 1,
        }).addTo(hotspotLayer);

        if (index === rings.length - 1) {
          circle
            .bindTooltip(
              `${cell.job_count} open ${cell.job_count === 1 ? 'job' : 'jobs'}`,
              { direction: 'top', offset: [0, -8] }
            )
            .on('click', () => onSelectCell(cell));
        }
      });
    }

    if (cells.length > 0 && !userCenteredRef.current) {
      const bounds = L.latLngBounds(
        cells.map((cell) => [cell.cell_lat, cell.cell_lng] as L.LatLngTuple)
      );
      map.fitBounds(bounds, {
        animate: true,
        maxZoom: 14,
        padding: [44, 44],
      });
    }

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [cells, mapReady, onSelectCell]);

  const locateUser = useCallback(async () => {
    const map = mapRef.current;
    const userLayer = userLayerRef.current;
    if (!map || !userLayer || locationState === 'loading') return;

    setLocationState('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState('denied');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: L.LatLngExpression = [
        position.coords.latitude,
        position.coords.longitude,
      ];

      userLayer.clearLayers();
      L.circleMarker(point, {
        radius: 9,
        color: colors.surface,
        weight: 3,
        fillColor: colors.primary,
        fillOpacity: 1,
      })
        .bindTooltip('You are here', { direction: 'top', offset: [0, -8] })
        .addTo(userLayer);

      userCenteredRef.current = true;
      map.setView(point, 14, { animate: true });
      setLocationState('granted');
    } catch {
      setLocationState('denied');
    }
  }, [locationState]);

  return (
    <View style={styles.flex}>
      <View
        ref={(node) => {
          containerRef.current = node as unknown as HTMLElement | null;
        }}
        style={styles.map}
        accessibilityLabel="Interactive job hotspot map"
      />

      {!mapReady && (
        <View style={styles.center}>
          <MapPinIcon size={80} />
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.loadingSpinner}
          />
        </View>
      )}

      <Pressable
        accessibilityLabel="Center map on my location"
        accessibilityRole="button"
        onPress={() => void locateUser()}
        style={({ pressed }) => [
          styles.locationButton,
          pressed && styles.locationButtonPressed,
        ]}
      >
        {locationState === 'loading' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name={locationState === 'granted' ? 'navigate' : 'locate-outline'}
            size={22}
            color={colors.primary}
          />
        )}
      </Pressable>

      {locationState === 'denied' && (
        <View style={styles.locationNotice}>
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.locationNoticeText}>
            Location is off. You can still pan, zoom, and open hotspots.
          </Text>
        </View>
      )}

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
            No active hotspots yet—they appear as more jobs are posted nearby.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minHeight: 320,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e8eee9',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  loadingSpinner: {
    marginTop: spacing.md,
  },
  locationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 46,
    zIndex: 1000,
    ...shadows.raised,
  },
  locationButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  locationNotice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 1000,
  },
  locationNoticeText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  loadingPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    top: spacing.md,
    zIndex: 900,
  },
  loadingText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBanner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 900,
  },
  emptyBannerText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
  },
});
