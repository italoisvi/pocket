import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCardShadowStyle } from '@/lib/cardStyles';

type BudgetCardProps = {
  title: string;
  spent: number;
  limit: number;
  periodType: 'monthly' | 'weekly' | 'yearly';
};

export function BudgetCard({
  title,
  spent,
  limit,
  periodType,
}: BudgetCardProps) {
  const { theme, isDark } = useTheme();

  const percentage = limit > 0 ? (spent / limit) * 100 : 0;
  const remaining = limit - spent;
  const isOverBudget = spent > limit;

  const getProgressColor = () => {
    if (isOverBudget) return '#EF5350';
    if (percentage >= 80) return '#FFB74D';
    return '#66BB6A';
  };

  const getPeriodLabel = () => {
    switch (periodType) {
      case 'weekly':
        return 'Semanal';
      case 'yearly':
        return 'Anual';
      default:
        return 'Mensal';
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
        },
        getCardShadowStyle(isDark),
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.periodBadge, { color: theme.textSecondary }]}>
          {getPeriodLabel()}
        </Text>
      </View>

      <View style={styles.amounts}>
        <View style={styles.amountRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Gasto
          </Text>
          <Text
            style={[
              styles.value,
              { color: isOverBudget ? '#EF5350' : theme.text },
            ]}
          >
            {formatCurrency(spent)}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Limite
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {formatCurrency(limit)}
          </Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View
          style={[
            styles.progressBarBackground,
            { backgroundColor: theme.border },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: getProgressColor(),
              },
            ]}
          />
        </View>
        <View style={styles.progressInfo}>
          <Text style={[styles.percentage, { color: getProgressColor() }]}>
            {percentage.toFixed(0)}%
          </Text>
          <Text
            style={[
              styles.remaining,
              {
                color: isOverBudget ? '#EF5350' : theme.textSecondary,
              },
            ]}
          >
            {isOverBudget
              ? `Excedido em ${formatCurrency(Math.abs(remaining))}`
              : `Restam ${formatCurrency(remaining)}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  periodBadge: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  amounts: {
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
  },
  value: {
    fontSize: 18,
    fontFamily: 'DMSans-SemiBold',
  },
  progressSection: {
    gap: 8,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentage: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  remaining: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
});
