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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          occurred_at: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          activity_type: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          activity_type?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_user_id: string | null
          id: string
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Insert: {
          actor_user_id?: string | null
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Update: {
          actor_user_id?: string | null
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          eligibility_snapshot: Json
          email_address_id: string
          email_snapshot: string
          id: string
          merge_data: Json
          status: Database["public"]["Enums"]["recipient_status"]
          suppression_reason: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          eligibility_snapshot?: Json
          email_address_id: string
          email_snapshot: string
          id?: string
          merge_data?: Json
          status?: Database["public"]["Enums"]["recipient_status"]
          suppression_reason?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          eligibility_snapshot?: Json
          email_address_id?: string
          email_snapshot?: string
          id?: string
          merge_data?: Json
          status?: Database["public"]["Enums"]["recipient_status"]
          suppression_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          list_id: string | null
          name: string
          provider: string | null
          provider_campaign_id: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string | null
          name: string
          provider?: string | null
          provider_campaign_id?: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string | null
          name?: string
          provider?: string | null
          provider_campaign_id?: string | null
          purpose?: Database["public"]["Enums"]["permission_purpose"]
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "mailing_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_profiles: {
        Row: {
          admission_jurisdictions: string[]
          availability_date: string | null
          candidate_status: string
          created_at: string
          current_firm_id: string | null
          current_title: string | null
          cv_storage_path: string | null
          desired_locations: string[]
          last_contacted_at: string | null
          person_id: string
          practice_areas: string[]
          privacy_notice_at: string | null
          salary_current: number | null
          salary_expected: number | null
          updated_at: string
          work_preferences: string[]
          years_pqe: number | null
        }
        Insert: {
          admission_jurisdictions?: string[]
          availability_date?: string | null
          candidate_status?: string
          created_at?: string
          current_firm_id?: string | null
          current_title?: string | null
          cv_storage_path?: string | null
          desired_locations?: string[]
          last_contacted_at?: string | null
          person_id: string
          practice_areas?: string[]
          privacy_notice_at?: string | null
          salary_current?: number | null
          salary_expected?: number | null
          updated_at?: string
          work_preferences?: string[]
          years_pqe?: number | null
        }
        Update: {
          admission_jurisdictions?: string[]
          availability_date?: string | null
          candidate_status?: string
          created_at?: string
          current_firm_id?: string | null
          current_title?: string | null
          cv_storage_path?: string | null
          desired_locations?: string[]
          last_contacted_at?: string | null
          person_id?: string
          practice_areas?: string[]
          privacy_notice_at?: string | null
          salary_current?: number | null
          salary_expected?: number | null
          updated_at?: string
          work_preferences?: string[]
          years_pqe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_profiles_current_firm_id_fkey"
            columns: ["current_firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_preferences: {
        Row: {
          effective_at: string
          email_address_id: string
          evidence: Json
          expires_at: string | null
          fulfilled_at: string | null
          id: string
          kind: Database["public"]["Enums"]["permission_kind"]
          lawful_basis: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          source: string | null
          status: Database["public"]["Enums"]["preference_status"]
          updated_at: string
        }
        Insert: {
          effective_at?: string
          email_address_id: string
          evidence?: Json
          expires_at?: string | null
          fulfilled_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["permission_kind"]
          lawful_basis?: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          source?: string | null
          status?: Database["public"]["Enums"]["preference_status"]
          updated_at?: string
        }
        Update: {
          effective_at?: string
          email_address_id?: string
          evidence?: Json
          expires_at?: string | null
          fulfilled_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["permission_kind"]
          lawful_basis?: string | null
          purpose?: Database["public"]["Enums"]["permission_purpose"]
          source?: string | null
          status?: Database["public"]["Enums"]["preference_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_preferences_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          actor_user_id: string | null
          email_address_id: string
          event_type: string
          evidence: Json
          id: string
          new_status: Database["public"]["Enums"]["preference_status"] | null
          occurred_at: string
          previous_status:
            | Database["public"]["Enums"]["preference_status"]
            | null
          purpose: Database["public"]["Enums"]["permission_purpose"] | null
          source: string
        }
        Insert: {
          actor_user_id?: string | null
          email_address_id: string
          event_type: string
          evidence?: Json
          id?: string
          new_status?: Database["public"]["Enums"]["preference_status"] | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["preference_status"]
            | null
          purpose?: Database["public"]["Enums"]["permission_purpose"] | null
          source: string
        }
        Update: {
          actor_user_id?: string | null
          email_address_id?: string
          event_type?: string
          evidence?: Json
          id?: string
          new_status?: Database["public"]["Enums"]["preference_status"] | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["preference_status"]
            | null
          purpose?: Database["public"]["Enums"]["permission_purpose"] | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_events_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_addresses: {
        Row: {
          created_at: string
          email: string
          id: string
          is_primary: boolean
          last_verified_at: string | null
          person_id: string | null
          verification_status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          last_verified_at?: string | null
          person_id?: string | null
          verification_status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          last_verified_at?: string | null
          person_id?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_addresses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          email_message_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider: string
          provider_event_id: string
          received_at: string
        }
        Insert: {
          email_message_id?: string | null
          event_type: string
          id?: string
          occurred_at: string
          payload?: Json
          provider: string
          provider_event_id: string
          received_at?: string
        }
        Update: {
          email_message_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider?: string
          provider_event_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          campaign_recipient_id: string | null
          created_at: string
          email_address_id: string
          id: string
          provider: string
          provider_message_id: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          sent_at: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          subject_snapshot: string
        }
        Insert: {
          campaign_recipient_id?: string | null
          created_at?: string
          email_address_id: string
          id?: string
          provider: string
          provider_message_id?: string | null
          purpose: Database["public"]["Enums"]["permission_purpose"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          subject_snapshot: string
        }
        Update: {
          campaign_recipient_id?: string | null
          created_at?: string
          email_address_id?: string
          id?: string
          provider?: string
          provider_message_id?: string | null
          purpose?: Database["public"]["Enums"]["permission_purpose"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          subject_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          html_template: string
          id: string
          name: string
          purpose: Database["public"]["Enums"]["permission_purpose"]
          subject_template: string
          text_template: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          html_template: string
          id?: string
          name: string
          purpose: Database["public"]["Enums"]["permission_purpose"]
          subject_template: string
          text_template: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          html_template?: string
          id?: string
          name?: string
          purpose?: Database["public"]["Enums"]["permission_purpose"]
          subject_template?: string
          text_template?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          is_primary: boolean
          person_id: string
          role_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          is_primary?: boolean
          person_id: string
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          is_primary?: boolean
          person_id?: string
          role_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_contacts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          address: Json
          created_at: string
          created_by: string | null
          id: string
          legal_name: string | null
          main_phone: string | null
          name: string
          owner_id: string | null
          practice_areas: string[]
          relationship_stage: Database["public"]["Enums"]["firm_relationship_stage"]
          size_band: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          legal_name?: string | null
          main_phone?: string | null
          name: string
          owner_id?: string | null
          practice_areas?: string[]
          relationship_stage?: Database["public"]["Enums"]["firm_relationship_stage"]
          size_band?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          legal_name?: string | null
          main_phone?: string | null
          name?: string
          owner_id?: string | null
          practice_areas?: string[]
          relationship_stage?: Database["public"]["Enums"]["firm_relationship_stage"]
          size_band?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firms_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token: string
          created_at: string
          google_email: string
          id: string
          last_history_id: string | null
          last_synced_at: string | null
          profile_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          google_email: string
          id?: string
          last_history_id?: string | null
          last_synced_at?: string | null
          profile_id: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          google_email?: string
          id?: string
          last_history_id?: string | null
          last_synced_at?: string | null
          profile_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          closed_at: string | null
          confidential_notes: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          fee_percent: number | null
          firm_id: string
          id: string
          location: string | null
          max_pqe: number | null
          min_pqe: number | null
          opened_at: string | null
          owner_id: string | null
          practice_area: string | null
          reference_code: string | null
          salary_max: number | null
          salary_min: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          confidential_notes?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          fee_percent?: number | null
          firm_id: string
          id?: string
          location?: string | null
          max_pqe?: number | null
          min_pqe?: number | null
          opened_at?: string | null
          owner_id?: string | null
          practice_area?: string | null
          reference_code?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          confidential_notes?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          fee_percent?: number | null
          firm_id?: string
          id?: string
          location?: string | null
          max_pqe?: number | null
          min_pqe?: number | null
          opened_at?: string | null
          owner_id?: string | null
          practice_area?: string | null
          reference_code?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_list_members: {
        Row: {
          added_at: string
          added_source: string | null
          email_address_id: string
          list_id: string
          removed_at: string | null
        }
        Insert: {
          added_at?: string
          added_source?: string | null
          email_address_id: string
          list_id: string
          removed_at?: string | null
        }
        Update: {
          added_at?: string
          added_source?: string | null
          email_address_id?: string
          list_id?: string
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mailing_list_members_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "mailing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          dynamic_filter: Json | null
          id: string
          name: string
          purpose: Database["public"]["Enums"]["permission_purpose"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          dynamic_filter?: Json | null
          id?: string
          name: string
          purpose: Database["public"]["Enums"]["permission_purpose"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          dynamic_filter?: Json | null
          id?: string
          name?: string
          purpose?: Database["public"]["Enums"]["permission_purpose"]
        }
        Relationships: [
          {
            foreignKeyName: "mailing_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          created_by: string | null
          first_name: string
          id: string
          last_name: string
          linkedin_url: string | null
          location: string | null
          owner_id: string | null
          phone: string | null
          preferred_name: string | null
          source_detail: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          first_name: string
          id?: string
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          owner_id?: string | null
          phone?: string | null
          preferred_name?: string | null
          source_detail?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          first_name?: string
          id?: string
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          owner_id?: string | null
          phone?: string | null
          preferred_name?: string | null
          source_detail?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          created_at: string
          created_by: string | null
          fee_amount: number | null
          guarantee_end_date: string | null
          id: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          salary: number | null
          start_date: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee_amount?: number | null
          guarantee_end_date?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          salary?: number | null
          start_date?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee_amount?: number | null
          guarantee_end_date?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          salary?: number | null
          start_date?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "placements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      report_requests: {
        Row: {
          delivered_at: string | null
          email_address_id: string
          id: string
          report_code: string
          requested_at: string
          source: string | null
          status: string
        }
        Insert: {
          delivered_at?: string | null
          email_address_id: string
          id?: string
          report_code: string
          requested_at?: string
          source?: string | null
          status?: string
        }
        Update: {
          delivered_at?: string | null
          email_address_id?: string
          id?: string
          report_code?: string
          requested_at?: string
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_requests_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          candidate_id: string
          consent_to_submit_at: string | null
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          notes: string | null
          rejection_reason: string | null
          source: string | null
          stage: Database["public"]["Enums"]["submission_stage"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          consent_to_submit_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          notes?: string | null
          rejection_reason?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["submission_stage"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          consent_to_submit_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          rejection_reason?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["submission_stage"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_entries: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email_address_id: string
          id: string
          lifted_at: string | null
          lifted_by: string | null
          notes: string | null
          provider_event_id: string | null
          reason: Database["public"]["Enums"]["suppression_reason"]
          scope: Database["public"]["Enums"]["suppression_scope"]
          source: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email_address_id: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          notes?: string | null
          provider_event_id?: string | null
          reason: Database["public"]["Enums"]["suppression_reason"]
          scope: Database["public"]["Enums"]["suppression_scope"]
          source: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email_address_id?: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          notes?: string | null
          provider_event_id?: string | null
          reason?: Database["public"]["Enums"]["suppression_reason"]
          scope?: Database["public"]["Enums"]["suppression_scope"]
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_entries_email_address_id_fkey"
            columns: ["email_address_id"]
            isOneToOne: false
            referencedRelation: "email_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_entries_lifted_by_fkey"
            columns: ["lifted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_answers: {
        Row: {
          answer: Json
          created_at: string
          id: string
          question_id: string
          response_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          id?: string
          question_id: string
          response_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          question_id?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_options: {
        Row: {
          id: string
          option_label: string
          option_value: string
          position: number
          question_id: string
        }
        Insert: {
          id?: string
          option_label: string
          option_value: string
          position: number
          question_id: string
        }
        Update: {
          id?: string
          option_label?: string
          option_value?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          id: string
          position: number
          question_key: string
          question_text: string
          question_type: string
          required: boolean
          settings: Json
          survey_id: string
        }
        Insert: {
          id?: string
          position: number
          question_key: string
          question_text: string
          question_type: string
          required?: boolean
          settings?: Json
          survey_id: string
        }
        Update: {
          id?: string
          position?: number
          question_key?: string
          question_text?: string
          question_type?: string
          required?: boolean
          settings?: Json
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          broad_source: string | null
          id: string
          response_token_hash: string
          status: string
          submitted_at: string
          survey_id: string
        }
        Insert: {
          broad_source?: string | null
          id?: string
          response_token_hash: string
          status?: string
          submitted_at?: string
          survey_id: string
        }
        Update: {
          broad_source?: string | null
          id?: string
          response_token_hash?: string
          status?: string
          submitted_at?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          opens_at: string | null
          slug: string
          status: string
          title: string
          version: number
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string | null
          slug: string
          status?: string
          title: string
          version?: number
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string | null
          slug?: string
          status?: string
          title?: string
          version?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          status: Database["public"]["Enums"]["task_status"]
          subject_id: string | null
          subject_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          subject_id?: string | null
          subject_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          subject_id?: string | null
          subject_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_suppression: {
        Args: {
          p_email_address_id: string
          p_notes?: string
          p_reason: Database["public"]["Enums"]["suppression_reason"]
          p_scope: Database["public"]["Enums"]["suppression_scope"]
        }
        Returns: string
      }
      apply_permission_preference: {
        Args: {
          p_email_id: string
          p_evidence: Json
          p_kind: Database["public"]["Enums"]["permission_kind"]
          p_purpose: Database["public"]["Enums"]["permission_purpose"]
          p_source: string
        }
        Returns: undefined
      }
      approve_campaign: { Args: { p_campaign_id: string }; Returns: undefined }
      can_send_email: {
        Args: {
          p_email_address_id: string
          p_purpose: Database["public"]["Enums"]["permission_purpose"]
        }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      claim_campaign_batch: {
        Args: { p_batch_size?: number; p_campaign_id: string }
        Returns: {
          campaign_id: string
          created_at: string
          eligibility_snapshot: Json
          email_address_id: string
          email_snapshot: string
          id: string
          merge_data: Json
          status: Database["public"]["Enums"]["recipient_status"]
          suppression_reason: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_recipients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_report_batch: {
        Args: { p_batch_size?: number; p_report_code?: string }
        Returns: {
          delivered_at: string | null
          email_address_id: string
          id: string
          report_code: string
          requested_at: string
          source: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "report_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compute_segment_count: { Args: { p_filter: Json }; Returns: number }
      create_ad_hoc_campaign: {
        Args: {
          p_filter: Json
          p_name: string
          p_purpose: Database["public"]["Enums"]["permission_purpose"]
          p_template_id: string
        }
        Returns: string
      }
      create_candidate: {
        Args: {
          p_current_title?: string
          p_email: string
          p_first_name: string
          p_last_name: string
          p_location?: string
          p_phone?: string
          p_practice_areas?: string[]
          p_years_pqe?: number
        }
        Returns: string
      }
      create_firm_contact: {
        Args: {
          p_email: string
          p_firm_id: string
          p_first_name: string
          p_is_primary?: boolean
          p_last_name: string
          p_phone?: string
          p_role_title?: string
        }
        Returns: string
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      dashboard_summary: { Args: never; Returns: Json }
      generate_campaign_recipients: {
        Args: { p_campaign_id: string }
        Returns: {
          count: number
          status: Database["public"]["Enums"]["recipient_status"]
        }[]
      }
      get_active_survey: { Args: { p_slug: string }; Returns: Json }
      list_surveys: {
        Args: never
        Returns: {
          closes_at: string
          opens_at: string
          slug: string
          status: string
          title: string
        }[]
      }
      normalise_email: { Args: { p_email: string }; Returns: string }
      process_email_event: {
        Args: {
          p_event_type: string
          p_occurred_at: string
          p_payload: Json
          p_provider: string
          p_provider_event_id: string
          p_provider_message_id: string
        }
        Returns: undefined
      }
      record_email_sent: {
        Args: {
          p_campaign_recipient_id: string
          p_provider: string
          p_provider_message_id: string
          p_subject_snapshot: string
        }
        Returns: string
      }
      record_report_delivered: {
        Args: { p_report_request_id: string }
        Returns: undefined
      }
      record_unsubscribe: {
        Args: {
          p_email_address_id: string
          p_scope: Database["public"]["Enums"]["suppression_scope"]
          p_source?: string
        }
        Returns: undefined
      }
      select_segment_email_ids: { Args: { p_filter: Json }; Returns: string[] }
      set_survey_status: {
        Args: { p_slug: string; p_status: string }
        Returns: undefined
      }
      submit_permission_request: {
        Args: {
          p_blog?: boolean
          p_email: string
          p_form_version?: string
          p_recruitment?: boolean
          p_report?: boolean
          p_report_code?: string
          p_source?: string
        }
        Returns: undefined
      }
      submit_survey_response: {
        Args: { p_answers: Json; p_broad_source?: string; p_slug: string }
        Returns: undefined
      }
      survey_aggregate_report: {
        Args: { p_min_cohort?: number; p_slug: string }
        Returns: Json
      }
      sync_mailing_list_members: {
        Args: { p_list_id: string }
        Returns: {
          added: number
          removed: number
          total_active: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "recruiter" | "marketing" | "viewer"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "paused"
        | "completed"
        | "cancelled"
      firm_relationship_stage:
        | "prospect"
        | "contacted"
        | "terms_sent"
        | "terms_signed"
        | "dormant"
      invoice_status: "not_invoiced" | "invoiced" | "paid" | "written_off"
      job_status:
        | "draft"
        | "open"
        | "on_hold"
        | "filled"
        | "closed"
        | "cancelled"
      permission_kind: "single_use" | "ongoing"
      permission_purpose: "report" | "blog" | "recruitment"
      preference_status: "unknown" | "opted_in" | "opted_out" | "fulfilled"
      recipient_status:
        | "pending"
        | "suppressed"
        | "queued"
        | "sent"
        | "delivered"
        | "bounced"
        | "complained"
        | "unsubscribed"
        | "failed"
        | "cancelled"
      record_status: "active" | "archived"
      submission_stage:
        | "longlist"
        | "shortlist"
        | "submitted"
        | "interview"
        | "offer"
        | "placed"
        | "rejected"
        | "withdrawn"
      suppression_reason:
        | "unsubscribe"
        | "complaint"
        | "hard_bounce"
        | "soft_bounce_limit"
        | "manual"
        | "legal_request"
      suppression_scope:
        | "all_email"
        | "all_marketing"
        | "report"
        | "blog"
        | "recruitment"
      task_status: "open" | "completed" | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "recruiter", "marketing", "viewer"],
      campaign_status: [
        "draft",
        "scheduled",
        "sending",
        "paused",
        "completed",
        "cancelled",
      ],
      firm_relationship_stage: [
        "prospect",
        "contacted",
        "terms_sent",
        "terms_signed",
        "dormant",
      ],
      invoice_status: ["not_invoiced", "invoiced", "paid", "written_off"],
      job_status: ["draft", "open", "on_hold", "filled", "closed", "cancelled"],
      permission_kind: ["single_use", "ongoing"],
      permission_purpose: ["report", "blog", "recruitment"],
      preference_status: ["unknown", "opted_in", "opted_out", "fulfilled"],
      recipient_status: [
        "pending",
        "suppressed",
        "queued",
        "sent",
        "delivered",
        "bounced",
        "complained",
        "unsubscribed",
        "failed",
        "cancelled",
      ],
      record_status: ["active", "archived"],
      submission_stage: [
        "longlist",
        "shortlist",
        "submitted",
        "interview",
        "offer",
        "placed",
        "rejected",
        "withdrawn",
      ],
      suppression_reason: [
        "unsubscribe",
        "complaint",
        "hard_bounce",
        "soft_bounce_limit",
        "manual",
        "legal_request",
      ],
      suppression_scope: [
        "all_email",
        "all_marketing",
        "report",
        "blog",
        "recruitment",
      ],
      task_status: ["open", "completed", "cancelled"],
    },
  },
} as const
export type AppRole = Database['public']['Enums']['app_role']
