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
        };
        Insert: {
          id: string;
          created_at?: string;
          name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string | null;
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
    };
  };
};
