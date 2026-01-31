import { View, Text, StyleSheet } from 'react-native';
import { FeedCard } from './FeedCard';
import { useTheme } from '@/lib/theme';
import type { InsightItem } from '@/types/feed';

type InsightCardProps = {
  insight: InsightItem;
  onPress?: () => void;
};

export function InsightCard({ insight, onPress }: InsightCardProps) {
  const { theme } = useTheme();

  const getIcon = () => {
    switch (insight.type) {
      case 'tip':
        return '💡';
      case 'alert':
        return '⚠️';
      case 'opportunity':
        return '🎯';
      default:
        return '💡';
    }
  };

  const getBackgroundColor = () => {
    switch (insight.type) {
      case 'tip':
        return '#3B82F6';
      case 'alert':
        return '#F59E0B';
      case 'opportunity':
        return '#10B981';
      default:
        return '#3B82F6';
    }
  };

  return (
    <FeedCard onPress={onPress}>
      <View style={[styles.badge, { backgroundColor: getBackgroundColor() }]}>
        <Text style={styles.badgeText}>{getIcon()} Insight do Walts</Text>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{insight.title}</Text>

      <Text style={[styles.content, { color: theme.textSecondary }]}>
        {insight.content}
      </Text>
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  title: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
    marginBottom: 8,
    lineHeight: 24,
  },
  content: {
    fontSize: 15,
    fontFamily: 'DMSans-Regular',
    lineHeight: 22,
  },
});
