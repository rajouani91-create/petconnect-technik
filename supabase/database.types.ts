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
      appointments: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          kind: string
          location: string | null
          note: string | null
          owner_id: string
          pet_id: string
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          note?: string | null
          owner_id?: string
          pet_id: string
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          ends_at?: string | null
          kind?: string
          location?: string | null
          note?: string | null
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          amount: number
          claim_date: string
          created_at: string
          document_id: string | null
          id: string
          insurance_id: string
          note: string | null
          owner_id: string
          pet_id: string
          reimbursed_amount: number | null
          status: string
          title: string
        }
        Insert: {
          amount: number
          claim_date?: string
          created_at?: string
          document_id?: string | null
          id?: string
          insurance_id: string
          note?: string | null
          owner_id?: string
          pet_id: string
          reimbursed_amount?: number | null
          status?: string
          title: string
        }
        Update: {
          amount?: number
          claim_date?: string
          document_id?: string | null
          note?: string | null
          reimbursed_amount?: number | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pet_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_insurance_id_pet_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "pet_insurances"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_documents: {
        Row: {
          category: string
          created_at: string
          doc_date: string | null
          id: string
          mime_type: string
          owner_id: string
          pet_id: string
          size_bytes: number
          storage_path: string
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          doc_date?: string | null
          id?: string
          mime_type: string
          owner_id?: string
          pet_id: string
          size_bytes: number
          storage_path: string
          title: string
        }
        Update: {
          category?: string
          doc_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_documents_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_insurances: {
        Row: {
          created_at: string
          deductible: number | null
          holder_name: string | null
          id: string
          insurer: string
          note: string | null
          owner_id: string
          pet_id: string
          policy_no: string
          reimbursement_pct: number | null
          submission: string | null
        }
        Insert: {
          created_at?: string
          deductible?: number | null
          holder_name?: string | null
          id?: string
          insurer: string
          note?: string | null
          owner_id?: string
          pet_id: string
          policy_no: string
          reimbursement_pct?: number | null
          submission?: string | null
        }
        Update: {
          deductible?: number | null
          holder_name?: string | null
          insurer?: string
          note?: string | null
          policy_no?: string
          reimbursement_pct?: number | null
          submission?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_insurances_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_invite_pets: {
        Row: {
          invite_id: string
          pet_id: string
        }
        Insert: {
          invite_id: string
          pet_id: string
        }
        Update: {
          invite_id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_invite_pets_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "pet_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_invite_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invitee_name: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invitee_name: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invitee_name?: string
          role?: string
          token?: string
        }
        Relationships: []
      }
      pet_members: {
        Row: {
          created_at: string
          pet_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          pet_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          pet_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_members_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          allergies: string | null
          birth_date: string | null
          breed: string | null
          cat_outdoor: boolean | null
          chip_no: string | null
          created_at: string
          deceased: boolean
          emergency_contact: string | null
          id: string
          medications: string | null
          name: string
          owner_phone: string | null
          owner_id: string
          photo_path: string | null
          sex: string | null
          species: string
          species_other: string | null
          stable: string | null
          updated_at: string
          vet_name: string | null
          vet_phone: string | null
        }
        Insert: {
          allergies?: string | null
          birth_date?: string | null
          breed?: string | null
          cat_outdoor?: boolean | null
          chip_no?: string | null
          created_at?: string
          deceased?: boolean
          emergency_contact?: string | null
          id?: string
          medications?: string | null
          name: string
          owner_phone?: string | null
          owner_id?: string
          photo_path?: string | null
          sex?: string | null
          species: string
          species_other?: string | null
          stable?: string | null
          updated_at?: string
          vet_name?: string | null
          vet_phone?: string | null
        }
        Update: {
          allergies?: string | null
          birth_date?: string | null
          breed?: string | null
          cat_outdoor?: boolean | null
          chip_no?: string | null
          created_at?: string
          deceased?: boolean
          emergency_contact?: string | null
          id?: string
          medications?: string | null
          name?: string
          owner_phone?: string | null
          owner_id?: string
          photo_path?: string | null
          sex?: string | null
          species?: string
          species_other?: string | null
          stable?: string | null
          updated_at?: string
          vet_name?: string | null
          vet_phone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          language: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          language?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          done_at: string | null
          due_on: string
          id: string
          kind: string
          last_done_on: string | null
          note: string | null
          owner_id: string
          pet_id: string
          repeat_days: number | null
          title: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          due_on: string
          id?: string
          kind?: string
          last_done_on?: string | null
          note?: string | null
          owner_id?: string
          pet_id: string
          repeat_days?: number | null
          title: string
        }
        Update: {
          done_at?: string | null
          due_on?: string
          kind?: string
          last_done_on?: string | null
          note?: string | null
          repeat_days?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_done: {
        Row: {
          created_at: string
          done_on: string
          id: string
          owner_id: string
          routine_item_id: string
        }
        Insert: {
          created_at?: string
          done_on?: string
          id?: string
          owner_id?: string
          routine_item_id: string
        }
        Update: {
          created_at?: string
          done_on?: string
          id?: string
          owner_id?: string
          routine_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_done_routine_item_id_fkey"
            columns: ["routine_item_id"]
            isOneToOne: false
            referencedRelation: "routine_items"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_items: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          owner_id: string
          pet_id: string
          reminder_on: boolean
          repeat: string
          time_of_day: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          owner_id?: string
          pet_id: string
          reminder_on?: boolean
          repeat?: string
          time_of_day: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          owner_id?: string
          pet_id?: string
          reminder_on?: boolean
          repeat?: string
          time_of_day?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_items_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      sitter_access: {
        Row: {
          care_notes: string | null
          created_at: string
          feeding: string | null
          id: string
          owner_id: string
          pet_id: string
          revoked_at: string | null
          sitter_name: string
          token: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          care_notes?: string | null
          created_at?: string
          feeding?: string | null
          id?: string
          owner_id?: string
          pet_id: string
          revoked_at?: string | null
          sitter_name: string
          token?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          care_notes?: string | null
          feeding?: string | null
          revoked_at?: string | null
          sitter_name?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "sitter_access_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccinations: {
        Row: {
          created_at: string
          given_on: string | null
          id: string
          name: string
          owner_id: string
          pet_id: string
          source: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          given_on?: string | null
          id?: string
          name: string
          owner_id?: string
          pet_id: string
          source?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          given_on?: string | null
          id?: string
          name?: string
          owner_id?: string
          pet_id?: string
          source?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      weights: {
        Row: {
          created_at: string
          id: string
          kg: number
          measured_on: string
          owner_id: string
          pet_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kg: number
          measured_on?: string
          owner_id?: string
          pet_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kg?: number
          measured_on?: string
          owner_id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weights_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pet_invite: { Args: { p_token: string }; Returns: string[] }
      complete_reminder: {
        Args: { p_done_on?: string; p_id: string }
        Returns: {
          created_at: string
          done_at: string | null
          due_on: string
          id: string
          kind: string
          last_done_on: string | null
          note: string | null
          owner_id: string
          pet_id: string
          repeat_days: number | null
          title: string
        }
      }
      create_pet_invite: {
        Args: { p_name: string; p_pet_ids: string[]; p_role: string }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      invite_preview: { Args: { p_token: string }; Returns: Json }
      sitter_view: { Args: { p_token: string }; Returns: Json }
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
    Enums: {},
  },
} as const
