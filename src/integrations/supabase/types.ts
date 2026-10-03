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
      agent_approvals: {
        Row: {
          action_summary: string
          agent_run_id: string
          always_allow: boolean
          created_at: string
          expires_at: string | null
          id: string
          resolved_at: string | null
          status: string
          tool_step_id: string
          user_id: string
        }
        Insert: {
          action_summary: string
          agent_run_id: string
          always_allow?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          resolved_at?: string | null
          status: string
          tool_step_id: string
          user_id: string
        }
        Update: {
          action_summary?: string
          agent_run_id?: string
          always_allow?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          resolved_at?: string | null
          status?: string
          tool_step_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_tool_step_id_fkey"
            columns: ["tool_step_id"]
            isOneToOne: false
            referencedRelation: "agent_tool_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runner_credentials: {
        Row: {
          created_at: string
          pairing_code_hash: string | null
          pairing_expires_at: string | null
          runner_id: string
          token_hash: string | null
        }
        Insert: {
          created_at?: string
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          runner_id: string
          token_hash?: string | null
        }
        Update: {
          created_at?: string
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          runner_id?: string
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runner_credentials_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: true
            referencedRelation: "agent_runners"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runners: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          platform: string | null
          runner_version: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          platform?: string | null
          runner_version?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          platform?: string | null
          runner_version?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          chat_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          model_id: string | null
          runner_id: string | null
          status: string
          step_count: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          model_id?: string | null
          runner_id?: string | null
          status: string
          step_count?: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          model_id?: string | null
          runner_id?: string | null
          status?: string
          step_count?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "agent_runners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "agent_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          args: Json
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          result: Json | null
          runner_id: string
          status: string
          tool_name: string
          tool_step_id: string | null
          user_id: string
          workspace_root: string | null
        }
        Insert: {
          args?: Json
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          result?: Json | null
          runner_id: string
          status?: string
          tool_name: string
          tool_step_id?: string | null
          user_id: string
          workspace_root?: string | null
        }
        Update: {
          args?: Json
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          result?: Json | null
          runner_id?: string
          status?: string
          tool_name?: string
          tool_step_id?: string | null
          user_id?: string
          workspace_root?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "agent_runners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_tool_step_id_fkey"
            columns: ["tool_step_id"]
            isOneToOne: false
            referencedRelation: "agent_tool_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_permissions: {
        Row: {
          created_at: string
          id: string
          permission_mode: string
          tool_name: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          permission_mode: string
          tool_name: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          permission_mode?: string
          tool_name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "agent_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_steps: {
        Row: {
          agent_run_id: string
          created_at: string
          duration_ms: number | null
          id: string
          safe_input: Json
          safe_output: Json
          status: string
          step_number: number
          tool_name: string
          updated_at: string
        }
        Insert: {
          agent_run_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          safe_input?: Json
          safe_output?: Json
          status: string
          step_number: number
          tool_name: string
          updated_at?: string
        }
        Update: {
          agent_run_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          safe_input?: Json
          safe_output?: Json
          status?: string
          step_number?: number
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_steps_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_workspaces: {
        Row: {
          configured_root: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          runner_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          configured_root: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          runner_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          configured_root?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          runner_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_workspaces_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "agent_runners"
            referencedColumns: ["id"]
          },
        ]
      }
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
      attachment_extractions: {
        Row: {
          attachment_id: string
          created_at: string
          error_message: string | null
          extracted_text: string | null
          extraction_status: string
          id: string
          source_map: Json
          structured_metadata: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_id: string
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          extraction_status: string
          id?: string
          source_map?: Json
          structured_metadata?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_id?: string
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          extraction_status?: string
          id?: string
          source_map?: Json
          structured_metadata?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachment_extractions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: true
            referencedRelation: "chat_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_extractions_user_id_fkey"
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
      code_change_sets: {
        Row: {
          changes: Json
          created_at: string
          generation_run_id: string
          id: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          changes: Json
          created_at?: string
          generation_run_id: string
          id?: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          changes?: Json
          created_at?: string
          generation_run_id?: string
          id?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_change_sets_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "code_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_change_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "code_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      code_generation_runs: {
        Row: {
          chat_id: string | null
          continuation_count: number
          created_at: string
          error_message: string | null
          finish_reason: string | null
          id: string
          instruction: string
          message_id: string | null
          model_id: string | null
          output: string
          plan: string | null
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          continuation_count?: number
          created_at?: string
          error_message?: string | null
          finish_reason?: string | null
          id?: string
          instruction: string
          message_id?: string | null
          model_id?: string | null
          output?: string
          plan?: string | null
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          continuation_count?: number
          created_at?: string
          error_message?: string | null
          finish_reason?: string | null
          id?: string
          instruction?: string
          message_id?: string | null
          model_id?: string | null
          output?: string
          plan?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_generation_runs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_generation_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_generation_runs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_generation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "code_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      code_projects: {
        Row: {
          chat_id: string | null
          created_at: string
          framework: string
          id: string
          preview_error: string | null
          preview_status: string
          selected_model_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          framework?: string
          id?: string
          preview_error?: string | null
          preview_status?: string
          selected_model_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          framework?: string
          id?: string
          preview_error?: string | null
          preview_status?: string
          selected_model_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_projects_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_projects_selected_model_id_fkey"
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
      managed_dev_servers: {
        Row: {
          command_summary: string
          created_at: string
          id: string
          local_port: number | null
          process_identifier: string | null
          runner_id: string
          safe_preview_url: string | null
          started_at: string | null
          status: string
          stopped_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          command_summary: string
          created_at?: string
          id?: string
          local_port?: number | null
          process_identifier?: string | null
          runner_id: string
          safe_preview_url?: string | null
          started_at?: string | null
          status: string
          stopped_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          command_summary?: string
          created_at?: string
          id?: string
          local_port?: number | null
          process_identifier?: string | null
          runner_id?: string
          safe_preview_url?: string | null
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_dev_servers_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "agent_runners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_dev_servers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "agent_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          citations: Json | null
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
          citations?: Json | null
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
          citations?: Json | null
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
          max_output_tokens: number | null
          output_cost_per_million: number | null
          provider_model_id: string
          supports_structured_output: boolean | null
          supports_tool_calls: boolean | null
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
          max_output_tokens?: number | null
          output_cost_per_million?: number | null
          provider_model_id: string
          supports_structured_output?: boolean | null
          supports_tool_calls?: boolean | null
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
          max_output_tokens?: number | null
          output_cost_per_million?: number | null
          provider_model_id?: string
          supports_structured_output?: boolean | null
          supports_tool_calls?: boolean | null
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
          agent_auto_continue: boolean
          agent_mode_default: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_approved: boolean
          is_disabled: boolean
          updated_at: string
        }
        Insert: {
          agent_auto_continue?: boolean
          agent_mode_default?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_approved?: boolean
          is_disabled?: boolean
          updated_at?: string
        }
        Update: {
          agent_auto_continue?: boolean
          agent_mode_default?: boolean
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
      project_file_versions: {
        Row: {
          change_source: string
          change_summary: string | null
          content: string
          created_at: string
          id: string
          project_file_id: string
          project_id: string
          version_number: number
        }
        Insert: {
          change_source: string
          change_summary?: string | null
          content: string
          created_at?: string
          id?: string
          project_file_id: string
          project_id: string
          version_number: number
        }
        Update: {
          change_source?: string
          change_summary?: string | null
          content?: string
          created_at?: string
          id?: string
          project_file_id?: string
          project_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_file_versions_project_file_id_fkey"
            columns: ["project_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "code_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          content: string
          created_at: string
          created_by: string
          file_type: string
          id: string
          is_entry_file: boolean
          language: string | null
          path: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          file_type?: string
          id?: string
          is_entry_file?: boolean
          language?: string | null
          path: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          file_type?: string
          id?: string
          is_entry_file?: boolean
          language?: string | null
          path?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "code_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_runs: {
        Row: {
          chat_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_summary: Json
          message_id: string | null
          output_summary: Json
          status: string
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_summary?: Json
          message_id?: string | null
          output_summary?: Json
          status: string
          tool_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_summary?: Json
          message_id?: string | null
          output_summary?: Json
          status?: string
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_runs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      owns_code_project: { Args: { _project_id: string }; Returns: boolean }
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
