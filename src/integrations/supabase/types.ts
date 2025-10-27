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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_recommendations: {
        Row: {
          call_id: string | null
          created_at: string | null
          engagement_score: number | null
          id: string
          qualification_score: number | null
          reasoning: string | null
          recommendation: string | null
          red_flags: string[] | null
          strengths: string[] | null
          suggested_next_steps: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          qualification_score?: number | null
          reasoning?: string | null
          recommendation?: string | null
          red_flags?: string[] | null
          strengths?: string[] | null
          suggested_next_steps?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          qualification_score?: number | null
          reasoning?: string | null
          recommendation?: string | null
          red_flags?: string[] | null
          strengths?: string[] | null
          suggested_next_steps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          attempt_number: number | null
          call_sid: string | null
          candidate_id: string | null
          conversation_id: string | null
          cost_credits: number | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          error_message: string | null
          id: string
          recording_url: string | null
          started_at: string | null
          status: string | null
          transcript_url: string | null
        }
        Insert: {
          attempt_number?: number | null
          call_sid?: string | null
          candidate_id?: string | null
          conversation_id?: string | null
          cost_credits?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          transcript_url?: string | null
        }
        Update: {
          attempt_number?: number | null
          call_sid?: string | null
          candidate_id?: string | null
          conversation_id?: string | null
          cost_credits?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          transcript_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          completed_calls: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          position: string
          question_template_id: string | null
          retry_policy: Json | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: string | null
          successful_calls: number | null
          total_candidates: number | null
          updated_at: string | null
          voice_settings: Json | null
        }
        Insert: {
          completed_calls?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          position: string
          question_template_id?: string | null
          retry_policy?: Json | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string | null
          successful_calls?: number | null
          total_candidates?: number | null
          updated_at?: string | null
          voice_settings?: Json | null
        }
        Update: {
          completed_calls?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          position?: string
          question_template_id?: string | null
          retry_policy?: Json | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string | null
          successful_calls?: number | null
          total_candidates?: number | null
          updated_at?: string | null
          voice_settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_question_template_id_fkey"
            columns: ["question_template_id"]
            isOneToOne: false
            referencedRelation: "question_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          current_company: string | null
          email: string
          full_name: string
          id: string
          linkedin_url: string | null
          notes: string | null
          phone_number: string
          position: string
          preferred_call_time: string | null
          preferred_language: string | null
          status: string | null
          updated_at: string | null
          years_experience: number | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          current_company?: string | null
          email: string
          full_name: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone_number: string
          position: string
          preferred_call_time?: string | null
          preferred_language?: string | null
          status?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          current_company?: string | null
          email?: string
          full_name?: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          phone_number?: string
          position?: string
          preferred_call_time?: string | null
          preferred_language?: string | null
          status?: string | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          last_login?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      question_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          role_category: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          role_category?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          role_category?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string | null
          estimated_duration_seconds: number | null
          expected_answer_type: string | null
          follow_up_logic: Json | null
          id: string
          is_mandatory: boolean | null
          question_text: string
          question_type: string | null
          sequence_order: number | null
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_duration_seconds?: number | null
          expected_answer_type?: string | null
          follow_up_logic?: Json | null
          id?: string
          is_mandatory?: boolean | null
          question_text: string
          question_type?: string | null
          sequence_order?: number | null
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_duration_seconds?: number | null
          expected_answer_type?: string | null
          follow_up_logic?: Json | null
          id?: string
          is_mandatory?: boolean | null
          question_text?: string
          question_type?: string | null
          sequence_order?: number | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "question_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      structured_responses: {
        Row: {
          call_id: string | null
          confidence_score: number | null
          created_at: string | null
          extracted_value: Json | null
          id: string
          question_id: string | null
          question_text: string
          raw_response: string | null
          red_flags: string[] | null
        }
        Insert: {
          call_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          extracted_value?: Json | null
          id?: string
          question_id?: string | null
          question_text: string
          raw_response?: string | null
          red_flags?: string[] | null
        }
        Update: {
          call_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          extracted_value?: Json | null
          id?: string
          question_id?: string | null
          question_text?: string
          raw_response?: string | null
          red_flags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "structured_responses_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structured_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          call_id: string | null
          confidence: number | null
          created_at: string | null
          id: string
          sequence_number: number | null
          speaker: string
          text: string
          timestamp: string
        }
        Insert: {
          call_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          sequence_number?: number | null
          speaker: string
          text: string
          timestamp: string
        }
        Update: {
          call_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          sequence_number?: number | null
          speaker?: string
          text?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
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
