export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      article_assets: {
        Row: {
          article_id: string
          body: string
          channel: string
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          published_at: string | null
          published_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          article_id: string
          body?: string
          channel: string
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          published_at?: string | null
          published_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          published_at?: string | null
          published_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_assets_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "article_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      article_drafts: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          generated_at: string | null
          id: string
          keyword: string
          keyword_id: string | null
          last_checked_at: string | null
          last_status_code: number | null
          meta_description: string
          meta_title: string
          project: string
          published: boolean
          published_at: string | null
          published_url: string | null
          scheduled_for: string | null
          service: string
          slug: string
          status: string
          title: string
          updated_at: string
          verified_live_at: string | null
        }
        Insert: {
          body?: string
          client_id?: string | null
          created_at?: string
          generated_at?: string | null
          id: string
          keyword?: string
          keyword_id?: string | null
          last_checked_at?: string | null
          last_status_code?: number | null
          meta_description?: string
          meta_title?: string
          project?: string
          published?: boolean
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          service?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          verified_live_at?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          keyword?: string
          keyword_id?: string | null
          last_checked_at?: string | null
          last_status_code?: number | null
          meta_description?: string
          meta_title?: string
          project?: string
          published?: boolean
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          service?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          verified_live_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_drafts_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          brand_voice: string | null
          created_at: string
          email: string | null
          id: string
          is_default: boolean
          logo_url: string | null
          name: string
          phone: string | null
          service_areas: Json
          services: Json
          social_urls: Json
          timezone: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          brand_voice?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          service_areas?: Json
          services?: Json
          social_urls?: Json
          timezone?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          brand_voice?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          service_areas?: Json
          services?: Json
          social_urls?: Json
          timezone?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      content_assets: {
        Row: {
          body: string
          channel: string
          client_id: string | null
          created_at: string
          id: string
          package_id: string
          published_at: string | null
          published_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel: string
          client_id?: string | null
          created_at?: string
          id?: string
          package_id: string
          published_at?: string | null
          published_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          package_id?: string
          published_at?: string | null
          published_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packages: {
        Row: {
          business_name: string
          city: string
          client_id: string | null
          created_at: string
          id: string
          keyword: string
          project: string
          service: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          business_name?: string
          city?: string
          client_id?: string | null
          created_at?: string
          id?: string
          keyword?: string
          project?: string
          service?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          city?: string
          client_id?: string | null
          created_at?: string
          id?: string
          keyword?: string
          project?: string
          service?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          city: string
          client_id: string | null
          created_at: string
          difficulty: string
          id: string
          intent: string
          keyword: string
          service: string
          state: string
          volume: number
        }
        Insert: {
          city?: string
          client_id?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          intent?: string
          keyword: string
          service?: string
          state?: string
          volume?: number
        }
        Update: {
          city?: string
          client_id?: string | null
          created_at?: string
          difficulty?: string
          id?: string
          intent?: string
          keyword?: string
          service?: string
          state?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "keywords_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          client_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_error: string | null
          last_verified_at: string | null
          provider: string
          provider_metadata: Json
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          provider: string
          provider_metadata?: Json
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          provider?: string
          provider_metadata?: Json
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
