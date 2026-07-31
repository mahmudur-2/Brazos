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
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import ViewState from 'ol/View.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Point from 'ol/geom/Point.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { fromLonLat } from 'ol/proj.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import 'ol/ol.css';
import { MapPinIcon } from './MapPinIcon';
import {
  glowRingsForCell,
  type HotspotCell,
  type HotspotMapProps,
} from '../lib/hotspots';
import { colors, radius, shadows, spacing } from '../lib/theme';

const DEFAULT_CENTER: [number, number] = [-73.9496, 40.6501];
const DEFAULT_ZOOM = 12;
const PRIMARY_LOAD_TIMEOUT_MS = 7000;
const FALLBACK_LOAD_TIMEOUT_MS = 10000;
const CARTO_RETINA_URL =
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type LocationState = 'idle' | 'loading' | 'granted' | 'denied';

function createPrimarySource() {
  return new XYZ({
    attributions: [
      '© OpenStreetMap contributors',
      '© CARTO',
    ],
    attributionsCollapsible: true,
    crossOrigin: 'anonymous',
    maxZoom: 20,
    tilePixelRatio: 2,
    tileSize: 256,
    transition: 180,
    url: CARTO_RETINA_URL,
  });
}

function createFallbackSource() {
  return new XYZ({
    attributions: '© OpenStreetMap contributors',
    attributionsCollapsible: true,
    crossOrigin: 'anonymous',
    maxZoom: 19,
    transition: 180,
    url: OSM_FALLBACK_URL,
  });
}

