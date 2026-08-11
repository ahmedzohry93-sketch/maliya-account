-- 1) Permissions
INSERT INTO public.permissions (key, label, category, description) VALUES
  ('bank_recon.view', 'View Bank Reconciliation', 'Bank Reconciliation', 'عرض التسويات البنكية'),
  ('bank_recon.manage_accounts', 'Manage Bank Accounts', 'Bank Reconciliation', 'إدارة الحسابات البنكية'),
  ('bank_recon.create', 'Create Reconciliation', 'Bank Reconciliation', 'إنشاء تسوية جديدة'),
  ('bank_recon.import', 'Import Statement', 'Bank Reconciliation', 'استيراد كشف الحساب'),
  ('bank_recon.match', 'Match Transactions', 'Bank Reconciliation', 'مطابقة العمليات'),
  ('bank_recon.create_entries', 'Create Journal Entries', 'Bank Reconciliation', 'إنشاء قيود يومية للتسوية'),
  ('bank_recon.approve', 'Approve Reconciliation', 'Bank Reconciliation', 'اعتماد التسوية'),
  ('bank_recon.close', 'Close Reconciliation', 'Bank Reconciliation', 'إغلاق التسوية'),
  ('bank_recon.reopen', 'Reopen Reconciliation', 'Bank Reconciliation', 'إعادة فتح التسوية'),
  ('bank_recon.delete', 'Delete Reconciliation', 'Bank Reconciliation', 'حذف التسوية'),
  ('bank_recon.manage_rules', 'Manage Matching Rules', 'Bank Reconciliation', 'إدارة قواعد المطابقة')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.is_system = true AND r.name = 'Admin'
  AND p.key LIKE 'bank_recon.%'
ON CONFLICT DO NOTHING;

-- 2) Enums
DO $$ BEGIN
  CREATE TYPE public.bank_recon_status AS ENUM ('draft','imported','matching','matched','reviewed','approved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_line_match_status AS ENUM ('unmatched','matched','partial','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_line_category AS ENUM ('outstanding_check','deposit_in_transit','bank_charge','bank_interest','direct_deposit','returned_check','fx_difference','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_match_type AS ENUM ('auto','manual','split','merge');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_rule_field AS ENUM ('description','reference','amount');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bank_rule_operator AS ENUM ('contains','equals','starts_with','ends_with','regex','greater_than','less_than');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  bank_name text,
  account_number text,
  iban text,
  currency text NOT NULL DEFAULT 'SAR',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  gl_account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_select" ON public.bank_accounts FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "ba_insert" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.manage_accounts'));
CREATE POLICY "ba_update" ON public.bank_accounts FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'bank_recon.manage_accounts'));
CREATE POLICY "ba_delete" ON public.bank_accounts FOR DELETE TO authenticated USING (has_permission(auth.uid(),'bank_recon.manage_accounts'));
CREATE TRIGGER trg_ba_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) bank_reconciliations
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  period_from date NOT NULL,
  period_to date NOT NULL,
  statement_balance numeric(18,2) NOT NULL DEFAULT 0,
  book_balance numeric(18,2) NOT NULL DEFAULT 0,
  difference numeric(18,2) NOT NULL DEFAULT 0,
  status public.bank_recon_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_br_account ON public.bank_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_br_status ON public.bank_reconciliations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliations TO authenticated;
