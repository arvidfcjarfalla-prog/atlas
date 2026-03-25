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
      data_cache: {
        Row: {
          id: string;
          cache_key: string;
          data: Json;
          profile: Json;
          source: string;
          description: string;
          resolution_status: string | null;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          cache_key: string;
          data: Json;
          profile: Json;
          source: string;
          description?: string;
          resolution_status?: string | null;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          data?: Json;
          profile?: Json;
          source?: string;
          description?: string;
          resolution_status?: string | null;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      clarify_cache: {
        Row: {
          id: string;
          prompt_key: string;
          response: Json;
          ttl_hours: number;
          hit_count: number;
          created_at: string;
          expires_at: string | null;
          last_hit_at: string | null;
        };
        Insert: {
          id?: string;
          prompt_key: string;
          response: Json;
          ttl_hours?: number;
          hit_count?: number;
          created_at?: string;
          expires_at?: string | null;
          last_hit_at?: string | null;
        };
        Update: {
          hit_count?: number;
          last_hit_at?: string | null;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      clarify_resolutions: {
        Row: {
          id: string;
          prompt_original: string;
          prompt_key: string;
          resolved_prompt: string;
          data_url: string;
          source_type: string;
          keywords: string[];
          use_count: number;
          created_at: string;
          last_used_at: string;
        };
        Insert: {
          id?: string;
          prompt_original: string;
          prompt_key: string;
          resolved_prompt: string;
          data_url: string;
          source_type: string;
          keywords: string[];
          use_count?: number;
          created_at?: string;
          last_used_at?: string;
        };
        Update: {
          use_count?: number;
          last_used_at?: string;
        };
        Relationships: [];
      };
      maps: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          prompt: string;
          manifest: Json;
          geojson_url: string | null;
          thumbnail_url: string | null;
          is_public: boolean;
          slug: string | null;
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
          thumbnail_url?: string | null;
          is_public?: boolean;
          slug?: string | null;
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
          thumbnail_url?: string | null;
          is_public?: boolean;
          slug?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          plan: "free" | "pro" | "enterprise";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_clarify_hit: {
        Args: { p_prompt_key: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience aliases
export type MapRow = Database["public"]["Tables"]["maps"]["Row"];
export type MapInsert = Database["public"]["Tables"]["maps"]["Insert"];
export type MapUpdate = Database["public"]["Tables"]["maps"]["Update"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
