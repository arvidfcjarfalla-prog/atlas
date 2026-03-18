// Supabase database type definitions.
// Reflects the public.maps table created in the Supabase dashboard.
// Matches the generic shape expected by @supabase/supabase-js createClient<Database>.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      maps: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          prompt: string;
          manifest: Json;
          geojson_url: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          prompt: string;
          manifest: Json;
          geojson_url?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          prompt?: string;
          manifest?: Json;
          geojson_url?: string | null;
          is_public?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience aliases
export type MapRow = Database["public"]["Tables"]["maps"]["Row"];
export type MapInsert = Database["public"]["Tables"]["maps"]["Insert"];
export type MapUpdate = Database["public"]["Tables"]["maps"]["Update"];
