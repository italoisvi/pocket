import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';
import { getCardShadowStyle } from '@/lib/cardStyles';
import type { ActionCard, ActionCardAction } from '@/lib/agent-worker';

type AgentActionCardProps = {
  card: ActionCard;
  onDismiss: (id: string) => void;
  onAction: (action: ActionCardAction) => void;
};

export function AgentActionCard({
  card,
  onDismiss,
  onAction,
}: AgentActionCardProps) {
  const { theme } = useTheme();
  const isDarkMode = theme.background === '#000';

  const priorityColors = {
    high: '#FF4444',
    medium: '#FFAA00',
    low: theme.primary,
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          borderLeftColor: priorityColors[card.priority],
        },
        getCardShadowStyle(isDarkMode),
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: theme.text }]}>
            {card.title}
          </Text>
        </View>
        {card.dismissible && (
          <TouchableOpacity
            onPress={() => onDismiss(card.id)}
            style={styles.dismissButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.dismissText, { color: theme.textSecondary }]}>
              x
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {card.message}
      </Text>

      <View style={styles.actionsContainer}>
        {card.actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onAction(action)}
            style={[
              styles.actionButton,
              index === 0
                ? {
                    backgroundColor: isDarkMode ? theme.card : theme.primary,
                    borderColor: isDarkMode ? theme.cardBorder : theme.primary,
                  }
                : {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
            ]}
          >
            <Text
              style={[
                styles.actionText,
                {
                  color:
                    index === 0
                      ? isDarkMode
                        ? theme.text
                        : '#FFF'
                      : theme.text,
                },
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 2,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'CormorantGaramond-SemiBold',
    lineHeight: 22,
  },
  dismissButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 20,
    fontFamily: 'CormorantGaramond-Regular',
  },
  message: {
    fontSize: 16,
    fontFamily: 'CormorantGaramond-Regular',
    lineHeight: 22,
    marginBottom: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
  },
  actionText: {
    fontSize: 14,
    fontFamily: 'CormorantGaramond-SemiBold',
  },
});
