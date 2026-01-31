import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { StockQuote } from '@/types/feed';

type StockQuoteCardProps = {
  quote: StockQuote;
  onPress?: () => void;
};

export function StockQuoteCard({ quote, onPress }: StockQuoteCardProps) {
  const { theme } = useTheme();
  const isPositive = quote.changePercent >= 0;

  return (
    <FeedCard onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.symbol, { color: theme.text }]}>
          {quote.symbol}
        </Text>
        <Text style={[styles.name, { color: theme.textSecondary }]}>
          {quote.name}
        </Text>
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.text }]}>
          R$ {quote.price.toFixed(2)}
        </Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: isPositive ? '#10B981' : '#EF4444' },
          ]}
        >
          <Text style={styles.changeText}>
            {isPositive ? '▲' : '▼'} {Math.abs(quote.changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>

      <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
        Atualizado às{' '}
        {quote.updatedAt.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  symbol: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
  },
  name: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    flex: 1,
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
