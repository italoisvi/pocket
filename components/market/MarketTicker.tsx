import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { useMarketData, type MarketIndicator } from '@/hooks/useMarketData';

const ANIMATION_SPEED = 30; // pixels por segundo

export function MarketTicker() {
  const { theme } = useTheme();
  const { data, loading } = useMarketData();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const handleContentLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== contentWidth) {
      setContentWidth(width);
    }
  };

  useEffect(() => {
    if (contentWidth === 0 || data.length === 0) return;

    // Para animação anterior
    if (animationRef.current) {
      animationRef.current.stop();
    }

    // Reset para a posição inicial (fora da tela à direita)
    scrollX.setValue(0);

    // Duração baseada na largura do conteúdo
    const duration = (contentWidth / ANIMATION_SPEED) * 1000;

    // Cria animação em loop
    const animate = () => {
      scrollX.setValue(0);
      animationRef.current = Animated.timing(scrollX, {
        toValue: -contentWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });

      animationRef.current.start(({ finished }) => {
        if (finished) {
          animate(); // Loop
        }
      });
    };

    animate();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [contentWidth, data.length, scrollX]);

  if (loading && data.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.card }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Carregando mercado...
          </Text>
        </View>
      </View>
    );
  }

  if (data.length === 0) {
    return null;
  }

  // Duplica os dados para criar efeito de loop suave
  const tickerData = [...data, ...data];

  return (
    <View style={[styles.container, { backgroundColor: theme.card }]}>
      <View style={styles.tickerWrapper}>
        <Animated.View
          style={[
            styles.tickerContent,
            { transform: [{ translateX: scrollX }] },
          ]}
          onLayout={handleContentLayout}
        >
          {tickerData.map((item, index) => (
            <TickerItem key={`${item.symbol}-${index}`} item={item} />
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

function TickerItem({ item }: { item: MarketIndicator }) {
  const { theme } = useTheme();
  const isPositive = item.changePercent >= 0;
  const changeColor = isPositive ? '#10B981' : '#EF4444';

  const formatPrice = (price: number, symbol: string) => {
    if (symbol === 'USDBRL') {
      return `R$ ${price.toFixed(2)}`;
    }
    if (symbol === 'BTCUSDT') {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return price.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  };

  return (
    <View style={styles.tickerItem}>
      <Text style={[styles.symbolText, { color: theme.text }]}>
        {item.displaySymbol}
      </Text>
      <Text style={[styles.priceText, { color: theme.text }]}>
        {formatPrice(item.price, item.symbol)}
      </Text>
      <View
        style={[styles.changeBadge, { backgroundColor: `${changeColor}20` }]}
      >
        <Text style={[styles.changeText, { color: changeColor }]}>
          {isPositive ? '+' : ''}
          {item.changePercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  tickerWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  tickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  symbolText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
  },
  priceText: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  changeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changeText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
  },
});
