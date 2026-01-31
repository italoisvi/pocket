import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { IndexQuote } from '@/types/feed';

type IndexCardProps = {
  index: IndexQuote;
  onPress?: () => void;
};

export function IndexCard({ index, onPress }: IndexCardProps) {
  const { theme } = useTheme();
  const isPositive = index.changePercent >= 0;

  return (
    <FeedCard onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.symbol, { color: theme.text }]}>
          📈 {index.symbol}
        </Text>
      </View>
      <Text style={[styles.name, { color: theme.textSecondary }]}>
        {index.name}
      </Text>

      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.text }]}>
          {index.points.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}{' '}
          pts
        </Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: isPositive ? '#10B981' : '#EF4444' },
          ]}
        >
          <Text style={styles.changeText}>
            {isPositive ? '▲' : '▼'} {Math.abs(index.changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>

      <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
        Atualizado às{' '}
        {index.updatedAt.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 4,
  },
  symbol: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
  },
  name: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  price: {
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
  timestamp: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
});
