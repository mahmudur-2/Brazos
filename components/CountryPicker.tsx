import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { flagEmoji, searchCountries, type Country } from '../lib/countries';
import { USE_NATIVE_DRIVER } from '../lib/motion';

const OPEN_MS = 220;
const CLOSE_MS = 180;
const ROW_HEIGHT = 56;

type CountryPickerProps = {
  visible: boolean;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
};

/**
 * Country selector for the auth flow's phone field.
 *
 * A plain RN <Modal> plus a FlatList rather than a picker package: every
 * off-the-shelf country picker either bundles a native module (which would
 * force a custom development build and break Expo Go) or its own icon/flag
 * asset set. This works unchanged on iOS, Android and web — <Modal> on
 * react-native-web routes the Escape key to onRequestClose, which is the same
 * callback Android's hardware back button uses.
 */
export function CountryPicker({ visible, selected, onSelect, onClose }: CountryPickerProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  // Kept mounted through the close animation so the sheet can slide out.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setQuery('');
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }

    // Unmounting is driven by a timer as well as by the animation callback.
    // Animated's JS driver runs on requestAnimationFrame, which a browser stops
    // delivering to a backgrounded tab — leaving the callback alone would let a
    // dismissed sheet stay mounted on top of the form.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setMounted(false);
    };

    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) release();
    });

    const failsafe = setTimeout(release, CLOSE_MS + 200);
    return () => clearTimeout(failsafe);
  }, [visible, progress]);

  const results = useMemo(() => searchCountries(query), [query]);

  // Tall enough to be worth searching in, never taller than the window.
  const sheetHeight = Math.min(height * 0.72, 560);

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close country list"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight + insets.bottom,
              paddingBottom: insets.bottom,
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Select country</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={authColors.muted} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={authColors.muted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Country or code"
              placeholderTextColor={authColors.placeholder}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search countries"
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            getItemLayout={(_, index) => ({
              length: ROW_HEIGHT,
              offset: ROW_HEIGHT * index,
              index,
            })}
            ListEmptyComponent={
              <Text style={styles.empty}>No country matches “{query.trim()}”.</Text>
            }
            renderItem={({ item }) => {
              const isSelected = item.code === selected.code;
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${item.name}, plus ${item.dial}`}
                >
                  <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.dial}>+{item.dial}</Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={20} color={authColors.emerald} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 32, 25, 0.42)',
  },
  sheet: {
    width: '100%',
    maxWidth: authSizes.maxContentWidth,
    backgroundColor: authColors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: authColors.line,
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: authSpacing.gutter,
    paddingTop: authSpacing.md,
    paddingBottom: authSpacing.sm,
  },
  title: {
    ...authType.navTitle,
    fontSize: 17,
    color: authColors.ink,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.sm,
    marginHorizontal: authSpacing.gutter,
    marginBottom: authSpacing.sm,
    paddingHorizontal: authSpacing.md,
    height: 46,
    borderRadius: authRadius.field,
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.line,
  },
  search: {
    flex: 1,
    fontSize: 16,
    color: authColors.ink,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md,
    paddingHorizontal: authSpacing.gutter,
  },
  rowPressed: {
    backgroundColor: authColors.mint,
  },
  flag: {
    fontSize: 22,
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: authColors.ink,
  },
  dial: {
    fontSize: 15,
    color: authColors.muted,
  },
  empty: {
    ...authType.body,
    color: authColors.muted,
    textAlign: 'center',
    paddingHorizontal: authSpacing.gutter,
    paddingVertical: authSpacing.xl,
  },
});
