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
    };
  };
};
