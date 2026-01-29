import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatCurrency } from '../utils/format.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

type IncomeCard = {
  id: string;
  salary: string;
  paymentDay: string;
  incomeSource: string;
};

export type ProfileSummary = {
  name: string | null;
  income: string | null;
  incomeSource: string | null;
  paymentDay: string | null;
  connectedBanks: number;
};

export type BankInfo = {
  name: string;
  balance: string;
  lastSync: string;
};

export async function getProfileSummary(
  userId: string
): Promise<ProfileSummary> {
  const supabase = getServiceClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, income_cards')
    .eq('id', userId)
    .single();

  const { count: bankCount } = await supabase
    .from('pluggy_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const incomeCards = (profile?.income_cards || []) as IncomeCard[];
  const primaryCard = incomeCards[0];

  return {
    name: profile?.name || null,
    income: primaryCard?.salary
      ? formatCurrency(parseFloat(primaryCard.salary))
      : null,
    incomeSource: primaryCard?.incomeSource || null,
    paymentDay: primaryCard?.paymentDay
      ? `Dia ${primaryCard.paymentDay}`
      : null,
    connectedBanks: bankCount || 0,
  };
}

export async function getUserBanks(userId: string): Promise<BankInfo[]> {
  const supabase = getServiceClient();

  const { data: accounts } = await supabase
    .from('pluggy_accounts')
    .select(
      `
      id,
      name,
      balance,
      last_sync_at,
      pluggy_items!inner (
        connector_name
      )
    `
    )
    .eq('user_id', userId);

  if (!accounts || accounts.length === 0) {
    return [];
  }

  return accounts.map((account: any) => ({
    name:
      account.pluggy_items?.connector_name || account.name || 'Conta bancária',
    balance: account.balance !== null ? formatCurrency(account.balance) : 'N/A',
    lastSync: account.last_sync_at
      ? formatRelativeDate(new Date(account.last_sync_at))
      : 'Nunca',
  }));
}

export async function updateProfileField(
  userId: string,
  field: string,
  value: string
): Promise<boolean> {
  const supabase = getServiceClient();

  if (field === 'name') {
    const { error } = await supabase
      .from('profiles')
      .update({ name: value })
      .eq('id', userId);
    return !error;
  }

  if (
    field === 'income' ||
    field === 'incomeSource' ||
    field === 'paymentDay'
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('income_cards')
      .eq('id', userId)
      .single();

    const incomeCards = (profile?.income_cards || []) as IncomeCard[];

    if (incomeCards.length === 0) {
      incomeCards.push({
        id: crypto.randomUUID(),
        salary: '0',
        paymentDay: '1',
        incomeSource: 'Outros',
      });
    }

    const card = incomeCards[0];

    if (field === 'income') {
      card.salary = value;
    } else if (field === 'incomeSource') {
      card.incomeSource = value;
    } else if (field === 'paymentDay') {
      card.paymentDay = value;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ income_cards: incomeCards })
      .eq('id', userId);

    return !error;
  }

  return false;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins} min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;

  return date.toLocaleDateString('pt-BR');
}
