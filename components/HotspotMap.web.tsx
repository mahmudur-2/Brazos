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
import type * as MapLibre from 'maplibre-gl';
import { MapPinIcon } from './MapPinIcon';
import { tierForCount, type HotspotMapProps } from '../lib/hotspots';
import { colors, radius, shadows, spacing } from '../lib/theme';

declare global {
  interface Window {
    maplibregl?: typeof import('maplibre-gl');
  }
}

const DEFAULT_CENTER: MapLibre.LngLatLike = [-73.9496, 40.6501];
const DEFAULT_ZOOM = 11.5;
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const VECTOR_LOAD_TIMEOUT_MS = 8000;
const FALLBACK_LOAD_TIMEOUT_MS = 12000;

const RASTER_FALLBACK_STYLE: MapLibre.StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'openStreetMap',
      type: 'raster',
      source: 'openStreetMap',
    },
  ],
};

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
  const mapRef = useRef<MapLibre.Map | null>(null);
  const hotspotMarkersRef = useRef<MapLibre.Marker[]>([]);
  const userMarkerRef = useRef<MapLibre.Marker | null>(null);
  const userCenteredRef = useRef(false);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const maplibregl = window.maplibregl;
    if (!maplibregl) {
      setMapError('The map engine did not load. Check your connection and try again.');
      return;
    }

    setMapReady(false);
    setMapError(null);
    let map: MapLibre.Map;
    let fallbackActive = false;
    let settled = false;
    let terminalTimer: number | undefined;
    let vectorTimer: number | undefined;

    const markReady = () => {
      settled = true;
      if (vectorTimer) window.clearTimeout(vectorTimer);
      if (terminalTimer) window.clearTimeout(terminalTimer);
      map.resize();
      setMapReady(true);
      setMapError(null);
    };

    const activateFallback = () => {
      if (settled || fallbackActive) return;
      fallbackActive = true;
      map.setStyle(RASTER_FALLBACK_STYLE);
      terminalTimer = window.setTimeout(() => {
        if (!settled) {
          setMapError('The map could not connect. Tap below to try again.');
        }
      }, FALLBACK_LOAD_TIMEOUT_MS);
    };

    const handleMapError = (event: MapLibre.MapEventType['error']) => {
      console.warn('[BRAZOS map]', event.error?.message ?? 'Map resource failed');
      if (!settled) activateFallback();
    };

    try {
      map = new maplibregl.Map({
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
      // Keep the legally required map-data credit available without a large
      // permanent attribution strip covering the map.
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      map.on('load', markReady);
      map.on('error', handleMapError);
      mapRef.current = map;
      vectorTimer = window.setTimeout(activateFallback, VECTOR_LOAD_TIMEOUT_MS);
    } catch (error) {
      console.error('[BRAZOS map] Failed to initialize', error);
      setMapError('The map could not start. Tap below to try again.');
      return;
    }

    const resizeTimer = window.setTimeout(() => map.resize(), 0);
    return () => {
      window.clearTimeout(resizeTimer);
      if (vectorTimer) window.clearTimeout(vectorTimer);
      if (terminalTimer) window.clearTimeout(terminalTimer);
      map.off('load', markReady);
      map.off('error', handleMapError);
      hotspotMarkersRef.current.forEach((marker) => marker.remove());
      hotspotMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = window.maplibregl;
    if (!map || !mapReady || !maplibregl) return;

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
      const point: MapLibre.LngLatLike = [
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
      const maplibregl = window.maplibregl;
      if (!maplibregl) {
        setLocationState('denied');
        return;
      }
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

      {!mapReady && !mapError && (
        <View style={styles.center}>
          <MapPinIcon size={120} />
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.loadingSpinner}
          />
        </View>
      )}

      {mapError && (
        <View style={styles.center}>
          <MapPinIcon size={120} />
          <Text style={styles.mapErrorText}>{mapError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryKey((value) => value + 1)}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.locationButtonPressed,
            ]}
          >
            <Ionicons name="refresh" size={18} color={colors.onPrimary} />
            <Text style={styles.retryButtonText}>Retry map</Text>
          </Pressable>
        </View>
      )}

      {mapReady && (
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
      )}

      {mapReady && locationState === 'denied' && (
        <View style={styles.locationNotice}>
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.locationNoticeText}>
            Location is off. You can still pan, zoom, rotate, and open hotspots.
          </Text>
        </View>
      )}

      {mapReady && loading && (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Updating hotspots…</Text>
        </View>
      )}

      {mapReady && !loading && cells.length === 0 && (
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
  mapErrorText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
    maxWidth: 300,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
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
