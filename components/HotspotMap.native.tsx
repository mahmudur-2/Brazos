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
import { permissionOutcome, trackIntent } from '../lib/observability/analytics';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { litBetween } from '../ui/primitives/LitSurface';

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
  selectedPinKey = null,
  hideLocateButton = false,
}: HotspotMapProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [perm, setPerm] = useState<PermState>('loading');
  const mapRef = useRef<MapView>(null);
  // Where the user last left the map. Survives the theme-keyed remount below
  // so a Light/Dark switch does not snap them back to the default region.
  const regionRef = useRef(DEFAULT_REGION);
  // Kept in a ref so obtaining a GPS fix (an effect below) always reports to
  // the CURRENT caller without re-running the location effect per render.
  const onUserLocationRef = useRef(onUserLocation);
  onUserLocationRef.current = onUserLocation;

  useEffect(() => {
    let active = true;
    (async () => {
      // Foreground-only ("while using the app"); rationale copy comes from the
      // NSLocationWhenInUseUsageDescription string configured in app.json.
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      // Emitted before the `active` bail-out: the dialog was shown and
      // answered whether or not this component is still mounted to hear it,
      // and dropping the event on an unmount would under-count exactly the
      // people who left because of the prompt.
      trackIntent({
        name: 'permission_result',
        kind: 'location',
        outcome: permissionOutcome(status, canAskAgain),
      });
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
        // emerald D9 — WHY THIS IS KEYED ON THE THEME.
        //
        // The device pass found light MapKit tiles inside a dark app, and the
        // JS-to-native path was already complete: this is the only MapView in
        // the tree, MapScreen its only consumer, and react-native-maps 1.20.1
        // declares (lib/MapView.d.ts), exports (ios/AirMaps/AIRMapManager.m)
        // and implements (ios/AirMaps/AIRMap.m) `userInterfaceStyle` by
        // assigning `overrideUserInterfaceStyle` on its MKMapView subclass.
        // Nothing resets it. So it was not the wrong component, not an
        // unthreaded prop, not a stale value, and not a Google-style mistake.
        //
        // What is left is the native condition: `overrideUserInterfaceStyle`
        // changes the view's TRAIT COLLECTION, and MKMapView repaints its
        // basemap on a trait CHANGE. A map that has already rasterised its
        // tiles under one appearance does not reliably re-rasterise when the
        // override is applied to it afterwards — the light tiles it first drew
        // stay. Keying the view on the resolved theme sidesteps that entirely:
        // a theme flip CONSTRUCTS a new map view under the right trait
        // collection instead of asking an existing one to repaint.
        //
        // The remount would otherwise throw away wherever the user had panned
        // to, so the last completed region is kept in a ref and fed back as
        // the initial region. A ref rather than state: this fires on every
        // pan, and re-rendering the map on each frame would cost more than the
        // problem it solves.
        key={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
        initialRegion={regionRef.current}
        showsUserLocation={perm === 'granted'}
        showsMyLocationButton={perm === 'granted' && !hideLocateButton}
        toolbarEnabled={false}
        // Apple Maps (MapKit) — no Google provider is configured, so
        // customMapStyle would be Google-only and inert here. Tiles follow
        // the RESOLVED in-app theme through this per-MapView iOS prop
        // (react-native-maps 1.20.1), which also covers a pinned Light/Dark
        // preference that differs from the OS trait.
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
          onRegionChangeComplete?.(region);
        }}
      >
        {pins !== undefined
          ? pins.map((pin) => {
              const selected = selectedPinKey === pin.key;
              return (
              <Marker
                // The selected state is IN THE KEY: the marker is captured
                // once (tracksViewChanges false, below), so a pin that
                // merely re-rendered with the gold ring would keep showing
                // its old capture. Remounting the one pin whose state
                // changed is one fresh capture, not a per-frame one.
                key={`${pin.key}:${selected ? 'selected' : 'resting'}`}
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
                {/* 2026-09-19 — THE APPROVED PIN (docs/mockups/html/map-explore-*):
                    a teardrop lit top-to-bottom in the pin tokens, a green
                    stroke, a cream briefcase, and a count badge only where
                    the cluster holds more than one job. The selected pin
                    wears the gold ring and its glow. EVERYTHING IS A VIEW:
                    no icon font, because the marker is captured once
                    (tracksViewChanges false) and a glyph that has not loaded
                    at capture time would be captured as nothing — the
                    briefcase is a body and a handle, drawn. */}
                <View style={[styles.pinWrap, selected && styles.pinWrapSelected]}>
                  <View
                    style={[
                      styles.pinHead,
                      litBetween({ top: colors.pinTop, bottom: colors.pinBottom, flat: !isDark }),
                      selected && styles.pinHeadSelected,
                    ]}
                  >
                    <View style={styles.briefHandle} />
                    <View style={styles.briefBody}>
                      <View style={styles.briefClasp} />
                    </View>
                  </View>
                  <View style={[styles.pinTail, selected && styles.pinTailSelected]} />
                  {pin.count > 1 ? (
                    <View style={styles.pinCountBadge}>
                      <Text style={styles.pinCount}>{pin.count}</Text>
                    </View>
                  ) : null}
                </View>
              </Marker>
              );
            })
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
    paddingTop: 4,
    paddingHorizontal: 6,
  },
  // 2026-09-19 — the approved teardrop: a 40pt head lit from `pinTop` to
  // `pinBottom` (ui/tokens.ts, the design's own two greens per theme) with
  // the emerald stroke, over a tail cut from the same fill. The head stays
  // over the 44pt touch floor with the Marker's own hit area plus the tail.
  pinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pinBottom,
    borderWidth: 2,
    borderColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pinTail: {
    width: 12,
    height: 12,
    marginTop: -7,
    backgroundColor: colors.pinBottom,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.emerald,
    transform: [{ rotate: '45deg' }],
  },
  // The selected pin: the gold ring and its glow (the design's selected state).
  pinWrapSelected: {
    shadowColor: colors.gold,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pinHeadSelected: { borderColor: colors.gold, borderWidth: 2.5 },
  pinTailSelected: { borderColor: colors.gold, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  // The briefcase, drawn: a handle over a body with a clasp line.
  briefHandle: {
    width: 8,
    height: 5,
    borderWidth: 1.8,
    borderBottomWidth: 0,
    borderColor: colors.pinGlyph,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  briefBody: {
    width: 18,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.8,
    borderColor: colors.pinGlyph,
    marginTop: -1,
    justifyContent: 'center',
  },
  briefClasp: { height: 1.8, backgroundColor: colors.pinGlyph },
  // The count badge, top-right, only on clusters.
  pinCountBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.emerald,
    borderWidth: 1.5,
    borderColor: colors.pinBottom,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pinCount: {
    color: colors.onForest,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },

  }),
);
