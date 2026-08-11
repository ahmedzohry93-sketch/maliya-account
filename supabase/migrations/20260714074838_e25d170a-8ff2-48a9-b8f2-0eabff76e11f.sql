
DO $$ BEGIN CREATE TYPE public.check_direction AS ENUM ('incoming','outgoing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.check_status AS ENUM ('pending','under_collection','cleared','returned','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.obligation_frequency AS ENUM ('daily','weekly','monthly','quarterly','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.obligation_category AS ENUM ('rent','loan','utility','payroll','insurance','subscription','fees','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction public.check_direction NOT NULL,
  check_number text NOT NULL,
  bank_name text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status public.check_status NOT NULL DEFAULT 'pending',
  branch text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checks TO authenticated;
GRANT ALL ON public.checks TO service_role;
ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checks_select" ON public.checks FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'checks.manage') OR public.has_permission(auth.uid(),'finance.dashboard.view'));
CREATE POLICY "checks_insert" ON public.checks FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'checks.manage'));
CREATE POLICY "checks_update" ON public.checks FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'checks.manage'));
CREATE POLICY "checks_delete" ON public.checks FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'checks.manage'));
CREATE TRIGGER trg_checks_updated BEFORE UPDATE ON public.checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_checks_due ON public.checks(due_date);
CREATE INDEX IF NOT EXISTS idx_checks_dir_status ON public.checks(direction, status);

CREATE TABLE IF NOT EXISTS public.recurring_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text,
  category public.obligation_category NOT NULL DEFAULT 'other',
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  frequency public.obligation_frequency NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_due_date date NOT NULL,
  end_date date,
  payment_method text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_obligations TO authenticated;
GRANT ALL ON public.recurring_obligations TO service_role;
ALTER TABLE public.recurring_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oblig_select" ON public.recurring_obligations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'obligations.manage') OR public.has_permission(auth.uid(),'finance.dashboard.view'));
CREATE POLICY "oblig_insert" ON public.recurring_obligations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'obligations.manage'));
CREATE POLICY "oblig_update" ON public.recurring_obligations FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'obligations.manage'));
CREATE POLICY "oblig_delete" ON public.recurring_obligations FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'obligations.manage'));
CREATE TRIGGER trg_oblig_updated BEFORE UPDATE ON public.recurring_obligations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_oblig_due ON public.recurring_obligations(next_due_date) WHERE active;

CREATE OR REPLACE FUNCTION public.advance_recurring_due(_id uuid)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recurring_obligations%ROWTYPE; next_d date;
BEGIN
  SELECT * INTO r FROM public.recurring_obligations WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  next_d := CASE r.frequency
    WHEN 'daily' THEN r.next_due_date + INTERVAL '1 day'
    WHEN 'weekly' THEN r.next_due_date + INTERVAL '1 week'
    WHEN 'monthly' THEN r.next_due_date + INTERVAL '1 month'
    WHEN 'quarterly' THEN r.next_due_date + INTERVAL '3 months'
    WHEN 'yearly' THEN r.next_due_date + INTERVAL '1 year'
  END;
  IF r.end_date IS NOT NULL AND next_d > r.end_date THEN
    UPDATE public.recurring_obligations SET active = false WHERE id = _id;
    RETURN r.next_due_date;
  END IF;
  UPDATE public.recurring_obligations SET next_due_date = next_d WHERE id = _id;
  RETURN next_d;
END; $$;

INSERT INTO public.permissions(key, label, category, description) VALUES
  ('finance.dashboard.view','View Financial Dashboard','finance','View financial dashboard with receivables, payables, and cash flow'),
  ('checks.manage','Manage Checks','finance','Create and manage incoming/outgoing checks'),
  ('obligations.manage','Manage Recurring Obligations','finance','Create and manage recurring financial obligations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_system = true AND r.name = 'Admin'
  AND p.key IN ('finance.dashboard.view','checks.manage','obligations.manage')
ON CONFLICT DO NOTHING;
