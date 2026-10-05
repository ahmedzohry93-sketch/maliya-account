
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'warehouse' CHECK (kind IN ('warehouse','branch')),
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.warehouses (name, kind) VALUES ('المخزن الرئيسي','warehouse');

CREATE TABLE public.invoice_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no serial,
  kind text NOT NULL CHECK (kind IN ('sales_return','purchase_return')),
  original_invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  partner_id uuid NOT NULL,
  return_date date NOT NULL DEFAULT current_date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  journal_entry_id uuid,
  cogs_journal_entry_id uuid,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.invoice_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.invoice_returns(id) ON DELETE CASCADE,
  original_line_id uuid REFERENCES public.invoice_lines(id),
  product_id uuid,
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  line_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.stock_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no serial,
  kind text NOT NULL CHECK (kind IN ('in','out','transfer')),
  voucher_date date NOT NULL DEFAULT current_date,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  target_warehouse_id uuid REFERENCES public.warehouses(id),
  party_type text CHECK (party_type IN ('supplier','warehouse','branch','department','external','other')),
  party_name text,
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','sent','received')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stock_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.stock_vouchers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.stock_moves ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.stock_moves ADD COLUMN voucher_id uuid REFERENCES public.stock_vouchers(id) ON DELETE CASCADE;
ALTER TABLE public.stock_moves ADD COLUMN return_id uuid REFERENCES public.invoice_returns(id) ON DELETE CASCADE;
UPDATE public.stock_moves SET warehouse_id = (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1) WHERE warehouse_id IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouses','invoice_returns','invoice_return_lines','stock_vouchers','stock_voucher_lines'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'products.view') OR public.has_permission(auth.uid(),'invoices.view'))$p$, t||'_view', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'products.manage') OR public.has_permission(auth.uid(),'invoices.create'))$p$, t||'_ins', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'products.manage') OR public.has_permission(auth.uid(),'invoices.edit'))$p$, t||'_upd', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'products.manage') OR public.has_permission(auth.uid(),'invoices.delete'))$p$, t||'_del', t);
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE public.invoice_returns_return_no_seq, public.stock_vouchers_voucher_no_seq TO authenticated;
