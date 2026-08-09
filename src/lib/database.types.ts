export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      dependencies: {
        Row: {
          created_at: string | null
          dep_type: string
          id: string
          project_id: string
          source_file_id: string | null
          source_function_id: string | null
          target_file_id: string | null
          target_function_id: string | null
        }
        Insert: {
          created_at?: string | null
          dep_type: string
          id?: string
          project_id: string
          source_file_id?: string | null
          source_function_id?: string | null
          target_file_id?: string | null
          target_function_id?: string | null
        }
        Update: {
          created_at?: string | null
          dep_type?: string
          id?: string
          project_id?: string
          source_file_id?: string | null
          source_function_id?: string | null
          target_file_id?: string | null
          target_function_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_source_function_id_fkey"
            columns: ["source_function_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_target_file_id_fkey"
            columns: ["target_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_target_function_id_fkey"
            columns: ["target_function_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          content: string
          created_at: string | null
          id: string
          language: string
          path: string
          project_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          language: string
          path: string
          project_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          language?: string
          path?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      functions: {
        Row: {
          code_snippet: string
          created_at: string | null
          end_line: number
          explanation: Json | null
          explanation_status: string
          file_id: string
          id: string
          kind: string
          name: string
          project_id: string
          qualified_name: string | null
          signature: string | null
          start_line: number
        }
        Insert: {
          code_snippet: string
          created_at?: string | null
          end_line: number
          explanation?: Json | null
          explanation_status?: string
          file_id: string
          id?: string
          kind: string
          name: string
          project_id: string
          qualified_name?: string | null
          signature?: string | null
          start_line: number
        }
        Update: {
          code_snippet?: string
          created_at?: string | null
          end_line?: number
          explanation?: Json | null
          explanation_status?: string
          file_id?: string
          id?: string
          kind?: string
          name?: string
          project_id?: string
          qualified_name?: string | null
          signature?: string | null
          start_line?: number
        }
        Relationships: [
          {
            foreignKeyName: "functions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "functions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          file_count: number | null
          function_count: number | null
          id: string
          name: string
          source_type: string
          source_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_count?: number | null
          function_count?: number | null
          id?: string
          name: string
          source_type: string
          source_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_count?: number | null
          function_count?: number | null
          id?: string
          name?: string
          source_type?: string
          source_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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