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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      artifact_generation_jobs: {
        Row: {
          attachment_id: string | null
          chat_id: string | null
          context_mode: string
          created_at: string
          error_message: string | null
          id: string
          instruction: string
          model_id: string | null
          output_format: string
          output_message_id: string | null
          requested_filename: string | null
          source_message_id: string | null
          status: string
          summary: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_id?: string | null
          chat_id?: string | null
          context_mode?: string
          created_at?: string
          error_message?: string | null
          id?: string
          instruction: string
          model_id?: string | null
          output_format: string
          output_message_id?: string | null
          requested_filename?: string | null
          source_message_id?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_id?: string | null
          chat_id?: string | null
          context_mode?: string
          created_at?: string
          error_message?: string | null
          id?: string
          instruction?: string
          model_id?: string | null
          output_format?: string
          output_message_id?: string | null
          requested_filename?: string | null
          source_message_id?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_generation_jobs_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "chat_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_generation_jobs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_generation_jobs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_generation_jobs_output_message_id_fkey"
            columns: ["output_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_generation_jobs_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_generation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          attachment_type: string
          chat_id: string | null
          created_at: string
          extraction_status: string
          id: string
          message_id: string | null
          mime_type: string | null
          original_filename: string
          processing_status: string
          safe_preview_type: string | null
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_type?: string
          chat_id?: string | null
          created_at?: string
          extraction_status?: string
          id?: string
          message_id?: string | null
          mime_type?: string | null
          original_filename: string
          processing_status?: string
          safe_preview_type?: string | null
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_type?: string
          chat_id?: string | null
          created_at?: string
          extraction_status?: string
          id?: string
          message_id?: string | null
          mime_type?: string | null
          original_filename?: string
          processing_status?: string
          safe_preview_type?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          max_tokens: number | null
          selected_connection_id: string | null
          selected_model_id: string | null
          system_prompt: string | null
          temperature: number | null
          title: string
          top_p: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          max_tokens?: number | null
          selected_connection_id?: string | null
          selected_model_id?: string | null
          system_prompt?: string | null
          temperature?: number | null
          title?: string
          top_p?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          max_tokens?: number | null
          selected_connection_id?: string | null
          selected_model_id?: string | null
          system_prompt?: string | null
          temperature?: number | null
          title?: string
          top_p?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_selected_connection_id_fkey"
            columns: ["selected_connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_selected_model_id_fkey"
            columns: ["selected_model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          base_url: string | null
          created_at: string
          enabled: boolean
          encrypted_api_key: string
          id: string
          key_hint: string | null
          last_test_message: string | null
          last_test_status: string | null
          last_tested_at: string | null
          name: string
          owner_user_id: string | null
          provider_type: string
          scope: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          encrypted_api_key: string
          id?: string
          key_hint?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          name: string
          owner_user_id?: string | null
          provider_type: string
          scope: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          encrypted_api_key?: string
          id?: string
          key_hint?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          name?: string
          owner_user_id?: string | null
          provider_type?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      image_generation_jobs: {
        Row: {
          aspect_ratio: string | null
          attachment_id: string | null
          chat_id: string | null
          connection_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          model_id: string | null
          negative_prompt: string | null
          prompt: string
          provider_job_id: string | null
          quality: string | null
          revised_prompt: string | null
          size: string | null
          status: string
          style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          attachment_id?: string | null
          chat_id?: string | null
          connection_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          model_id?: string | null
          negative_prompt?: string | null
          prompt: string
          provider_job_id?: string | null
          quality?: string | null
          revised_prompt?: string | null
          size?: string | null
          status?: string
          style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          attachment_id?: string | null
          chat_id?: string | null
          connection_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          model_id?: string | null
          negative_prompt?: string | null
          prompt?: string
          provider_job_id?: string | null
          quality?: string | null
          revised_prompt?: string | null
          size?: string | null
          status?: string
          style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_generation_jobs_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "chat_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          client_request_id: string | null
          content: string
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number | null
          model_id: string | null
          output_tokens: number | null
          provider_message_id: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          chat_id: string
          client_request_id?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          provider_message_id?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          chat_id?: string
          client_request_id?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          provider_message_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          capabilities: Json
          connection_id: string
          context_window: number | null
          created_at: string
          display_name: string
          enabled: boolean
          fetched_at: string
          id: string
          input_cost_per_million: number | null
          output_cost_per_million: number | null
          provider_model_id: string
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          connection_id: string
          context_window?: number | null
          created_at?: string
          display_name: string
          enabled?: boolean
          fetched_at?: string
          id?: string
          input_cost_per_million?: number | null
          output_cost_per_million?: number | null
          provider_model_id: string
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          connection_id?: string
          context_window?: number | null
          created_at?: string
          display_name?: string
          enabled?: boolean
          fetched_at?: string
          id?: string
          input_cost_per_million?: number | null
          output_cost_per_million?: number | null
          provider_model_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_approved: boolean
          is_disabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_approved?: boolean
          is_disabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_approved?: boolean
          is_disabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_admin: {
        Args: { _grant: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_approval: {
        Args: { _approved: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_disabled: {
        Args: { _disabled: boolean; _user_id: string }
        Returns: undefined
      }
      can_manage_connection: {
        Args: { _connection_id: string }
        Returns: boolean
      }
      can_view_connection: {
        Args: { _connection_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_approved_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      owns_chat: { Args: { _chat_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
