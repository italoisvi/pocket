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
    };
  };
};
