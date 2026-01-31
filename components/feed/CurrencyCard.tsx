import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { CurrencyQuote } from '@/types/feed';

type CurrencyCardProps = {
  currency: CurrencyQuote;
  onPress?: () => void;
};

export function CurrencyCard({ currency, onPress }: CurrencyCardProps) {
  const { theme } = useTheme();
  const isPositive = currency.changePercent >= 0;

  return (
    <FeedCard onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.code, { color: theme.text }]}>
          💱 {currency.code}
        </Text>
        <Text style={[styles.name, { color: theme.textSecondary }]}>
          {currency.name}
        </Text>
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.text }]}>
          R$ {currency.buyPrice.toFixed(4)}
        </Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: isPositive ? '#10B981' : '#EF4444' },
          ]}
        >
          <Text style={styles.changeText}>
            {isPositive ? '▲' : '▼'}{' '}
            {Math.abs(currency.changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>

      <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
        PTAX - {currency.updatedAt.toLocaleDateString('pt-BR')}
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
  code: {
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
