import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/formatCurrency';

type ExpenseCardProps = {
  id: string;
  establishmentName: string;
  amount: number;
  date: string;
  onPress: () => void;
};

export function ExpenseCard({
  establishmentName,
  amount,
  date,
  onPress,
}: ExpenseCardProps) {
  const { theme } = useTheme();
  const formattedDate = new Date(date).toLocaleDateString('pt-BR');

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
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          {establishmentName}
        </Text>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {formattedDate}
        </Text>
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
  content: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-SemiBold',
    marginBottom: 4,
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
