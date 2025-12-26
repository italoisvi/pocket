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
  onPress: () => void;
};

export function ExpenseCard({
  establishmentName,
  amount,
  category,
  subcategory,
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
      <View style={styles.leftSection}>
        {categoryInfo && <CategoryIcon categoryInfo={categoryInfo} size={32} />}
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>
            {establishmentName}
          </Text>
          {subcategory && (
            <Text style={[styles.subcategory, { color: theme.primary }]}>
              {subcategory}
            </Text>
          )}
          <Text style={[styles.date, { color: theme.textSecondary }]}>
            {currentDate}
          </Text>
        </View>
      </View>
      <Text style={[styles.amount, { color: theme.text }]}>
        {formatCurrency(amount)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
  },
  subcategory: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-Medium',
    marginBottom: 2,
  },
  date: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
  },
  amount: {
    fontSize: 22,
    fontFamily: 'CormorantGaramond-Bold',
  },
});
