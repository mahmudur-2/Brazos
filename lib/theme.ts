import { Platform, type ViewStyle } from 'react-native';

/**
 * Brazos design system — "Forest and earth".
 * Deep forest green primary on a warm cream background, grounded and natural.
 */

export const colors = {
  primary: '#1F4D3A',
  primaryDark: '#173A2C',
  primarySoft: '#E3EBE2',
  // Cream content (text/icons) shown on a solid primary-filled surface —
  // buttons, selected chips, own chat bubbles, progress dots, etc.
  onPrimary: '#F4F1E8',
  // Rating-star gold. Kept as an explicit token (not tied to status/primary)
  // since gold stars are a near-universal convention independent of theme.
  star: '#F59E0B',

  text: '#1F2E22',
  textMuted: '#6B7566',
  textSubtle: '#9AA38F',

  background: '#F4F1E8',
  surface: '#FFFFFF',
  border: '#DDD6C4',

  // Status palette (text + background pairs), warmed to sit naturally in the
  // forest/earth palette. Kept clearly distinct from `primary` (which is a
  // deep blue-green) so status badges still read at a glance — success leans
  // olive/moss, danger leans terracotta, etc.
  success: '#4C7A3D',
  successBg: '#E6EDD9',
  warning: '#9A5B1E',
  warningBg: '#F3E3C4',
  danger: '#A8432B',
  dangerBg: '#F3DCD2',
  info: '#3D6B6B',
  infoBg: '#DCE8E6',
  neutral: '#6B6255',
  neutralBg: '#EDE7DA',

  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  subheading: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: colors.textSubtle },
} as const;

/** Soft, grounded shadows. Uses boxShadow on web to avoid deprecation warnings. */
export const shadows: Record<'card' | 'raised', ViewStyle> = {
  card: Platform.select({
    web: { boxShadow: '0 1px 3px rgba(31,46,34,0.07), 0 1px 2px rgba(31,46,34,0.05)' },
    default: {
      shadowColor: '#1F2E22',
      shadowOpacity: 0.07,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }) as ViewStyle,
  raised: Platform.select({
    web: { boxShadow: '0 8px 24px rgba(31,46,34,0.14)' },
    default: {
      shadowColor: '#1F2E22',
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }) as ViewStyle,
};

export const theme = { colors, spacing, radius, typography, shadows } as const;
