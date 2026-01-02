import { VisaIcon } from '@/components/VisaIcon';
import { MastercardIcon } from '@/components/MastercardIcon';
import { EloIcon } from '@/components/EloIcon';
import { CreditCardIcon } from '@/components/CreditCardIcon';

export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'elo'
  | 'amex'
  | 'hipercard'
  | 'generic';

export function detectCardBrand(cardName: string): CardBrand {
  const nameLower = cardName.toLowerCase();

  // Ordem de prioridade: palavras-chave mais específicas primeiro
  if (nameLower.includes('visa')) return 'visa';
  if (nameLower.includes('master') || nameLower.includes('platinum'))
    return 'mastercard';
  if (nameLower.includes('elo') || nameLower.includes('gold')) return 'elo';
  if (nameLower.includes('amex') || nameLower.includes('american'))
    return 'amex';
  if (nameLower.includes('hiper')) return 'hipercard';

  return 'generic';
}

type CardBrandIconProps = {
  cardName: string;
  size?: number;
};

export function CardBrandIcon({ cardName, size = 40 }: CardBrandIconProps) {
  const brand = detectCardBrand(cardName);

  switch (brand) {
    case 'visa':
      return <VisaIcon size={size} />;
    case 'mastercard':
      return <MastercardIcon size={size} />;
    case 'elo':
      return <EloIcon size={size} />;
    case 'amex':
      return <CreditCardIcon size={size} color="#006FCF" />;
    case 'hipercard':
      return <CreditCardIcon size={size} color="#EC1C24" />;
    default:
      return <CreditCardIcon size={size} />;
  }
}
