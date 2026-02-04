export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          name: string | null;
          avatar_url: string | null;
          kiwify_access_until: string | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          name?: string | null;
          avatar_url?: string | null;
          kiwify_access_until?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string | null;
          avatar_url?: string | null;
          kiwify_access_until?: string | null;
        };
      };
      kiwify_purchases: {
        Row: {
          id: string;
          transaction_id: string;
          email: string;
          product_name: string;
          status: string;
          purchased_at: string;
          access_until: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          email: string;
          product_name: string;
          status: string;
          purchased_at: string;
          access_until: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          email?: string;
          product_name?: string;
          status?: string;
          purchased_at?: string;
          access_until?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          messages: Json;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          messages: Json;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          messages?: Json;
          created_at?: number;
          updated_at?: number;
        };
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          establishment_name: string;
          amount: number;
          date: string;
          items: Json;
          image_url: string | null;
          notes: string | null;
          category: string | null;
          subcategory: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          establishment_name: string;
          amount: number;
          date: string;
          items?: Json;
          image_url?: string | null;
          notes?: string | null;
          category?: string | null;
          subcategory?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          establishment_name?: string;
          amount?: number;
          date?: string;
          items?: Json;
          image_url?: string | null;
          notes?: string | null;
          category?: string | null;
          subcategory?: string | null;
        };
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          amount: string;
          period_type: 'monthly' | 'weekly' | 'yearly';
          start_date: string;
          end_date: string | null;
          rollover_enabled: boolean;
          notifications_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          amount: string;
          period_type: 'monthly' | 'weekly' | 'yearly';
          start_date: string;
          end_date?: string | null;
          rollover_enabled?: boolean;
          notifications_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          amount?: string;
          period_type?: 'monthly' | 'weekly' | 'yearly';
          start_date?: string;
          end_date?: string | null;
          rollover_enabled?: boolean;
          notifications_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      telegram_accounts: {
        Row: {
          id: string;
          telegram_user_id: number;
          telegram_username: string | null;
          telegram_first_name: string | null;
          user_id: string;
          is_primary_channel: boolean;
          onboarding_completed: boolean;
          onboarding_step: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_user_id: number;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          user_id: string;
          is_primary_channel?: boolean;
          onboarding_completed?: boolean;
          onboarding_step?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_user_id?: number;
          telegram_username?: string | null;
          telegram_first_name?: string | null;
          user_id?: string;
          is_primary_channel?: boolean;
          onboarding_completed?: boolean;
          onboarding_step?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      telegram_conversations: {
        Row: {
          id: string;
          telegram_account_id: string;
          messages: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_account_id: string;
          messages?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_account_id?: string;
          messages?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      link_codes: {
        Row: {
          id: string;
          code: string;
          user_id: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          user_id: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          user_id?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
      };
      belvo_links: {
        Row: {
          id: string;
          belvo_link_id: string;
          user_id: string;
          institution_name: string;
          institution_type: string | null;
          access_mode: string;
          status: string;
          created_at: string;
          last_accessed_at: string | null;
          refresh_rate: string | null;
          external_id: string | null;
        };
        Insert: {
          id?: string;
          belvo_link_id: string;
          user_id: string;
          institution_name: string;
          institution_type?: string | null;
          access_mode?: string;
          status?: string;
          created_at?: string;
          last_accessed_at?: string | null;
          refresh_rate?: string | null;
          external_id?: string | null;
        };
        Update: {
          id?: string;
          belvo_link_id?: string;
          user_id?: string;
          institution_name?: string;
          institution_type?: string | null;
          access_mode?: string;
          status?: string;
          created_at?: string;
          last_accessed_at?: string | null;
          refresh_rate?: string | null;
          external_id?: string | null;
        };
      };
      belvo_accounts: {
        Row: {
          id: string;
          belvo_account_id: string;
          user_id: string;
          link_id: string;
          category: string;
          type: string | null;
          name: string;
          agency: string | null;
          number: string | null;
          balance_current: number | null;
          balance_available: number | null;
          currency: string;
          credit_limit: number | null;
          credit_available: number | null;
          credit_used: number | null;
          last_sync_at: string | null;
          created_at: string;
          institution_name: string | null;
        };
        Insert: {
          id?: string;
          belvo_account_id: string;
          user_id: string;
          link_id: string;
          category: string;
          type?: string | null;
          name: string;
          agency?: string | null;
          number?: string | null;
          balance_current?: number | null;
          balance_available?: number | null;
          currency?: string;
          credit_limit?: number | null;
          credit_available?: number | null;
          credit_used?: number | null;
          last_sync_at?: string | null;
          created_at?: string;
          institution_name?: string | null;
        };
        Update: {
          id?: string;
          belvo_account_id?: string;
          user_id?: string;
          link_id?: string;
          category?: string;
          type?: string | null;
          name?: string;
          agency?: string | null;
          number?: string | null;
          balance_current?: number | null;
          balance_available?: number | null;
          currency?: string;
          credit_limit?: number | null;
          credit_available?: number | null;
          credit_used?: number | null;
          last_sync_at?: string | null;
          created_at?: string;
          institution_name?: string | null;
        };
      };
      belvo_transactions: {
        Row: {
          id: string;
          belvo_transaction_id: string;
          user_id: string;
          account_id: string;
          description: string;
          amount: number;
          type: string;
          status: string | null;
          category: string | null;
          subcategory: string | null;
          reference: string | null;
          balance: number | null;
          value_date: string;
          accounting_date: string | null;
          currency: string;
          synced: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          belvo_transaction_id: string;
          user_id: string;
          account_id: string;
          description: string;
          amount: number;
          type: string;
          status?: string | null;
          category?: string | null;
          subcategory?: string | null;
          reference?: string | null;
          balance?: number | null;
          value_date: string;
          accounting_date?: string | null;
          currency?: string;
          synced?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          belvo_transaction_id?: string;
          user_id?: string;
          account_id?: string;
          description?: string;
          amount?: number;
          type?: string;
          status?: string | null;
          category?: string | null;
          subcategory?: string | null;
          reference?: string | null;
          balance?: number | null;
          value_date?: string;
          accounting_date?: string | null;
          currency?: string;
          synced?: boolean;
          created_at?: string;
        };
      };
      belvo_consents: {
        Row: {
          id: string;
          belvo_consent_id: string;
          user_id: string;
          link_id: string | null;
          institution_name: string;
          status: string;
          permissions: string[] | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          belvo_consent_id: string;
          user_id: string;
          link_id?: string | null;
          institution_name: string;
          status: string;
          permissions?: string[] | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          belvo_consent_id?: string;
          user_id?: string;
          link_id?: string | null;
          institution_name?: string;
          status?: string;
          permissions?: string[] | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
