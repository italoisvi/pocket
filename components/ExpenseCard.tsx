import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/formatCurrency';
import { CATEGORIES, type ExpenseCategory } from '@/lib/categories';
import { CategoryIcon } from '@/components/CategoryIcon';

type ExpenseCardProps = {
  id: string;
  establishmentName: string;
  amount: number;
  date: string;
  category: string;
  subcategory?: string;
  isCash?: boolean;
  onPress: () => void;
};

export function ExpenseCard({
  establishmentName,
  amount,
  category,
  subcategory,
  isCash,
  onPress,
}: ExpenseCardProps) {
  const { theme } = useTheme();
  const currentDate = new Date().toLocaleDateString('pt-BR');
  const categoryInfo = CATEGORIES[category as ExpenseCategory];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadow,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.topSection}>
        {categoryInfo && (
          <CategoryIcon
            categoryInfo={categoryInfo}
            size={32}
            subcategory={subcategory}
          />
        )}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, { color: theme.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {establishmentName}
            </Text>
            {isCash && (
              <View
                style={[
                  styles.cashBadge,
                  {
                    backgroundColor:
                      theme.background === '#000'
                        ? 'rgba(76, 175, 80, 0.2)'
                        : '#4CAF50',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cashBadgeText,
                    {
                      color: theme.background === '#000' ? '#4CAF50' : '#fff',
                    },
                  ]}
                >
                  Dinheiro
                </Text>
              </View>
            )}
          </View>
          {subcategory && (
            <Text style={[styles.subcategory, { color: theme.primary }]}>
              {subcategory}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.bottomSection}>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {currentDate}
        </Text>
        <Text style={[styles.amount, { color: theme.text }]}>
          {formatCurrency(amount)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
    flexShrink: 1,
  },
  cashBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cashBadgeText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
    textTransform: 'uppercase',
  },
  subcategory: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  date: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    flexShrink: 1,
  },
  amount: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    flexShrink: 0,
    marginLeft: 8,
  },
});