/**
 * Browser/PWA implementation of the hotspot map. OpenLayers renders Retina
 * image tiles without WebGL or web workers, avoiding the blank-map failure
 * seen in installed iPhone PWAs while retaining pan, pinch zoom, and two-finger
 * rotation. The privacy model stays identical to native: this receives
 * aggregated cell centers and counts, never individual job coordinates.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<ViewState | null>(null);
  const hotspotSourceRef = useRef<VectorSource | null>(null);
  const userSourceRef = useRef<VectorSource | null>(null);
  const userCenteredRef = useRef(false);
  const onSelectCellRef = useRef(onSelectCell);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  onSelectCellRef.current = onSelectCell;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    setMapReady(false);
    setMapError(null);

    const primarySource = createPrimarySource();
    const baseLayer = new TileLayer({ preload: 2, source: primarySource });
    const hotspotSource = new VectorSource({ wrapX: false });
    const userSource = new VectorSource({ wrapX: false });
    const hotspotLayer = new VectorLayer({ source: hotspotSource });
    const userLayer = new VectorLayer({ source: userSource });
    const view = new ViewState({
      center: fromLonLat(DEFAULT_CENTER),
      constrainRotation: false,
      enableRotation: true,
      maxZoom: 20,
      zoom: DEFAULT_ZOOM,
    });
    const map = new Map({
      controls: defaultControls({
        attributionOptions: {
          collapsed: true,
          collapsible: true,
        },
        rotate: false,
        zoom: true,
      }),
      interactions: defaultInteractions({
        dragPan: true,
        onFocusOnly: false,
        pinchRotate: true,
        pinchZoom: true,
      }),
      layers: [baseLayer, hotspotLayer, userLayer],
      target: container,
      view,
    });

    let activeSource = primarySource;
    let fallbackActive = false;
    let terminal = false;
    let loadTimer: number | undefined;
    const sourceCleanups: Array<() => void> = [];

    const clearLoadTimer = () => {
      if (loadTimer) {
        window.clearTimeout(loadTimer);
        loadTimer = undefined;
      }
    };

    const markReady = () => {
      if (terminal) return;
      terminal = true;
      clearLoadTimer();
      map.updateSize();
      setMapReady(true);
      setMapError(null);
    };

    const markFailed = () => {
      if (terminal) return;
      terminal = true;
      clearLoadTimer();
      setMapReady(false);
      setMapError('The map could not connect. Tap below to try again.');
    };

    const watchSource = (source: XYZ) => {
      const handleTileLoad = () => {
        if (source === activeSource) markReady();
      };
      const handleTileError = () => {
        if (source !== activeSource || terminal) return;
        if (!fallbackActive) activateFallback();
      };

      source.on('tileloadend', handleTileLoad);
      source.on('tileloaderror', handleTileError);
      sourceCleanups.push(() => {
        source.un('tileloadend', handleTileLoad);
        source.un('tileloaderror', handleTileError);
      });
    };

    const activateFallback = () => {
      if (terminal || fallbackActive) return;
      fallbackActive = true;
      clearLoadTimer();

      const fallbackSource = createFallbackSource();
      activeSource = fallbackSource;
      watchSource(fallbackSource);
      baseLayer.setSource(fallbackSource);
      loadTimer = window.setTimeout(markFailed, FALLBACK_LOAD_TIMEOUT_MS);
    };

    watchSource(primarySource);
    loadTimer = window.setTimeout(activateFallback, PRIMARY_LOAD_TIMEOUT_MS);

    const handleMapClick = (event: MapBrowserEvent) => {
      map.forEachFeatureAtPixel(event.pixel, (featureLike) => {
        const feature = featureLike as Feature<CircleGeometry>;
        const cell = feature.get('hotspotCell') as HotspotCell | undefined;
        if (!cell) return undefined;
        onSelectCellRef.current(cell);
        return true;
      });
    };

    map.on('singleclick', handleMapClick);
    mapRef.current = map;
    viewRef.current = view;
    hotspotSourceRef.current = hotspotSource;
    userSourceRef.current = userSource;

    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(container);
    const resizeTimer = window.setTimeout(() => map.updateSize(), 0);

    return () => {
      terminal = true;
      clearLoadTimer();
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      sourceCleanups.forEach((cleanup) => cleanup());
      map.un('singleclick', handleMapClick);
      map.setTarget(undefined);
      mapRef.current = null;
      viewRef.current = null;
      hotspotSourceRef.current = null;
      userSourceRef.current = null;
      setMapReady(false);
    };
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    const view = viewRef.current;
    const source = hotspotSourceRef.current;
    if (!map || !view || !source) return;

    source.clear();
    const features: Feature<CircleGeometry>[] = [];

    for (const cell of cells) {
      const center = fromLonLat([cell.cell_lng, cell.cell_lat]);
      for (const ring of glowRingsForCell(cell)) {
        const feature = new Feature(new CircleGeometry(center, ring.radiusMeters));
        feature.set('hotspotCell', cell);
        feature.setStyle(
          new Style({
            fill: new Fill({ color: ring.fillColor }),
          })
        );
        features.push(feature);
      }
    }

    source.addFeatures(features);

    if (features.length > 0 && !userCenteredRef.current) {
      map.updateSize();
      const extent = source.getExtent();
      if (extent) {
        view.fit(extent, {
          duration: 600,
          maxZoom: 14,
          padding: [52, 52, 52, 52],
        });
      }
    }
  }, [cells, mapReady]);

  const locateUser = useCallback(async () => {
    const view = viewRef.current;
    const userSource = userSourceRef.current;
    if (!view || !userSource || locationState === 'loading') return;

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
      const point = fromLonLat([
        position.coords.longitude,
        position.coords.latitude,
      ]);
      const marker = new Feature(new Point(point));
      marker.setStyle(
        new Style({
          image: new CircleStyle({
            fill: new Fill({ color: colors.primary }),
            radius: 10,
            stroke: new Stroke({
              color: colors.surface,
              width: 4,
            }),
          }),
        })
      );

      userSource.clear();
      userSource.addFeature(marker);
      userCenteredRef.current = true;
      view.animate({ center: point, duration: 700, zoom: 14 });
      setLocationState('granted');
    } catch {
      setLocationState('denied');
    }
  }, [locationState]);

  const rotateMap = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    view.animate({
      duration: 240,
      rotation: view.getRotation() + Math.PI / 4,
    });
  }, []);

  const resetNorth = useCallback(() => {
    viewRef.current?.animate({ duration: 240, rotation: 0 });
  }, []);

  return (
    <View style={styles.flex}>
      <View
        ref={(node) => {
          containerRef.current = node as unknown as HTMLElement | null;
        }}
        style={styles.map}
        accessibilityLabel="Interactive job hotspot map"
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
              pressed && styles.controlButtonPressed,
            ]}
          >
            <Ionicons name="refresh" size={18} color={colors.onPrimary} />
            <Text style={styles.retryButtonText}>Retry map</Text>
          </Pressable>
        </View>
      )}

      {mapReady && (
        <>
          <Pressable
            accessibilityLabel="Center map on my location"
            accessibilityRole="button"
            onPress={() => void locateUser()}
            style={({ pressed }) => [
              styles.locationButton,
              pressed && styles.controlButtonPressed,
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

          <Pressable
            accessibilityHint="Tap to rotate 45 degrees. Hold to reset north."
            accessibilityLabel="Rotate map"
            accessibilityRole="button"
            delayLongPress={450}
            onLongPress={resetNorth}
            onPress={rotateMap}
            style={({ pressed }) => [
              styles.rotateButton,
              pressed && styles.controlButtonPressed,
            ]}
          >
            <Ionicons name="compass-outline" size={23} color={colors.primary} />
          </Pressable>
        </>
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
    backgroundColor: '#e8eee9',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
    zIndex: 20,
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
  rotateButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    top: spacing.md + 54,
    width: 46,
    zIndex: 10,
    ...shadows.raised,
  },
  controlButtonPressed: {
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