GRANT ALL ON public.bank_reconciliations TO service_role;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "br_select" ON public.bank_reconciliations FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "br_insert" ON public.bank_reconciliations FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.create'));
CREATE POLICY "br_update" ON public.bank_reconciliations FOR UPDATE TO authenticated USING (
  has_permission(auth.uid(),'bank_recon.match') OR has_permission(auth.uid(),'bank_recon.approve')
  OR has_permission(auth.uid(),'bank_recon.close') OR has_permission(auth.uid(),'bank_recon.reopen')
);
CREATE POLICY "br_delete" ON public.bank_reconciliations FOR DELETE TO authenticated USING (has_permission(auth.uid(),'bank_recon.delete'));
CREATE TRIGGER trg_br_updated BEFORE UPDATE ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) bank_statement_lines
CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reconciliation_id uuid NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text,
  reference text,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2),
  match_status public.bank_line_match_status NOT NULL DEFAULT 'unmatched',
  match_confidence numeric(5,2) NOT NULL DEFAULT 0,
  category public.bank_line_category,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  line_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bsl_recon ON public.bank_statement_lines(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_bsl_status ON public.bank_statement_lines(match_status);
CREATE INDEX IF NOT EXISTS idx_bsl_date ON public.bank_statement_lines(txn_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_lines TO authenticated;
GRANT ALL ON public.bank_statement_lines TO service_role;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsl_select" ON public.bank_statement_lines FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "bsl_insert" ON public.bank_statement_lines FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.import'));
CREATE POLICY "bsl_update" ON public.bank_statement_lines FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'bank_recon.match'));
CREATE POLICY "bsl_delete" ON public.bank_statement_lines FOR DELETE TO authenticated USING (has_permission(auth.uid(),'bank_recon.import') OR has_permission(auth.uid(),'bank_recon.delete'));
CREATE TRIGGER trg_bsl_updated BEFORE UPDATE ON public.bank_statement_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) bank_reconciliation_matches
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_line_id uuid NOT NULL REFERENCES public.bank_statement_lines(id) ON DELETE CASCADE,
  journal_line_id uuid NOT NULL REFERENCES public.journal_lines(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL,
  match_type public.bank_match_type NOT NULL DEFAULT 'manual',
  confidence numeric(5,2) NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brm_line ON public.bank_reconciliation_matches(statement_line_id);
CREATE INDEX IF NOT EXISTS idx_brm_jl ON public.bank_reconciliation_matches(journal_line_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_matches TO authenticated;
GRANT ALL ON public.bank_reconciliation_matches TO service_role;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brm_select" ON public.bank_reconciliation_matches FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "brm_insert" ON public.bank_reconciliation_matches FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.match'));
CREATE POLICY "brm_update" ON public.bank_reconciliation_matches FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'bank_recon.match'));
CREATE POLICY "brm_delete" ON public.bank_reconciliation_matches FOR DELETE TO authenticated USING (has_permission(auth.uid(),'bank_recon.match'));

-- 7) bank_matching_rules
CREATE TABLE IF NOT EXISTS public.bank_matching_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  condition_field public.bank_rule_field NOT NULL DEFAULT 'description',
  operator public.bank_rule_operator NOT NULL DEFAULT 'contains',
  value text NOT NULL,
  target_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category public.bank_line_category,
  auto_create_entry boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_matching_rules TO authenticated;
GRANT ALL ON public.bank_matching_rules TO service_role;
ALTER TABLE public.bank_matching_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bmr_select" ON public.bank_matching_rules FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "bmr_insert" ON public.bank_matching_rules FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.manage_rules'));
CREATE POLICY "bmr_update" ON public.bank_matching_rules FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'bank_recon.manage_rules'));
CREATE POLICY "bmr_delete" ON public.bank_matching_rules FOR DELETE TO authenticated USING (has_permission(auth.uid(),'bank_recon.manage_rules'));
CREATE TRIGGER trg_bmr_updated BEFORE UPDATE ON public.bank_matching_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8) settings (singleton)
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_tolerance_days integer NOT NULL DEFAULT 3,
  amount_tolerance numeric(18,2) NOT NULL DEFAULT 0,
  default_charges_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  default_interest_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  default_fx_diff_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_settings TO authenticated;
GRANT ALL ON public.bank_reconciliation_settings TO service_role;
ALTER TABLE public.bank_reconciliation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brs_select" ON public.bank_reconciliation_settings FOR SELECT TO authenticated USING (has_permission(auth.uid(),'bank_recon.view'));
CREATE POLICY "brs_insert" ON public.bank_reconciliation_settings FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'bank_recon.manage_rules'));
CREATE POLICY "brs_update" ON public.bank_reconciliation_settings FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'bank_recon.manage_rules'));
CREATE TRIGGER trg_brs_updated BEFORE UPDATE ON public.bank_reconciliation_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bank_reconciliation_settings (date_tolerance_days, amount_tolerance)
SELECT 3, 0 WHERE NOT EXISTS (SELECT 1 FROM public.bank_reconciliation_settings);

-- 9) Book balance function
CREATE OR REPLACE FUNCTION public.get_book_balance(_gl_account_id uuid, _from date, _to date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_id = _gl_account_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN _from AND _to;
$$;

REVOKE EXECUTE ON FUNCTION public.get_book_balance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_balance(uuid, date, date) TO authenticated, service_role;