import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';

type FeedCardProps = {
  children: React.ReactNode;
  onPress?: () => void;
};

export function FeedCard({ children, onPress }: FeedCardProps) {
  const { theme, isDark } = useTheme();

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: isDark ? '#fff' : '#000',
        },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});
