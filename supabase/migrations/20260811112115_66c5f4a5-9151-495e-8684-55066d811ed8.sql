CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_permissions(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated;

ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_partner_id ON public.journal_lines(partner_id);

INSERT INTO public.accounts (code, name, type) VALUES ('113', 'المخزون', 'asset')
  ON CONFLICT DO NOTHING;
INSERT INTO public.accounts (code, name, type) VALUES ('52', 'تسوية المخزون', 'expense')
  ON CONFLICT DO NOTHING;

DO $$ BEGIN
  CREATE TYPE public.invoice_type AS ENUM ('sale','purchase');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft','posted','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_kind AS ENUM ('receipt','payment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.invoice_type NOT NULL,
  invoice_no bigserial NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  reference text,
  notes text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  partner_account_id uuid REFERENCES public.accounts(id),
  counter_account_id uuid REFERENCES public.accounts(id),
  tax_account_id uuid REFERENCES public.accounts(id),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.invoices_invoice_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoices_invoice_no_seq TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_order int NOT NULL DEFAULT 0,
  description text,
  quantity numeric(18,3) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all invoice_lines" ON public.invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.payment_kind NOT NULL,
  payment_no bigserial NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(18,2) NOT NULL,
  method text,
  reference text,
  notes text,
  cash_account_id uuid NOT NULL REFERENCES public.accounts(id),
  partner_account_id uuid NOT NULL REFERENCES public.accounts(id),
  status public.invoice_status NOT NULL DEFAULT 'posted',
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payments_payment_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.payments_payment_no_seq TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'قطعة',
  sale_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  stock_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
  tracks_inventory BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_moves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  move_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty NUMERIC(18,3) NOT NULL,
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_moves TO authenticated;
GRANT ALL ON public.stock_moves TO service_role;
ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all stock_moves" ON public.stock_moves FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_stock_moves_product ON public.stock_moves(product_id);
CREATE INDEX idx_stock_moves_invoice ON public.stock_moves(invoice_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES public.accounts(id);

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(18,2) NOT NULL DEFAULT 0;

INSERT INTO public.accounts (code, name, type, parent_id, is_active)
SELECT '1203', 'خصم مسموح به', 'expense', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1203');

INSERT INTO public.accounts (code, name, type, parent_id, is_active)
SELECT '54', 'تكلفة البضاعة المباعة', 'expense', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '54');