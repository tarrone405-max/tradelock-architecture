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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      change_orders: {
        Row: {
          application_fee_amount: number | null
          client_signature_name: string | null
          client_signed_at: string | null
          cost: number
          created_at: string
          currency: string | null
          description: string
          disputed_at: string | null
          dispute_status: string | null
          due_date: string | null
          id: string
          last_reminder_sent_at: string | null
          paid_at: string | null
          payment_reference: string | null
          project_id: string
          provider_signature_name: string | null
          provider_signed_at: string | null
          refunded_amount: number | null
          refunded_at: string | null
          signature_data: string | null
          signed_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_connected_account_id: string | null
          stripe_dispute_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          terms_accepted_at: string | null
          terms_version_id: string | null
        }
        Insert: {
          application_fee_amount?: number | null
          client_signature_name?: string | null
          client_signed_at?: string | null
          cost: number
          created_at?: string
          currency?: string | null
          description: string
          disputed_at?: string | null
          dispute_status?: string | null
          due_date?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          project_id: string
          provider_signature_name?: string | null
          provider_signed_at?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_dispute_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          terms_accepted_at?: string | null
          terms_version_id?: string | null
        }
        Update: {
          application_fee_amount?: number | null
          client_signature_name?: string | null
          client_signed_at?: string | null
          cost?: number
          created_at?: string
          currency?: string | null
          description?: string
          disputed_at?: string | null
          dispute_status?: string | null
          due_date?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          project_id?: string
          provider_signature_name?: string | null
          provider_signed_at?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_dispute_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          terms_accepted_at?: string | null
          terms_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "terms_of_service"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          contact_email: string | null
          created_at: string
          feedback_type: string
          id: string
          message: string
          project_id: string | null
          submitted_by: string
          user_id: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          feedback_type: string
          id?: string
          message: string
          project_id?: string | null
          submitted_by: string
          user_id?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string
          project_id?: string | null
          submitted_by?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          project_id: string
          sender_type: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          project_id: string
          sender_type: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_email: string | null
          client_name: string
          created_at: string
          id: string
          portal_token_revoked_at: string | null
          property_address: string | null
          unique_token: string
          user_id: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          created_at?: string
          id?: string
          portal_token_revoked_at?: string | null
          property_address?: string | null
          unique_token?: string
          user_id: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          created_at?: string
          id?: string
          portal_token_revoked_at?: string | null
          property_address?: string | null
          unique_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_of_service: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          user_id: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_of_service_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          stripe_account_id: string | null
          stripe_connect_charges_enabled: boolean
          stripe_connect_event_at: string | null
          stripe_connect_payouts_enabled: boolean
          stripe_customer_id: string | null
          stripe_subscription_event_at: string | null
          stripe_subscription_id: string | null
          subscription_grace_period_started_at: string | null
          subscription_status: string
          subscription_tier: string
          terms_accepted: boolean
          terms_accepted_at: string | null
          terms_version: string | null
          trial_ends_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          id: string
          stripe_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_event_at?: string | null
          stripe_connect_payouts_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_event_at?: string | null
          stripe_subscription_id?: string | null
          subscription_grace_period_started_at?: string | null
          subscription_status?: string
          subscription_tier?: string
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          stripe_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_event_at?: string | null
          stripe_connect_payouts_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_event_at?: string | null
          stripe_subscription_id?: string | null
          subscription_grace_period_started_at?: string | null
          subscription_status?: string
          subscription_tier?: string
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          project_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          project_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          project_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          endpoint: string
          id: string
          received_at: string
          type: string
        }
        Insert: {
          endpoint: string
          id: string
          received_at?: string
          type: string
        }
        Update: {
          endpoint?: string
          id?: string
          received_at?: string
          type?: string
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
