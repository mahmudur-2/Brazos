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
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPinIcon } from './MapPinIcon';
import { tierForCount, type HotspotMapProps } from '../lib/hotspots';
import { colors, radius, shadows, spacing } from '../lib/theme';

const DEFAULT_CENTER: maplibregl.LngLatLike = [-73.9496, 40.6501];
const DEFAULT_ZOOM = 11.5;
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type LocationState = 'idle' | 'loading' | 'granted' | 'denied';

/**
 * Browser/PWA implementation of the hotspot map. MapLibre renders vector
 * streets through WebGL, so labels and roads stay sharp at every zoom level
 * and the map supports touch rotation and two-finger pitch. The privacy model
 * stays identical to native: this receives aggregated cell centers and counts,
 * never individual job coordinates.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hotspotMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userCenteredRef = useRef(false);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: VECTOR_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 20,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      'top-left'
    );
    // Keep the legally required map-data credit available without the large
    // permanent Leaflet attribution strip that previously covered the map.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const markReady = () => {
      map.resize();
      setMapReady(true);
    };
    map.on('load', markReady);
    mapRef.current = map;

    const resizeTimer = window.setTimeout(() => map.resize(), 0);
    return () => {
      window.clearTimeout(resizeTimer);
      map.off('load', markReady);
      hotspotMarkersRef.current.forEach((marker) => marker.remove());
      hotspotMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    hotspotMarkersRef.current.forEach((marker) => marker.remove());
    hotspotMarkersRef.current = [];

    for (const cell of cells) {
      const tier = tierForCount(cell.job_count);
      if (!tier) continue;

      const element = document.createElement('button');
      const size =
        tier.key === 'peak' ? 78 : tier.key === 'high' ? 68 : tier.key === 'medium' ? 58 : 48;
      element.type = 'button';
      element.className = 'brazos-hotspot-marker';
      element.setAttribute(
        'aria-label',
        `${cell.job_count} open ${cell.job_count === 1 ? 'job' : 'jobs'}`
      );
      element.title = element.getAttribute('aria-label') ?? '';
      Object.assign(element.style, {
        width: `${size}px`,
        height: `${size}px`,
        border: '0',
        borderRadius: '999px',
        cursor: 'pointer',
        padding: '0',
        background: `radial-gradient(circle, ${tier.stroke}e6 0 16%, ${tier.stroke}8f 28%, ${tier.stroke}42 52%, ${tier.stroke}00 74%)`,
        filter: 'drop-shadow(0 2px 5px rgba(10, 44, 34, 0.18))',
        WebkitTapHighlightColor: 'transparent',
      });
      element.addEventListener('click', () => onSelectCell(cell));

      hotspotMarkersRef.current.push(
        new maplibregl.Marker({
          element,
          anchor: 'center',
          pitchAlignment: 'map',
          rotationAlignment: 'map',
        })
          .setLngLat([cell.cell_lng, cell.cell_lat])
          .addTo(map)
      );
    }

    if (cells.length > 0 && !userCenteredRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      cells.forEach((cell) => bounds.extend([cell.cell_lng, cell.cell_lat]));
      map.fitBounds(bounds, {
        animate: true,
        maxZoom: 14,
        padding: 52,
      });
    }

    window.setTimeout(() => map.resize(), 0);
  }, [cells, mapReady, onSelectCell]);

  const locateUser = useCallback(async () => {
    const map = mapRef.current;
    if (!map || locationState === 'loading') return;

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
      const point: maplibregl.LngLatLike = [
        position.coords.longitude,
        position.coords.latitude,
      ];

      userMarkerRef.current?.remove();
      const markerElement = document.createElement('div');
      markerElement.setAttribute('aria-label', 'You are here');
      Object.assign(markerElement.style, {
        width: '22px',
        height: '22px',
        border: `4px solid ${colors.surface}`,
        borderRadius: '999px',
        backgroundColor: colors.primary,
        boxShadow: '0 2px 9px rgba(10, 44, 34, 0.38)',
      });
      userMarkerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: 'center',
      })
        .setLngLat(point)
        .addTo(map);

      userCenteredRef.current = true;
      map.easeTo({ center: point, zoom: 14, pitch: 35, duration: 700 });
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
        accessibilityLabel="Interactive vector job hotspot map"
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
            Location is off. You can still pan, zoom, rotate, and open hotspots.
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
    backgroundColor: '#dfe9e2',
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
    zIndex: 10,
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
    zIndex: 10,
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
    zIndex: 9,
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
    zIndex: 9,
  },
  emptyBannerText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
  },
});
