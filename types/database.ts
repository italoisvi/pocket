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
        };
        Insert: {
          id: string;
          created_at?: string;
          name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string | null;
          avatar_url?: string | null;
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
    };
  };
};
