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
          owner_id: string
          photo_path: string | null
          sex: string | null
          species: string
          species_other: string | null
          stable: string | null
          updated_at: string
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
          owner_id?: string
          photo_path?: string | null
          sex?: string | null
          species: string
          species_other?: string | null
          stable?: string | null
          updated_at?: string
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
          owner_id?: string
          photo_path?: string | null
          sex?: string | null
          species?: string
          species_other?: string | null
          stable?: string | null
          updated_at?: string
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
      create_pet_invite: {
        Args: { p_name: string; p_pet_ids: string[]; p_role: string }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      invite_preview: { Args: { p_token: string }; Returns: Json }
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
