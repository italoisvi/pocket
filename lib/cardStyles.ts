import { ViewStyle } from 'react-native';

/**
 * Standard card shadow styles for both light and dark modes
 * Use this to maintain consistent card appearance across the app
 */
export const getCardShadowStyle = (isDark: boolean): ViewStyle => ({
  shadowColor: isDark ? '#fff' : '#000',
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: isDark ? 0.15 : 0.1,
  shadowRadius: 4,
  elevation: 4,
});
