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
  public: {
    Tables: {
      accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciations: {
        Row: {
          amount: number
          asset_id: string
          book_value_after: number
          created_at: string
          id: string
          journal_entry_id: string | null
          period_date: string
          posted: boolean
          updated_at: string
        }
        Insert: {
          amount?: number
          asset_id: string
          book_value_after?: number
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_date: string
          posted?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          asset_id?: string
          book_value_after?: number
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_date?: string
          posted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          device: string | null
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          device?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          device?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          destination: string
          error: string | null
          file_name: string | null
          files_count: number
          id: string
          kind: string
          restored_at: string | null
          rows_count: number
          size_bytes: number
          status: string
          storage_path: string | null
          tables_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination?: string
          error?: string | null
          file_name?: string | null
          files_count?: number
          id?: string
          kind?: string
          restored_at?: string | null
          rows_count?: number
          size_bytes?: number
          status?: string
          storage_path?: string | null
          tables_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination?: string
          error?: string | null
          file_name?: string | null
          files_count?: number
          id?: string
          kind?: string
          restored_at?: string | null
          rows_count?: number
          size_bytes?: number
          status?: string
          storage_path?: string | null
          tables_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          created_at: string
          daily_enabled: boolean
          id: string
          include_files: boolean
          last_run_at: string | null
          retention_count: number
          run_hour_utc: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_enabled?: boolean
          id?: string
          include_files?: boolean
          last_run_at?: string | null
          retention_count?: number
          run_hour_utc?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_enabled?: boolean
          id?: string
          include_files?: boolean
          last_run_at?: string | null
          retention_count?: number
          run_hour_utc?: number
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          gl_account_id: string | null
          iban: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          gl_account_id?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          gl_account_id?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_matching_rules: {
        Row: {
          auto_create_entry: boolean
          category: Database["public"]["Enums"]["bank_line_category"] | null
          condition_field: Database["public"]["Enums"]["bank_rule_field"]
          created_at: string
          id: string
          is_active: boolean
          name: string
          operator: Database["public"]["Enums"]["bank_rule_operator"]
          priority: number
          target_account_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          auto_create_entry?: boolean
          category?: Database["public"]["Enums"]["bank_line_category"] | null
          condition_field?: Database["public"]["Enums"]["bank_rule_field"]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          operator?: Database["public"]["Enums"]["bank_rule_operator"]
          priority?: number
          target_account_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          auto_create_entry?: boolean
          category?: Database["public"]["Enums"]["bank_line_category"] | null
          condition_field?: Database["public"]["Enums"]["bank_rule_field"]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          operator?: Database["public"]["Enums"]["bank_rule_operator"]
          priority?: number
          target_account_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_matching_rules_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_matches: {
        Row: {
          amount: number
          confidence: number
          created_at: string
          created_by: string | null
          id: string
          journal_line_id: string
          match_type: Database["public"]["Enums"]["bank_match_type"]
          statement_line_id: string
        }
        Insert: {
          amount: number
          confidence?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_line_id: string
          match_type?: Database["public"]["Enums"]["bank_match_type"]
          statement_line_id: string
        }
        Update: {
          amount?: number
          confidence?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_line_id?: string
          match_type?: Database["public"]["Enums"]["bank_match_type"]
          statement_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_matches_journal_line_id_fkey"
            columns: ["journal_line_id"]
            isOneToOne: false
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_statement_line_id_fkey"
            columns: ["statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_settings: {
        Row: {
          amount_tolerance: number
          created_at: string
          date_tolerance_days: number
          default_charges_account_id: string | null
          default_fx_diff_account_id: string | null
          default_interest_account_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          amount_tolerance?: number
          created_at?: string
          date_tolerance_days?: number
          default_charges_account_id?: string | null
          default_fx_diff_account_id?: string | null
          default_interest_account_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          amount_tolerance?: number
          created_at?: string
          date_tolerance_days?: number
          default_charges_account_id?: string | null
          default_fx_diff_account_id?: string | null
          default_interest_account_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_settings_default_charges_account_id_fkey"
            columns: ["default_charges_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_settings_default_fx_diff_account_id_fkey"
            columns: ["default_fx_diff_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_settings_default_interest_account_id_fkey"
            columns: ["default_interest_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          book_balance: number
          closed_at: string | null
          created_at: string
          created_by: string | null
          difference: number
          id: string
          notes: string | null
          period_from: string
          period_to: string
          statement_balance: number
          status: Database["public"]["Enums"]["bank_recon_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          book_balance?: number
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          difference?: number
          id?: string
          notes?: string | null
          period_from: string
          period_to: string
          statement_balance?: number
          status?: Database["public"]["Enums"]["bank_recon_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          book_balance?: number
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          difference?: number
          id?: string
          notes?: string | null
          period_from?: string
          period_to?: string
          statement_balance?: number
          status?: Database["public"]["Enums"]["bank_recon_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          balance: number | null
          category: Database["public"]["Enums"]["bank_line_category"] | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string | null
          line_order: number
          match_confidence: number
          match_status: Database["public"]["Enums"]["bank_line_match_status"]
          reconciliation_id: string
          reference: string | null
          txn_date: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          category?: Database["public"]["Enums"]["bank_line_category"] | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          line_order?: number
          match_confidence?: number
          match_status?: Database["public"]["Enums"]["bank_line_match_status"]
          reconciliation_id: string
          reference?: string | null
          txn_date: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          category?: Database["public"]["Enums"]["bank_line_category"] | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          line_order?: number
          match_confidence?: number
          match_status?: Database["public"]["Enums"]["bank_line_match_status"]
          reconciliation_id?: string
          reference?: string | null
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "bank_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      checks: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          bank_account_id: string | null
          bank_name: string | null
          branch: string | null
          check_number: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          direction: Database["public"]["Enums"]["check_direction"]
          due_date: string
          id: string
          is_archived: boolean
          is_deleted: boolean
          issue_date: string
          notes: string | null
          partner_id: string | null
          status: Database["public"]["Enums"]["check_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          bank_account_id?: string | null
          bank_name?: string | null
          branch?: string | null
          check_number: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction: Database["public"]["Enums"]["check_direction"]
          due_date: string
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          bank_account_id?: string | null
          bank_name?: string | null
          branch?: string | null
          check_number?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: Database["public"]["Enums"]["check_direction"]
          due_date?: string
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          email: string | null
          footer_note: string | null
          id: string
          logo_path: string | null
          name: string
          name_en: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          footer_note?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          footer_note?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          accum_dep_account_id: string | null
          acquisition_date: string
          archived_at: string | null
          archived_by: string | null
          asset_account_id: string | null
          category: string | null
          code: string | null
          cost: number
          created_at: string
          created_by: string | null
          declining_rate: number
          deleted_at: string | null
          deleted_by: string | null
          dep_expense_account_id: string | null
          disposal_amount: number | null
          disposal_date: string | null
          id: string
          in_service_date: string | null
          is_archived: boolean
          is_deleted: boolean
          method: Database["public"]["Enums"]["depreciation_method"]
          name: string
          notes: string | null
          salvage_value: number
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          accum_dep_account_id?: string | null
          acquisition_date?: string
          archived_at?: string | null
          archived_by?: string | null
          asset_account_id?: string | null
          category?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          declining_rate?: number
          deleted_at?: string | null
          deleted_by?: string | null
          dep_expense_account_id?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          id?: string
          in_service_date?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          method?: Database["public"]["Enums"]["depreciation_method"]
          name: string
          notes?: string | null
          salvage_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          useful_life_months?: number
        }
        Update: {
          accum_dep_account_id?: string | null
          acquisition_date?: string
          archived_at?: string | null
          archived_by?: string | null
          asset_account_id?: string | null
          category?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          declining_rate?: number
          deleted_at?: string | null
          deleted_by?: string | null
          dep_expense_account_id?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          id?: string
          in_service_date?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          method?: Database["public"]["Enums"]["depreciation_method"]
          name?: string
          notes?: string | null
          salvage_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_accum_dep_account_id_fkey"
            columns: ["accum_dep_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_asset_account_id_fkey"
            columns: ["asset_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_dep_expense_account_id_fkey"
            columns: ["dep_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          cost_per_unit: number
          description: string | null
          id: string
          invoice_id: string
          line_order: number
          product_id: string | null
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          cost_per_unit?: number
          description?: string | null
          id?: string
          invoice_id: string
          line_order?: number
          product_id?: string | null
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          cost_per_unit?: number
          description?: string | null
          id?: string
          invoice_id?: string
          line_order?: number
          product_id?: string | null
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cogs_account_id: string | null
          counter_account_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_account_id: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          due_date: string | null
          id: string
          inventory_account_id: string | null
          invoice_date: string
          invoice_no: number
          is_archived: boolean
          is_deleted: boolean
          journal_entry_id: string | null
          notes: string | null
          partner_account_id: string | null
          partner_id: string
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          tax_account_id: string | null
          total: number
          type: Database["public"]["Enums"]["invoice_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cogs_account_id?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_account_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          due_date?: string | null
          id?: string
          inventory_account_id?: string | null
          invoice_date?: string
          invoice_no?: number
          is_archived?: boolean
          is_deleted?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          partner_account_id?: string | null
          partner_id: string
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          tax_account_id?: string | null
          total?: number
          type: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cogs_account_id?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_account_id?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          due_date?: string | null
          id?: string
          inventory_account_id?: string | null
          invoice_date?: string
          invoice_no?: number
          is_archived?: boolean
          is_deleted?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          partner_account_id?: string | null
          partner_id?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          tax_account_id?: string | null
          total?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_counter_account_id_fkey"
            columns: ["counter_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_discount_account_id_fkey"
            columns: ["discount_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_account_id_fkey"
            columns: ["tax_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          entry_date: string
          entry_no: number
          entry_type: string | null
          id: string
          is_archived: boolean
          is_deleted: boolean
          reference: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: number
          entry_type?: string | null
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          reference?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: number
          entry_type?: string | null
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          reference?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          line_order: number
          partner_id: string | null
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          line_order?: number
          partner_id?: string | null
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_order?: number
          partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          code: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_deleted: boolean
          name: string
          phone: string | null
          tax_number: string | null
          type: Database["public"]["Enums"]["partner_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_deleted?: boolean
          name: string
          phone?: string | null
          tax_number?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_deleted?: boolean
          name?: string
          phone?: string | null
          tax_number?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          cash_account_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_id: string | null
          is_archived: boolean
          is_deleted: boolean
          journal_entry_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method: string | null
          notes: string | null
          partner_account_id: string
          partner_id: string
          payment_date: string
          payment_no: number
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          archived_at?: string | null
          archived_by?: string | null
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_id?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          journal_entry_id?: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method?: string | null
          notes?: string | null
          partner_account_id: string
          partner_id: string
          payment_date?: string
          payment_no?: number
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_id?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          journal_entry_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: string | null
          notes?: string | null
          partner_account_id?: string
          partner_id?: string
          payment_date?: string
          payment_no?: number
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          description: string | null
          id: string
          key: string
          label: string
        }
        Insert: {
          category: string
          description?: string | null
          id?: string
          key: string
          label: string
        }
        Update: {
          category?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cost_price: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_deleted: boolean
          name: string
          notes: string | null
          sale_price: number
          sku: string | null
          stock_qty: number
          tracks_inventory: boolean
          unit: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_deleted?: boolean
          name: string
          notes?: string | null
          sale_price?: number
          sku?: string | null
          stock_qty?: number
          tracks_inventory?: boolean
          unit?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_deleted?: boolean
          name?: string
          notes?: string | null
          sale_price?: number
          sku?: string | null
          stock_qty?: number
          tracks_inventory?: boolean
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_obligations: {
        Row: {
          active: boolean
          amount: number
          archived_at: string | null
          archived_by: string | null
          category: Database["public"]["Enums"]["obligation_category"]
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["obligation_frequency"]
          id: string
          is_archived: boolean
          is_deleted: boolean
          name: string
          next_due_date: string
          notes: string | null
          payment_method: string | null
          start_date: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          active?: boolean
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          category?: Database["public"]["Enums"]["obligation_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["obligation_frequency"]
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          name: string
          next_due_date: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          category?: Database["public"]["Enums"]["obligation_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["obligation_frequency"]
          id?: string
          is_archived?: boolean
          is_deleted?: boolean
          name?: string
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      stock_moves: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          move_date: string
          notes: string | null
          product_id: string
          qty: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          move_date?: string
          notes?: string | null
          product_id: string
          qty: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          move_date?: string
          notes?: string | null
          product_id?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_recurring_due: { Args: { _id: string }; Returns: string }
      get_book_balance: {
        Args: { _from: string; _gl_account_id: string; _to: string }
        Returns: number
      }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          key: string
        }[]
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_audit:
        | {
            Args: {
              _action: string
              _details?: Json
              _entity: string
              _entity_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _action: string
              _details?: Json
              _device?: string
              _entity: string
              _entity_id: string
              _ip_address?: string
              _new_value?: Json
              _old_value?: Json
            }
            Returns: undefined
          }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      asset_status: "draft" | "running" | "fully_depreciated" | "disposed"
      bank_line_category:
        | "outstanding_check"
        | "deposit_in_transit"
        | "bank_charge"
        | "bank_interest"
        | "direct_deposit"
        | "returned_check"
        | "fx_difference"
        | "other"
      bank_line_match_status: "unmatched" | "matched" | "partial" | "ignored"
      bank_match_type: "auto" | "manual" | "split" | "merge"
      bank_recon_status:
        | "draft"
        | "imported"
        | "matching"
        | "matched"
        | "reviewed"
        | "approved"
        | "closed"
      bank_rule_field: "description" | "reference" | "amount"
      bank_rule_operator:
        | "contains"
        | "equals"
        | "starts_with"
        | "ends_with"
        | "regex"
        | "greater_than"
        | "less_than"
      check_direction: "incoming" | "outgoing"
      check_status:
        | "pending"
        | "under_collection"
        | "cleared"
        | "returned"
        | "cancelled"
      depreciation_method: "straight_line" | "declining_balance" | "none"
      invoice_status: "draft" | "posted" | "cancelled"
      invoice_type: "sale" | "purchase"
      journal_status: "draft" | "posted" | "cancelled"
      obligation_category:
        | "rent"
        | "loan"
        | "utility"
        | "payroll"
        | "insurance"
        | "subscription"
        | "fees"
        | "other"
      obligation_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      partner_type: "customer" | "supplier" | "both"
      payment_kind: "receipt" | "payment"
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
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      asset_status: ["draft", "running", "fully_depreciated", "disposed"],
      bank_line_category: [
        "outstanding_check",
        "deposit_in_transit",
        "bank_charge",
        "bank_interest",
        "direct_deposit",
        "returned_check",
        "fx_difference",
        "other",
      ],
      bank_line_match_status: ["unmatched", "matched", "partial", "ignored"],
      bank_match_type: ["auto", "manual", "split", "merge"],
      bank_recon_status: [
        "draft",
        "imported",
        "matching",
        "matched",
        "reviewed",
        "approved",
        "closed",
      ],
      bank_rule_field: ["description", "reference", "amount"],
      bank_rule_operator: [
        "contains",
        "equals",
        "starts_with",
        "ends_with",
        "regex",
        "greater_than",
        "less_than",
      ],
      check_direction: ["incoming", "outgoing"],
      check_status: [
        "pending",
        "under_collection",
        "cleared",
        "returned",
        "cancelled",
      ],
      depreciation_method: ["straight_line", "declining_balance", "none"],
      invoice_status: ["draft", "posted", "cancelled"],
      invoice_type: ["sale", "purchase"],
      journal_status: ["draft", "posted", "cancelled"],
      obligation_category: [
        "rent",
        "loan",
        "utility",
        "payroll",
        "insurance",
        "subscription",
        "fees",
        "other",
      ],
      obligation_frequency: [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      partner_type: ["customer", "supplier", "both"],
      payment_kind: ["receipt", "payment"],
    },
  },
} as const
