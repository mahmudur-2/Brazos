export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      areas: {
        Row: {
          aliases: string[]
          borough: string
          centroid_lat: number
          centroid_lng: number
          code: string
          created_at: string
          display_name: string
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
          name: string
          rings: Json
        }
        Insert: {
          aliases?: string[]
          borough: string
          centroid_lat: number
          centroid_lng: number
          code: string
          created_at?: string
          display_name: string
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
          name: string
          rings: Json
        }
        Update: {
          aliases?: string[]
          borough?: string
          centroid_lat?: number
          centroid_lng?: number
          code?: string
          created_at?: string
          display_name?: string
          max_lat?: number
          max_lng?: number
          min_lat?: number
          min_lng?: number
          name?: string
          rings?: Json
        }
        Relationships: []
      }
      banned_phones: {
        Row: {
          banned_profile_id: string | null
          created_at: string
          phone: string
        }
        Insert: {
          banned_profile_id?: string | null
          created_at?: string
          phone: string
        }
        Update: {
          banned_profile_id?: string | null
          created_at?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "banned_phones_banned_profile_id_fkey"
            columns: ["banned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          job_id: string
          message: string | null
          status: Database["public"]["Enums"]["bid_status"]
          worker_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          status?: Database["public"]["Enums"]["bid_status"]
          worker_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["bid_status"]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          expires_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_states: {
        Row: {
          archived: boolean
          cleared_before: string | null
          created_at: string
          deleted: boolean
          direct_thread_id: string | null
          hidden: boolean
          job_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          cleared_before?: string | null
          created_at?: string
          deleted?: boolean
          direct_thread_id?: string | null
          hidden?: boolean
          job_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          cleared_before?: string | null
          created_at?: string
          deleted?: boolean
          direct_thread_id?: string | null
          hidden?: boolean
          job_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_direct_thread_id_fkey"
            columns: ["direct_thread_id"]
            isOneToOne: false
            referencedRelation: "direct_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_threads: {
        Row: {
          created_at: string
          id: string
          user_a: string
          user_a_read_at: string | null
          user_b: string
          user_b_read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          user_a: string
          user_a_read_at?: string | null
          user_b: string
          user_b_read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          user_a?: string
          user_a_read_at?: string | null
          user_b?: string
          user_b_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_threads_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_threads_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_schedule: {
        Row: {
          cancel_fee_bps: number
          cancel_fee_max_cents: number
          cancel_fee_min_cents: number
          created_at: string
          customer_bps: number
          effective_from: string
          id: number
          tax_bps: number
          tip_customer_bps: number
          tip_max_bps: number
          tip_max_cents: number
          worker_bps: number
          worker_min_fee_cents: number
        }
        Insert: {
          cancel_fee_bps?: number
          cancel_fee_max_cents?: number
          cancel_fee_min_cents?: number
          created_at?: string
          customer_bps: number
          effective_from: string
          id?: never
          tax_bps?: number
          tip_customer_bps?: number
          tip_max_bps?: number
          tip_max_cents?: number
          worker_bps: number
          worker_min_fee_cents?: number
        }
        Update: {
          cancel_fee_bps?: number
          cancel_fee_max_cents?: number
          cancel_fee_min_cents?: number
          created_at?: string
          customer_bps?: number
          effective_from?: string
          id?: never
          tax_bps?: number
          tip_customer_bps?: number
          tip_max_bps?: number
          tip_max_cents?: number
          worker_bps?: number
          worker_min_fee_cents?: number
        }
        Relationships: []
      }
      job_agreements: {
        Row: {
          accepted_at: string
          agreed_price_cents: number
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          cancel_fee_bps: number
          cancel_fee_max_cents: number
          cancel_fee_min_cents: number
          category: string
          customer_fee_cents: number
          customer_id: string
          description: string | null
          fee_schedule_id: number
          job_id: string
          offer_id: string
          scheduled_date: string | null
          tax_cents: number
          title: string
          total_cents: number
          worker_fee_cents: number
          worker_id: string
        }
        Insert: {
          accepted_at?: string
          agreed_price_cents: number
          arrival_end_hour?: number | null
          arrival_start_hour?: number | null
          cancel_fee_bps: number
          cancel_fee_max_cents: number
          cancel_fee_min_cents: number
          category: string
          customer_fee_cents: number
          customer_id: string
          description?: string | null
          fee_schedule_id: number
          job_id: string
          offer_id: string
          scheduled_date?: string | null
          tax_cents: number
          title: string
          total_cents: number
          worker_fee_cents: number
          worker_id: string
        }
        Update: {
          accepted_at?: string
          agreed_price_cents?: number
          arrival_end_hour?: number | null
          arrival_start_hour?: number | null
          cancel_fee_bps?: number
          cancel_fee_max_cents?: number
          cancel_fee_min_cents?: number
          category?: string
          customer_fee_cents?: number
          customer_id?: string
          description?: string | null
          fee_schedule_id?: number
          job_id?: string
          offer_id?: string
          scheduled_date?: string | null
          tax_cents?: number
          title?: string
          total_cents?: number
          worker_fee_cents?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_agreements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_fee_schedule_id_fkey"
            columns: ["fee_schedule_id"]
            isOneToOne: false
            referencedRelation: "fee_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_agreements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          id: string
          job_id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          job_id: string
          label: string
          position?: number
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          job_id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_completions: {
        Row: {
          completed_by: string
          created_at: string
          id: string
          job_id: string
          photos: string[]
        }
        Insert: {
          completed_by: string
          created_at?: string
          id?: string
          job_id: string
          photos: string[]
        }
        Update: {
          completed_by?: string
          created_at?: string
          id?: string
          job_id?: string
          photos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "job_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_disputes: {
        Row: {
          created_at: string
          details: string | null
          id: string
          job_id: string
          opened_by: string
          payment_id: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          job_id: string
          opened_by: string
          payment_id?: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string
          opened_by?: string
          payment_id?: string | null
          reason?: Database["public"]["Enums"]["dispute_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "job_disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "refunds_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_due"
            referencedColumns: ["id"]
          },
        ]
      }
      job_locations: {
        Row: {
          access_notes: string | null
          address_line: string | null
          job_id: string
          lat: number | null
          lng: number | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address_line?: string | null
          job_id: string
          lat?: number | null
          lng?: number | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address_line?: string | null
          job_id?: string
          lat?: number | null
          lng?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_locations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_offers: {
        Row: {
          amount_cents: number
          author_id: string
          awaiting_id: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          job_id: string
          message: string | null
          offer_type: Database["public"]["Enums"]["offer_type"]
          parent_offer_id: string | null
          root_offer_id: string
          source_id: string | null
          source_table: string | null
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          amount_cents: number
          author_id: string
          awaiting_id?: string | null
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          job_id: string
          message?: string | null
          offer_type: Database["public"]["Enums"]["offer_type"]
          parent_offer_id?: string | null
          root_offer_id: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          amount_cents?: number
          author_id?: string
          awaiting_id?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          job_id?: string
          message?: string | null
          offer_type?: Database["public"]["Enums"]["offer_type"]
          parent_offer_id?: string | null
          root_offer_id?: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_offers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_awaiting_id_fkey"
            columns: ["awaiting_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_customer_owns_job_fkey"
            columns: ["job_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_offers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_parent_inherits_fkey"
            columns: [
              "parent_offer_id",
              "job_id",
              "offer_type",
              "customer_id",
              "worker_id",
              "root_offer_id",
            ]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: [
              "id",
              "job_id",
              "offer_type",
              "customer_id",
              "worker_id",
              "root_offer_id",
            ]
          },
          {
            foreignKeyName: "job_offers_root_offer_id_fkey"
            columns: ["root_offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requests: {
        Row: {
          amount_cents: number
          awaiting_id: string
          category: string
          client_counters: number
          client_id: string
          created_at: string
          created_job_id: string | null
          description: string
          direct_thread_id: string | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          photos: Json
          status: string
          thread_job_id: string | null
          title: string
          updated_at: string
          videos: Json
          worker_counters: number
          worker_id: string
        }
        Insert: {
          amount_cents: number
          awaiting_id: string
          category: string
          client_counters?: number
          client_id: string
          created_at?: string
          created_job_id?: string | null
          description?: string
          direct_thread_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          photos?: Json
          status?: string
          thread_job_id?: string | null
          title: string
          updated_at?: string
          videos?: Json
          worker_counters?: number
          worker_id: string
        }
        Update: {
          amount_cents?: number
          awaiting_id?: string
          category?: string
          client_counters?: number
          client_id?: string
          created_at?: string
          created_job_id?: string | null
          description?: string
          direct_thread_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          photos?: Json
          status?: string
          thread_job_id?: string | null
          title?: string
          updated_at?: string
          videos?: Json
          worker_counters?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_requests_awaiting_id_fkey"
            columns: ["awaiting_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_created_job_id_fkey"
            columns: ["created_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_direct_thread_id_fkey"
            columns: ["direct_thread_id"]
            isOneToOne: false
            referencedRelation: "direct_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_thread_job_id_fkey"
            columns: ["thread_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        Insert: {
          accepted_bid_id?: string | null
          accepted_offer_id?: string | null
          area_code?: string | null
          arrival_end_hour?: number | null
          arrival_start_hour?: number | null
          arrived_at?: string | null
          assigned_worker_id?: string | null
          budget_cents?: number | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at?: string | null
          completion_photo_url?: string | null
          completion_photos?: Json
          completion_videos?: Json
          created_at?: string
          description?: string | null
          en_route_at?: string | null
          final_amount_cents?: number | null
          id?: string
          location?: string | null
          location_text?: string | null
          photos?: Json
          property_id?: string | null
          scheduled_date?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          videos?: Json
          visibility?: Database["public"]["Enums"]["job_visibility"]
        }
        Update: {
          accepted_bid_id?: string | null
          accepted_offer_id?: string | null
          area_code?: string | null
          arrival_end_hour?: number | null
          arrival_start_hour?: number | null
          arrived_at?: string | null
          assigned_worker_id?: string | null
          budget_cents?: number | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: Database["public"]["Enums"]["job_category"]
          client_id?: string
          completed_at?: string | null
          completion_photo_url?: string | null
          completion_photos?: Json
          completion_videos?: Json
          created_at?: string
          description?: string | null
          en_route_at?: string | null
          final_amount_cents?: number | null
          id?: string
          location?: string | null
          location_text?: string | null
          photos?: Json
          property_id?: string | null
          scheduled_date?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          videos?: Json
          visibility?: Database["public"]["Enums"]["job_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_accepted_bid_fk"
            columns: ["accepted_bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_accepted_offer_fkey"
            columns: ["accepted_offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_area_code_fkey"
            columns: ["area_code"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "jobs_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document: string
          id: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          document: string
          id?: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          document?: string
          id?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_location_shares: {
        Row: {
          direct_thread_id: string | null
          expires_at: string
          id: string
          job_id: string | null
          lat: number
          lng: number
          sharer_id: string
          started_at: string
          updated_at: string
        }
        Insert: {
          direct_thread_id?: string | null
          expires_at: string
          id?: string
          job_id?: string | null
          lat: number
          lng: number
          sharer_id: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          direct_thread_id?: string | null
          expires_at?: string
          id?: string
          job_id?: string | null
          lat?: number
          lng?: number
          sharer_id?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_location_shares_direct_thread_id_fkey"
            columns: ["direct_thread_id"]
            isOneToOne: false
            referencedRelation: "direct_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_location_shares_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_location_shares_sharer_id_fkey"
            columns: ["sharer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          job_id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          job_id: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          job_id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          job_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          job_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          job_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          audio_duration_ms: number | null
          audio_url: string | null
          content: string
          created_at: string
          direct_thread_id: string | null
          document_name: string | null
          document_size_bytes: number | null
          document_url: string | null
          id: string
          image_url: string | null
          job_id: string | null
          job_offer_id: string | null
          job_request_id: string | null
          reply_to_id: string | null
          request_amount_cents: number | null
          request_event: string | null
          sender_id: string
          unsent_at: string | null
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_url?: string | null
          content?: string
          created_at?: string
          direct_thread_id?: string | null
          document_name?: string | null
          document_size_bytes?: number | null
          document_url?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          job_offer_id?: string | null
          job_request_id?: string | null
          reply_to_id?: string | null
          request_amount_cents?: number | null
          request_event?: string | null
          sender_id: string
          unsent_at?: string | null
        }
        Update: {
          audio_duration_ms?: number | null
          audio_url?: string | null
          content?: string
          created_at?: string
          direct_thread_id?: string | null
          document_name?: string | null
          document_size_bytes?: number | null
          document_url?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          job_offer_id?: string | null
          job_request_id?: string | null
          reply_to_id?: string | null
          request_amount_cents?: number | null
          request_event?: string | null
          sender_id?: string
          unsent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_direct_thread_id_fkey"
            columns: ["direct_thread_id"]
            isOneToOne: false
            referencedRelation: "direct_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_offer_id_fkey"
            columns: ["job_offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_request_fk"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "job_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          id: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutes_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          body: string
          category: string
          created_at: string
          data: Json
          dedupe_key: string | null
          id: string
          last_error: string | null
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          attempts?: number
          body: string
          category: string
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          read_at?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          attempts?: number
          body?: string
          category?: string
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          read_at?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          bids: boolean
          hire_requests: boolean
          home_lat: number | null
          home_lng: number | null
          job_updates: boolean
          messages: boolean
          nearby_jobs: boolean
          nearby_radius_miles: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bids?: boolean
          hire_requests?: boolean
          home_lat?: number | null
          home_lng?: number | null
          job_updates?: boolean
          messages?: boolean
          nearby_jobs?: boolean
          nearby_radius_miles?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bids?: boolean
          hire_requests?: boolean
          home_lat?: number | null
          home_lng?: number | null
          job_updates?: boolean
          messages?: boolean
          nearby_jobs?: boolean
          nearby_radius_miles?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          created_at: string
          payouts_checked_at: string | null
          payouts_enabled: boolean
          payouts_status: string
          stripe_account_id: string | null
          stripe_customer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          payouts_checked_at?: string | null
          payouts_enabled?: boolean
          payouts_status?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          payouts_checked_at?: string | null
          payouts_enabled?: boolean
          payouts_status?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          account_id: string | null
          attempts: number
          error: string | null
          id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          error?: string | null
          id: string
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          account_id?: string | null
          attempts?: number
          error?: string | null
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "refunds_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_due"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        Insert: {
          amount_cents: number
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string
          customer_fee_bps?: number | null
          customer_fee_cents?: number
          funding_due_at?: string | null
          held_at?: string | null
          id?: string
          job_id: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider?: string
          provider_ref?: string | null
          refund_attempts?: number
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          transfer_attempts?: number
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string
          worker_fee_bps?: number | null
        }
        Update: {
          amount_cents?: number
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string
          customer_fee_bps?: number | null
          customer_fee_cents?: number
          funding_due_at?: string | null
          held_at?: string | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id?: string
          payer_id?: string
          platform_fee_cents?: number
          provider?: string
          provider_ref?: string | null
          refund_attempts?: number
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          transfer_attempts?: number
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string
          worker_fee_bps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          caption: string | null
          category: string
          created_at: string
          display_order: number
          id: string
          photo_url: string
          published: boolean
          source_job_id: string | null
          worker_id: string
        }
        Insert: {
          caption?: string | null
          category: string
          created_at?: string
          display_order?: number
          id?: string
          photo_url: string
          published?: boolean
          source_job_id?: string | null
          worker_id: string
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          photo_url?: string
          published?: boolean
          source_job_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepting_work: boolean
          active_mode: string
          availability_note: string | null
          avatar_url: string | null
          banned: boolean
          bio: string | null
          categories: string[] | null
          completion_rate: number | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_admin: boolean
          language: string | null
          on_time_pct: number | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          response_time: number | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_account_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          accepting_work?: boolean
          active_mode?: string
          availability_note?: string | null
          avatar_url?: string | null
          banned?: boolean
          bio?: string | null
          categories?: string[] | null
          completion_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id: string
          is_admin?: boolean
          language?: string | null
          on_time_pct?: number | null
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          response_time?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_account_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          accepting_work?: boolean
          active_mode?: string
          availability_note?: string | null
          avatar_url?: string | null
          banned?: boolean
          bio?: string | null
          categories?: string[] | null
          completion_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          is_admin?: boolean
          language?: string | null
          on_time_pct?: number | null
          phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          response_time?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_account_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      properties: {
        Row: {
          area_code: string | null
          city: string
          created_at: string
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          owner_id: string
          postal_code: string | null
          state: string
          street: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          area_code?: string | null
          city: string
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          owner_id: string
          postal_code?: string | null
          state: string
          street: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          area_code?: string | null
          city?: string
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          owner_id?: string
          postal_code?: string | null
          state?: string
          street?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_area_code_fkey"
            columns: ["area_code"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["code"]
          },
        ]
      }
      push_tokens: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          job_id: string | null
          reason: string
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          job_id: string
          photos: Json
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id: string
          photos?: Json
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string
          photos?: Json
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_workers: {
        Row: {
          created_at: string
          user_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_workers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_semantic_docs: {
        Row: {
          embedded_hash: string | null
          embedding: string | null
          embedding_model: string | null
          evidence: Json
          generated_at: string | null
          is_stale: boolean | null
          source_hash: string
          source_text: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          embedded_hash?: string | null
          embedding?: string | null
          embedding_model?: string | null
          evidence?: Json
          generated_at?: string | null
          is_stale?: boolean | null
          source_hash?: string
          source_text?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          embedded_hash?: string | null
          embedding?: string | null
          embedding_model?: string | null
          evidence?: Json
          generated_at?: string | null
          is_stale?: boolean | null
          source_hash?: string
          source_text?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_semantic_docs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_services: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          position: number
          price_cents: number | null
          price_unit: string
          published: boolean
          title: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          price_cents?: number | null
          price_unit?: string
          published?: boolean
          title: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          price_cents?: number | null
          price_unit?: string
          published?: boolean
          title?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_services_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      conversations: {
        Row: {
          assigned_worker_id: string | null
          client_id: string | null
          direct_thread_id: string | null
          job_id: string | null
          job_title: string | null
          last_message_at: string | null
          last_message_audio_url: string | null
          last_message_content: string | null
          last_message_document_name: string | null
          last_message_document_url: string | null
          last_message_id: string | null
          last_message_image_url: string | null
          last_message_sender_id: string | null
          last_message_unsent_at: string | null
          my_read_at: string | null
        }
        Relationships: []
      }
      refunds_due: {
        Row: {
          amount_cents: number | null
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string | null
          customer_fee_bps: number | null
          customer_fee_cents: number | null
          funding_due_at: string | null
          held_at: string | null
          id: string | null
          job_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"] | null
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string | null
          payer_id: string | null
          platform_fee_cents: number | null
          provider: string | null
          provider_ref: string | null
          refund_attempts: number | null
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id: string | null
          tax_cents: number | null
          transfer_attempts: number | null
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string | null
          worker_fee_bps: number | null
        }
        Insert: {
          amount_cents?: number | null
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string | null
          customer_fee_bps?: number | null
          customer_fee_cents?: number | null
          funding_due_at?: string | null
          held_at?: string | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"] | null
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          provider?: string | null
          provider_ref?: string | null
          refund_attempts?: number | null
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number | null
          transfer_attempts?: number | null
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string | null
          worker_fee_bps?: number | null
        }
        Update: {
          amount_cents?: number | null
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string | null
          customer_fee_bps?: number | null
          customer_fee_cents?: number | null
          funding_due_at?: string | null
          held_at?: string | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"] | null
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          provider?: string | null
          provider_ref?: string | null
          refund_attempts?: number | null
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number | null
          transfer_attempts?: number | null
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string | null
          worker_fee_bps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers_due: {
        Row: {
          amount_cents: number | null
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string | null
          customer_fee_bps: number | null
          customer_fee_cents: number | null
          funding_due_at: string | null
          held_at: string | null
          id: string | null
          job_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"] | null
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string | null
          payer_id: string | null
          platform_fee_cents: number | null
          provider: string | null
          provider_ref: string | null
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id: string | null
          tax_cents: number | null
          transfer_attempts: number | null
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string | null
          worker_fee_bps: number | null
        }
        Insert: {
          amount_cents?: number | null
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string | null
          customer_fee_bps?: number | null
          customer_fee_cents?: number | null
          funding_due_at?: string | null
          held_at?: string | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"] | null
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          provider?: string | null
          provider_ref?: string | null
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number | null
          transfer_attempts?: number | null
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string | null
          worker_fee_bps?: number | null
        }
        Update: {
          amount_cents?: number | null
          authorized_at?: string | null
          charge_amount_cents?: number | null
          chargeback_at?: string | null
          chargeback_ref?: string | null
          created_at?: string | null
          customer_fee_bps?: number | null
          customer_fee_cents?: number | null
          funding_due_at?: string | null
          held_at?: string | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"] | null
          last_error?: string | null
          offer_id?: string | null
          paid_out_at?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          provider?: string | null
          provider_ref?: string | null
          refund_cents?: number | null
          refund_reason?: string | null
          refund_ref?: string | null
          release_reason?: string | null
          release_requested_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number | null
          transfer_attempts?: number | null
          transfer_cents?: number | null
          transfer_ref?: string | null
          transfer_reversed_at?: string | null
          updated_at?: string | null
          worker_fee_bps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "job_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bids_projection_drift: {
        Row: {
          drift: string | null
          job_id: string | null
          live_amount_cents: number | null
          live_status: Database["public"]["Enums"]["bid_status"] | null
          mirrored_amount_cents: number | null
          mirrored_status: Database["public"]["Enums"]["bid_status"] | null
          root_offer_id: string | null
          worker_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_bid: {
        Args: { p_bid_id: string; p_job_id: string }
        Returns: undefined
      }
      accept_legal_documents: { Args: { p_documents: Json }; Returns: number }
      accept_offer: { Args: { p_offer_id: string }; Returns: string }
      account_deletion_blockers: {
        Args: never
        Returns: {
          detail: string
          kind: string
          label: string
          ref_id: string
        }[]
      }
      account_deletion_enabled: { Args: never; Returns: boolean }
      active_work_lifecycle_enabled: { Args: never; Returns: boolean }
      admin_open_reports: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          job_id: string
          job_title: string
          reason: string
          reported_banned: boolean
          reported_id: string
          reported_name: string
          reporter_id: string
          reporter_name: string
          status: string
        }[]
      }
      apply_payment_event: { Args: { p_event_id: string }; Returns: Json }
      apply_worker_embeddings: {
        Args: { p_model: string; p_rows: Json }
        Returns: number
      }
      area_for_point: {
        Args: { p_lat: number; p_lng: number }
        Returns: string
      }
      attach_provider_ref: {
        Args: { p_payment_id: string; p_ref: string }
        Returns: undefined
      }
      auto_release_due_payments: { Args: never; Returns: number }
      ban_user: {
        Args: { p_report_id?: string; p_target: string }
        Returns: undefined
      }
      begin_job_payment: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_tip_payment: {
        Args: { p_amount_cents: number; p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bids_projection_enabled: { Args: never; Returns: boolean }
      bids_projection_v2_enabled: { Args: never; Returns: boolean }
      build_worker_semantic_source: {
        Args: { p_worker: string }
        Returns: {
          evidence: Json
          source_hash: string
          source_text: string
        }[]
      }
      can_delete_own_job: { Args: { p_job_id: string }; Returns: boolean }
      cancel_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancellation_fee_cents: {
        Args: { p_amount_cents: number; p_job_id: string }
        Returns: number
      }
      claim_notification_batch: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          data: Json
          outbox_id: string
          recipient_id: string
          title: string
          tokens: string[]
          type: string
        }[]
      }
      client_job_stats: {
        Args: { p_client_id: string }
        Returns: {
          cancelled: number
          completed: number
          posted: number
        }[]
      }
      connect_onboarding_enabled: { Args: never; Returns: boolean }
      conversation_parties: {
        Args: { p_direct_thread_id: string; p_job_id: string }
        Returns: Record<string, unknown>
      }
      counter_notification_copy_enabled: { Args: never; Returns: boolean }
      counter_notification_enabled: { Args: never; Returns: boolean }
      counter_offer: {
        Args: { p_amount_cents: number; p_offer_id: string }
        Returns: string
      }
      counteroffer_cap_enabled: { Args: never; Returns: boolean }
      create_bid: {
        Args: { p_amount_cents: number; p_job_id: string; p_message?: string }
        Returns: {
          amount_cents: number
          created_at: string
          id: string
          job_id: string
          message: string | null
          status: Database["public"]["Enums"]["bid_status"]
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bids"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_job: {
        Args: {
          p_address_line?: string
          p_arrival_end_hour?: number
          p_arrival_start_hour?: number
          p_budget_cents?: number
          p_budget_max_cents?: number
          p_budget_min_cents?: number
          p_category: Database["public"]["Enums"]["job_category"]
          p_description: string
          p_lat?: number
          p_lng?: number
          p_location: string
          p_photos?: Json
          p_scheduled_date?: string
          p_title: string
          p_videos?: Json
        }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_job_request: {
        Args: {
          p_amount_cents: number
          p_category: string
          p_description: string
          p_lat?: number
          p_lng?: number
          p_location: string
          p_photos?: Json
          p_thread_job_id?: string
          p_title: string
          p_videos?: Json
          p_worker_id: string
        }
        Returns: string
      }
      create_offer: {
        Args: {
          p_amount_cents: number
          p_category?: string
          p_description?: string
          p_job_id?: string
          p_lat?: number
          p_lng?: number
          p_location?: string
          p_message?: string
          p_photos?: Json
          p_thread_job_id?: string
          p_title?: string
          p_videos?: Json
          p_worker_id?: string
        }
        Returns: string
      }
      create_review: {
        Args: {
          p_comment?: string
          p_job_id: string
          p_photos?: Json
          p_rating: number
          p_reviewee_id: string
        }
        Returns: {
          comment: string | null
          created_at: string
          id: string
          job_id: string
          photos: Json
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_fee: {
        Args: { p_at?: string }
        Returns: {
          cancel_fee_bps: number
          cancel_fee_max_cents: number
          cancel_fee_min_cents: number
          customer_bps: number
          effective_from: string
          id: number
          tax_bps: number
          tip_customer_bps: number
          tip_max_bps: number
          tip_max_cents: number
          worker_bps: number
          worker_min_fee_cents: number
        }[]
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      current_user_is_banned: { Args: never; Returns: boolean }
      deactivate_push_token: { Args: { p_token: string }; Returns: undefined }
      decline_offer: { Args: { p_offer_id: string }; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      direct_thread_notifications_enabled: { Args: never; Returns: boolean }
      drain_notification_outbox: { Args: never; Returns: number }
      drain_settlements: { Args: never; Returns: number }
      enqueue_notification: {
        Args: {
          p_actor: string
          p_body: string
          p_category: string
          p_data: Json
          p_dedupe_key: string
          p_recipient: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      ensure_direct_thread: {
        Args: { p_a: string; p_b: string }
        Returns: string
      }
      expire_offer_if_stale: {
        Args: { p_offer: Database["public"]["Tables"]["job_offers"]["Row"] }
        Returns: boolean
      }
      expire_unfunded_payments: {
        Args: never
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_active_mode: { Args: never; Returns: string }
      get_my_profile: {
        Args: never
        Returns: {
          accepting_work: boolean
          active_mode: string
          availability_note: string | null
          avatar_url: string | null
          banned: boolean
          bio: string | null
          categories: string[] | null
          completion_rate: number | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_admin: boolean
          language: string | null
          on_time_pct: number | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          response_time: number | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_account_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_payment_account: { Args: { p_user_id: string }; Returns: string }
      get_payment_customer: { Args: { p_user_id: string }; Returns: string }
      hardening_fixes_enabled: { Args: never; Returns: boolean }
      install_settlement_schedules: { Args: never; Returns: string }
      is_active_user: { Args: never; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_profile_active: { Args: { p_user: string }; Returns: boolean }
      job_bid_count: { Args: { p_job_id: string }; Returns: number }
      job_bid_counts: {
        Args: { p_job_ids: string[] }
        Returns: {
          bid_count: number
          job_id: string
        }[]
      }
      job_categories_expanded: { Args: never; Returns: boolean }
      job_completions_enabled: { Args: never; Returns: boolean }
      job_hotspots: {
        Args: never
        Returns: {
          categories: Json
          cell_lat: number
          cell_lng: number
          ilat: number
          ilng: number
          job_count: number
        }[]
      }
      job_offer_count: { Args: { p_job_id: string }; Returns: number }
      job_offer_counts: {
        Args: { p_job_ids: string[] }
        Returns: {
          job_id: string
          offer_count: number
        }[]
      }
      job_offer_rpcs_enabled: { Args: never; Returns: boolean }
      job_offers_enabled: { Args: never; Returns: boolean }
      job_payment_state: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_request_parties_ok: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      job_terms: {
        Args: { p_amount_cents: number; p_job_id: string }
        Returns: {
          accepted_at: string
          cancel_fee_bps: number
          cancel_fee_max_cents: number
          cancel_fee_min_cents: number
          customer_fee_bps: number
          customer_fee_cents: number
          fee_schedule_id: number
          from_snapshot: boolean
          tax_cents: number
          total_cents: number
          worker_fee_bps: number
          worker_fee_cents: number
        }[]
      }
      jobs_in_cell: {
        Args: { p_ilat: number; p_ilng: number }
        Returns: {
          budget_cents: number
          category: string
          client_id: string
          created_at: string
          description: string
          id: string
          location: string
          status: string
          title: string
        }[]
      }
      jobs_within_radius: {
        Args: { p_lat: number; p_lng: number; p_radius_miles: number }
        Returns: {
          budget_cents: number
          category: string
          client_id: string
          created_at: string
          description: string
          distance_miles: number
          id: string
          location: string
          photos: Json
          status: string
          title: string
          videos: Json
        }[]
      }
      legal_acceptance_enabled: { Args: never; Returns: boolean }
      mark_direct_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      mark_worker_arrival: {
        Args: { p_job_id: string; p_step: string }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marketplace_thread_identity_enabled: { Args: never; Returns: boolean }
      match_workers_semantic: {
        Args: {
          p_categories?: string[]
          p_limit?: number
          p_min_similarity?: number
          p_query_embedding: number[]
        }
        Returns: {
          avatar_url: string
          categories: string[]
          completed_total: number
          evidence_categories: string[]
          final_score: number
          full_name: string
          matched_categories: string[]
          rating_avg: number
          rating_count: number
          reason_code: string
          related_completed: number
          semantic_score: number
          verification_status: string
          worker_id: string
        }[]
      }
      messaging_lock_enabled: { Args: never; Returns: boolean }
      messaging_unlocked: {
        Args: { p_direct_thread_id?: string; p_job_id?: string }
        Returns: boolean
      }
      my_payouts_enabled: { Args: never; Returns: boolean }
      my_payouts_status: { Args: never; Returns: string }
      my_pending_job_requests: {
        Args: never
        Returns: {
          amount_cents: number
          client_id: string
          direct_thread_id: string
          id: string
          status: string
          thread_job_id: string
          updated_at: string
          worker_id: string
        }[]
      }
      my_pending_offers: {
        Args: never
        Returns: {
          amount_cents: number
          customer_id: string
          direct_thread_id: string
          id: string
          job_id: string
          offer_type: string
          status: string
          thread_job_id: string
          updated_at: string
          worker_id: string
        }[]
      }
      notification_feed_enabled: { Args: never; Returns: boolean }
      notify_display_name: { Args: { p_user: string }; Returns: string }
      notify_nearby_for_job: { Args: { p_job_id: string }; Returns: undefined }
      offer_post_event: {
        Args: {
          p_actor: string
          p_amount: number
          p_event: string
          p_offer_id: string
          p_root_id: string
        }
        Returns: undefined
      }
      offer_scoped_chat_enabled: { Args: never; Returns: boolean }
      open_job_dispute: {
        Args: { p_details?: string; p_job_id: string; p_reason: string }
        Returns: {
          created_at: string
          details: string | null
          id: string
          job_id: string
          opened_by: string
          payment_id: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        SetofOptions: {
          from: "*"
          to: "job_disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pg_function_present: {
        Args: { p_name: string; p_namespace: string }
        Returns: boolean
      }
      phase68_deleted_at_authorization_enabled: {
        Args: never
        Returns: boolean
      }
      phase69_execute_lockdown_enabled: { Args: never; Returns: boolean }
      phase70_unsend_message_authz_enabled: { Args: never; Returns: boolean }
      phase71_reviews_read_lockdown_enabled: { Args: never; Returns: boolean }
      phase72_storage_read_lockdown_enabled: { Args: never; Returns: boolean }
      phase73_null_safe_guards_enabled: { Args: never; Returns: boolean }
      phase75_security_hardening_enabled: { Args: never; Returns: boolean }
      phase76_corrections_enabled: { Args: never; Returns: boolean }
      phase76_rls_posture: { Args: never; Returns: Json }
      phase77_conversation_features_enabled: { Args: never; Returns: boolean }
      phase78_properties_enabled: { Args: never; Returns: boolean }
      portfolio_category_freeform_enabled: { Args: never; Returns: boolean }
      post_wizard_fields_enabled: { Args: never; Returns: boolean }
      profile_review_summary: {
        Args: { p_user: string }
        Returns: {
          average: number
          five: number
          four: number
          one: number
          three: number
          total: number
          two: number
        }[]
      }
      profile_reviews: {
        Args: { p_limit?: number; p_offset?: number; p_user: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          job_category: string
          photos: Json
          rating: number
          reviewer_avatar_url: string
          reviewer_id: string
          reviewer_name: string
        }[]
      }
      project_offer_chain_to_bids: {
        Args: { p_root_offer_id: string }
        Returns: undefined
      }
      push_notifications_enabled: { Args: never; Returns: boolean }
      push_scheduler_enabled: { Args: never; Returns: boolean }
      quote_job_price: {
        Args: { p_amount_cents: number; p_at?: string }
        Returns: {
          customer_fee_cents: number
          job_price_cents: number
          tax_cents: number
          total_cents: number
          worker_fee_cents: number
          worker_receives_cents: number
        }[]
      }
      record_settlement_attempt: {
        Args: {
          p_error: string
          p_kind: string
          p_payment_id: string
          p_rotate: boolean
        }
        Returns: boolean
      }
      refresh_worker_semantic_doc: {
        Args: { p_worker: string }
        Returns: undefined
      }
      register_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: undefined
      }
      release_job_payment: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_job_dispute: {
        Args: { p_in_favour_of: string; p_job_id: string; p_note?: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_notification: {
        Args: { p_error?: string; p_outbox_id: string; p_status: string }
        Returns: undefined
      }
      respond_job_request: {
        Args: {
          p_action: string
          p_amount_cents?: number
          p_request_id: string
        }
        Returns: string
      }
      review_integrity_enabled: { Args: never; Returns: boolean }
      sandbox_authorize_job_payment: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sandbox_cash_out: {
        Args: never
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sandbox_cash_out_enabled: { Args: never; Returns: boolean }
      sandbox_hold_job_payment: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sandbox_payments_enabled: { Args: never; Returns: boolean }
      sandbox_release_job_payment: {
        Args: { p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sandbox_tip_worker: {
        Args: { p_amount_cents: number; p_job_id: string }
        Returns: {
          amount_cents: number
          authorized_at: string | null
          charge_amount_cents: number | null
          chargeback_at: string | null
          chargeback_ref: string | null
          created_at: string
          customer_fee_bps: number | null
          customer_fee_cents: number
          funding_due_at: string | null
          held_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          last_error: string | null
          offer_id: string | null
          paid_out_at: string | null
          payee_id: string
          payer_id: string
          platform_fee_cents: number
          provider: string
          provider_ref: string | null
          refund_attempts: number
          refund_cents: number | null
          refund_reason: string | null
          refund_ref: string | null
          release_reason: string | null
          release_requested_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          tax_cents: number
          transfer_attempts: number
          transfer_cents: number | null
          transfer_ref: string | null
          transfer_reversed_at: string | null
          updated_at: string
          worker_fee_bps: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      security_definer_search_path_enabled: { Args: never; Returns: boolean }
      set_active_mode: { Args: { p_mode: string }; Returns: string }
      set_block: {
        Args: { p_blocked: string; p_expires_at?: string }
        Returns: undefined
      }
      set_conversation_state: {
        Args: {
          p_archived?: boolean
          p_clear?: boolean
          p_delete?: boolean
          p_direct_thread_id?: string
          p_hidden?: boolean
          p_job_id?: string
        }
        Returns: undefined
      }
      set_direct_thread_read_at: {
        Args: { p_read_at: string; p_thread_id: string }
        Returns: undefined
      }
      set_job_property: {
        Args: { p_job_id: string; p_property_id: string }
        Returns: undefined
      }
      set_payment_account: {
        Args: { p_account_id: string; p_user_id: string }
        Returns: string
      }
      set_payment_customer: {
        Args: { p_customer_id: string; p_user_id: string }
        Returns: string
      }
      set_payouts_enabled: {
        Args: { p_enabled: boolean; p_stripe_account_id: string }
        Returns: boolean
      }
      set_payouts_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: boolean
      }
      settlement_retry_enabled: { Args: never; Returns: boolean }
      settlement_schedules_enabled: { Args: never; Returns: boolean }
      should_notify: {
        Args: { p_actor: string; p_category: string; p_recipient: string }
        Returns: boolean
      }
      start_live_location: {
        Args: {
          p_direct_thread_id?: string
          p_expires_at: string
          p_job_id?: string
          p_lat: number
          p_lng: number
        }
        Returns: string
      }
      stop_live_location: {
        Args: { p_direct_thread_id?: string; p_job_id?: string }
        Returns: undefined
      }
      stripe_foundation_enabled: { Args: never; Returns: boolean }
      transition_job_status: {
        Args: {
          p_completion_photos?: Json
          p_completion_videos?: Json
          p_job_id: string
          p_status: string
        }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unban_user: { Args: { p_target: string }; Returns: undefined }
      unsend_message: { Args: { p_message_id: string }; Returns: undefined }
      update_job_details: {
        Args: {
          p_address_line?: string
          p_arrival_end_hour?: number
          p_arrival_start_hour?: number
          p_budget_cents?: number
          p_budget_max_cents?: number
          p_budget_min_cents?: number
          p_category: Database["public"]["Enums"]["job_category"]
          p_description: string
          p_job_id: string
          p_lat?: number
          p_lng?: number
          p_location: string
          p_photos?: Json
          p_scheduled_date?: string
          p_title: string
          p_videos?: Json
        }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
          area_code: string | null
          arrival_end_hour: number | null
          arrival_start_hour: number | null
          arrived_at: string | null
          assigned_worker_id: string | null
          budget_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["job_category"]
          client_id: string
          completed_at: string | null
          completion_photo_url: string | null
          completion_photos: Json
          completion_videos: Json
          created_at: string
          description: string | null
          en_route_at: string | null
          final_amount_cents: number | null
          id: string
          location: string | null
          location_text: string | null
          photos: Json
          property_id: string | null
          scheduled_date: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_live_location: {
        Args: {
          p_direct_thread_id?: string
          p_job_id?: string
          p_lat: number
          p_lng: number
        }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_patch: Json }
        Returns: {
          accepting_work: boolean
          active_mode: string
          availability_note: string | null
          avatar_url: string | null
          banned: boolean
          bio: string | null
          categories: string[] | null
          completion_rate: number | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_admin: boolean
          language: string | null
          on_time_pct: number | null
          phone: string | null
          rating_avg: number | null
          rating_count: number | null
          response_time: number | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_account_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      view_security_invoker_enabled: { Args: never; Returns: boolean }
      withdraw_job_dispute: {
        Args: { p_dispute_id: string }
        Returns: {
          created_at: string
          details: string | null
          id: string
          job_id: string
          opened_by: string
          payment_id: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        SetofOptions: {
          from: "*"
          to: "job_disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_offer: { Args: { p_offer_id: string }; Returns: undefined }
      worker_job_stats: {
        Args: { p_worker: string }
        Returns: {
          category: string
          job_count: number
        }[]
      }
      worker_self_service_enabled: { Args: never; Returns: boolean }
      worker_semantic_coverage: {
        Args: never
        Returns: {
          embedded: number
          stale: number
          total: number
        }[]
      }
      worker_semantic_refresh_queue: {
        Args: { p_limit?: number }
        Returns: {
          source_hash: string
          source_text: string
          worker_id: string
        }[]
      }
    }
    Enums: {
      bid_status: "pending" | "accepted" | "rejected" | "withdrawn"
      dispute_reason:
        | "not_as_described"
        | "incomplete"
        | "damage"
        | "no_show"
        | "other"
      dispute_status: "open" | "withdrawn" | "resolved"
      job_category:
        | "dog_walking"
        | "cleaning"
        | "moving"
        | "yard_work"
        | "handyman"
        | "errands"
        | "other"
        | "furniture_assembly"
        | "tv_mounting"
        | "painting"
        | "packing"
      job_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "draft"
      job_visibility: "open_market" | "direct"
      offer_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
        | "superseded"
      offer_type: "marketplace_bid" | "direct_offer"
      payment_kind: "job_payment" | "tip"
      payment_status:
        | "unfunded"
        | "pending"
        | "authorized"
        | "held"
        | "released"
        | "paid_out"
        | "refunded"
        | "partially_refunded"
        | "failed"
        | "voided"
      user_role: "client" | "worker" | "both"
      verification_status: "unverified" | "pending" | "verified"
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
    Enums: {
      bid_status: ["pending", "accepted", "rejected", "withdrawn"],
      dispute_reason: [
        "not_as_described",
        "incomplete",
        "damage",
        "no_show",
        "other",
      ],
      dispute_status: ["open", "withdrawn", "resolved"],
      job_category: [
        "dog_walking",
        "cleaning",
        "moving",
        "yard_work",
        "handyman",
        "errands",
        "other",
        "furniture_assembly",
        "tv_mounting",
        "painting",
        "packing",
      ],
      job_status: [
        "open",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
        "draft",
      ],
      job_visibility: ["open_market", "direct"],
      offer_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
        "superseded",
      ],
      offer_type: ["marketplace_bid", "direct_offer"],
      payment_kind: ["job_payment", "tip"],
      payment_status: [
        "unfunded",
        "pending",
        "authorized",
        "held",
        "released",
        "paid_out",
        "refunded",
        "partially_refunded",
        "failed",
        "voided",
      ],
      user_role: ["client", "worker", "both"],
      verification_status: ["unverified", "pending", "verified"],
    },
  },
} as const

