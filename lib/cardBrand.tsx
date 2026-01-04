import { VisaIcon } from '@/components/VisaIcon';
import { MastercardIcon } from '@/components/MastercardIcon';
import { EloIcon } from '@/components/EloIcon';
import { AmexIcon } from '@/components/AmexIcon';
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
  if (nameLower.includes('amex') || nameLower.includes('american'))
    return 'amex';
  if (
    nameLower.includes('master') ||
    nameLower.includes('platinum') ||
    nameLower.includes('black')
  )
    return 'mastercard';
  if (nameLower.includes('hiper')) return 'hipercard';

  // Elo é usado principalmente no Brasil
  if (nameLower.includes('elo')) return 'elo';

  // Mapeamento de bancos brasileiros para bandeiras mais comuns
  // Nubank, Inter, Next, C6: Mastercard
  if (
    nameLower.includes('nubank') ||
    nameLower.includes('roxinho') ||
    nameLower.includes('inter') ||
    nameLower.includes('next') ||
    nameLower.includes('c6')
  ) {
    return 'mastercard';
  }

  // Santander: pode ser Visa ou Mastercard (default Mastercard para SX)
  if (nameLower.includes('santander')) {
    if (nameLower.includes('sx')) return 'mastercard';
    return 'visa';
  }

  // Bradesco: geralmente Elo ou Visa
  if (nameLower.includes('bradesco')) {
    if (
      nameLower.includes('prime') ||
      nameLower.includes('infinite') ||
      nameLower.includes('gold')
    )
      return 'elo';
    return 'visa';
  }

  // Itaú: geralmente Visa ou Mastercard
  if (nameLower.includes('itau') || nameLower.includes('itaú')) {
    return 'visa';
  }

  // Caixa: geralmente Mastercard ou Elo
  if (nameLower.includes('caixa')) {
    return 'elo';
  }

  // Banco do Brasil: geralmente Visa ou Ourocard (Mastercard)
  if (nameLower.includes('bb ') || nameLower.includes('ourocard')) {
    if (nameLower.includes('ourocard')) return 'mastercard';
    return 'visa';
  }

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
      return <AmexIcon size={size} />;
    case 'hipercard':
      return <CreditCardIcon size={size} color="#EC1C24" />;
    default:
      return <CreditCardIcon size={size} />;
  }
}
