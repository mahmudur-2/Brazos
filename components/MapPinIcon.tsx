import { View } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';

type MapPinIconProps = {
  size?: number;
};

/**
 * Brazos's map-tab glyph: a location pin sitting over a simplified, abstract
 * map — same general concept as standard maps-app iconography (pin over
 * map), but built from plain Views in the app's forest/earth palette rather
 * than any icon font or a copy of a real map app's style. The "map" beneath
 * the pin is just geometric road-lines and blocks, enough to read as a map
 * at a glance without depicting anything literal.
 *
 * Used wherever the Map tab shows a loading/permission/empty placeholder
 * instead of the real interactive map.
 */
export function MapPinIcon({ size = 72 }: MapPinIconProps) {
  const { palette } = useThemeColors();

  const mapW = size * 0.82;
  const mapH = size * 0.5;
  const pinSize = size * 0.46;
  const holeSize = pinSize * 0.4;
  const tipSize = pinSize * 0.48;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Abstract map base */}
      <View
        style={{
          width: mapW,
          height: mapH,
          borderRadius: mapH * 0.22,
          backgroundColor: palette.primarySoft,
          borderWidth: 1,
          borderColor: palette.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: mapH * 0.4,
            left: mapW * 0.08,
            width: mapW * 0.84,
            height: 2,
            borderRadius: 1,
            backgroundColor: palette.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: mapH * 0.12,
            left: mapW * 0.36,
            width: 2,
            height: mapH * 0.76,
            borderRadius: 1,
            backgroundColor: palette.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: mapH * 0.16,
            left: mapW * 0.56,
            width: mapW * 0.3,
            height: mapH * 0.24,
            borderRadius: 3,
            backgroundColor: palette.primary,
            opacity: 0.16,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: mapH * 0.1,
            left: mapW * 0.1,
            width: mapW * 0.2,
            height: mapH * 0.24,
            borderRadius: 3,
            backgroundColor: palette.primary,
            opacity: 0.16,
          }}
        />
      </View>

      {/* Pin — overlaps the top of the map so its point lands on it */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: pinSize,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: pinSize * 0.58,
            width: tipSize,
            height: tipSize,
            backgroundColor: palette.primary,
            borderRadius: 2,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <View
          style={{
            width: pinSize,
            height: pinSize,
            borderRadius: pinSize / 2,
            backgroundColor: palette.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: holeSize,
              height: holeSize,
              borderRadius: holeSize / 2,
              backgroundColor: palette.onPrimary,
            }}
          />
        </View>
      </View>
    </View>
  );
}
