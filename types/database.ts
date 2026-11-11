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
      blocked_terms: {
        Row: {
          term: string
        }
        Insert: {
          term: string
        }
        Update: {
          term?: string
        }
        Relationships: []
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
            referencedRelation: "refunds_ready"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_ready"
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
      job_series: {
        Row: {
          anchor_date: string | null
          cadence: string
          client_id: string
          created_at: string
          dropped_worker_ids: string[]
          id: string
          last_error: string | null
          next_visit_date: string | null
          next_visit_no: number
          origin_job_id: string
          pending_job_id: string | null
          price_cents: number | null
          status: string
          stopped_at: string | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          anchor_date?: string | null
          cadence: string
          client_id: string
          created_at?: string
          dropped_worker_ids?: string[]
          id?: string
          last_error?: string | null
          next_visit_date?: string | null
          next_visit_no?: number
          origin_job_id: string
          pending_job_id?: string | null
          price_cents?: number | null
          status?: string
          stopped_at?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          anchor_date?: string | null
          cadence?: string
          client_id?: string
          created_at?: string
          dropped_worker_ids?: string[]
          id?: string
          last_error?: string | null
          next_visit_date?: string | null
          next_visit_no?: number
          origin_job_id?: string
          pending_job_id?: string | null
          price_cents?: number | null
          status?: string
          stopped_at?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_series_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_origin_job_id_fkey"
            columns: ["origin_job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_pending_job_id_fkey"
            columns: ["pending_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_worker_id_fkey"
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          videos: Json
          visibility: Database["public"]["Enums"]["job_visibility"]
        }
        Insert: {
          accepted_bid_id?: string | null
          accepted_offer_id?: string | null
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
          job_number?: number
          late_minutes?: number | null
          late_reported_at?: string | null
          location?: string | null
          location_text?: string | null
          needed_today?: boolean
          photos?: Json
          pricing_mode?: string
          scheduled_date?: string | null
          scheduled_for?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          videos?: Json
          visibility?: Database["public"]["Enums"]["job_visibility"]
        }
        Update: {
          accepted_bid_id?: string | null
          accepted_offer_id?: string | null
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
          job_number?: number
          late_minutes?: number | null
          late_reported_at?: string | null
          location?: string | null
          location_text?: string | null
          needed_today?: boolean
          photos?: Json
          pricing_mode?: string
          scheduled_date?: string | null
          scheduled_for?: string | null
          series_id?: string | null
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
            foreignKeyName: "jobs_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "job_series"
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
          content: string
          created_at: string
          direct_thread_id: string | null
          id: string
          image_url: string | null
          job_id: string | null
          job_offer_id: string | null
          reply_to_id: string | null
          request_amount_cents: number | null
          request_event: string | null
          sender_id: string
          unsent_at: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          direct_thread_id?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          job_offer_id?: string | null
          reply_to_id?: string | null
          request_amount_cents?: number | null
          request_event?: string | null
          sender_id: string
          unsent_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          direct_thread_id?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          job_offer_id?: string | null
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
          send_after: string | null
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
          send_after?: string | null
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
          send_after?: string | null
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
          quiet_hours: boolean
          quiet_tz: string | null
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
          quiet_hours?: boolean
          quiet_tz?: string | null
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
          quiet_hours?: boolean
          quiet_tz?: string | null
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
            referencedRelation: "refunds_ready"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_ready"
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
      receipt_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          next_attempt_at: string | null
          payment_id: string
          provider_ref: string | null
          recipient_id: string
          role: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          job_id: string
          last_error?: string | null
          next_attempt_at?: string | null
          payment_id: string
          provider_ref?: string | null
          recipient_id: string
          role: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          job_id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          payment_id?: string
          provider_ref?: string | null
          recipient_id?: string
          role?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_outbox_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "refunds_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "refunds_ready"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_due"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "transfers_ready"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
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
          subject_id: string | null
          subject_kind: string | null
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
          subject_id?: string | null
          subject_kind?: string | null
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
          subject_id?: string | null
          subject_kind?: string | null
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
          would_again: boolean | null
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
          would_again?: boolean | null
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
          would_again?: boolean | null
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
          last_message_content: string | null
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
      refunds_ready: {
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
      transfers_ready: {
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
    }
    Functions: {
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
      advance_job_series: { Args: { p_now?: string }; Returns: number }
      apply_payment_event: { Args: { p_event_id: string }; Returns: Json }
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
      can_delete_own_job: { Args: { p_job_id: string }; Returns: boolean }
      cancel_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
      claim_receipt_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          next_attempt_at: string | null
          payment_id: string
          provider_ref: string | null
          recipient_id: string
          role: string
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "receipt_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      client_job_stats: {
        Args: { p_client_id: string }
        Returns: {
          cancelled: number
          cancelled_after_hire: number
          completed: number
          posted: number
          rehires: number
          would_again_total: number
          would_again_yes: number
        }[]
      }
      close_unpaid_hires: { Args: { p_now?: string }; Returns: number }
      counter_offer: {
        Args: { p_amount_cents: number; p_offer_id: string }
        Returns: string
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
          p_needed_today?: boolean
          p_photos?: Json
          p_pricing_mode?: string
          p_scheduled_date?: string
          p_title: string
          p_videos?: Json
        }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
          p_would_again?: boolean
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
          would_again: boolean | null
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
      drain_notification_outbox: { Args: never; Returns: number }
      drain_receipts: { Args: never; Returns: number }
      drain_settlements: { Args: never; Returns: number }
      drop_series_worker: { Args: { p_series_id: string }; Returns: undefined }
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
      enqueue_payment_declined: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      enqueue_tomorrow_reminders: {
        Args: { p_today?: string }
        Returns: number
      }
      ensure_direct_thread: {
        Args: { p_a: string; p_b: string }
        Returns: string
      }
      expire_offer_if_stale: {
        Args: { p_offer: Database["public"]["Tables"]["job_offers"]["Row"] }
        Returns: boolean
      }
      expire_open_jobs: { Args: { p_now?: string }; Returns: number }
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
      install_lifecycle_schedules: { Args: never; Returns: string }
      install_payment_events_prune: { Args: never; Returns: string }
      install_push_schedule: { Args: never; Returns: string }
      install_receipt_schedule: { Args: never; Returns: string }
      install_reminder_schedule: { Args: never; Returns: string }
      install_series_schedule: { Args: never; Returns: string }
      install_settlement_schedules: { Args: never; Returns: string }
      is_active_user: { Args: never; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_profile_active: { Args: { p_user: string }; Returns: boolean }
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
      job_window_end: {
        Args: { p_arrival_end_hour: number; p_scheduled_date: string }
        Returns: string
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
      mark_direct_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      mark_worker_arrival: {
        Args: { p_job_id: string; p_step: string }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
      messaging_unlocked: {
        Args: { p_direct_thread_id?: string; p_job_id?: string }
        Returns: boolean
      }
      money_label: { Args: { p_cents: number }; Returns: string }
      my_payouts_status: { Args: never; Returns: string }
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
      profile_review_summaries: {
        Args: { p_role?: string; p_users: string[] }
        Returns: {
          average: number
          completed_jobs: number
          five: number
          four: number
          is_new: boolean
          on_time_pct: number
          one: number
          shown_average: number
          three: number
          total: number
          two: number
          user_id: string
        }[]
      }
      profile_review_summary: {
        Args: { p_role?: string; p_user: string }
        Returns: {
          average: number
          five: number
          four: number
          is_new: boolean
          one: number
          shown_average: number
          three: number
          total: number
          two: number
        }[]
      }
      profile_reviews: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_user: string
        }
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
      prune_payment_event_payloads: {
        Args: { p_older_than?: string }
        Returns: number
      }
      queue_free_cancel_refund: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      quiet_hours_until: { Args: { p_recipient: string }; Returns: string }
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
      receipt_details: { Args: { p_payment_id: string }; Returns: Json }
      record_settlement_attempt: {
        Args: {
          p_error: string
          p_kind: string
          p_payment_id: string
          p_rotate: boolean
        }
        Returns: boolean
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
      report_running_late: {
        Args: { p_job_id: string; p_minutes: number }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
      resolve_receipt: {
        Args: {
          p_error?: string
          p_id: string
          p_provider_ref?: string
          p_status: string
        }
        Returns: undefined
      }
      review_is_revealed: {
        Args: {
          p_created_at: string
          p_job_id: string
          p_reviewee_id: string
          p_reviewer_id: string
        }
        Returns: boolean
      }
      series_close_offers: {
        Args: { p_actor: string; p_job_id: string }
        Returns: undefined
      }
      series_offer_visit: {
        Args: {
          p_series: Database["public"]["Tables"]["job_series"]["Row"]
          p_visit: string
        }
        Returns: string
      }
      series_open_visit: {
        Args: {
          p_passed_by: string
          p_series: Database["public"]["Tables"]["job_series"]["Row"]
          p_visit: string
        }
        Returns: string
      }
      series_visit_date: {
        Args: { p_anchor: string; p_cadence: string; p_visit: number }
        Returns: string
      }
      set_active_mode: { Args: { p_mode: string }; Returns: string }
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
      should_notify: {
        Args: { p_actor: string; p_category: string; p_recipient: string }
        Returns: boolean
      }
      start_job_series: {
        Args: { p_cadence: string; p_job_id: string }
        Returns: {
          anchor_date: string | null
          cadence: string
          client_id: string
          created_at: string
          dropped_worker_ids: string[]
          id: string
          last_error: string | null
          next_visit_date: string | null
          next_visit_no: number
          origin_job_id: string
          pending_job_id: string | null
          price_cents: number | null
          status: string
          stopped_at: string | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "job_series"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_job_series: {
        Args: { p_series_id: string }
        Returns: {
          anchor_date: string | null
          cadence: string
          client_id: string
          created_at: string
          dropped_worker_ids: string[]
          id: string
          last_error: string | null
          next_visit_date: string | null
          next_visit_no: number
          origin_job_id: string
          pending_job_id: string | null
          price_cents: number | null
          status: string
          stopped_at: string | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "job_series"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
          p_pricing_mode?: string
          p_scheduled_date?: string
          p_title: string
          p_videos?: Json
        }
        Returns: {
          accepted_bid_id: string | null
          accepted_offer_id: string | null
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
          job_number: number
          late_minutes: number | null
          late_reported_at: string | null
          location: string | null
          location_text: string | null
          needed_today: boolean
          photos: Json
          pricing_mode: string
          scheduled_date: string | null
          scheduled_for: string | null
          series_id: string | null
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
      worker_missed_window: {
        Args: {
          p_at: string
          p_job: Database["public"]["Tables"]["jobs"]["Row"]
        }
        Returns: boolean
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

