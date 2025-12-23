import { Text } from 'react-native';
import { HouseIcon } from './HouseIcon';
import { RestaurantIcon } from './RestaurantIcon';
import type { CategoryInfo } from '@/lib/categories';

type CategoryIconProps = {
  categoryInfo: CategoryInfo;
  size?: number;
  color?: string;
};

export function CategoryIcon({
  categoryInfo,
  size = 24,
  color,
}: CategoryIconProps) {
  // Se o tipo de ícone é componente, renderizar o componente correspondente
  if (categoryInfo.iconType === 'component') {
    const iconColor = color || categoryInfo.color;

    switch (categoryInfo.icon) {
      case 'house':
        return <HouseIcon size={size} color={iconColor} />;
      case 'restaurant':
        return <RestaurantIcon size={size} color={iconColor} />;
      default:
        // Fallback para emoji se o componente não existir
        return <Text style={{ fontSize: size }}>{categoryInfo.icon}</Text>;
    }
  }

  // Se o tipo de ícone é emoji ou não especificado, renderizar como texto
  return <Text style={{ fontSize: size }}>{categoryInfo.icon}</Text>;
}
