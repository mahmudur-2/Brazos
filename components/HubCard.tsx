import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { colors, radius, spacing } from '../lib/theme';
import { formatBudget } from '../lib/jobs';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type HubCardProps = {
  icon: IoniconName;
  title: string;
  /** Counterparty line, e.g. "Worker · Carlos Reyes". */
  subtitle: string;
  priceCents: number | null;
  priceLabel?: string;
  status: string;
  onPress: () => void;
};

export function HubCard({
  icon,
  title,
  subtitle,
  priceCents,
  priceLabel,
  status,
  onPress,
}: HubCardProps) {
  return (
    <Card onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <StatusBadge status={status} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.price}>
          {priceLabel ? `${priceLabel} ` : ''}
          {formatBudget(priceCents)}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
});
