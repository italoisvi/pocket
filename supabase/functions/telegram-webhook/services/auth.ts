import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  TelegramUserId,
  UserId,
  TelegramAccountRow,
  TelegramUser,
} from '../types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function findTelegramAccount(
  telegramUserId: TelegramUserId
): Promise<TelegramAccountRow | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('telegram_accounts')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[auth] Error finding telegram account:', error);
    throw error;
  }

  return data as TelegramAccountRow | null;
}

export async function createTelegramUser(
  telegramUser: TelegramUser
): Promise<{ telegramAccount: TelegramAccountRow; userId: UserId }> {
  const supabase = getServiceClient();
  const telegramUserId = telegramUser.id as TelegramUserId;

  const email = `tg_${telegramUserId}@pocket.telegram`;
  const password = crypto.randomUUID();

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        telegram_user_id: telegramUserId,
        telegram_username: telegramUser.username,
        telegram_first_name: telegramUser.first_name,
      },
    });

  if (authError) {
    console.error('[auth] Error creating user:', authError);
    throw authError;
  }

  const userId = authData.user.id as UserId;

  const { data: telegramAccount, error: accountError } = await supabase
    .from('telegram_accounts')
    .insert({
      telegram_user_id: telegramUserId,
      telegram_username: telegramUser.username || null,
      telegram_first_name: telegramUser.first_name,
      user_id: userId,
      is_primary_channel: true,
      onboarding_completed: false,
      onboarding_step: 'welcome',
    })
    .select()
    .single();

  if (accountError) {
    console.error('[auth] Error creating telegram account:', accountError);
    await supabase.auth.admin.deleteUser(userId);
    throw accountError;
  }

  await supabase.from('telegram_conversations').insert({
    telegram_account_id: telegramAccount.id,
    messages: [],
  });

  console.log(
    `[auth] Created new user ${userId} for telegram user ${telegramUserId}`
  );

  return {
    telegramAccount: telegramAccount as TelegramAccountRow,
    userId,
  };
}

export async function linkTelegramToExistingUser(
  telegramUser: TelegramUser,
  linkCode: string
): Promise<{
  success: boolean;
  message: string;
  telegramAccount?: TelegramAccountRow;
}> {
  const supabase = getServiceClient();
  const telegramUserId = telegramUser.id as TelegramUserId;

  const { data: codeData, error: codeError } = await supabase
    .from('link_codes')
    .select('*')
    .eq('code', linkCode.toUpperCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (codeError || !codeData) {
    return {
      success: false,
      message: 'Código inválido ou expirado. Gere um novo código no app.',
    };
  }

  const existingAccount = await findTelegramAccount(telegramUserId);
  if (existingAccount) {
    return {
      success: false,
      message: 'Este Telegram já está vinculado a uma conta.',
    };
  }

  const { data: telegramAccount, error: accountError } = await supabase
    .from('telegram_accounts')
    .insert({
      telegram_user_id: telegramUserId,
      telegram_username: telegramUser.username || null,
      telegram_first_name: telegramUser.first_name,
      user_id: codeData.user_id,
      is_primary_channel: false,
      onboarding_completed: true,
      onboarding_step: 'completed',
    })
    .select()
    .single();

  if (accountError) {
    console.error('[auth] Error linking telegram account:', accountError);
    return {
      success: false,
      message: 'Erro ao vincular conta. Tente novamente.',
    };
  }

  await supabase
    .from('link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', codeData.id);

  await supabase.from('telegram_conversations').insert({
    telegram_account_id: telegramAccount.id,
    messages: [],
  });

  console.log(
    `[auth] Linked telegram user ${telegramUserId} to existing user ${codeData.user_id}`
  );

  return {
    success: true,
    message:
      'Conta vinculada com sucesso! Agora você pode usar o Pocket pelo Telegram.',
    telegramAccount: telegramAccount as TelegramAccountRow,
  };
}

export async function updateTelegramAccount(
  telegramAccountId: string,
  updates: Partial<TelegramAccountRow>
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from('telegram_accounts')
    .update(updates)
    .eq('id', telegramAccountId);

  if (error) {
    console.error('[auth] Error updating telegram account:', error);
    throw error;
  }
}
