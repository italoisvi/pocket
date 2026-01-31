import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { CryptoQuote } from '@/types/feed';

type CryptoCardProps = {
  crypto: CryptoQuote;
  onPress?: () => void;
};

export function CryptoCard({ crypto, onPress }: CryptoCardProps) {
  const { theme } = useTheme();
  const isPositive = crypto.change24h >= 0;

  return (
    <FeedCard onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.symbol, { color: theme.text }]}>
          🪙 {crypto.symbol}
        </Text>
        <Text style={[styles.name, { color: theme.textSecondary }]}>
          {crypto.name}
        </Text>
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.text }]}>
          R${' '}
          {crypto.price.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: isPositive ? '#10B981' : '#EF4444' },
          ]}
        >
          <Text style={styles.changeText}>
            {isPositive ? '▲' : '▼'} {Math.abs(crypto.change24h).toFixed(2)}%
          </Text>
        </View>
      </View>

      <Text style={[styles.label, { color: theme.textSecondary }]}>24h</Text>
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
    marginBottom: 4,
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
  label: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
});
