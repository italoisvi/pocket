import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { EconomicIndicator } from '@/types/feed';

type IndicatorCardProps = {
  indicator: EconomicIndicator;
  onPress?: () => void;
};

export function IndicatorCard({ indicator, onPress }: IndicatorCardProps) {
  const { theme } = useTheme();
  const hasChange = indicator.change !== undefined && indicator.change !== null;
  const isPositive = hasChange && indicator.change! >= 0;

  return (
    <FeedCard onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: theme.text }]}>
          📊 {indicator.name}
        </Text>
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: theme.text }]}>
          {indicator.value.toFixed(2)} {indicator.unit}
        </Text>
        {hasChange && (
          <View
            style={[
              styles.changeBadge,
              { backgroundColor: isPositive ? '#10B981' : '#EF4444' },
            ]}
          >
            <Text style={styles.changeText}>
              {isPositive ? '▲' : '▼'} {Math.abs(indicator.change!).toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {indicator.description && (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {indicator.description}
        </Text>
      )}
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 8,
  },
  name: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  value: {
    fontSize: 28,
    fontFamily: 'DMSans-Bold',
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changeText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  description: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
  },
});
