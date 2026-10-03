import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MarkPop } from './SelectMark';
import { metricStyles, starColors, useThemeColors } from '../lib/theme';

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
};

export function StarRating({ value, onChange, size = 32 }: StarRatingProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const starPaint = starColors(colors, isDark);
  const readOnly = !onChange;
  // FIX-RUN F12: the star just tapped swells and settles (components/SelectMark's MarkPop).
  const [popped, setPopped] = useState<{ star: number; key: number } | null>(null);

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const icon = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? starPaint.filled : starPaint.empty}
          />
        );
        if (readOnly) {
          return (
            <View key={star} style={styles.star}>
              {icon}
            </View>
          );
        }
        return (
          <Pressable
            key={star}
            testID={`review-star-${star}`}
            onPress={() => {
              onChange(star);
              setPopped({ star, key: Date.now() });
            }}
            hitSlop={6}
            style={styles.star}
            // n5 (2026-09-04): a name and a state for VoiceOver — the glyph
            // alone read as its character. The testID stays: the Maestro walk
            // taps the stars by it.
            accessibilityRole="button"
            accessibilityLabel={`${star} ${star === 1 ? 'star' : 'stars'}`}
            accessibilityState={{ selected: filled }}
          >
            <MarkPop popKey={popped?.star === star ? popped.key : 0}>{icon}</MarkPop>
          </Pressable>
        );
      })}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  star: {
    padding: 2,
  },
}));
