import { Text } from 'react-native';
import { HouseIcon } from './HouseIcon';
import { RestaurantIcon } from './RestaurantIcon';
import { ShoppingBasketIcon } from './ShoppingBasketIcon';
import { TransporteIcon } from './TransporteIcon';
import { SaudeIcon } from './SaudeIcon';
import { EducacaoIcon } from './EducacaoIcon';
import { LazerIcon } from './LazerIcon';
import { VestuarioIcon } from './VestuarioIcon';
import { BelezaIcon } from './BelezaIcon';
import { EletronicosIcon } from './EletronicosIcon';
import { PoupancaIcon } from './PoupancaIcon';
import { PrevidenciaIcon } from './PrevidenciaIcon';
import { InvestimentosIcon } from './InvestimentosIcon';
import { CartaoIcon } from './CartaoIcon';
import { EmprestimosIcon } from './EmprestimosIcon';
import { FinanciamentosIcon } from './FinanciamentosIcon';
import { TransferenciasIcon } from './TransferenciasIcon';
import { OutrosIcon } from './OutrosIcon';
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
  // Usar a cor da categoria se não for fornecida uma cor customizada
  const iconColor = color || categoryInfo.color;

  // Se o tipo de ícone é componente, renderizar o componente correspondente
  if (categoryInfo.iconType === 'component') {
    switch (categoryInfo.icon) {
      case 'house':
        return <HouseIcon size={size} color={iconColor} />;
      case 'restaurant':
        return <RestaurantIcon size={size} color={iconColor} />;
      case 'shopping-basket':
        return <ShoppingBasketIcon size={size} color={iconColor} />;
      case 'transporte':
        return <TransporteIcon size={size} color={iconColor} />;
      case 'saude':
        return <SaudeIcon size={size} color={iconColor} />;
      case 'educacao':
        return <EducacaoIcon size={size} color={iconColor} />;
      case 'lazer':
        return <LazerIcon size={size} color={iconColor} />;
      case 'vestuario':
        return <VestuarioIcon size={size} color={iconColor} />;
      case 'beleza':
        return <BelezaIcon size={size} color={iconColor} />;
      case 'eletronicos':
        return <EletronicosIcon size={size} color={iconColor} />;
      case 'poupanca':
        return <PoupancaIcon size={size} color={iconColor} />;
      case 'previdencia':
        return <PrevidenciaIcon size={size} color={iconColor} />;
      case 'investimentos':
        return <InvestimentosIcon size={size} color={iconColor} />;
      case 'cartao':
        return <CartaoIcon size={size} color={iconColor} />;
      case 'emprestimos':
        return <EmprestimosIcon size={size} color={iconColor} />;
      case 'financiamentos':
        return <FinanciamentosIcon size={size} color={iconColor} />;
      case 'transferencias':
        return <TransferenciasIcon size={size} color={iconColor} />;
      case 'outros':
        return <OutrosIcon size={size} color={iconColor} />;
      default:
        // Fallback para emoji se o componente não existir
        return <Text style={{ fontSize: size }}>{categoryInfo.icon}</Text>;
    }
  }

  // Se o tipo de ícone é emoji ou não especificado, renderizar como texto
  return <Text style={{ fontSize: size }}>{categoryInfo.icon}</Text>;
}
