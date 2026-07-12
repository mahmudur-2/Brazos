import { Platform, type ViewStyle } from 'react-native';

/**
 * Brazos design system — "Uber meets Linear".
 * Confident blue primary, near-black text, generous spacing, soft shadows.
 */

export const colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF4FF',

  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',

  // Status palette (text + background pairs)
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
  neutral: '#475569',
  neutralBg: '#F1F5F9',

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

/** Soft, premium shadows. Uses boxShadow on web to avoid deprecation warnings. */
export const shadows: Record<'card' | 'raised', ViewStyle> = {
  card: Platform.select({
    web: { boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)' },
    default: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }) as ViewStyle,
  raised: Platform.select({
    web: { boxShadow: '0 8px 24px rgba(15,23,42,0.12)' },
    default: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }) as ViewStyle,
};

export const theme = { colors, spacing, radius, typography, shadows } as const;
