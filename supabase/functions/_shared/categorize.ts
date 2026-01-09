/**
 * Categorização de transações
 * Este arquivo é compartilhado entre o app e as Edge Functions
 */

// Detecta se um texto é um nome de pessoa física
export function isPessoaFisica(text: string): boolean {
  const textLower = text.toLowerCase();

  // Indicadores que NÃO é pessoa física (empresas/estabelecimentos)
  const empresaIndicators = [
    'ltda',
    'me',
    'epp',
    'eireli',
    's.a',
    's/a',
    'sa ',
    'sociedade',
    'comercio',
    'comércio',
    'servicos',
    'serviços',
    'supermercado',
    'loja',
    'restaurante',
    'farmacia',
    'farmácia',
    'hospital',
    'clinica',
    'clínica',
    'posto',
    'shopping',
    'mercado',
    'bar',
    'padaria',
    'magazine',
    'distribuidora',
    'atacado',
    'varejo',
    'delivery',
    'ifood',
    'uber',
  ];

  for (const indicator of empresaIndicators) {
    if (textLower.includes(indicator)) {
      return false;
    }
  }

  // Remover palavras comuns de transação para análise
  const cleanText = text
    .replace(/pix/gi, '')
    .replace(/transferencia|transferência/gi, '')
    .replace(/enviado|recebido|para|de/gi, '')
    .trim();

  // Verificar se tem formato de nome de pessoa (2-4 palavras)
  const words = cleanText.split(/\s+/).filter((w) => w.length > 1);

  // Nome de pessoa geralmente tem entre 2 e 4 palavras
  // e cada palavra tem entre 2 e 15 caracteres
  if (words.length >= 2 && words.length <= 4) {
    const allWordsValidLength = words.every(
      (w) => w.length >= 2 && w.length <= 15
    );

    // Verificar se a maioria das palavras começa com maiúscula (nome próprio)
    const capitalizedWords = words.filter((w) => /^[A-Z]/.test(w));
    const mostlyCapitalized = capitalizedWords.length >= words.length * 0.5;

    return allWordsValidLength && mostlyCapitalized;
  }

  return false;
}

/**
 * Categoriza uma transação da Pluggy
 * Retorna null se não for PIX para pessoa física
 */
export function categorizePluggyTransaction(transaction: {
  description: string;
  category?: string | null;
  paymentData?: {
    payer?: { name?: string };
    receiver?: { name?: string };
  };
}): { category: string; subcategory: string } | null {
  const pluggyCategory = transaction.category?.toLowerCase();

  // Verificar se é PIX
  if (pluggyCategory === 'pix') {
    // PIX enviado: verifica se o receiver é pessoa física
    const receiverName = transaction.paymentData?.receiver?.name;
    if (receiverName && isPessoaFisica(receiverName)) {
      console.log(
        '[categorizePluggyTransaction] PIX enviado para pessoa física:',
        {
          receiverName,
        }
      );

      return {
        category: 'dividas_pessoais',
        subcategory: 'PIX Pessoa Física',
      };
    }

    // PIX recebido: verifica se o payer é pessoa física
    const payerName = transaction.paymentData?.payer?.name;
    if (payerName && isPessoaFisica(payerName)) {
      console.log(
        '[categorizePluggyTransaction] PIX recebido de pessoa física:',
        {
          payerName,
        }
      );

      return {
        category: 'dividas_pessoais',
        subcategory: 'PIX Pessoa Física',
      };
    }
  }

  // Fallback: verificar se a descrição parece ser nome de pessoa
  if (isPessoaFisica(transaction.description)) {
    const nameLower = transaction.description.toLowerCase();
    const subcategory = nameLower.includes('pix')
      ? 'PIX Pessoa Física'
      : 'Transferência Pessoa Física';

    console.log(
      '[categorizePluggyTransaction] Detectado como pessoa física pela descrição:',
      {
        description: transaction.description,
        subcategory,
      }
    );

    return {
      category: 'dividas_pessoais',
      subcategory,
    };
  }

  return null;
}
