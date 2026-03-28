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
      map_versions: {
        Row: {
          id: string;
          map_id: string;
          version: number;
          prompt: string | null;
          manifest: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          map_id: string;
          version: number;
          prompt?: string | null;
          manifest: Json;
          created_at?: string;
        };
        Update: {
          manifest?: Json;
          prompt?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "map_versions_map_id_fkey";
            columns: ["map_id"];
            referencedRelation: "maps";
            referencedColumns: ["id"];
          },
        ];
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
          chat_history: Json;
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
          chat_history?: Json;
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
          chat_history?: Json;
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
      insert_map_version: {
        Args: { p_map_id: string; p_manifest: Json; p_prompt?: string };
        Returns: { id: string; version: number; created_at: string }[];
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
export type MapVersionRow = Database["public"]["Tables"]["map_versions"]["Row"];
export type MapVersionInsert = Database["public"]["Tables"]["map_versions"]["Insert"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
